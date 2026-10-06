import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHash } from 'node:crypto';
import { createPayDb } from '../helpers/fakePayDb';

const session = vi.hoisted(() => ({ user: null as any }));
const payDb = createPayDb();
vi.mock('../../lib/neon', () => ({ sql: (s: TemplateStringsArray, ...v: any[]) => payDb.sql(s, ...v) }));
vi.mock('../../lib/session', async (orig) => ({ ...(await orig<any>()), getSessionUser: async () => session.user }));

import { GET as orderStatus } from '../../app/api/payments/orders/[id]/route';
import { POST as webhook } from '../../app/api/payments/pagbank/webhook/route';
import { resolvePaymentFacts, diagnoseAuthenticity } from '../../lib/pagbank';
import { __resetPaymentsSchemaForTests } from '../../lib/payments';
import { __resetRateLimitStoreForTests } from '../../lib/rateLimit';

const TOKEN = 'tok-teste-nao-real-0123456789';
const REF = 'cvf_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const CHEC = 'CHEC_11111111-2222-3333-4444-555555555555';
const ORDE = 'ORDE_66666666-7777-8888-9999-000000000000';

// Formas REAIS observadas no sandbox (campos relevantes).
const checkoutPaid = (over: any = {}) => ({
  id: CHEC, reference_id: REF, status: 'ACTIVE', items: [{ name: 'x', quantity: 1, unit_amount: 1500 }],
  redirect_url: 'https://app/return', notification_urls: ['https://app/hook'], payment_notification_urls: ['https://app/hook'],
  orders: [{ id: ORDE, links: [{ rel: 'GET', href: `https://sandbox.api.pagseguro.com/orders/${ORDE}` }] }], ...over,
});
const checkoutUnpaid = () => { const { orders, ...rest } = checkoutPaid(); void orders; return rest; };
const orderPaid = (over: any = {}) => ({
  id: ORDE, reference_id: REF, created_at: '2026-10-07T10:00:00-03:00',
  charges: [{ id: 'CHAR_1', reference_id: REF, status: 'PAID', paid_at: '2026-10-07T10:00:05-03:00',
    amount: { value: 1500, currency: 'BRL', summary: { total: 1500, paid: 1500, refunded: 0, incremented: 0 } },
    payment_response: { code: '20000', message: 'SUCESSO' }, payment_method: { type: 'CREDIT_CARD', installments: 1, capture: true } }],
  ...over,
});
const reply = (json: unknown, status = 200) => new Response(JSON.stringify(json), { status });

let routes: Record<string, () => Response>;
let fetchMock: ReturnType<typeof vi.fn>;
const calls = () => fetchMock.mock.calls.map((c) => String(c[0]).replace('https://sandbox.api.pagseguro.com', ''));

const seedOrder = (over: any = {}) => {
  payDb.orders.push({ id: 'ord-aaaaaaaa-1', user_id: 'u1', plan_id: 'basico', amount_cents: 1500, reference_id: REF, psp_order_id: CHEC, checkout_url: 'https://p/x', status: 'pending', paid_at: null, created_at: Date.now(), ...over });
};
const getStatus = (id = 'ord-aaaaaaaa-1') => orderStatus(new Request('http://x/o'), { params: Promise.resolve({ id }) });

beforeEach(() => {
  payDb.reset(); session.user = { id: 'u1', email: 'dono@x.com' };
  payDb.users.push({ id: 'u1', email: 'dono@x.com', plan: 'free', pdf_imports_used: 0 });
  __resetPaymentsSchemaForTests(); __resetRateLimitStoreForTests();
  process.env.PAGBANK_TOKEN = TOKEN; process.env.ADMIN_EMAILS = 'dono@x.com'; delete process.env.PAGBANK_ENV;
  routes = {
    [`/checkouts/${CHEC}`]: () => reply(checkoutPaid()),
    [`/orders/${ORDE}`]: () => reply(orderPaid()),
  };
  fetchMock = vi.fn(async (url: string) => {
    const key = String(url).replace('https://sandbox.api.pagseguro.com', '');
    return routes[key] ? routes[key]() : reply({}, 404);
  });
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllGlobals(); for (const k of ['PAGBANK_TOKEN', 'ADMIN_EMAILS', 'PAGBANK_ENV']) delete process.env[k]; });

describe('resolvePaymentFacts com checkout CHEC_ (forma real do sandbox)', () => {
  it('segue orders[].id, consulta o pedido e agrega as cobranças PAID (1500 centavos)', async () => {
    expect(await resolvePaymentFacts(CHEC)).toEqual({ referenceId: REF, paid: true, paidAmountCents: 1500 });
    expect(calls()).toEqual([`/checkouts/${CHEC}`, `/orders/${ORDE}`]);
  });
  it('checkout sem orders[] (não pago) -> null, sem consultar pedidos', async () => {
    routes[`/checkouts/${CHEC}`] = () => reply(checkoutUnpaid());
    expect(await resolvePaymentFacts(CHEC)).toBeNull();
    expect(calls()).toEqual([`/checkouts/${CHEC}`]);
  });
  it('pedido do checkout com reference_id divergente é ignorado (null)', async () => {
    routes[`/orders/${ORDE}`] = () => reply(orderPaid({ reference_id: 'cvf_outro_bbbbbbbbbbbbbbbbbbbbbbbb' }));
    expect(await resolvePaymentFacts(CHEC)).toBeNull();
  });
  it('soma vários pedidos pagos; cobrança não paga não conta; ids malformados e excesso (>5) são ignorados', async () => {
    const ids = ['ORDE_a1111', 'ORDE_b2222', '../hack', 'x', 'ORDE_c3333', 'ORDE_d4444', 'ORDE_e5555', 'ORDE_f6666'];
    routes[`/checkouts/${CHEC}`] = () => reply(checkoutPaid({ orders: ids.map((id) => ({ id })) }));
    for (const id of ids.filter((i) => i.startsWith('ORDE_'))) {
      routes[`/orders/${id}`] = () => reply(orderPaid({ id, charges: [{ status: id === 'ORDE_b2222' ? 'DECLINED' : 'PAID', amount: { value: 500 } }] }));
    }
    const facts = await resolvePaymentFacts(CHEC);
    // considerados: a1111, b2222, c3333, d4444, e5555 (5 válidos); b2222 recusado -> 4 x 500
    expect(facts).toEqual({ referenceId: REF, paid: true, paidAmountCents: 2000 });
    expect(calls()).not.toContain('/orders/ORDE_f6666');
  });
  it('pedido consultado com cobrança DECLINED -> paid=false', async () => {
    routes[`/orders/${ORDE}`] = () => reply(orderPaid({ charges: [{ status: 'DECLINED', amount: { value: 1500 } }] }));
    expect(await resolvePaymentFacts(CHEC)).toMatchObject({ paid: false });
  });
  it('erro do PSP ao consultar o pedido propaga (para o chamador tratar como temporário)', async () => {
    routes[`/orders/${ORDE}`] = () => reply({}, 500);
    await expect(resolvePaymentFacts(CHEC)).rejects.toMatchObject({ code: 'PSP_UNAVAILABLE' });
  });
});

describe('GET /api/payments/orders/[id] reconcilia pedido pendente', () => {
  it('pending -> paid uma única vez e concede o plano; chamadas seguintes não reaplicam', async () => {
    seedOrder();
    const res = await getStatus();
    expect(await res.json()).toMatchObject({ status: 'paid', planId: 'basico' });
    expect(payDb.users[0]).toMatchObject({ plan: 'basico', pdf_imports_used: 0 });
    payDb.users[0].pdf_imports_used = 1;
    await getStatus();
    expect(payDb.users[0].pdf_imports_used).toBe(1); // sem nova concessão
    expect(fetchMock.mock.calls.length).toBe(2); // checkout + pedido, e não consulta de novo (já pago)
  });

  it('limite: no máximo 1 reconsulta ao PSP a cada 10 s por pedido', async () => {
    seedOrder();
    routes[`/checkouts/${CHEC}`] = () => reply(checkoutUnpaid());
    for (let i = 0; i < 5; i++) expect((await (await getStatus()).json()).status).toBe('pending');
    expect(calls().filter((c) => c.startsWith('/checkouts/'))).toHaveLength(1);
  });

  it('falha do PSP -> continua pending, sem erro 500', async () => {
    seedOrder();
    routes[`/checkouts/${CHEC}`] = () => reply({}, 500);
    const res = await getStatus();
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe('pending');
  });

  it('valor, referência ou status divergentes -> não libera', async () => {
    seedOrder();
    routes[`/orders/${ORDE}`] = () => reply(orderPaid({ charges: [{ status: 'PAID', amount: { value: 100 } }] }));
    expect((await (await getStatus()).json()).status).toBe('pending');
    payDb.calls.length = 0; __resetRateLimitStoreForTests();
    routes[`/orders/${ORDE}`] = () => reply(orderPaid({ charges: [{ status: 'PAID', amount: {} }] }));
    expect((await (await getStatus()).json()).status).toBe('pending'); // valor desconhecido também não libera
    __resetRateLimitStoreForTests();
    payDb.orders[0].reference_id = 'cvf_diferente_ccccccccccccccccccc';
    routes[`/checkouts/${CHEC}`] = () => reply(checkoutPaid()); // reference_id da API != do pedido
    routes[`/orders/${ORDE}`] = () => reply(orderPaid());
    expect((await (await getStatus()).json()).status).toBe('pending');
    expect(payDb.users[0].plan).toBe('free');
  });

  it('sandbox: dono NÃO admin não recebe o plano; production: recebe', async () => {
    delete process.env.ADMIN_EMAILS;
    seedOrder();
    expect((await (await getStatus()).json()).status).toBe('pending');
    expect(payDb.users[0].plan).toBe('free');
    __resetRateLimitStoreForTests();
    process.env.PAGBANK_ENV = 'production';
    fetchMock.mockImplementation(async (url: string) => {
      const key = String(url).replace('https://api.pagseguro.com', '');
      return routes[key] ? routes[key]() : reply({}, 404);
    });
    expect((await (await getStatus()).json()).status).toBe('paid');
    expect(payDb.users[0].plan).toBe('basico');
  });

  it('só reconcilia pedido do próprio dono (alheio = 404, sem consulta ao PSP)', async () => {
    seedOrder({ user_id: 'u9' });
    const res = await getStatus();
    expect(res.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sem checkout (psp_order_id nulo) não consulta o PSP', async () => {
    seedOrder({ psp_order_id: null });
    expect((await (await getStatus()).json()).status).toBe('pending');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('webhook com assinatura inválida (sandbox real não casou com a fórmula)', () => {
  const send = (body: unknown, headers: Record<string, string> = {}) => webhook(new Request('http://x/hook', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-authenticity-token': 'a'.repeat(64), 'x-product-origin': 'CHECKOUT', 'x-forwarded-for': '34.1.2.3', ...headers },
    body: JSON.stringify(body),
  }));

  it('id válido + API=PAID + dono admin em sandbox -> concede (a barreira é a reconsulta)', async () => {
    seedOrder();
    const res = await send({ id: CHEC });
    expect(res.status).toBe(200);
    expect(payDb.orders[0].status).toBe('paid');
    expect(payDb.users[0].plan).toBe('basico');
    expect(payDb.events).toHaveLength(1);
  });

  it('o corpo não manda: afirma PAID mas a API não confirma -> NÃO concede e não grava evento', async () => {
    seedOrder();
    routes[`/orders/${ORDE}`] = () => reply(orderPaid({ charges: [{ status: 'WAITING', amount: { value: 1500 } }] }));
    const res = await send({ id: CHEC, charges: [{ status: 'PAID', amount: { value: 1500 } }] });
    expect(res.status).toBe(200);
    expect(payDb.orders[0].status).toBe('pending');
    expect(payDb.users[0].plan).toBe('free');
    expect(payDb.events).toHaveLength(0);
  });

  it('sandbox + dono não admin -> não concede; id inválido ou ausente -> 401 sem tocar no PSP', async () => {
    delete process.env.ADMIN_EMAILS;
    seedOrder();
    expect((await send({ id: CHEC })).status).toBe(200);
    expect(payDb.users[0].plan).toBe('free');
    fetchMock.mockClear();
    for (const body of [{ id: '../../etc/passwd' }, { id: 'ORDE_' }, { id: 'XXXX_1234' }, { nada: 1 }, {}]) {
      expect((await send(body)).status).toBe(401);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('limite por IP: 30/min, depois 429', async () => {
    seedOrder();
    routes[`/checkouts/${CHEC}`] = () => reply(checkoutUnpaid());
    for (let i = 0; i < 30; i++) expect((await send({ id: CHEC, n: i })).status).toBe(200);
    expect((await send({ id: CHEC, n: 99 })).status).toBe(429);
    expect((await send({ id: CHEC }, { 'x-forwarded-for': '9.9.9.9' })).status).toBe(200); // outro IP não é afetado
  });

  it('diagnóstico no log: só booleanos e tamanhos, nenhum segredo, header ou corpo', async () => {
    seedOrder();
    const body = { id: CHEC, marcador_do_corpo: 'CORPO-SECRETO-XYZ' };
    await send(body, { 'x-authenticity-token': 'HEADER-SECRETO-ABC' });
    const logged = JSON.stringify([...(console.warn as any).mock.calls, ...(console.info as any).mock.calls, ...(console.error as any).mock.calls]);
    for (const secret of [TOKEN, 'HEADER-SECRETO-ABC', 'header-secreto-abc', 'CORPO-SECRETO-XYZ', 'dono@x.com']) expect(logged).not.toContain(secret);
    expect(logged).toContain('tokenDashBody');
    expect(logged).toMatch(/signatureValid\\":false/);
    expect(logged).toMatch(/hasHeader\\":true/);
    expect(logged).toMatch(/headerLength\\":18/);
  });

  it('diagnoseAuthenticity identifica a fórmula que casa', () => {
    const raw = '{"id":"ORDE_1"}';
    const sha = (v: string) => createHash('sha256').update(v).digest('hex');
    expect(diagnoseAuthenticity(raw, sha(`${TOKEN}-${raw}`))).toMatchObject({ tokenDashBody: true, tokenBody: false, bodyDashToken: false });
    expect(diagnoseAuthenticity(raw, sha(`${TOKEN}${raw}`))).toMatchObject({ tokenDashBody: false, tokenBody: true });
    expect(diagnoseAuthenticity(raw, sha(`${raw}-${TOKEN}`))).toMatchObject({ bodyDashToken: true });
    expect(diagnoseAuthenticity(raw, null)).toMatchObject({ hasHeader: false, headerLength: 0, tokenDashBody: false });
  });
});
