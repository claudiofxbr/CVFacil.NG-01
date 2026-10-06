import { sql } from './neon';
import { ensurePaymentsSchema, type Order } from './payments';

/** Consultas e transições de pedidos usadas pelas rotas de pagamento (E2 a E4). */

/** Checkout pendente recente do mesmo usuário e plano (o link PAY expira em 2 h por padrão). */
export async function findReusableCheckout(userId: string, planId: string): Promise<Order | null> {
  await ensurePaymentsSchema();
  const rows = await sql`
    SELECT * FROM orders
    WHERE user_id = ${userId} AND plan_id = ${planId} AND status = 'pending'
      AND checkout_url IS NOT NULL AND created_at > CURRENT_TIMESTAMP - interval '90 minutes'
    ORDER BY created_at DESC LIMIT 1;
  `;
  return (rows[0] as (Order & { checkout_url: string }) | undefined) ?? null;
}

export async function attachCheckout(orderId: string, checkoutId: string, payUrl: string): Promise<void> {
  await ensurePaymentsSchema();
  await sql`
    UPDATE orders SET psp_order_id = ${checkoutId}, checkout_url = ${payUrl}
    WHERE id = ${orderId} AND status = 'pending';
  `;
}

/** Só devolve pedido do próprio usuário (alheio = inexistente). */
export async function getOrderForUser(orderId: string, userId: string): Promise<Order | null> {
  await ensurePaymentsSchema();
  const rows = await sql`
    SELECT id, plan_id, amount_cents, status, paid_at FROM orders WHERE id = ${orderId} AND user_id = ${userId} LIMIT 1;
  `;
  return (rows[0] as Order | undefined) ?? null;
}

export async function getOrderByReference(referenceId: string): Promise<Order | null> {
  await ensurePaymentsSchema();
  const rows = await sql`SELECT * FROM orders WHERE reference_id = ${referenceId} LIMIT 1;`;
  return (rows[0] as Order | undefined) ?? null;
}

/**
 * pending -> paid E concessão do plano numa ÚNICA instrução SQL (CTEs): ou as duas coisas acontecem
 * ou nenhuma. O UPDATE condicional (status = 'pending') garante que o mesmo pedido pago processado
 * duas vezes concede uma só vez. A compra define users.plan = id do plano e zera o contador de
 * importações. Devolve o pedido atualizado ou null se ele não estava pendente.
 */
export async function markOrderPaidAndGrant(orderId: string): Promise<Order | null> {
  await ensurePaymentsSchema();
  const rows = await sql`
    WITH paid AS (
      UPDATE orders SET status = 'paid', paid_at = CURRENT_TIMESTAMP
      WHERE id = ${orderId} AND status = 'pending'
      RETURNING *
    ),
    granted AS (
      UPDATE users u SET plan = paid.plan_id, pdf_imports_used = 0, updated_at = CURRENT_TIMESTAMP
      FROM paid WHERE u.id = paid.user_id
      RETURNING u.id
    )
    SELECT paid.*, (SELECT count(*) FROM granted) AS granted FROM paid;
  `;
  return (rows[0] as Order | undefined) ?? null;
}

/**
 * Estorno (sem rota ainda): paid -> refunded e revoga o plano SOMENTE se o usuário ainda estiver
 * nele (não derruba um plano comprado depois). Volta ao plano 'free'. Instrução única, idempotente.
 */
export async function markOrderRefundedAndRevoke(orderId: string): Promise<Order | null> {
  await ensurePaymentsSchema();
  const rows = await sql`
    WITH refunded AS (
      UPDATE orders SET status = 'refunded'
      WHERE id = ${orderId} AND status = 'paid'
      RETURNING *
    ),
    revoked AS (
      UPDATE users u SET plan = 'free', pdf_imports_used = 0, updated_at = CURRENT_TIMESTAMP
      FROM refunded WHERE u.id = refunded.user_id AND u.plan = refunded.plan_id
      RETURNING u.id
    )
    SELECT refunded.*, (SELECT count(*) FROM revoked) AS revoked FROM refunded;
  `;
  return (rows[0] as Order | undefined) ?? null;
}

export async function getOrderOwnerEmail(userId: string): Promise<string | null> {
  const rows = await sql`SELECT email FROM users WHERE id = ${userId} LIMIT 1;`;
  return typeof rows[0]?.email === 'string' ? rows[0].email : null;
}

// ---- deduplicação de notificações ----
export async function isEventProcessed(eventId: string): Promise<boolean> {
  await ensurePaymentsSchema();
  const rows = await sql`SELECT id FROM webhook_events WHERE event_id = ${eventId} LIMIT 1;`;
  return rows.length > 0;
}

/** Registra o evento depois de processado com sucesso; UNIQUE(event_id) torna repetição inofensiva. */
export async function recordEvent(id: string, eventId: string, orderId: string | null): Promise<void> {
  await ensurePaymentsSchema();
  await sql`
    INSERT INTO webhook_events (id, event_id, order_id) VALUES (${id}, ${eventId}, ${orderId})
    ON CONFLICT (event_id) DO NOTHING;
  `;
}
