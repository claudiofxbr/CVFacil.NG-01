import { hitExceeds } from './rateLimit';
import { isPaymentsProduction, resolvePaymentFacts, type PaymentFacts } from './pagbank';
import { markOrderPaidAndGrant, getOrderForReconcile } from './orders';
import type { Order } from './payments';

export type ReleaseOutcome = 'granted' | 'already' | 'not_paid' | 'mismatch' | 'blocked';

/**
 * ÚNICO ponto de liberação do plano (webhook e reconciliação). Só concede se, nesta ordem:
 * a API confirma PAID; o reference_id devolvido pela API é o do NOSSO pedido; o valor pago em centavos
 * é exatamente o do pedido; e, fora de produção, o dono do pedido é administrador (cartão de teste é público).
 * A concessão é idempotente (UPDATE condicional pending -> paid).
 */
export async function releaseIfConfirmed(
  order: Pick<Order, 'id' | 'reference_id' | 'amount_cents'>,
  facts: PaymentFacts,
  ownerIsAdmin: () => Promise<boolean>,
): Promise<ReleaseOutcome> {
  if (!facts.paid) return 'not_paid';
  if (facts.referenceId !== order.reference_id) return 'mismatch';
  if (facts.paidAmountCents !== order.amount_cents) return 'mismatch';
  if (!isPaymentsProduction() && !(await ownerIsAdmin())) return 'blocked';
  return (await markOrderPaidAndGrant(order.id)) ? 'granted' : 'already';
}

const RECONCILE_WINDOW_MS = 10_000;

/**
 * Reconciliação ativa (webhook perdido ou assinatura não verificável): para um pedido PENDENTE com checkout,
 * reconsulta o PagBank no máximo 1 vez a cada 10 s por pedido. Falha do PSP/banco = continua pendente (sem erro).
 */
export async function reconcileOrder(orderId: string, userId: string, ownerIsAdmin: boolean): Promise<void> {
  try {
    const order = await getOrderForReconcile(orderId, userId);
    if (!order || order.status !== 'pending' || !order.psp_order_id) return;
    if (await hitExceeds(`reconcile:${order.id}`, 1, RECONCILE_WINDOW_MS)) return;
    const facts = await resolvePaymentFacts(order.psp_order_id);
    if (!facts) return;
    const outcome = await releaseIfConfirmed(order, facts, async () => ownerIsAdmin);
    if (outcome === 'mismatch' || outcome === 'blocked') console.error('reconciliação: não liberado', outcome, order.id);
  } catch (e) {
    console.error('reconciliação falhou (pedido segue pendente):', e instanceof Error ? e.name : 'erro');
  }
}
