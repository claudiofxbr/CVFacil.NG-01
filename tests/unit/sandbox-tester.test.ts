import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { createPayDb } from '../helpers/fakePayDb';

const session = vi.hoisted(() => ({ user: null as any }));
const payDb = createPayDb();
vi.mock('../../lib/neon', () => ({ sql: (s: TemplateStringsArray, ...v: any[]) => payDb.sql(s, ...v) }));
vi.mock('../../lib/session', async (orig) => ({ ...(await orig<any>()), getSessionUser: async () => session.user }));

import { POST as checkout } from '../../app/api/payments/checkout/route';
import { GET as orderStatus } from '../../app/api/payments/orders/[id]/route';
import { POST as webhook } from '../../app/api/payments/pagbank/webhook/route';
import { POST as setupPost, GET as setupGet } from '../../app/api/neon/setup/route';
import { GET as resumesGet, POST as resumesPost } from '../../app/api/neon/resumes/route';
import { isSandboxTesterEmail, isAdminEmail } from '../../lib/session';
import { canUseSandboxPayments } from '../../lib/paymentRelease';
import { authContext, adminGuard } from '../../lib/apiAuth';
import { __resetPaymentsSchemaForTests } from '../../lib/payments';
import { __resetRateLimitStoreForTests } from '../../lib/rateLimit';

const TOKEN = 'tok-teste-nao-real-0123456789';
const TESTER = { id: 'ut', email: 'avaliador@exemplo.invalid' };
const COMUM = { id: 'uc', email: 'comum@exemplo.invalid' };
const REF = 'cvf_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const ORDE = 'ORDE_66666666-7777-8888-9999-000000000000';

let fetchMock: ReturnType<typeof vi.fn>;
const pagbankOk = () => new Response(JSON.stringify({ id: 'CHEC_ABCDEF123456', status: 'ACTIVE', links: [{ rel: 'PAY', href: 'https://pagamento.sandbox.pagbank.com.br/pagamento?code=1' }] }), { status: 201 });
const post = (planId = 'basico') => checkout(new Request('http://x/c', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ planId }) }));

beforeEach(() => {
  payDb.reset(); session.user = null;
  payDb.users.push({ id: 'ut', email: TESTER.email, plan: 'free', credits: 5 }, { id: 'uc', email: COMUM.email, plan: 'free', credits: 5 });
  __resetPaymentsSchemaForTests(); __resetRateLimitStoreForTests();
  process.env.PAGBANK_TOKEN = TOKEN;
  process.env.SANDBOX_TESTER_EMAILS = ' Avaliador@Exemplo.INVALID , outro@exemplo.invalid ';
  delete process.env.ADMIN_EMAILS; delete process.env.PAGBANK_ENV;
  fetchMock = vi.fn(async () => pagbankOk());
  vi.stubGlobal('fetch', fetchMock);
  for (const m of ['error', 'warn', 'info'] as const) vi.spyOn(console, m).mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllGlobals(); for (const k of ['PAGBANK_TOKEN', 'SANDBOX_TESTER_EMAILS', 'ADMIN_EMAILS', 'PAGBANK_ENV']) delete process.env[k]; });

describe('isSandboxTesterEmail / canUseSandboxPayments', () => {
  it('lista por vírgula, trim e caixa; sem a env ninguém é testador', () => {
    expect(isSandboxTesterEmail('avaliador@exemplo.invalid')).toBe(true);
    expect(isSandboxTesterEmail('  AVALIADOR@EXEMPLO.INVALID ')).toBe(true);
    expect(isSandboxTesterEmail('outro@exemplo.invalid')).toBe(true);
    expect(isSandboxTesterEmail('comum@exemplo.invalid')).toBe(false);
    expect(isSandboxTesterEmail('')).toBe(false);
    expect(isSandboxTesterEmail(null)).toBe(false);
    delete process.env.SANDBOX_TESTER_EMAILS;
    expect(isSandboxTesterEmail('avaliador@exemplo.invalid')).toBe(false);
    process.env.SANDBOX_TESTER_EMAILS = ' , ,';
    expect(isSandboxTesterEmail('')).toBe(false);
  });
  it('regra única: admin OU testador; comum não', () => {
    process.env.ADMIN_EMAILS = 'chefe@exemplo.invalid';
    expect(canUseSandboxPayments({ isAdmin: true, email: 'x@exemplo.invalid' })).toBe(true);
    expect(canUseSandboxPayments({ isAdmin: false, email: TESTER.email })).toBe(true);
    expect(canUseSandboxPayments({ isAdmin: false, email: COMUM.email })).toBe(false);
    expect(canUseSandboxPayments({ isAdmin: false, email: null })).toBe(false);
  });
});

describe('checkout em sandbox', () => {
  it('testador cria pedido e chama o PSP', async () => {
    session.user = TESTER;
    const res = await post('padrao');
    expect(res.status).toBe(200);
    expect(payDb.orders).toHaveLength(1);
    expect(payDb.orders[0]).toMatchObject({ user_id: 'ut', amount_cents: 4000 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('usuário comum: 403 PAYMENTS_NOT_AVAILABLE, "Pagamentos em breve.", sem pedido e sem fetch', async () => {
    session.user = COMUM;
    const res = await post();
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Pagamentos em breve.', code: 'PAYMENTS_NOT_AVAILABLE' });
    expect(payDb.orders).toHaveLength(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('sem SANDBOX_TESTER_EMAILS o avaliador também é bloqueado', async () => {
    delete process.env.SANDBOX_TESTER_EMAILS;
    session.user = TESTER;
    expect((await post()).status).toBe(403);
    expect(payDb.orders).toHaveLength(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('e-mail da sessão em outra caixa/espaços casa com a lista', async () => {
    session.user = { id: 'ut', email: '  AVALIADOR@exemplo.invalid ' };
    expect((await post()).status).toBe(200);
  });
  it('production: usuário comum compra normalmente', async () => {
    process.env.PAGBANK_ENV = 'production';
    session.user = COMUM;
    expect((await post()).status).toBe(200);
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.pagseguro.com/checkouts');
  });
});

describe('o testador NÃO é administrador', () => {
  beforeEach(() => { session.user = TESTER; });

  it('authContext.isAdmin é falso e adminGuard devolve 403', async () => {
    const ctx: any = await authContext(new Request('http://x/'));
    expect(ctx.isAdmin).toBe(false);
    expect(isAdminEmail(TESTER.email)).toBe(false);
    expect(((await adminGuard(new Request('http://x/'))) as Response).status).toBe(403);
  });
  it('/api/neon/setup (POST e GET) -> 403', async () => {
    expect((await setupPost(new Request('http://x/s', { method: 'POST' }))).status).toBe(403);
    expect((await setupGet(new Request('http://x/s'))).status).toBe(403);
    expect(payDb.calls.filter((c) => c.t.startsWith('CREATE TABLE IF NOT EXISTS users'))).toHaveLength(0);
  });
  it('listagem scope=all devolve só os próprios currículos', async () => {
    payDb.resumes.push({ id: 'r-t', user_id: 'ut', deleted_at: null }, { id: 'r-c', user_id: 'uc', deleted_at: null });
    const res = await resumesGet(new NextRequest('http://x/api/neon/resumes?scope=all&role=admin&userId=uc'));
    const ids = (await res.json()).resumes.map((r: any) => r.id);
    expect(ids).toEqual(['r-t']);
  });
  it('limites e cotas normais do plano free (3 currículos), sem ilimitado', async () => {
    for (let i = 0; i < 3; i++) {
      expect((await resumesPost(new NextRequest('http://x/r', { method: 'POST', body: JSON.stringify({ id: `t${i}` }) }))).status).toBe(200);
    }
    const res = await resumesPost(new NextRequest('http://x/r', { method: 'POST', body: JSON.stringify({ id: 't9' }) }));
    expect(res.status).toBe(403);
    expect((await res.json()).maxAllowed).toBe(3);
  });
});

describe('liberação do plano em sandbox (webhook e reconciliação)', () => {
  const apiRoutes = () => {
    const routes: Record<string, unknown> = {
      '/checkouts/CHEC_ABCDEF123456': { id: 'CHEC_ABCDEF123456', reference_id: REF, status: 'ACTIVE', orders: [{ id: ORDE }] },
      [`/orders/${ORDE}`]: { id: ORDE, reference_id: REF, charges: [{ status: 'PAID', amount: { value: 1500 } }] },
    };
    fetchMock.mockImplementation(async (url: string) => {
      const key = String(url).replace('https://sandbox.api.pagseguro.com', '');
      return routes[key] ? new Response(JSON.stringify(routes[key]), { status: 200 }) : new Response('{}', { status: 404 });
    });
  };
  const seed = (userId: string) => payDb.orders.push({ id: 'ord-aaaaaaaa-1', user_id: userId, plan_id: 'basico', amount_cents: 1500, reference_id: REF, psp_order_id: 'CHEC_ABCDEF123456', checkout_url: 'https://p/x', status: 'pending', paid_at: null, created_at: Date.now() });
  const hook = () => webhook(new Request('http://x/hook', { method: 'POST', headers: { 'content-type': 'application/json', 'x-authenticity-token': 'a'.repeat(64) }, body: JSON.stringify({ id: 'CHEC_ABCDEF123456' }) }));
  const status = (user: any) => { session.user = user; return orderStatus(new Request('http://x/o'), { params: Promise.resolve({ id: 'ord-aaaaaaaa-1' }) }); };

  it('webhook: dono testador recebe o plano; dono comum não', async () => {
    apiRoutes(); seed('ut');
    expect((await hook()).status).toBe(200);
    expect(payDb.users.find((u) => u.id === 'ut').plan).toBe('basico');

    payDb.orders.length = 0; payDb.events.length = 0; payDb.orders.push({ id: 'ord-cccccccc-1', user_id: 'uc', plan_id: 'basico', amount_cents: 1500, reference_id: REF, psp_order_id: 'CHEC_ABCDEF123456', status: 'pending', created_at: Date.now() });
    expect((await hook()).status).toBe(200);
    expect(payDb.users.find((u) => u.id === 'uc').plan).toBe('free');
    expect(payDb.orders[0].status).toBe('pending');
  });

  it('reconciliação (GET orders/[id]): testador concede; comum não', async () => {
    apiRoutes(); seed('ut');
    expect((await (await status(TESTER)).json()).status).toBe('paid');
    expect(payDb.users.find((u) => u.id === 'ut').plan).toBe('basico');

    payDb.orders.length = 0; __resetRateLimitStoreForTests(); seed('uc');
    expect((await (await status(COMUM)).json()).status).toBe('pending');
    expect(payDb.users.find((u) => u.id === 'uc').plan).toBe('free');
  });

  it('production: dono comum recebe o plano pela reconciliação', async () => {
    process.env.PAGBANK_ENV = 'production';
    seed('uc');
    const routes: Record<string, unknown> = {
      '/checkouts/CHEC_ABCDEF123456': { reference_id: REF, orders: [{ id: ORDE }] },
      [`/orders/${ORDE}`]: { reference_id: REF, charges: [{ status: 'PAID', amount: { value: 1500 } }] },
    };
    fetchMock.mockImplementation(async (url: string) => new Response(JSON.stringify(routes[String(url).replace('https://api.pagseguro.com', '')] ?? {}), { status: 200 }));
    expect((await (await status(COMUM)).json()).status).toBe('paid');
  });
});
