import { NextResponse } from 'next/server';
import { sql } from '../../../../lib/neon';
import { authContext } from '../../../../lib/apiAuth';
import { readJson } from '../../../../lib/authInput';
import { validateAvatar, validateName, AVATAR_MAX_CHARS } from '../../../../lib/profile';

export const dynamic = 'force-dynamic';

const BODY_LIMIT = AVATAR_MAX_CHARS + 1024;
const bad = (error: string) => NextResponse.json({ error }, { status: 400 });

/**
 * Atualiza nome e/ou avatar do usuário da SESSÃO. O id nunca vem do corpo e o e-mail não é editável.
 * Avatar: data URL image/png|jpeg|webp de até 150 KB; `null` remove a foto.
 * Usa a coluna existente users.avatar_url (criada no schema inicial); não há DDL aqui.
 */
export async function PATCH(req: Request) {
  const ctx = await authContext(req);
  if (ctx instanceof NextResponse) return ctx;

  const body = await readJson(req, BODY_LIMIT);
  if (!body) return bad('INVALID_BODY');
  if ('email' in body) return bad('EMAIL_NOT_EDITABLE');

  const hasName = 'name' in body;
  const hasAvatar = 'avatar' in body;
  if (!hasName && !hasAvatar) return bad('NOTHING_TO_UPDATE');

  const name = hasName ? validateName(body.name) : null;
  if (hasName && !name) return bad('INVALID_NAME');
  const removeAvatar = hasAvatar && body.avatar === null;
  const avatar = hasAvatar && !removeAvatar ? validateAvatar(body.avatar) : null;
  if (hasAvatar && !removeAvatar && !avatar) return bad('INVALID_AVATAR');

  try {
    // COALESCE mantém o nome atual quando não enviado; o WHERE usa só o id da sessão.
    const rows = await sql`
      UPDATE users
      SET name = COALESCE(${name}, name),
          avatar_url = CASE WHEN ${hasAvatar} THEN ${avatar} ELSE avatar_url END,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ${ctx.id}
      RETURNING name, avatar_url;
    `;
    if (!rows[0]) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
    return NextResponse.json({ ok: true, name: rows[0].name, avatar: rows[0].avatar_url ?? null });
  } catch (e) {
    console.error('auth/profile falhou:', e instanceof Error ? e.name : 'erro');
    return NextResponse.json({ error: 'AUTH_UNAVAILABLE' }, { status: 503 });
  }
}
