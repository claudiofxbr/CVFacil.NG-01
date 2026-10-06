import { NextResponse } from 'next/server';
import { createHash, randomUUID } from 'node:crypto';
import { isPaymentsProduction, resolvePaymentFacts, verifyAuthenticity } from '../../../../../lib/pagbank';
import { isAdminEmail } from '../../../../../lib/session';
import { getOrderOwnerEmail } from '../../../../../lib/orders';
import { getOrderByReference, isEventProcessed, markOrderPaidAndGrant, recordEvent } from '../../../../../lib/orders';

export const dynamic = 'force-dynamic';

const MAX_BODY_CHARS = 200_000;

/**
 * Notificações do PagBank. Barreiras, nesta ordem:
 *  1. corpo BRUTO lido antes de qualquer parse;
 *  2. x-authenticity-token = SHA-256 de `{token}-{corpo}` em tempo constante (inválido -> 401, sem tocar no banco);
 *  3. deduplicação por evento (webhook_events.event_id UNIQUE);
 *  4. RECONSULTA do pedido na API do PagBank: o corpo recebido só indica qual id consultar;
 *  5. valor pago conferido contra o pedido do servidor; pending -> paid + concessão do plano numa única
 *     instrução (idempotente: o mesmo pedido pago processado duas vezes concede uma vez).
 * Falha temporária (PSP/banco) -> 503 para o PagBank reenviar; evento só é registrado após sucesso.
 */
export async function POST(req: Request) {
  const raw = await req.text();
  if (raw.length > MAX_BODY_CHARS) return NextResponse.json({ error: 'PAYLOAD_TOO_LARGE' }, { status: 413 });

  if (!verifyAuthenticity(raw, req.headers.get('x-authenticity-token'))) {
    return NextResponse.json({ error: 'INVALID_SIGNATURE' }, { status: 401 });
  }

  let body: any;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'INVALID_BODY' }, { status: 400 });
  }
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'INVALID_BODY' }, { status: 400 });

  const originHeader = (req.headers.get('x-product-origin') || '').toUpperCase();
  const origin = originHeader === 'ORDER' || originHeader === 'CHECKOUT' ? originHeader : 'UNKNOWN';
  const eventId = `${origin}:${createHash('sha256').update(raw).digest('hex')}`;

  try {
    if (await isEventProcessed(eventId)) return NextResponse.json({ ok: true, duplicate: true });

    const facts = await resolvePaymentFacts(body.id);
    if (!facts) return NextResponse.json({ ok: true, ignored: true }); // não resolvível: nada é liberado

    const order = await getOrderByReference(facts.referenceId);
    if (!order) {
      await recordEvent(randomUUID(), eventId, null);
      return NextResponse.json({ ok: true, ignored: true });
    }

    if (facts.paid) {
      if (facts.paidAmountCents !== null && facts.paidAmountCents !== order.amount_cents) {
        console.error('pagbank webhook: valor pago diferente do pedido', order.id);
        await recordEvent(randomUUID(), eventId, order.id);
        return NextResponse.json({ ok: true, ignored: true });
      }
      // Defesa em profundidade: fora de produção (cartão de teste público) só administrador recebe plano.
      if (!isPaymentsProduction() && !isAdminEmail(await getOrderOwnerEmail(order.user_id))) {
        console.error('pagbank webhook: plano não concedido fora de produção (dono não é admin)', order.id);
        await recordEvent(randomUUID(), eventId, order.id);
        return NextResponse.json({ ok: true, ignored: true });
      }
      await markOrderPaidAndGrant(order.id);
    }

    await recordEvent(randomUUID(), eventId, order.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('pagbank webhook falhou:', e instanceof Error ? e.name : 'erro');
    return NextResponse.json({ error: 'TEMPORARY_FAILURE' }, { status: 503 });
  }
}
