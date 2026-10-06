import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { createPayDb } from '../helpers/fakePayDb';

const session = vi.hoisted(() => ({ user: null as any }));
const payDb = createPayDb();
vi.mock('../../lib/neon', () => ({ sql: (s: TemplateStringsArray, ...v: any[]) => payDb.sql(s, ...v) }));
vi.mock('../../lib/session', async (orig) => ({ ...(await orig<any>()), getSessionUser: async () => session.user }));

import { POST as resumesPost } from '../../app/api/neon/resumes/route';
import { POST as importV2 } from '../../app/api/gemini/import-pdf-v2/route';
import { withImportQuota, reserveImport } from '../../lib/entitlements';
import { markOrderPaidAndGrant, markOrderRefundedAndRevoke } from '../../lib/orders';
import { __resetPaymentsSchemaForTests } from '../../lib/payments';
import { __resetRateLimitStoreForTests } from '../../lib/rateLimit';

const mkUser = (plan: string, extra: any = {}) => { payDb.users.length = 0; payDb.users.push({ id: 'u1', plan, credits: 5, pdf_imports_used: 0, ...extra }); session.user = { id: 'u1', email: 'u1@x.com' }; };
const saveResume = (id: string) => resumesPost(new NextRequest('http://x/api/neon/resumes', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, fullName: 'Ana' }) }));
const importReq = () => new Request('http://x/api/gemini/import-pdf-v2', { method: 'POST', body: '{}' });

beforeEach(() => {
  payDb.reset(); session.user = null;
  __resetPaymentsSchemaForTests(); __resetRateLimitStoreForTests();
  delete process.env.ADMIN_EMAILS; delete process.env.GEMINI_API_KEY; delete process.env.API_KEY;
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('limite de currículos por plano em /api/neon/resumes', () => {
  it.each([['basico', 1], ['padrao', 6], ['premium', 9]])('plano %s permite %i currículos e bloqueia o seguinte', async (plan, max) => {
    mkUser(plan);
    for (let i = 0; i < max; i++) expect((await saveResume(`r${i}`)).status).toBe(200);
    const res = await saveResume('extra');
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: 'DOCUMENT_LIMIT_EXCEEDED', maxAllowed: max });
    expect(payDb.resumes).toHaveLength(max);
  });

  it('plano pago não consome nem exige créditos (cota é do plano)', async () => {
    mkUser('padrao', { credits: 0 });
    expect((await saveResume('r1')).status).toBe(200);
    expect(payDb.users[0].credits).toBe(0);
  });

  it('free mantém limite 3 e créditos (INSUFFICIENT_CREDITS); admin é ilimitado', async () => {
    mkUser('free');
    for (let i = 0; i < 3; i++) expect((await saveResume(`f${i}`)).status).toBe(200);
    expect(payDb.users[0].credits).toBe(2);
    const res = await saveResume('f4');
    expect(res.status).toBe(403);
    expect((await res.json()).maxAllowed).toBe(3);
    mkUser('free', { credits: 0 });
    payDb.resumes.length = 0;
    const noCredit = await saveResume('z');
    expect(noCredit.status).toBe(402);
    expect((await noCredit.json()).code).toBe('INSUFFICIENT_CREDITS');
    process.env.ADMIN_EMAILS = 'u1@x.com';
    mkUser('basico');
    for (let i = 0; i < 12; i++) expect((await saveResume(`a${i}`)).status).toBe(200);
  });
});

describe('cota de importações por plano', () => {
  it.each([['basico', 1], ['padrao', 3], ['premium', 9]])('plano %s: %i importações, a seguinte -> 403 IMPORT_QUOTA_EXCEEDED', async (plan, max) => {
    mkUser(plan);
    const ok = vi.fn(async () => new Response('{}', { status: 200 }));
    for (let i = 0; i < max; i++) expect((await withImportQuota(importReq(), ok)).status).toBe(200);
    const res = await withImportQuota(importReq(), ok);
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe('IMPORT_QUOTA_EXCEEDED');
    expect(ok).toHaveBeenCalledTimes(max); // a IA nem é chamada
    expect(payDb.users[0].pdf_imports_used).toBe(max);
  });

  it('importação que falha (>= 400 ou exceção) não consome cota', async () => {
    mkUser('basico');
    expect((await withImportQuota(importReq(), async () => new Response('{}', { status: 503 }))).status).toBe(503);
    expect(payDb.users[0].pdf_imports_used).toBe(0);
    await expect(withImportQuota(importReq(), async () => { throw new Error('boom'); })).rejects.toThrow('boom');
    expect(payDb.users[0].pdf_imports_used).toBe(0);
    expect((await withImportQuota(importReq(), async () => new Response('{}', { status: 200 }))).status).toBe(200);
  });

  it('free e admin não têm cota; sem sessão -> 401; erro de banco -> 503', async () => {
    mkUser('free');
    for (let i = 0; i < 5; i++) expect((await withImportQuota(importReq(), async () => new Response('{}'))).status).toBe(200);
    expect(await reserveImport('u1', true)).toBe('none');
    session.user = null;
    expect((await withImportQuota(importReq(), async () => new Response('{}'))).status).toBe(401);
    mkUser('basico');
    payDb.failAll = true;
    expect((await withImportQuota(importReq(), async () => new Response('{}'))).status).toBe(503);
  });

  it('rota real import-pdf-v2 sem chave de IA: 503 AI_NOT_CONFIGURED e a cota é devolvida', async () => {
    mkUser('basico');
    const res = await importV2(new NextRequest('http://x/api/gemini/import-pdf-v2', { method: 'POST', body: JSON.stringify({ pdfBase64: 'AAAA' }) }));
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe('AI_NOT_CONFIGURED');
    expect(payDb.users[0].pdf_imports_used).toBe(0);
  });

  it('concorrência: o UPDATE condicional não passa do limite', async () => {
    mkUser('basico');
    const results = await Promise.all([1, 2, 3].map(() => reserveImport('u1', false)));
    expect(results.filter((r) => r === 'reserved')).toHaveLength(1);
    expect(payDb.users[0].pdf_imports_used).toBe(1);
  });
});

describe('concessão e revogação do plano', () => {
  const seed = (plan = 'free') => {
    payDb.users.push({ id: 'u1', plan, pdf_imports_used: 2 });
    payDb.orders.push({ id: 'o1', user_id: 'u1', plan_id: 'padrao', amount_cents: 4000, reference_id: 'cvf_x', status: 'pending', created_at: Date.now() });
  };
  it('pending -> paid concede o plano e zera o contador; segunda vez não concede de novo', async () => {
    seed();
    expect((await markOrderPaidAndGrant('o1'))?.status).toBe('paid');
    expect(payDb.users[0]).toMatchObject({ plan: 'padrao', pdf_imports_used: 0 });
    payDb.users[0].pdf_imports_used = 2;
    expect(await markOrderPaidAndGrant('o1')).toBeNull();
    expect(payDb.users[0].pdf_imports_used).toBe(2);
  });
  it('pedido cancelado/falho nunca concede', async () => {
    seed();
    payDb.orders[0].status = 'failed';
    expect(await markOrderPaidAndGrant('o1')).toBeNull();
    expect(payDb.users[0].plan).toBe('free');
  });
  it('estorno: paid -> refunded revoga só se o usuário ainda está nesse plano; não repete', async () => {
    seed();
    await markOrderPaidAndGrant('o1');
    expect((await markOrderRefundedAndRevoke('o1'))?.status).toBe('refunded');
    expect(payDb.users[0].plan).toBe('free');
    expect(await markOrderRefundedAndRevoke('o1')).toBeNull();

    payDb.users[0].plan = 'premium'; // comprou outro plano depois
    payDb.orders.push({ id: 'o2', user_id: 'u1', plan_id: 'padrao', amount_cents: 4000, reference_id: 'cvf_y', status: 'paid', created_at: Date.now() });
    await markOrderRefundedAndRevoke('o2');
    expect(payDb.users[0].plan).toBe('premium');
  });
});
