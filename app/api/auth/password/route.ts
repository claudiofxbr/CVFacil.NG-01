import { NextResponse } from 'next/server';
import { sql } from '../../../../lib/neon';
import { authContext } from '../../../../lib/apiAuth';
import { hashPassword, verifyPassword } from '../../../../lib/password';
import { passwordPolicyOk, readJson, validPasswordShape } from '../../../../lib/authInput';
import { AUTH_MAX_ATTEMPTS, AUTH_WINDOW_MS } from '../../../../lib/authRateLimit';
import { isLimited, recordFailure, resetKey } from '../../../../lib/rateLimit';
import { hashToken, readSessionToken } from '../../../../lib/session';
import { replacePassword } from '../../../../lib/passwordAdmin';

export const dynamic = 'force-dynamic';

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

/**
 * Troca a senha do usuário da SESSÃO (o id nunca vem do corpo). Exige a senha atual, aplica a política
 * de tamanho, limita tentativas erradas por usuário e revoga as demais sessões (a atual continua válida).
 */
export async function POST(req: Request) {
  const ctx = await authContext(req);
  if (ctx instanceof NextResponse) return ctx;

  const body = await readJson(req);
  const current = body?.currentPassword;
  const next = body?.newPassword;
  if (!validPasswordShape(current) || typeof next !== 'string') return fail('INVALID_BODY', 400);
  if (!passwordPolicyOk(next)) return fail('WEAK_PASSWORD', 400);
  if (next === current) return fail('SAME_PASSWORD', 400);

  const key = `pwchange:${ctx.id}`;
  if (await isLimited(key, AUTH_MAX_ATTEMPTS, AUTH_WINDOW_MS)) {
    return NextResponse.json({ error: 'TOO_MANY_ATTEMPTS' }, { status: 429, headers: { 'Retry-After': '900' } });
  }

  try {
    const rows = await sql`SELECT password_hash FROM users WHERE id = ${ctx.id} LIMIT 1;`;
    const ok = rows[0]?.password_hash ? await verifyPassword(current, rows[0].password_hash) : false;
    if (!ok) {
      await recordFailure(key, AUTH_WINDOW_MS);
      return fail('INVALID_CURRENT_PASSWORD', 403);
    }
    const token = readSessionToken(req);
    const done = await replacePassword(ctx.id, await hashPassword(next), token ? hashToken(token) : '');
    if (!done) return fail('UNAUTHENTICATED', 401);
    await resetKey(key);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('auth/password falhou:', e instanceof Error ? e.name : 'erro');
    return fail('AUTH_UNAVAILABLE', 503);
  }
}
