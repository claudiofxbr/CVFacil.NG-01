import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { authContext } from '../../../../lib/apiAuth';
import { readJson } from '../../../../lib/authInput';
import { resolvePlan } from '../../../../lib/plans';
import { createPendingOrder, transitionOrderStatus } from '../../../../lib/payments';
import { attachCheckout, findReusableCheckout } from '../../../../lib/orders';
import { createCheckout, isPaymentsProduction } from '../../../../lib/pagbank';
import { hitExceeds } from '../../../../lib/rateLimit';
import { appBaseUrl } from '../../../../lib/appUrl';
import { canUseSandboxPayments } from '../../../../lib/paymentRelease';

export const dynamic = 'force-dynamic';

const unavailable = () =>
  NextResponse.json(
    { error: 'Pagamento indisponível no momento. Tente novamente em instantes.', code: 'PAYMENT_UNAVAILABLE' },
    { status: 503 },
  );

/**
 * Cria (ou reaproveita) o checkout hospedado do PagBank para o plano escolhido.
 * Corpo: somente { planId }. Preço, plano e dono vêm do servidor; qualquer outro campo é ignorado.
 * Nunca devolve "aprovado": o plano só é liberado pelo webhook, após reconsulta no PagBank.
 */
export async function POST(req: Request) {
  const ctx = await authContext(req);
  if (ctx instanceof NextResponse) return ctx;

  // Trava: fora de produção o cartão de teste é público; sem isto qualquer logado "compraria" plano de graça. Liberado só a admin ou testador (SANDBOX_TESTER_EMAILS).
  if (!isPaymentsProduction() && !canUseSandboxPayments({ isAdmin: ctx.isAdmin, email: ctx.email })) {
    return NextResponse.json({ error: 'Pagamentos em breve.', code: 'PAYMENTS_NOT_AVAILABLE' }, { status: 403 });
  }

  const body = await readJson(req);
  const plan = resolvePlan(body?.planId);
  if (!plan) return NextResponse.json({ error: 'Plano inválido.', code: 'INVALID_PLAN' }, { status: 400 });

  if (await hitExceeds(`checkout:${ctx.id}`, 5, 10 * 60_000)) {
    return NextResponse.json(
      { error: 'Muitas tentativas de pagamento. Aguarde alguns minutos.', code: 'CHECKOUT_RATE_LIMITED' },
      { status: 429, headers: { 'Retry-After': '600' } },
    );
  }

  try {
    const reusable = await findReusableCheckout(ctx.id, plan.id);
    if (reusable && (reusable as { checkout_url?: string }).checkout_url) {
      return NextResponse.json({ url: (reusable as { checkout_url?: string }).checkout_url, orderId: reusable.id, reused: true });
    }

    const referenceId = `cvf_${randomUUID().replace(/-/g, '')}`;
    const { order } = await createPendingOrder({ userId: ctx.id, planId: plan.id, referenceId });

    const base = appBaseUrl();
    try {
      const { checkoutId, payUrl } = await createCheckout({
        order,
        plan,
        urls: {
          redirectUrl: `${base}/payments/return?order=${encodeURIComponent(order.id)}`,
          notificationUrl: `${base}/api/payments/pagbank/webhook`,
        },
      });
      await attachCheckout(order.id, checkoutId, payUrl);
      return NextResponse.json({ url: payUrl, orderId: order.id, reused: false });
    } catch (e) {
      // Falha do PSP: o pedido não pode ficar "pendente" sem link; nunca reportar aprovação.
      await transitionOrderStatus(order.id, 'failed').catch(() => null);
      throw e;
    }
  } catch (e) {
    console.error('payments/checkout falhou:', e instanceof Error ? e.name : 'erro');
    return unavailable();
  }
}
