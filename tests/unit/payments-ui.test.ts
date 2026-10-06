import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createPayDb } from '../helpers/fakePayDb';

const session = vi.hoisted(() => ({ user: null as any }));
const payDb = createPayDb();
vi.mock('../../lib/neon', () => ({ sql: (s: TemplateStringsArray, ...v: any[]) => payDb.sql(s, ...v) }));
vi.mock('../../lib/session', async (orig) => ({ ...(await orig<any>()), getSessionUser: async () => session.user }));

import { GET as orderStatus } from '../../app/api/payments/orders/[id]/route';
import { startCheckout, fetchOrderState, ORDER_MESSAGES } from '../../services/paymentsClient';
import { SESSION_EXPIRED_MESSAGE } from '../../services/authClient';

const root = join(__dirname, '..', '..');
const read = (...p: string[]) => readFileSync(join(root, ...p), 'utf8');
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
const call = (id: string) => orderStatus(new Request(`http://x/api/payments/orders/${id}`), { params: Promise.resolve({ id }) });

beforeEach(() => {
  payDb.reset(); session.user = null;
  payDb.orders.push({ id: 'ord-aaaaaaaa-1', user_id: 'u1', plan_id: 'basico', amount_cents: 1500, reference_id: 'cvf_1', status: 'paid', created_at: Date.now() });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.unstubAllGlobals());

describe('GET /api/payments/orders/[id]', () => {
  it('sem sessão -> 401', async () => {
    expect((await call('ord-aaaaaaaa-1')).status).toBe(401);
  });
  it('dono vê o status; outro usuário e inexistente -> 404 igual; id malformado -> 404 sem tocar no banco', async () => {
    session.user = { id: 'u1', email: 'a@x.com' };
    const ok = await call('ord-aaaaaaaa-1');
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ id: 'ord-aaaaaaaa-1', status: 'paid', planId: 'basico' });
    session.user = { id: 'u2', email: 'b@x.com' };
    const alien = await call('ord-aaaaaaaa-1');
    const none = await call('ord-inexistente-9');
    expect(alien.status).toBe(404);
    expect(await alien.text()).toBe(await none.text());
    payDb.calls.length = 0;
    expect((await call("1; DROP TABLE orders;--")).status).toBe(404);
    expect(payDb.calls.filter((c) => c.t.includes('FROM orders'))).toHaveLength(0);
  });
  it('erro de banco -> 503 sem detalhe', async () => {
    session.user = { id: 'u1', email: 'a@x.com' };
    payDb.failAll = true;
    const res = await call('ord-aaaaaaaa-1');
    expect(res.status).toBe(503);
    expect(await res.text()).not.toContain('segredo-interno');
  });
});

describe('paymentsClient', () => {
  it('startCheckout envia só { planId } com credentials e devolve a URL https', async () => {
    const f = vi.fn().mockResolvedValue(json(200, { url: 'https://pagamento.pagbank.com.br/x?code=1' }));
    vi.stubGlobal('fetch', f);
    expect(await startCheckout('padrao')).toEqual({ ok: true, url: 'https://pagamento.pagbank.com.br/x?code=1' });
    expect(f.mock.calls[0][0]).toBe('/api/payments/checkout');
    expect(f.mock.calls[0][1].credentials).toBe('same-origin');
    expect(JSON.parse(f.mock.calls[0][1].body)).toEqual({ planId: 'padrao' });
  });
  it.each([[401, SESSION_EXPIRED_MESSAGE], [403, 'Pagamentos em breve.'], [429, /Muitas tentativas/], [503, /indisponível/], [400, /inválido/]])('erro %i vira mensagem clara', async (status, msg) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(status, {})));
    const r: any = await startCheckout('basico');
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(msg as any);
  });
  it('rede fora, URL http ou resposta sem url -> falha (nunca redireciona)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('net')));
    expect((await startCheckout('basico')).ok).toBe(false);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(200, { url: 'http://inseguro/x' })));
    expect((await startCheckout('basico')).ok).toBe(false);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(200, { url: 'javascript:alert(1)' })));
    expect((await startCheckout('basico')).ok).toBe(false);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(200, {})));
    expect((await startCheckout('basico')).ok).toBe(false);
  });
  it('fetchOrderState traduz o status do servidor', async () => {
    const mk = (status: number, body: unknown = {}) => vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(status, body)));
    mk(200, { status: 'pending' }); expect(await fetchOrderState('o1')).toBe('pending');
    mk(200, { status: 'paid' }); expect(await fetchOrderState('o1')).toBe('paid');
    for (const s of ['failed', 'canceled', 'expired']) { mk(200, { status: s }); expect(await fetchOrderState('o1')).toBe('closed'); }
    mk(401); expect(await fetchOrderState('o1')).toBe('unauthenticated');
    mk(404); expect(await fetchOrderState('o1')).toBe('notfound');
    mk(503); expect(await fetchOrderState('o1')).toBe('error');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('x')));
    expect(await fetchOrderState('o1')).toBe('error');
    expect(ORDER_MESSAGES.paid).toMatch(/aprovado/);
  });
});

describe('fontes: Pricing e página de retorno', () => {
  const pricing = read('components', 'Pricing.tsx');
  const page = read('app', 'payments', 'return', 'page.tsx');
  it('Pricing chama o checkout por plano, bloqueia clique duplo e troca Stripe por PagBank', () => {
    expect(pricing).toContain("startCheckout");
    for (const id of ['basico', 'padrao', 'premium']) expect(pricing).toContain(`buy('${id}')`);
    expect(pricing).toContain('useRef(false)');
    expect(pricing).toMatch(/disabled=\{busyPlan !== null\}/);
    expect(pricing).toContain('Entre na sua conta para contratar um plano.');
    expect(pricing).toContain('via PagBank');
    expect(pricing).not.toContain('Stripe');
    expect(pricing).not.toMatch(/priceCents|unit_amount|amount/i); // preço nunca é enviado pelo cliente
  });
  it('página de retorno valida o id, consulta o servidor e não usa query string como resultado', () => {
    expect(page).toContain('fetchOrderState');
    expect(page).toMatch(/ORDER_ID_RE/);
    expect(page).not.toMatch(/get\('(status|paid|result)'\)/);
  });
});
