import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { Plan } from './plans';

/**
 * ADAPTADOR ÚNICO do PagBank (Checkout hospedado). Todo contrato externo vive aqui.
 *
 * Fontes oficiais consultadas:
 *  - https://developer.pagbank.com.br/reference/criar-checkout        (POST /checkouts)
 *  - https://developer.pagbank.com.br/docs/checkout
 *  - https://developer.pagbank.com.br/reference/consultar-checkout    (GET /checkouts/{id})
 *  - https://developer.pagbank.com.br/reference/consultar-pedido      (GET /orders/{id})
 *  - https://developer.pagbank.com.br/reference/webhooks
 *  - https://developer.pagbank.com.br/reference/confirmar-autenticidade-da-notificacao
 *  - https://developer.pagbank.com.br/docs/ambientes-disponiveis
 *
 * Pontos que a documentação NÃO confirma estão marcados "VALIDAR NO SANDBOX".
 * Token e corpo de resposta do PSP nunca vão para log nem para a resposta ao cliente.
 */

export type PagBankErrorCode =
  | 'PSP_NOT_CONFIGURED'
  | 'PSP_TIMEOUT'
  | 'PSP_AUTH'
  | 'PSP_REJECTED'
  | 'PSP_UNAVAILABLE'
  | 'PSP_BAD_RESPONSE';

export class PagBankError extends Error {
  constructor(public readonly code: PagBankErrorCode, public readonly httpStatus?: number) {
    super(code); // mensagem = só o código; nada do corpo do PSP
    this.name = 'PagBankError';
  }
}

const TIMEOUT_MS = 10_000;
const SANDBOX_BASE = 'https://sandbox.api.pagseguro.com';
const PRODUCTION_BASE = 'https://api.pagseguro.com';
const ID_RE = /^[A-Za-z0-9_-]{4,80}$/;

/** true somente com PAGBANK_ENV exatamente 'production'. Fora disso (sandbox) pagamentos reais NÃO existem. */
export function isPaymentsProduction(): boolean {
  return process.env.PAGBANK_ENV === 'production';
}

/** Padrão seguro = sandbox. Produção só com PAGBANK_ENV === 'production' exatamente. */
export function pagBankBaseUrl(): string {
  return process.env.PAGBANK_ENV === 'production' ? PRODUCTION_BASE : SANDBOX_BASE;
}

function token(): string {
  const t = process.env.PAGBANK_TOKEN;
  if (!t) throw new PagBankError('PSP_NOT_CONFIGURED');
  return t;
}

async function request(method: 'GET' | 'POST', path: string, body?: unknown): Promise<any> {
  const bearer = token();
  let res: Response;
  try {
    res = await fetch(`${pagBankBaseUrl()}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${bearer}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
    });
  } catch (e) {
    const timedOut = e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError');
    console.error('pagbank: falha de rede', timedOut ? 'timeout' : 'rede');
    throw new PagBankError(timedOut ? 'PSP_TIMEOUT' : 'PSP_UNAVAILABLE');
  }
  if (res.status === 401 || res.status === 403) {
    console.error('pagbank: credencial recusada', res.status);
    throw new PagBankError('PSP_AUTH', res.status);
  }
  if (res.status >= 500) {
    console.error('pagbank: erro do PSP', res.status);
    throw new PagBankError('PSP_UNAVAILABLE', res.status);
  }
  if (!res.ok) {
    console.error('pagbank: pedido recusado', res.status);
    throw new PagBankError('PSP_REJECTED', res.status);
  }
  try {
    return await res.json();
  } catch {
    throw new PagBankError('PSP_BAD_RESPONSE', res.status);
  }
}

// ---------------------------------------------------------------- checkout

export interface CheckoutUrls {
  /** Para onde o PagBank devolve o cliente após o pagamento. */
  redirectUrl: string;
  /** Webhook público (https) que recebe as notificações. */
  notificationUrl: string;
}

export interface CheckoutResult {
  checkoutId: string;
  payUrl: string;
}

/**
 * Cria o checkout hospedado. O valor vem do catálogo do servidor (plan.priceCents, centavos inteiros).
 * CONFIRMADO NO SANDBOX (HTTP 201, status ACTIVE, customer_modifiable true):
 * - `customer` é OMITIDO e o POST é aceito (a doc só o exige com customer_modifiable=false);
 *   o cliente preenche os dados na página do PagBank.
 * - `payment_methods` é omitido (todos os meios habilitados na conta) e o POST é aceito.
 * - `payment_notification_urls` e `notification_urls` são ambos aceitos; enviamos o mesmo webhook
 *   nos dois (a doc não explica a diferença). O webhook é idempotente, então duplicatas são inofensivas.
 */
export async function createCheckout(input: {
  order: { reference_id: string };
  plan: Plan;
  urls: CheckoutUrls;
}): Promise<CheckoutResult> {
  const json = await request('POST', '/checkouts', {
    reference_id: input.order.reference_id,
    items: [
      {
        reference_id: input.plan.id,
        name: `CVFacil.NG - Plano ${input.plan.name}`,
        quantity: 1,
        unit_amount: input.plan.priceCents,
      },
    ],
    redirect_url: input.urls.redirectUrl,
    return_url: input.urls.redirectUrl,
    payment_notification_urls: [input.urls.notificationUrl],
    notification_urls: [input.urls.notificationUrl],
  });

  const checkoutId = typeof json?.id === 'string' ? json.id : '';
  const pay = Array.isArray(json?.links) ? json.links.find((l: any) => l?.rel === 'PAY') : undefined;
  const payUrl = typeof pay?.href === 'string' ? pay.href : '';
  if (!ID_RE.test(checkoutId) || !isSafeHttpsUrl(payUrl)) throw new PagBankError('PSP_BAD_RESPONSE');
  // CONFIRMADO NO SANDBOX: o link PAY vem em https://pagamento.sandbox.pagbank.com.br/pagamento?code=...
  return { checkoutId, payUrl };
}

function isSafeHttpsUrl(v: string): boolean {
  try {
    const u = new URL(v);
    return u.protocol === 'https:' && !u.username && !u.password;
  } catch {
    return false;
  }
}

// ----------------------------------------------------------- notificações

/** x-authenticity-token = SHA-256 hex de `{token}-{corpo bruto}` (doc: confirmar-autenticidade-da-notificacao). */
export function verifyAuthenticity(rawBody: string, headerValue: string | null): boolean {
  const secret = process.env.PAGBANK_TOKEN;
  if (!secret || !headerValue) return false;
  const expected = createHash('sha256').update(`${secret}-${rawBody}`).digest('hex');
  const given = headerValue.trim().toLowerCase();
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(given, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

export interface PaymentFacts {
  /** reference_id do pedido DEVOLVIDO pela API do PagBank (não do corpo da notificação). */
  referenceId: string;
  paid: boolean;
  /** Soma em centavos das cobranças PAID, ou null se a API não informou valores. */
  paidAmountCents: number | null;
}

const MAX_CHECKOUT_ORDERS = 5;

/** Fatos de pagamento a partir de UM pedido (GET /orders/{id}). Formato CONFIRMADO NO SANDBOX. */
function factsFromOrder(json: any): PaymentFacts | null {
  const referenceId = typeof json?.reference_id === 'string' ? json.reference_id : '';
  const charges: any[] | null = Array.isArray(json?.charges) ? json.charges : null;
  if (!referenceId || !charges) return null;
  const paidCharges = charges.filter((c) => c && c.status === 'PAID');
  const amounts = paidCharges.map((c) => c?.amount?.value); // centavos inteiros (ex.: 1500)
  const known = amounts.length > 0 && amounts.every((v) => Number.isSafeInteger(v));
  return {
    referenceId,
    paid: paidCharges.length > 0,
    paidAmountCents: known ? (amounts as number[]).reduce((sum, v) => sum + v, 0) : null,
  };
}

/**
 * Reconsulta na API a partir do id citado. O corpo da notificação NUNCA é fonte da verdade: só indica
 * qual id consultar.
 * - ORDE_*: GET /orders/{id} -> reference_id e charges[].status === 'PAID' / charges[].amount.value (centavos).
 *   CONFIRMADO NO SANDBOX.
 * - CHEC_*: GET /checkouts/{id} -> `reference_id` (o nosso) e `orders: [{ id: 'ORDE_...' }]`. O checkout NÃO
 *   traz `charges` e continua ACTIVE mesmo depois de pago (CONFIRMADO NO SANDBOX); por isso cada pedido de
 *   `orders[]` (até 5) é consultado e as cobranças PAID são somadas. Checkout sem `orders[]` (não pago) -> null.
 *   Só entram na soma pedidos cujo reference_id é o do checkout.
 */
export async function resolvePaymentFacts(notificationId: unknown): Promise<PaymentFacts | null> {
  if (typeof notificationId !== 'string' || !ID_RE.test(notificationId)) return null;

  if (!notificationId.startsWith('CHEC_')) {
    return factsFromOrder(await request('GET', `/orders/${encodeURIComponent(notificationId)}`));
  }

  const checkout = await request('GET', `/checkouts/${encodeURIComponent(notificationId)}`);
  const referenceId = typeof checkout?.reference_id === 'string' ? checkout.reference_id : '';
  const orderIds: string[] = Array.isArray(checkout?.orders)
    ? checkout.orders
        .map((o: any) => (typeof o?.id === 'string' ? o.id : ''))
        .filter((id: string) => /^ORDE_[A-Za-z0-9-]{4,70}$/.test(id))
        .slice(0, MAX_CHECKOUT_ORDERS)
    : [];
  if (!referenceId || orderIds.length === 0) return null;

  let paid = false;
  let total = 0;
  let allKnown = true;
  let considered = 0;
  for (const id of orderIds) {
    const facts = factsFromOrder(await request('GET', `/orders/${encodeURIComponent(id)}`));
    if (!facts || facts.referenceId !== referenceId) continue;
    considered += 1;
    if (!facts.paid) continue;
    paid = true;
    if (facts.paidAmountCents === null) allKnown = false;
    else total += facts.paidAmountCents;
  }
  if (considered === 0) return null;
  return { referenceId, paid, paidAmountCents: paid && allKnown ? total : null };
}

/**
 * DIAGNÓSTICO da assinatura (só booleanos e tamanhos; nunca token, header nem corpo): quais fórmulas
 * casariam com o header recebido. Usado para descobrir como o PagBank assina no sandbox.
 */
export function diagnoseAuthenticity(rawBody: string, headerValue: string | null): Record<string, boolean | number> {
  const secret = process.env.PAGBANK_TOKEN || '';
  const given = (headerValue || '').trim().toLowerCase();
  const sha = (v: string) => createHash('sha256').update(v).digest('hex');
  const match = (expected: string) => given.length > 0 && expected === given;
  return {
    hasHeader: headerValue !== null,
    headerLength: given.length,
    bodyLength: rawBody.length,
    tokenDashBody: match(sha(`${secret}-${rawBody}`)), // fórmula documentada (atual)
    tokenBody: match(sha(`${secret}${rawBody}`)),
    bodyDashToken: match(sha(`${rawBody}-${secret}`)),
    tokenDashTrimmedBody: match(sha(`${secret}-${rawBody.trim()}`)),
    hmacBodyKeyToken: match(createHmac('sha256', secret).update(rawBody).digest('hex')),
  };
}
