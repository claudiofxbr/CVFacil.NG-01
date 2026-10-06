import { NextResponse } from 'next/server';
import { sql } from '../../../../lib/neon';
import { verifyPassword, verifyDummy } from '../../../../lib/password';
import { createSession, SESSION_COOKIE, sessionCookieOptions } from '../../../../lib/session';
import { clientIp, AUTH_MAX_ATTEMPTS, AUTH_WINDOW_MS } from '../../../../lib/authRateLimit';
import { isLimited, recordFailure, resetKey } from '../../../../lib/rateLimit';
import { normalizeEmail, readJson, validPasswordShape } from '../../../../lib/authInput';

export const dynamic = 'force-dynamic';

const invalid = () => NextResponse.json({ error: 'INVALID_CREDENTIALS' }, { status: 401 });

export async function POST(req: Request) {
  const body = await readJson(req);
  const email = normalizeEmail(body?.email);
  const password = body?.password;
  if (!email || !validPasswordShape(password)) return invalid();

  const key = `login:${clientIp(req)}:${email}`;
  if (await isLimited(key, AUTH_MAX_ATTEMPTS, AUTH_WINDOW_MS)) {
    return NextResponse.json({ error: 'TOO_MANY_ATTEMPTS' }, { status: 429, headers: { 'Retry-After': '900' } });
  }

  try {
    const rows = await sql`SELECT id, password_hash FROM users WHERE email = ${email} LIMIT 1;`;
    const user = rows[0];
    const ok = user?.password_hash
      ? await verifyPassword(password, user.password_hash)
      : (await verifyDummy(password), false);
    if (!user || !ok) {
      await recordFailure(key, AUTH_WINDOW_MS);
      return invalid();
    }
    await resetKey(key);
    const { token, maxAge } = await createSession(String(user.id));
    const res = NextResponse.json({ ok: true });
    res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(maxAge));
    return res;
  } catch (e) {
    console.error('auth/login falhou:', e instanceof Error ? e.name : 'erro');
    return NextResponse.json({ error: 'AUTH_UNAVAILABLE' }, { status: 503 });
  }
}
