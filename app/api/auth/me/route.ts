import { NextResponse } from 'next/server';
import { sql } from '../../../../lib/neon';
import { requireUser, AuthError } from '../../../../lib/requireUser';
import { isAdminEmail } from '../../../../lib/session';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  // ?optional=1: checagem de sessão "silenciosa" do cliente. Sem sessão válida responde 200
  // {authenticated:false} (evita o 401 vermelho no console antes do login). Não concede nada:
  // nenhum dado de usuário sai sem sessão, e as demais rotas continuam respondendo 401.
  const optional = new URL(req.url).searchParams.get('optional') === '1';
  try {
    const user = await requireUser(req);
    const rows = await sql`SELECT name, plan, credits, avatar_url FROM users WHERE id = ${user.id} LIMIT 1;`;
    const p = rows[0] || {};
    return NextResponse.json({
      id: user.id,
      email: user.email,
      // O papel vem só do servidor (ADMIN_EMAILS); a coluna users.role não concede privilégio.
      role: isAdminEmail(user.email) ? 'admin' : 'user',
      name: typeof p.name === 'string' ? p.name : null,
      plan: typeof p.plan === 'string' ? p.plan : 'free',
      credits: Number.isFinite(Number(p.credits)) ? Number(p.credits) : 0,
      avatar: typeof p.avatar_url === 'string' ? p.avatar_url : null,
    });
  } catch (e) {
    if (e instanceof AuthError && e.status === 401 && optional) return NextResponse.json({ authenticated: false });
    if (e instanceof AuthError) return NextResponse.json({ error: e.code }, { status: e.status });
    return NextResponse.json({ error: 'AUTH_UNAVAILABLE' }, { status: 503 });
  }
}
