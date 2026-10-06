import { randomUUID } from 'node:crypto';
import { sql } from './neon';
import { requirePlan } from './plans';

/**
 * Pedidos (orders) e eventos de webhook. Etapa E1: só esquema e regras puras; nenhuma chamada ao PSP.
 * O valor do pedido vem SEMPRE do catálogo do servidor (lib/plans.ts).
 */

export type OrderStatus = 'pending' | 'paid' | 'canceled' | 'expired' | 'failed' | 'refunded';

export interface Order {
  id: string;
  user_id: string;
  plan_id: string;
  amount_cents: number;
  reference_id: string;
  psp_order_id: string | null;
  status: OrderStatus;
  created_at?: string;
  paid_at?: string | null;
}

export class OrderError extends Error {
  constructor(public readonly code: 'INVALID_REFERENCE' | 'REFERENCE_CONFLICT' | 'INVALID_USER' | 'ORDER_NOT_FOUND') {
    super(code);
    this.name = 'OrderError';
  }
}

// ---- Esquema aditivo, idempotente e lazy ----
let schemaReady = false;

export async function ensurePaymentsSchema(): Promise<void> {
  if (schemaReady) return;
  await sql`
    CREATE TABLE IF NOT EXISTS orders (
      id VARCHAR(64) PRIMARY KEY,
      user_id VARCHAR(100) NOT NULL REFERENCES users(id),
      plan_id VARCHAR(20) NOT NULL,
      amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
      reference_id VARCHAR(100) NOT NULL UNIQUE,
      psp_order_id VARCHAR(100),
      status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending','paid','canceled','expired','failed','refunded')),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      paid_at TIMESTAMP WITH TIME ZONE DEFAULT NULL
    );
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS webhook_events (
      id VARCHAR(64) PRIMARY KEY,
      event_id VARCHAR(200) NOT NULL UNIQUE,
      order_id VARCHAR(64) REFERENCES orders(id),
      received_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `;
  // Link PAY do checkout hospedado (permite reutilizar o link de um pedido pendente recente).
  await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS checkout_url TEXT;`;
  // Direitos do plano: contador de importações de PDF desde a última compra paga.
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS pdf_imports_used INTEGER NOT NULL DEFAULT 0;`;
  await sql`CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);`;
  await sql`CREATE INDEX IF NOT EXISTS idx_webhook_events_order_id ON webhook_events(order_id);`;
  schemaReady = true; // só após o sucesso: falha de DDL é tentada de novo
}

export function __resetPaymentsSchemaForTests(): void {
  schemaReady = false;
}

// ---- Transição de status: somente para frente ----
const TRANSITIONS: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = Object.freeze({
  pending: ['paid', 'canceled', 'expired', 'failed'],
  paid: ['refunded'],
  canceled: [],
  expired: [],
  failed: [],
  refunded: [],
});

export const isOrderStatus = (v: unknown): v is OrderStatus =>
  typeof v === 'string' && Object.prototype.hasOwnProperty.call(TRANSITIONS, v);

export function canTransition(from: unknown, to: unknown): boolean {
  return isOrderStatus(from) && isOrderStatus(to) && TRANSITIONS[from].includes(to);
}

/** Estados de origem permitidos para chegar em `to` (usado no UPDATE condicional atômico). */
export function allowedSources(to: OrderStatus): OrderStatus[] {
  return (Object.keys(TRANSITIONS) as OrderStatus[]).filter((from) => TRANSITIONS[from].includes(to));
}

// ---- Pedido pendente idempotente por reference_id ----
const REFERENCE_RE = /^[A-Za-z0-9_-]{8,100}$/;

export async function createPendingOrder(input: {
  userId: string;
  planId: unknown;
  referenceId: string;
}): Promise<{ order: Order; created: boolean }> {
  if (typeof input.userId !== 'string' || !input.userId) throw new OrderError('INVALID_USER');
  if (typeof input.referenceId !== 'string' || !REFERENCE_RE.test(input.referenceId)) throw new OrderError('INVALID_REFERENCE');
  // Preço e plano definidos no servidor: qualquer valor enviado pelo cliente nem chega aqui.
  const plan = requirePlan(input.planId);

  await ensurePaymentsSchema();
  const inserted = await sql`
    INSERT INTO orders (id, user_id, plan_id, amount_cents, reference_id, status)
    VALUES (${randomUUID()}, ${input.userId}, ${plan.id}, ${plan.priceCents}, ${input.referenceId}, 'pending')
    ON CONFLICT (reference_id) DO NOTHING
    RETURNING *;
  `;
  if (inserted[0]) return { order: inserted[0] as Order, created: true };

  const existing = await sql`SELECT * FROM orders WHERE reference_id = ${input.referenceId} LIMIT 1;`;
  const order = existing[0] as Order | undefined;
  // A mesma referência só é reaproveitada pelo mesmo usuário e plano; senão é conflito (sem revelar o dono).
  if (!order || order.user_id !== input.userId || order.plan_id !== plan.id) throw new OrderError('REFERENCE_CONFLICT');
  return { order, created: false };
}

/** Avança o status de forma atômica e só para frente. Devolve o pedido atualizado ou null se a transição não vale. */
export async function transitionOrderStatus(orderId: string, to: OrderStatus): Promise<Order | null> {
  if (!isOrderStatus(to)) return null;
  const sources = allowedSources(to);
  if (sources.length === 0) return null;
  await ensurePaymentsSchema();
  const rows = await sql`
    UPDATE orders
    SET status = ${to}, paid_at = CASE WHEN ${to}::text = 'paid' THEN CURRENT_TIMESTAMP ELSE paid_at END
    WHERE id = ${orderId} AND status = ANY(string_to_array(${sources.join(',')}, ','))
    RETURNING *;
  `;
  return (rows[0] as Order | undefined) ?? null;
}
