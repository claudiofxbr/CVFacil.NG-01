import { NextResponse } from 'next/server';
import { revokeSession, SESSION_COOKIE, sessionCookieOptions } from '../../../../lib/session';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    await revokeSession(req);
  } catch (e) {
    console.error('auth/logout falhou:', e instanceof Error ? e.name : 'erro');
    return NextResponse.json({ error: 'AUTH_UNAVAILABLE' }, { status: 503 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, '', sessionCookieOptions(0));
  return res;
}
