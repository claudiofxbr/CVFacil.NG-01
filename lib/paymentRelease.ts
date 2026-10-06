import { hitExceeds } from './rateLimit';
import { isPaymentsProduction, resolvePaymentFacts, type PaymentFacts } from './pagbank';
import { markOrderPaidAndGrant, getOrderForReconcile } from './orders';
import type { Order } from './payments';
import { isAdminEmail, isSandboxTesterEmail } from './session';

/**
 * REGRA ÚNICA do sandbox: fora de produção o cartão de teste é público, então só administrador OU testador de
 * pagamentos (SANDBOX_TESTER_EMAILS) compra e recebe plano. Em produção a regra não se aplica (qualquer logado).
 * O testador não ganha nenhum privilégio administrativo.
 */
export function canUseSandboxPayments(who: { isAdmin: boolean; email: string | null | undefined }): boolean {
  return who.isAdmin || isSandboxTesterEmail(who.email);
}

/** Mesma regra a partir só do e-mail do dono do pedido (webhook). */
export function emailMayUseSandboxPayments(email: string | null | undefined): boolean {
  return canUseSandboxPayments({ isAdmin: isAdminEmail(email), email });
}

export type ReleaseOutcome = 'granted' | 'already' | 'not_paid' | 'mismatch' | 'blocked';

/**
 * ÚNICO ponto de liberação do plano (webhook e reconciliação). Só concede se, nesta ordem:
 * a API confirma PAID; o reference_id devolvido pela API é o do NOSSO pedido; o valor pago em centavos
 * é exatamente o do pedido; e, fora de produção, o dono do pedido é admin ou testador (canUseSandboxPayments).
 * A concessão é idempotente (UPDATE condicional pending -> paid).
 */
export async function releaseIfConfirmed(
  order: Pick<Order, 'id' | 'reference_id' | 'amount_cents'>,
  facts: PaymentFacts,
  ownerMaySandbox: () => Promise<boolean>,
): Promise<ReleaseOutcome> {
  if (!facts.paid) return 'not_paid';
  if (facts.referenceId !== order.reference_id) return 'mismatch';
  if (facts.paidAmountCents !== order.amount_cents) return 'mismatch';
  if (!isPaymentsProduction() && !(await ownerMaySandbox())) return 'blocked';
  return (await markOrderPaidAndGrant(order.id)) ? 'granted' : 'already';
}

const RECONCILE_WINDOW_MS = 10_000;

/**
 * Reconciliação ativa (webhook perdido ou assinatura não verificável): para um pedido PENDENTE com checkout,
 * reconsulta o PagBank no máximo 1 vez a cada 10 s por pedido. Falha do PSP/banco = continua pendente (sem erro).
 */
export async function reconcileOrder(orderId: string, userId: string, ownerMaySandbox: boolean): Promise<void> {
  try {
    const order = await getOrderForReconcile(orderId, userId);
    if (!order || order.status !== 'pending' || !order.psp_order_id) return;
    if (await hitExceeds(`reconcile:${order.id}`, 1, RECONCILE_WINDOW_MS)) return;
    const facts = await resolvePaymentFacts(order.psp_order_id);
    if (!facts) return;
    const outcome = await releaseIfConfirmed(order, facts, async () => ownerMaySandbox);
    if (outcome === 'mismatch' || outcome === 'blocked') console.error('reconciliação: não liberado', outcome, order.id);
  } catch (e) {
    console.error('reconciliação falhou (pedido segue pendente):', e instanceof Error ? e.name : 'erro');
  }
}
