import { NextResponse } from 'next/server';
import { requireUser, AuthError } from '../../../../lib/requireUser';
import { isAdminEmail } from '../../../../lib/session';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const user = await requireUser(req);
    return NextResponse.json({ id: user.id, email: user.email, role: isAdminEmail(user.email) ? 'admin' : 'user' });
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.code }, { status: e.status });
    return NextResponse.json({ error: 'AUTH_UNAVAILABLE' }, { status: 503 });
  }
}
