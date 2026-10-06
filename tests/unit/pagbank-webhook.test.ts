import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHash } from 'node:crypto';
import { createPayDb } from '../helpers/fakePayDb';

const payDb = createPayDb();
vi.mock('../../lib/neon', () => ({ sql: (s: TemplateStringsArray, ...v: any[]) => payDb.sql(s, ...v) }));

import { POST as webhook } from '../../app/api/payments/pagbank/webhook/route';
import { verifyAuthenticity, resolvePaymentFacts } from '../../lib/pagbank';
import { __resetPaymentsSchemaForTests } from '../../lib/payments';

const TOKEN = 'tok-teste-nao-real-0123456789';
const sign = (raw: string, token = TOKEN) => createHash('sha256').update(`${token}-${raw}`).digest('hex');
const REF = 'cvf_00000000000000000000000000000001';

let fetchMock: ReturnType<typeof vi.fn>;
const apiOrder = (over: any = {}) => ({ id: 'ORDE_1111', reference_id: REF, charges: [{ status: 'PAID', amount: { value: 4000 } }], ...over });
const reply = (json: any, status = 200) => new Response(JSON.stringify(json), { status });

const send = (body: unknown, opts: { sig?: string | null; origin?: string; raw?: string } = {}) => {
  const raw = opts.raw ?? JSON.stringify(body);
  const headers: Record<string, string> = { 'content-type': 'application/json', 'x-product-origin': opts.origin ?? 'ORDER' };
  const sig = opts.sig === undefined ? sign(raw) : opts.sig;
  if (sig !== null) headers['x-authenticity-token'] = sig;
  return webhook(new Request('http://x/api/payments/pagbank/webhook', { method: 'POST', headers, body: raw }));
};

beforeEach(() => {
  payDb.reset();
  payDb.users.push({ id: 'u1', email: 'dono@x.com', plan: 'free', pdf_imports_used: 2 });
  process.env.ADMIN_EMAILS = 'dono@x.com'; // sandbox: só dono admin recebe plano
  payDb.orders.push({ id: 'o1', user_id: 'u1', plan_id: 'padrao', amount_cents: 4000, reference_id: REF, status: 'pending', paid_at: null, created_at: Date.now(), checkout_url: 'https://p/x' });
  __resetPaymentsSchemaForTests();
  process.env.PAGBANK_TOKEN = TOKEN;
  delete process.env.PAGBANK_ENV;
  fetchMock = vi.fn(async () => reply(apiOrder()));
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllGlobals(); delete process.env.PAGBANK_TOKEN; delete process.env.PAGBANK_ENV; delete process.env.ADMIN_EMAILS; });

describe('autenticidade (x-authenticity-token)', () => {
  it('SHA-256 de {token}-{corpo} em hex; maiúsculas aceitas; qualquer alteração invalida', () => {
    const raw = '{"id":"ORDE_1"}';
    expect(verifyAuthenticity(raw, sign(raw))).toBe(true);
    expect(verifyAuthenticity(raw, sign(raw).toUpperCase())).toBe(true);
    expect(verifyAuthenticity(raw + ' ', sign(raw))).toBe(false);
    expect(verifyAuthenticity(raw, sign(raw, 'outro-token'))).toBe(false);
    expect(verifyAuthenticity(raw, null)).toBe(false);
    expect(verifyAuthenticity(raw, 'abc')).toBe(false);
    delete process.env.PAGBANK_TOKEN;
    expect(verifyAuthenticity(raw, sign(raw))).toBe(false);
  });
});

describe('POST webhook', () => {
  it('assinatura inválida ou ausente -> 401 sem tocar no banco nem no PSP', async () => {
    for (const sig of ['0'.repeat(64), 'lixo', null, sign('{"id":"ORDE_1111"}', 'token-errado')]) {
      expect((await send({ id: 'ORDE_1111' }, { sig })).status).toBe(401);
    }
    expect(payDb.calls).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('assina o corpo BRUTO: reserializar o JSON muda a assinatura', async () => {
    const raw = '{ "id" : "ORDE_1111" }';
    expect((await send({}, { raw, sig: sign(JSON.stringify(JSON.parse(raw))) })).status).toBe(401);
    expect((await send({}, { raw })).status).toBe(200);
  });

  it('pago na reconsulta -> pedido paid e plano concedido (users.plan, contador zerado)', async () => {
    const res = await send({ id: 'ORDE_1111', reference_id: 'qualquer-coisa-do-corpo', charges: [{ status: 'PAID' }] });
    expect(res.status).toBe(200);
    expect(fetchMock.mock.calls[0][0]).toBe('https://sandbox.api.pagseguro.com/orders/ORDE_1111');
    expect(payDb.orders[0].status).toBe('paid');
    expect(payDb.users[0]).toMatchObject({ plan: 'padrao', pdf_imports_used: 0 });
    expect(payDb.events).toHaveLength(1);
  });

  it('o corpo NÃO é confiável: corpo diz PAID mas a API diz outra coisa -> nada é liberado', async () => {
    fetchMock.mockResolvedValue(reply(apiOrder({ charges: [{ status: 'DECLINED', amount: { value: 4000 } }] })));
    const res = await send({ id: 'ORDE_1111', charges: [{ status: 'PAID', amount: { value: 4000 } }] });
    expect(res.status).toBe(200);
    expect(payDb.orders[0].status).toBe('pending');
    expect(payDb.users[0].plan).toBe('free');
  });

  it('referência vem da API, não do corpo: corpo apontando para o nosso pedido não libera se a API aponta para outro', async () => {
    fetchMock.mockResolvedValue(reply(apiOrder({ reference_id: 'cvf_de_outra_loja_000000000000' })));
    await send({ id: 'ORDE_1111', reference_id: REF });
    expect(payDb.orders[0].status).toBe('pending');
  });

  it('valor pago diferente do pedido -> não libera', async () => {
    fetchMock.mockResolvedValue(reply(apiOrder({ charges: [{ status: 'PAID', amount: { value: 100 } }] })));
    expect((await send({ id: 'ORDE_1111' })).status).toBe(200);
    expect(payDb.orders[0].status).toBe('pending');
    expect(payDb.users[0].plan).toBe('free');
  });

  it('webhook repetido (mesmo corpo) é deduplicado; reconsulta não se repete', async () => {
    const body = { id: 'ORDE_1111' };
    expect((await send(body)).status).toBe(200);
    const again = await send(body);
    expect(await again.json()).toMatchObject({ duplicate: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(payDb.events).toHaveLength(1);
  });

  it('mesmo pedido PAID em eventos DIFERENTES concede uma única vez', async () => {
    await send({ id: 'ORDE_1111', n: 1 });
    payDb.users[0].plan = 'basico'; // simula mudança posterior; um segundo evento não pode reaplicar a concessão
    payDb.users[0].pdf_imports_used = 1;
    await send({ id: 'ORDE_1111', n: 2 });
    expect(payDb.users[0]).toMatchObject({ plan: 'basico', pdf_imports_used: 1 });
    expect(payDb.orders[0].status).toBe('paid');
  });

  it('pedido desconhecido -> 200 ignorado; id não resolvível -> 200 ignorado sem liberar', async () => {
    fetchMock.mockResolvedValueOnce(reply(apiOrder({ reference_id: 'cvf_inexistente_000000000000000' })));
    expect(await (await send({ id: 'ORDE_9999' })).json()).toMatchObject({ ignored: true });
    fetchMock.mockResolvedValueOnce(reply({ id: 'CHEC_ABCDEF', reference_id: REF, status: 'ACTIVE' })); // sem charges
    expect(await (await send({ id: 'CHEC_ABCDEF' }, { origin: 'CHECKOUT' })).json()).toMatchObject({ ignored: true });
    expect(await (await send({ id: '../../etc/passwd' })).json()).toMatchObject({ ignored: true });
    expect(payDb.orders[0].status).toBe('pending');
  });

  it('falha do PSP ou do banco -> 503 (para reenvio) e o evento NÃO é registrado', async () => {
    fetchMock.mockResolvedValueOnce(reply({ x: 1 }, 500));
    expect((await send({ id: 'ORDE_1111' })).status).toBe(503);
    expect(payDb.events).toHaveLength(0);
    payDb.failAll = true;
    const res = await send({ id: 'ORDE_1111', n: 3 });
    expect(res.status).toBe(503);
    expect(await res.text()).not.toContain('segredo-interno');
    payDb.failAll = false;
    expect((await send({ id: 'ORDE_1111' })).status).toBe(200); // reenvio funciona
    expect(payDb.orders[0].status).toBe('paid');
  });

  it('corpo inválido (assinatura ok) -> 400; corpo gigante -> 413', async () => {
    expect((await send(null, { raw: 'nao-json' })).status).toBe(400);
    expect((await send(null, { raw: 'x'.repeat(200_001) })).status).toBe(413);
  });
});

describe('webhook: trava de ambiente (defesa em profundidade)', () => {
  it('sandbox: pago por dono NÃO admin -> evento registrado, plano NÃO concedido', async () => {
    delete process.env.ADMIN_EMAILS;
    const res = await send({ id: 'ORDE_1111' });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ignored: true });
    expect(payDb.orders[0].status).toBe('pending');
    expect(payDb.users[0].plan).toBe('free');
    expect(payDb.events).toHaveLength(1);
  });
  it('sandbox: dono administrador recebe o plano', async () => {
    expect((await send({ id: 'ORDE_1111' })).status).toBe(200);
    expect(payDb.users[0].plan).toBe('padrao');
  });
  it('production: dono comum recebe o plano', async () => {
    delete process.env.ADMIN_EMAILS;
    process.env.PAGBANK_ENV = 'production';
    expect((await send({ id: 'ORDE_1111' })).status).toBe(200);
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.pagseguro.com/orders/ORDE_1111');
    expect(payDb.orders[0].status).toBe('paid');
    expect(payDb.users[0].plan).toBe('padrao');
  });
});

describe('resolvePaymentFacts', () => {
  it('soma só cobranças PAID; sem valor informado -> paidAmountCents null', async () => {
    fetchMock.mockResolvedValueOnce(reply(apiOrder({ charges: [{ status: 'PAID', amount: { value: 1000 } }, { status: 'PAID', amount: { value: 3000 } }, { status: 'DECLINED', amount: { value: 9 } }] })));
    expect(await resolvePaymentFacts('ORDE_1111')).toEqual({ referenceId: REF, paid: true, paidAmountCents: 4000 });
    fetchMock.mockResolvedValueOnce(reply(apiOrder({ charges: [{ status: 'PAID' }] })));
    expect(await resolvePaymentFacts('ORDE_1111')).toMatchObject({ paid: true, paidAmountCents: null });
    fetchMock.mockResolvedValueOnce(reply(apiOrder({ charges: [] })));
    expect(await resolvePaymentFacts('ORDE_1111')).toMatchObject({ paid: false });
  });
});
