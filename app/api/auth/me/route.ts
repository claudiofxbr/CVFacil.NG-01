import { NextResponse } from 'next/server';
import { sql } from '../../../../lib/neon';
import { requireUser, AuthError } from '../../../../lib/requireUser';
import { isAdminEmail } from '../../../../lib/session';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
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
    if (e instanceof AuthError) return NextResponse.json({ error: e.code }, { status: e.status });
    return NextResponse.json({ error: 'AUTH_UNAVAILABLE' }, { status: 503 });
  }
}
