import { NextResponse } from 'next/server';
import { authContext } from '../../../../../lib/apiAuth';
import { getOrderForUser } from '../../../../../lib/orders';

export const dynamic = 'force-dynamic';

const ID_RE = /^[A-Za-z0-9-]{8,64}$/;
const notFound = () => NextResponse.json({ error: 'ORDER_NOT_FOUND' }, { status: 404 });

/** Status de um pedido, somente para o dono (alheio ou inexistente = 404). Fonte: nosso banco, atualizado pelo webhook. */
export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  const ctx = await authContext(req);
  if (ctx instanceof NextResponse) return ctx;

  const { id } = await context.params;
  if (!ID_RE.test(id)) return notFound();

  try {
    const order = await getOrderForUser(id, ctx.id);
    if (!order) return notFound();
    return NextResponse.json({ id: order.id, status: order.status, planId: order.plan_id });
  } catch (e) {
    console.error('payments/orders falhou:', e instanceof Error ? e.name : 'erro');
    return NextResponse.json({ error: 'AUTH_UNAVAILABLE' }, { status: 503 });
  }
}
