import { NextResponse } from 'next/server';
import { sql } from '../../../../../lib/neon';
import { adminGuard } from '../../../../../lib/apiAuth';
import { hashPassword } from '../../../../../lib/password';
import { normalizeEmail, readJson } from '../../../../../lib/authInput';
import { hitExceeds } from '../../../../../lib/rateLimit';
import { generateTemporaryPassword, replacePassword } from '../../../../../lib/passwordAdmin';

export const dynamic = 'force-dynamic';

const RESETS_PER_HOUR = 10;
const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

/**
 * Recuperação de senha pelo administrador (não há provedor de e-mail). Gera uma senha temporária aleatória,
 * grava só o hash, revoga as sessões do usuário e devolve a senha UMA vez, sem cache, para o admin repassar.
 * A própria conta do admin usa /api/auth/password (exige a senha atual).
 */
export async function POST(req: Request) {
  const ctx = await adminGuard(req);
  if (ctx instanceof NextResponse) return ctx;

  const body = await readJson(req);
  const email = normalizeEmail(body?.email);
  if (!email) return fail('INVALID_EMAIL', 400);
  if (email === ctx.email?.trim().toLowerCase()) return fail('USE_CHANGE_PASSWORD', 400);
  if (await hitExceeds(`adminreset:${ctx.id}`, RESETS_PER_HOUR, 60 * 60 * 1000)) {
    return NextResponse.json({ error: 'TOO_MANY_ATTEMPTS' }, { status: 429, headers: { 'Retry-After': '3600' } });
  }

  try {
    const rows = await sql`SELECT id FROM users WHERE email = ${email} LIMIT 1;`;
    if (!rows[0]) return fail('USER_NOT_FOUND', 404);
    const temporaryPassword = generateTemporaryPassword();
    const done = await replacePassword(String(rows[0].id), await hashPassword(temporaryPassword), '');
    if (!done) return fail('USER_NOT_FOUND', 404);
    return NextResponse.json({ ok: true, temporaryPassword }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error('admin/reset-password falhou:', e instanceof Error ? e.name : 'erro');
    return fail('AUTH_UNAVAILABLE', 503);
  }
}
