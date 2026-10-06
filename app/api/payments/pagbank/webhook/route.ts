import { NextResponse } from 'next/server';
import { createHash, randomUUID } from 'node:crypto';
import { diagnoseAuthenticity, resolvePaymentFacts, verifyAuthenticity } from '../../../../../lib/pagbank';
import { getOrderByReference, getOrderOwnerEmail, isEventProcessed, recordEvent } from '../../../../../lib/orders';
import { emailMayUseSandboxPayments, releaseIfConfirmed } from '../../../../../lib/paymentRelease';
import { clientIp } from '../../../../../lib/authRateLimit';
import { hitExceeds } from '../../../../../lib/rateLimit';

export const dynamic = 'force-dynamic';

const MAX_BODY_CHARS = 200_000;
const CANDIDATE_ID_RE = /^(ORDE|CHEC)_[A-Za-z0-9-]{4,70}$/;

/**
 * Notificações do PagBank.
 *
 * DECISÃO CONSCIENTE (assinatura): no sandbox o x-authenticity-token real NÃO casou com a fórmula documentada
 * (SHA-256 de `{token}-{corpo}`) e o plano nunca era liberado. A barreira de verdade é a RECONSULTA na API do
 * PagBank (reference_id, valor pago em centavos, status PAID, trava de ambiente). Por isso:
 *  - assinatura válida: processa normalmente;
 *  - assinatura inválida: NÃO concede a partir do corpo; só extrai um id candidato (ORDE_/CHEC_) e processa pela
 *    mesma reconsulta, com limite por IP (30/min) e sem registrar evento enquanto nada foi decidido
 *    (para um corpo repetido por terceiros não "queimar" a deduplicação de uma notificação legítima);
 *  - assinatura inválida e sem id candidato: 401.
 * Um atacante sem assinatura no máximo faz o servidor consultar o PagBank; nunca consegue conceder plano.
 */
export async function POST(req: Request) {
  const raw = await req.text();
  if (raw.length > MAX_BODY_CHARS) return NextResponse.json({ error: 'PAYLOAD_TOO_LARGE' }, { status: 413 });

  const header = req.headers.get('x-authenticity-token');
  const signed = verifyAuthenticity(raw, header);

  let body: any = null;
  try {
    body = JSON.parse(raw);
  } catch {
    body = null;
  }

  if (!signed) {
    // Diagnóstico seguro: só booleanos e tamanhos (nunca token, header nem corpo).
    console.warn('pagbank webhook: assinatura inválida', JSON.stringify({
      ...diagnoseAuthenticity(raw, header),
      contentType: req.headers.get('content-type') || null,
      origin: req.headers.get('x-product-origin') || null,
    }));
    const candidate = typeof body?.id === 'string' && CANDIDATE_ID_RE.test(body.id) ? body.id : null;
    if (!candidate) return NextResponse.json({ error: 'INVALID_SIGNATURE' }, { status: 401 });
    if (await hitExceeds(`pagbank-webhook:${clientIp(req)}`, 30, 60_000)) {
      return NextResponse.json({ error: 'TOO_MANY_REQUESTS' }, { status: 429, headers: { 'Retry-After': '60' } });
    }
  } else if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'INVALID_BODY' }, { status: 400 });
  }
  console.info('pagbank webhook: recebido', JSON.stringify({ signatureValid: signed }));

  const originHeader = (req.headers.get('x-product-origin') || '').toUpperCase();
  const origin = originHeader === 'ORDER' || originHeader === 'CHECKOUT' ? originHeader : 'UNKNOWN';
  const eventId = `${origin}:${createHash('sha256').update(raw).digest('hex')}`;

  try {
    if (await isEventProcessed(eventId)) return NextResponse.json({ ok: true, duplicate: true });

    const facts = await resolvePaymentFacts(body?.id);
    if (!facts) return NextResponse.json({ ok: true, ignored: true }); // não resolvível: nada é liberado

    const order = await getOrderByReference(facts.referenceId);
    if (!order) {
      if (signed) await recordEvent(randomUUID(), eventId, null);
      return NextResponse.json({ ok: true, ignored: true });
    }

    const outcome = await releaseIfConfirmed(order, facts, async () => emailMayUseSandboxPayments(await getOrderOwnerEmail(order.user_id)));
    if (outcome === 'mismatch') console.error('pagbank webhook: referência ou valor divergente do pedido', order.id);
    if (outcome === 'blocked') console.error('pagbank webhook: plano não concedido fora de produção (dono não é admin nem testador)', order.id);

    // Assinado: registra sempre. Não assinado: só registra quando algo foi efetivamente decidido.
    if (signed || outcome === 'granted' || outcome === 'already') await recordEvent(randomUUID(), eventId, order.id);
    return NextResponse.json({ ok: true, ...(outcome === 'mismatch' || outcome === 'blocked' ? { ignored: true } : {}) });
  } catch (e) {
    console.error('pagbank webhook falhou:', e instanceof Error ? e.name : 'erro');
    return NextResponse.json({ error: 'TEMPORARY_FAILURE' }, { status: 503 });
  }
}
