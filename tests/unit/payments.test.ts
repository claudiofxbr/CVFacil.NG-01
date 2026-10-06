import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const db = vi.hoisted(() => ({ orders: [] as any[], calls: [] as { t: string; v: any[] }[], failDdlOnce: false }));

vi.mock('../../lib/neon', () => ({
  sql: async (strings: TemplateStringsArray, ...v: any[]) => {
    const t = strings.join('?').replace(/\s+/g, ' ').trim();
    db.calls.push({ t, v });
    if (t.startsWith('CREATE')) {
      if (db.failDdlOnce) { db.failDdlOnce = false; throw new Error('ddl falhou'); }
      return [];
    }
    if (t.startsWith('INSERT INTO orders')) {
      if (db.orders.some((o) => o.reference_id === v[4])) return []; // ON CONFLICT DO NOTHING
      const o = { id: v[0], user_id: v[1], plan_id: v[2], amount_cents: v[3], reference_id: v[4], psp_order_id: null, status: 'pending', paid_at: null };
      db.orders.push(o);
      return [o];
    }
    if (t.startsWith('SELECT * FROM orders WHERE reference_id')) return db.orders.filter((o) => o.reference_id === v[0]);
    if (t.startsWith('UPDATE orders')) {
      const [to, , id, sources] = v;
      const o = db.orders.find((x) => x.id === id && sources.split(',').includes(x.status));
      if (!o) return [];
      o.status = to;
      if (to === 'paid') o.paid_at = 'now';
      return [o];
    }
    throw new Error('query inesperada: ' + t);
  },
}));

import { PLANS, resolvePlan, requirePlan, formatBRL, PlanError } from '../../lib/plans';
import {
  createPendingOrder, transitionOrderStatus, canTransition, allowedSources, ensurePaymentsSchema,
  __resetPaymentsSchemaForTests, OrderError,
} from '../../lib/payments';

beforeEach(() => {
  db.orders.length = 0; db.calls.length = 0; db.failDdlOnce = false;
  __resetPaymentsSchemaForTests();
});

describe('catálogo de planos (servidor)', () => {
  it('valores, cotas e benefícios definidos', () => {
    expect(PLANS.basico).toMatchObject({ priceCents: 1500, maxResumes: 1, maxPdfImports: 1, layouts: 'basicos', exports: ['PDF'], prioritySupport: false });
    expect(PLANS.padrao).toMatchObject({ priceCents: 4000, maxResumes: 6, maxPdfImports: 3, layouts: 'todos', exports: ['PDF', 'DOCX', 'HTML'], prioritySupport: false });
    expect(PLANS.premium).toMatchObject({ priceCents: 9000, maxResumes: 9, maxPdfImports: 9, layouts: 'todos+exclusivos', exports: ['PDF', 'DOCX', 'HTML'], prioritySupport: true });
  });
  it('preços são centavos inteiros e o catálogo é imutável', () => {
    for (const p of Object.values(PLANS)) expect(Number.isSafeInteger(p.priceCents)).toBe(true);
    expect(() => { (PLANS.basico as any).priceCents = 1; }).toThrow();
    expect(PLANS.basico.priceCents).toBe(1500);
  });
  it('resolvePlan rejeita ids desconhecidos, vazios e chaves herdadas', () => {
    for (const bad of ['gratis', '', 'BASICO', '__proto__', 'constructor', 'toString', 1, null, undefined, {}, [], { planId: 'x' }, { planId: '__proto__' }]) {
      expect(resolvePlan(bad)).toBeNull();
    }
    expect(() => requirePlan('nope')).toThrow(PlanError);
  });
  it('resolvePlan IGNORA preço vindo do cliente', () => {
    expect(resolvePlan({ planId: 'premium', priceCents: 1, price: 0.01, amount: 1, value: '1,00' })?.priceCents).toBe(9000);
    expect(resolvePlan('basico')?.priceCents).toBe(1500);
  });
  it('formatBRL', () => {
    expect(formatBRL(1500)).toBe('R$ 15,00');
    expect(formatBRL(9005)).toBe('R$ 90,05');
    expect(() => formatBRL(15.5)).toThrow();
    expect(() => formatBRL(-1)).toThrow();
  });
});

describe('esquema lazy e idempotente', () => {
  it('cria orders e webhook_events com UNIQUE, uma única vez', async () => {
    await ensurePaymentsSchema();
    await ensurePaymentsSchema();
    const ddl = db.calls.map((c) => c.t);
    expect(ddl.filter((t) => t.startsWith('CREATE TABLE IF NOT EXISTS orders'))).toHaveLength(1);
    const orders = ddl.find((t) => t.startsWith('CREATE TABLE IF NOT EXISTS orders'))!;
    expect(orders).toContain('reference_id VARCHAR(100) NOT NULL UNIQUE');
    expect(orders).toContain('REFERENCES users(id)');
    expect(orders).toContain('amount_cents INTEGER NOT NULL CHECK (amount_cents > 0)');
    const wh = ddl.find((t) => t.startsWith('CREATE TABLE IF NOT EXISTS webhook_events'))!;
    expect(wh).toContain('event_id VARCHAR(200) NOT NULL UNIQUE');
    expect(ddl.every((t) => !t.startsWith('DROP') && !/ALTER TABLE .* DROP/.test(t))).toBe(true);
  });
  it('falha no DDL não é cacheada', async () => {
    db.failDdlOnce = true;
    await expect(ensurePaymentsSchema()).rejects.toThrow();
    await expect(ensurePaymentsSchema()).resolves.toBeUndefined();
  });
  it('/api/neon/setup registra as tabelas de pagamento', () => {
    const src = readFileSync(join(__dirname, '..', '..', 'app', 'api', 'neon', 'setup', 'route.ts'), 'utf8');
    expect(src).toContain('ensurePaymentsSchema');
    expect(src).toContain('"orders", "webhook_events"');
  });
});

describe('pedido pendente idempotente', () => {
  const REF = 'ref-12345678';
  it('valor e plano vêm do servidor, mesmo com preço forjado', async () => {
    const { order, created } = await createPendingOrder({ userId: 'u1', planId: { planId: 'padrao', priceCents: 1, amount: 1 } as any, referenceId: REF });
    expect(created).toBe(true);
    expect(order).toMatchObject({ user_id: 'u1', plan_id: 'padrao', amount_cents: 4000, status: 'pending' });
    expect(db.calls.find((c) => c.t.startsWith('INSERT INTO orders'))!.v).toContain(4000);
  });
  it('mesma reference_id -> mesmo pedido, sem duplicar', async () => {
    const a = await createPendingOrder({ userId: 'u1', planId: 'basico', referenceId: REF });
    const b = await createPendingOrder({ userId: 'u1', planId: 'basico', referenceId: REF });
    expect(a.created).toBe(true);
    expect(b.created).toBe(false);
    expect(b.order.id).toBe(a.order.id);
    expect(db.orders).toHaveLength(1);
  });
  it('reference_id reutilizada por outro usuário ou outro plano -> conflito, sem alterar o pedido', async () => {
    await createPendingOrder({ userId: 'u1', planId: 'basico', referenceId: REF });
    await expect(createPendingOrder({ userId: 'u2', planId: 'basico', referenceId: REF })).rejects.toMatchObject({ code: 'REFERENCE_CONFLICT' });
    await expect(createPendingOrder({ userId: 'u1', planId: 'premium', referenceId: REF })).rejects.toMatchObject({ code: 'REFERENCE_CONFLICT' });
    expect(db.orders).toHaveLength(1);
    expect(db.orders[0].amount_cents).toBe(1500);
  });
  it('plano desconhecido ou referência/usuário inválidos não tocam o banco', async () => {
    await expect(createPendingOrder({ userId: 'u1', planId: 'gratis', referenceId: REF })).rejects.toBeInstanceOf(PlanError);
    await expect(createPendingOrder({ userId: 'u1', planId: 'basico', referenceId: 'curta' })).rejects.toBeInstanceOf(OrderError);
    await expect(createPendingOrder({ userId: 'u1', planId: 'basico', referenceId: 'ref com espaço!' })).rejects.toBeInstanceOf(OrderError);
    await expect(createPendingOrder({ userId: '', planId: 'basico', referenceId: REF })).rejects.toBeInstanceOf(OrderError);
    expect(db.calls).toEqual([]);
  });
});

describe('status só para frente', () => {
  it('matriz de transições', () => {
    expect(canTransition('pending', 'paid')).toBe(true);
    expect(canTransition('pending', 'canceled')).toBe(true);
    expect(canTransition('paid', 'refunded')).toBe(true);
    for (const [from, to] of [['paid', 'pending'], ['paid', 'canceled'], ['canceled', 'paid'], ['expired', 'paid'], ['failed', 'paid'], ['refunded', 'paid'], ['pending', 'pending'], ['pending', 'refunded'], ['x', 'paid'], ['pending', 'x'], [null, 'paid']] as const) {
      expect(canTransition(from, to)).toBe(false);
    }
    expect(allowedSources('paid')).toEqual(['pending']);
    expect(allowedSources('refunded')).toEqual(['paid']);
    expect(allowedSources('pending')).toEqual([]);
  });
  it('transição atômica: pendente->pago define paid_at; repetir ou voltar não altera', async () => {
    const { order } = await createPendingOrder({ userId: 'u1', planId: 'basico', referenceId: 'ref-abcdefgh' });
    const paid = await transitionOrderStatus(order.id, 'paid');
    expect(paid?.status).toBe('paid');
    expect(db.orders[0].paid_at).toBe('now');
    expect(await transitionOrderStatus(order.id, 'paid')).toBeNull();
    expect(await transitionOrderStatus(order.id, 'pending')).toBeNull();
    expect(await transitionOrderStatus(order.id, 'canceled')).toBeNull();
    expect(db.orders[0].status).toBe('paid');
    expect((await transitionOrderStatus(order.id, 'refunded'))?.status).toBe('refunded');
    expect(await transitionOrderStatus(order.id, 'paid')).toBeNull();
  });
  it('pedido inexistente e status inválido -> null', async () => {
    expect(await transitionOrderStatus('nao-existe', 'paid')).toBeNull();
    expect(await transitionOrderStatus('x', 'hack' as any)).toBeNull();
  });
});

describe('sem rotas de checkout/webhook nem chamada ao PSP nesta etapa', () => {
  it('lib/payments e lib/plans não usam fetch nem segredos', () => {
    for (const f of ['payments.ts', 'plans.ts']) {
      const src = readFileSync(join(__dirname, '..', '..', 'lib', f), 'utf8');
      expect(src).not.toMatch(/fetch\(|process\.env|PAGBANK|pagseguro/i);
    }
  });
});
