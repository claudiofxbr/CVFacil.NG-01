import { SESSION_EXPIRED_MESSAGE } from './authClient';

export type CheckoutResult = { ok: true; url: string } | { ok: false; message: string };

const MESSAGES: Record<number, string> = {
  400: 'Plano inválido.',
  403: 'Pagamentos em breve.',
  429: 'Muitas tentativas de pagamento. Aguarde alguns minutos e tente novamente.',
  503: 'Pagamento indisponível no momento. Tente novamente em instantes.',
};

/** Pede ao servidor o link de pagamento do plano. O cliente só informa o id; o preço é do servidor. */
export async function startCheckout(planId: string): Promise<CheckoutResult> {
  let res: Response;
  try {
    res = await fetch('/api/payments/checkout', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ planId }),
    });
  } catch {
    return { ok: false, message: MESSAGES[503] };
  }
  if (res.status === 401) return { ok: false, message: SESSION_EXPIRED_MESSAGE };
  if (!res.ok) return { ok: false, message: MESSAGES[res.status] || MESSAGES[503] };
  try {
    const json = await res.json();
    const url = typeof json?.url === 'string' ? json.url : '';
    if (new URL(url).protocol !== 'https:') throw new Error('url');
    return { ok: true, url };
  } catch {
    return { ok: false, message: MESSAGES[503] };
  }
}

export type OrderState = 'pending' | 'paid' | 'closed' | 'unauthenticated' | 'notfound' | 'error';

/** Consulta o status do pedido (somente do dono) no NOSSO servidor; nunca confia em query string. */
export async function fetchOrderState(orderId: string): Promise<OrderState> {
  try {
    const res = await fetch(`/api/payments/orders/${encodeURIComponent(orderId)}`, { credentials: 'same-origin', cache: 'no-store' });
    if (res.status === 401) return 'unauthenticated';
    if (res.status === 404) return 'notfound';
    if (!res.ok) return 'error';
    const { status } = await res.json();
    if (status === 'paid' || status === 'refunded') return 'paid';
    if (status === 'pending') return 'pending';
    return 'closed'; // failed | canceled | expired
  } catch {
    return 'error';
  }
}

export const ORDER_MESSAGES: Record<OrderState, string> = {
  pending: 'Aguardando a confirmação do pagamento. Isso pode levar alguns instantes (boleto e PIX podem demorar mais).',
  paid: 'Pagamento aprovado! Seu plano já está ativo.',
  closed: 'O pagamento não foi concluído. Você pode tentar novamente na tela de Planos.',
  unauthenticated: SESSION_EXPIRED_MESSAGE,
  notfound: 'Pedido não encontrado.',
  error: 'Não foi possível consultar o pedido agora. Tente novamente em instantes.',
};
