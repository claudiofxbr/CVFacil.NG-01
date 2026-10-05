import { NextResponse } from 'next/server';
import { requireUser, AuthError } from '../../../../lib/requireUser';

export const dynamic = 'force-dynamic';

// Prova da etapa E0 (identidade server-side). Será removida/substituída
// quando a rota de checkout existir.
export async function GET(req: Request) {
  try {
    const user = await requireUser(req);
    return NextResponse.json({ userId: user.id });
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.code }, { status: e.status });
    }
    return NextResponse.json({ error: 'AUTH_UNAVAILABLE' }, { status: 503 });
  }
}
