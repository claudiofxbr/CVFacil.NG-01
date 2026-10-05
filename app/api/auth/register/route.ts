import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { sql } from '../../../../lib/neon';
import { hashPassword } from '../../../../lib/password';
import { createSession, SESSION_COOKIE, sessionCookieOptions } from '../../../../lib/session';
import { clientIp, isRateLimited, recordFailure } from '../../../../lib/authRateLimit';
import { normalizeEmail, passwordPolicyOk, readJson } from '../../../../lib/authInput';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const body = await readJson(req);
  const email = normalizeEmail(body?.email);
  const password = body?.password;
  const rawName = typeof body?.name === 'string' ? body.name.trim().slice(0, 120) : '';
  if (!email) return NextResponse.json({ error: 'INVALID_EMAIL' }, { status: 400 });
  if (typeof password !== 'string' || !passwordPolicyOk(password)) {
    return NextResponse.json({ error: 'INVALID_PASSWORD' }, { status: 400 });
  }

  // Toda tentativa de registro conta no limite (evita spam em massa e enumeração por IP).
  const ip = clientIp(req);
  const key = `register:${ip}:${email}`;
  const ipKey = `register-ip:${ip}`;
  if (isRateLimited(key) || isRateLimited(ipKey)) {
    return NextResponse.json({ error: 'TOO_MANY_ATTEMPTS' }, { status: 429, headers: { 'Retry-After': '900' } });
  }
  recordFailure(key);
  recordFailure(ipKey);

  try {
    const hash = await hashPassword(password);
    let userId: string | null = null;

    const inserted = await sql`
      INSERT INTO users (id, email, name, password_hash, role)
      VALUES (${randomUUID()}, ${email}, ${rawName || email.split('@')[0]}, ${hash}, 'user')
      ON CONFLICT (email) DO NOTHING
      RETURNING id;
    `;
    if (inserted[0]) {
      userId = String(inserted[0].id);
    } else {
      // Reivindicação: linha pré-existente com este e-mail e sem senha. UPDATE condicional é atômico.
      const claimed = await sql`
        UPDATE users SET password_hash = ${hash}, updated_at = now()
        WHERE email = ${email} AND (password_hash IS NULL OR password_hash = '')
        RETURNING id;
      `;
      if (claimed[0]) userId = String(claimed[0].id);
    }

    if (!userId) return NextResponse.json({ error: 'REGISTRATION_FAILED' }, { status: 409 });

    const { token, maxAge } = await createSession(userId);
    const res = NextResponse.json({ ok: true }, { status: 201 });
    res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(maxAge));
    return res;
  } catch (e) {
    console.error('auth/register falhou:', e instanceof Error ? e.name : 'erro');
    return NextResponse.json({ error: 'AUTH_UNAVAILABLE' }, { status: 503 });
  }
}
