import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createPayDb } from '../helpers/fakePayDb';

const session = vi.hoisted(() => ({ user: null as any }));
const payDb = createPayDb();

vi.mock('../../lib/neon', () => ({ sql: (s: TemplateStringsArray, ...v: any[]) => payDb.sql(s, ...v) }));
vi.mock('../../lib/session', async (orig) => ({ ...(await orig<any>()), getSessionUser: async () => session.user }));

import { POST as checkout } from '../../app/api/payments/checkout/route';
import { createCheckout, pagBankBaseUrl, PagBankError } from '../../lib/pagbank';
import { PLANS } from '../../lib/plans';
import { __resetPaymentsSchemaForTests } from '../../lib/payments';
import { __resetRateLimitStoreForTests } from '../../lib/rateLimit';

const TOKEN = 'tok-teste-nao-real-0123456789';
const U = { id: 'u1', email: 'u1@x.com' };
const post = (body: unknown) =>
  checkout(new Request('http://x/api/payments/checkout', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }));
const pagbankOk = (id = 'CHEC_ABCDEF123456') =>
  new Response(JSON.stringify({ id, status: 'ACTIVE', links: [{ rel: 'SELF', href: 'https://x/self' }, { rel: 'PAY', href: 'https://pagamento.pagbank.com.br/pagamento?code=XYZ' }] }), { status: 200 });

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  payDb.reset(); session.user = null;
  payDb.users.push({ id: 'u1', email: 'u1@x.com', plan: 'free', pdf_imports_used: 0 });
  __resetPaymentsSchemaForTests(); __resetRateLimitStoreForTests();
  process.env.PAGBANK_TOKEN = TOKEN;
  process.env.ADMIN_EMAILS = 'u1@x.com'; // sandbox: só admin compra (ver describe da trava)
  delete process.env.PAGBANK_ENV; delete process.env.APP_BASE_URL;
  fetchMock = vi.fn(async () => pagbankOk());
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllGlobals(); delete process.env.PAGBANK_TOKEN; delete process.env.PAGBANK_ENV; delete process.env.ADMIN_EMAILS; });

describe('adaptador lib/pagbank.ts', () => {
  it('base: sandbox por padrão; produção só com PAGBANK_ENV exatamente "production"', () => {
    expect(pagBankBaseUrl()).toBe('https://sandbox.api.pagseguro.com');
    for (const v of ['sandbox', 'PRODUCTION', 'prod', '', ' production']) { process.env.PAGBANK_ENV = v; expect(pagBankBaseUrl()).toBe('https://sandbox.api.pagseguro.com'); }
    process.env.PAGBANK_ENV = 'production';
    expect(pagBankBaseUrl()).toBe('https://api.pagseguro.com');
  });

  it('POST /checkouts com Bearer, valor do catálogo em centavos e sem dados do cliente', async () => {
    const r = await createCheckout({ order: { reference_id: 'cvf_abc12345' }, plan: PLANS.padrao, urls: { redirectUrl: 'https://app/return', notificationUrl: 'https://app/hook' } });
    expect(r).toEqual({ checkoutId: 'CHEC_ABCDEF123456', payUrl: 'https://pagamento.pagbank.com.br/pagamento?code=XYZ' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://sandbox.api.pagseguro.com/checkouts');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe(`Bearer ${TOKEN}`);
    const body = JSON.parse(init.body);
    expect(body.items).toEqual([{ reference_id: 'padrao', name: 'CVFacil.NG - Plano Padrão', quantity: 1, unit_amount: 4000 }]);
    expect(body.reference_id).toBe('cvf_abc12345');
    expect(body.customer).toBeUndefined();
    expect(body.payment_notification_urls).toEqual(['https://app/hook']);
  });

  it.each([
    [401, 'PSP_AUTH'], [403, 'PSP_AUTH'], [400, 'PSP_REJECTED'], [500, 'PSP_UNAVAILABLE'], [503, 'PSP_UNAVAILABLE'],
  ])('HTTP %i -> erro tipado %s sem vazar token nem corpo', async (status, code) => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: `corpo-secreto ${TOKEN}` }), { status }));
    const err: any = await createCheckout({ order: { reference_id: 'cvf_abc12345' }, plan: PLANS.basico, urls: { redirectUrl: 'https://a/r', notificationUrl: 'https://a/h' } }).catch((e) => e);
    expect(err).toBeInstanceOf(PagBankError);
    expect(err.code).toBe(code);
    const logged = JSON.stringify((console.error as any).mock.calls);
    for (const s of [err.message, logged]) { expect(s).not.toContain(TOKEN); expect(s).not.toContain('corpo-secreto'); }
  });

  it('timeout e falha de rede viram erro tipado', async () => {
    fetchMock.mockRejectedValueOnce(Object.assign(new Error('t'), { name: 'TimeoutError' }));
    await expect(createCheckout({ order: { reference_id: 'cvf_abc12345' }, plan: PLANS.basico, urls: { redirectUrl: 'https://a/r', notificationUrl: 'https://a/h' } })).rejects.toMatchObject({ code: 'PSP_TIMEOUT' });
    fetchMock.mockRejectedValueOnce(new TypeError('network'));
    await expect(createCheckout({ order: { reference_id: 'cvf_abc12345' }, plan: PLANS.basico, urls: { redirectUrl: 'https://a/r', notificationUrl: 'https://a/h' } })).rejects.toMatchObject({ code: 'PSP_UNAVAILABLE' });
  });

  it('resposta sem id/PAY, link http ou JSON inválido -> PSP_BAD_RESPONSE; sem token -> PSP_NOT_CONFIGURED', async () => {
    const mk = () => createCheckout({ order: { reference_id: 'cvf_abc12345' }, plan: PLANS.basico, urls: { redirectUrl: 'https://a/r', notificationUrl: 'https://a/h' } });
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ id: 'CHEC_ABCDEF', links: [] }), { status: 200 }));
    await expect(mk()).rejects.toMatchObject({ code: 'PSP_BAD_RESPONSE' });
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ id: 'CHEC_ABCDEF', links: [{ rel: 'PAY', href: 'http://inseguro/x' }] }), { status: 200 }));
    await expect(mk()).rejects.toMatchObject({ code: 'PSP_BAD_RESPONSE' });
    fetchMock.mockResolvedValueOnce(new Response('nao-json', { status: 200 }));
    await expect(mk()).rejects.toMatchObject({ code: 'PSP_BAD_RESPONSE' });
    delete process.env.PAGBANK_TOKEN;
    await expect(mk()).rejects.toMatchObject({ code: 'PSP_NOT_CONFIGURED' });
  });
});

describe('POST /api/payments/checkout', () => {
  it('sem sessão -> 401 e nenhuma chamada ao PSP nem ao banco', async () => {
    expect((await post({ planId: 'basico' })).status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(payDb.orders).toHaveLength(0);
  });

  it('plano inválido -> 400 INVALID_PLAN, sem PSP', async () => {
    session.user = U;
    for (const planId of ['gratis', '', '__proto__', 5, undefined]) {
      const res = await post({ planId });
      expect(res.status).toBe(400);
      expect((await res.json()).code).toBe('INVALID_PLAN');
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('cria pedido pendente com valor do SERVIDOR (preço do cliente ignorado) e devolve o link PAY', async () => {
    session.user = U;
    const res = await post({ planId: 'premium', priceCents: 1, price: 0.01, amount: 1, userId: 'outro' });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.url).toBe('https://pagamento.pagbank.com.br/pagamento?code=XYZ');
    expect(json.reused).toBe(false);
    expect(payDb.orders).toHaveLength(1);
    expect(payDb.orders[0]).toMatchObject({ user_id: 'u1', plan_id: 'premium', amount_cents: 9000, status: 'pending', psp_order_id: 'CHEC_ABCDEF123456' });
    expect(payDb.orders[0].reference_id).toMatch(/^cvf_[0-9a-f]{32}$/);
    const sent = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(sent.items[0].unit_amount).toBe(9000);
    expect(sent.redirect_url).toBe(`https://cvfacil.xavierbr-vps.tech/payments/return?order=${payDb.orders[0].id}`);
    expect(sent.payment_notification_urls).toEqual(['https://cvfacil.xavierbr-vps.tech/api/payments/pagbank/webhook']);
  });

  it('idempotência: mesmo usuário e plano reutiliza o link pendente recente (1 pedido, 1 chamada ao PSP)', async () => {
    session.user = U;
    const a = await (await post({ planId: 'basico' })).json();
    const b = await (await post({ planId: 'basico' })).json();
    expect(b.reused).toBe(true);
    expect(b.url).toBe(a.url);
    expect(b.orderId).toBe(a.orderId);
    expect(payDb.orders).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // outro plano gera outro pedido
    await post({ planId: 'padrao' });
    expect(payDb.orders).toHaveLength(2);
  });

  it('pedido pendente antigo (> 90 min) não é reutilizado', async () => {
    session.user = U;
    await post({ planId: 'basico' });
    payDb.now += 91 * 60_000;
    const b = await (await post({ planId: 'basico' })).json();
    expect(b.reused).toBe(false);
    expect(payDb.orders).toHaveLength(2);
  });

  it.each([401, 500, 400])('falha do PSP (%i) -> 503 PAYMENT_UNAVAILABLE, pedido marcado failed, nunca aprovado', async (status) => {
    session.user = U;
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ detalhe: 'interno' }), { status }));
    const res = await post({ planId: 'basico' });
    expect(res.status).toBe(503);
    const text = await res.text();
    expect(JSON.parse(text).code).toBe('PAYMENT_UNAVAILABLE');
    expect(text).not.toMatch(/interno|aprovad|paid/i);
    expect(payDb.orders[0].status).toBe('failed');
    expect(payDb.users[0].plan).toBe('free');
  });

  it('sem PAGBANK_TOKEN -> 503 PAYMENT_UNAVAILABLE sem chamar a rede', async () => {
    session.user = U;
    delete process.env.PAGBANK_TOKEN;
    expect((await post({ planId: 'basico' })).status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('erro de banco -> 503 sem vazar detalhe', async () => {
    session.user = U;
    payDb.failAll = true;
    const res = await post({ planId: 'basico' });
    expect(res.status).toBe(503);
    expect(await res.text()).not.toContain('segredo-interno');
  });

  it('limite por usuário: 6a tentativa em 10 min -> 429', async () => {
    session.user = U;
    fetchMock.mockImplementation(async () => new Response('{}', { status: 500 }));
    for (let i = 0; i < 5; i++) expect((await post({ planId: 'basico' })).status).toBe(503);
    const res = await post({ planId: 'basico' });
    expect(res.status).toBe(429);
    expect((await res.json()).code).toBe('CHECKOUT_RATE_LIMITED');
  });

  it('APP_BASE_URL configurável (https); valor inseguro cai no padrão', async () => {
    session.user = U;
    process.env.APP_BASE_URL = 'http://inseguro.example';
    await post({ planId: 'basico' });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).redirect_url).toMatch(/^https:\/\/cvfacil\.xavierbr-vps\.tech\//);
    delete process.env.APP_BASE_URL;
  });
});

describe('trava de ambiente: fora de produção só administrador compra', () => {
  const COMUM = { id: 'u2', email: 'comum@x.com' };
  const pagou = () => payDb.orders.length + fetchMock.mock.calls.length;

  it('sandbox: não-admin -> 403 PAYMENTS_NOT_AVAILABLE, sem pedido e sem chamar o PSP', async () => {
    session.user = COMUM;
    for (const env of [undefined, 'sandbox', 'PRODUCTION', 'prod', '']) {
      if (env === undefined) delete process.env.PAGBANK_ENV; else process.env.PAGBANK_ENV = env;
      const res = await post({ planId: 'premium' });
      expect(res.status).toBe(403);
      expect((await res.json()).code).toBe('PAYMENTS_NOT_AVAILABLE');
    }
    expect(pagou()).toBe(0);
  });

  it('sandbox: administrador (ADMIN_EMAILS) consegue criar o checkout', async () => {
    session.user = U;
    process.env.PAGBANK_ENV = 'sandbox';
    expect((await post({ planId: 'basico' })).status).toBe(200);
    expect(payDb.orders).toHaveLength(1);
  });

  it('sem ADMIN_EMAILS ninguém é admin: bloqueado em sandbox', async () => {
    session.user = U;
    delete process.env.ADMIN_EMAILS;
    expect((await post({ planId: 'basico' })).status).toBe(403);
    expect(pagou()).toBe(0);
  });

  it('production: usuário comum logado pode criar o checkout (e a base é a de produção)', async () => {
    session.user = COMUM;
    payDb.users.push({ id: 'u2', email: 'comum@x.com', plan: 'free' });
    process.env.PAGBANK_ENV = 'production';
    const res = await post({ planId: 'padrao' });
    expect(res.status).toBe(200);
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.pagseguro.com/checkouts');
    expect(payDb.orders[0].user_id).toBe('u2');
  });

  it('sem sessão continua 401 (a trava vem depois da autenticação)', async () => {
    session.user = null;
    expect((await post({ planId: 'basico' })).status).toBe(401);
  });
});
