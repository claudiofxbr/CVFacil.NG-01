import { NextResponse } from 'next/server';
import { requireUser, AuthError } from './requireUser';
import { isAdminEmail } from './session';
import { sql } from './neon';
import { exceedsUserLimit } from './userRateLimit';

export interface AuthContext {
  id: string;
  email: string | null;
  isAdmin: boolean;
}

/**
 * Identidade das rotas de dados: SEMPRE da sessão (cookie). userId/role vindos da URL ou do corpo
 * nunca são lidos. Admin = e-mail da sessão em ADMIN_EMAILS.
 */
export async function authContext(req: Request): Promise<AuthContext | NextResponse> {
  try {
    const u = await requireUser(req);
    return { id: u.id, email: u.email, isAdmin: isAdminEmail(u.email) };
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.code }, { status: e.status });
    return NextResponse.json({ error: 'AUTH_UNAVAILABLE' }, { status: 503 });
  }
}

export const notFoundResume = () =>
  NextResponse.json({ error: 'Currículo não encontrado ou acesso não autorizado.' }, { status: 404 });

/** Currículo visível ao usuário: admin vê qualquer um; os demais só os próprios (alheio = inexistente). */
export async function findAccessibleResume(ctx: AuthContext, id: string): Promise<{ id: string; user_id: string } | null> {
  const rows = ctx.isAdmin
    ? await sql`SELECT id, user_id FROM resumes WHERE id = ${id} LIMIT 1;`
    : await sql`SELECT id, user_id FROM resumes WHERE id = ${id} AND user_id = ${ctx.id} LIMIT 1;`;
  return rows[0] ? { id: String(rows[0].id), user_id: String(rows[0].user_id) } : null;
}

/** Guarda das rotas de IA: sessão obrigatória (401) + limite por usuário (429). */
export async function aiGuard(req: Request): Promise<AuthContext | NextResponse> {
  const ctx = await authContext(req);
  if (ctx instanceof NextResponse) return ctx;
  if (exceedsUserLimit(`ai:${ctx.id}`)) {
    return NextResponse.json(
      { error: 'Muitas solicitações de IA em pouco tempo. Aguarde um minuto e tente novamente.', code: 'AI_RATE_LIMITED' },
      { status: 429, headers: { 'Retry-After': '60' } },
    );
  }
  return ctx;
}

/** Guarda das rotas administrativas: 401 sem sessão, 403 para usuário comum. */
export async function adminGuard(req: Request): Promise<AuthContext | NextResponse> {
  const ctx = await authContext(req);
  if (ctx instanceof NextResponse) return ctx;
  if (!ctx.isAdmin) return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  return ctx;
}
