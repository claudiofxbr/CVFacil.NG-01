import { NextResponse } from 'next/server';
import { clientIp } from '../../../../lib/authRateLimit';
import { passwordPolicyOk, readJson } from '../../../../lib/authInput';
import { hashPassword } from '../../../../lib/password';
import { hitExceeds } from '../../../../lib/rateLimit';
import { consumeResetToken, RESET_TOKEN_RE } from '../../../../lib/passwordReset';

export const dynamic = 'force-dynamic';

const PER_IP_HOUR = 20;
const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

/** Conclui a redefinição: token de uso único (ver lib/passwordReset.ts) + nova senha dentro da política. */
export async function POST(req: Request) {
  const body = await readJson(req);
  const token = body?.token;
  const next = body?.newPassword;
  if (typeof token !== 'string' || !RESET_TOKEN_RE.test(token) || typeof next !== 'string') return fail('INVALID_BODY', 400);
  if (!passwordPolicyOk(next)) return fail('WEAK_PASSWORD', 400);

  if (await hitExceeds(`reset-ip:${clientIp(req)}`, PER_IP_HOUR, 60 * 60 * 1000)) {
    return NextResponse.json({ error: 'TOO_MANY_ATTEMPTS' }, { status: 429, headers: { 'Retry-After': '3600' } });
  }

  try {
    const ok = await consumeResetToken(token, await hashPassword(next));
    return ok ? NextResponse.json({ ok: true }) : fail('INVALID_OR_EXPIRED_TOKEN', 400);
  } catch (e) {
    console.error('auth/reset-password falhou:', e instanceof Error ? e.name : 'erro');
    return fail('AUTH_UNAVAILABLE', 503);
  }
}
