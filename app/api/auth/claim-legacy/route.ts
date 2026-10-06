import { NextResponse } from 'next/server';
import { sql } from '../../../../lib/neon';
import { authContext } from '../../../../lib/apiAuth';
import { readJson } from '../../../../lib/authInput';
import { LEGACY_ID_RE, LEGACY_EMAIL_DOMAIN, CLAIMED_EMAIL_DOMAIN } from '../../../../lib/accountIdentity';

export const dynamic = 'force-dynamic';

const MAX_IDS = 10;

/**
 * Reivindica currículos criados antes da sessão de servidor (ids locais `local-<timestamp>`).
 *
 * Tudo em UMA instrução SQL (CTEs encadeadas = atômica; o Neon HTTP não mantém transação entre
 * chamadas). Um id só é elegível se a linha antiga em `users` tiver e-mail SINTÉTICO exato
 * (`<id>@cvfacil.local`) e nenhuma senha. Ao migrar, o e-mail da linha antiga é trocado por um
 * marcador não-sintético, então o mesmo id não pode ser reivindicado de novo (FOR UPDATE +
 * re-checagem em READ COMMITTED cobre chamadas concorrentes).
 */
export async function POST(req: Request) {
  const ctx = await authContext(req);
  if (ctx instanceof NextResponse) return ctx;

  const body = await readJson(req);
  const raw = body?.legacyIds;
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_IDS) {
    return NextResponse.json({ error: 'INVALID_LEGACY_IDS' }, { status: 400 });
  }
  const unique = [...new Set(raw)];
  // Formato estrito: descarta (sem erro) o que não é local-<timestamp> — inclui admin-*, visitante e qualquer UUID.
  const valid = unique.filter((v): v is string => typeof v === 'string' && LEGACY_ID_RE.test(v) && v !== ctx.id);
  const rejected = unique.length - valid.length;
  if (valid.length === 0) {
    return NextResponse.json({ claimed: 0, resumesMoved: 0, versionsMoved: 0, rejected });
  }

  try {
    const rows = await sql`
      WITH ids AS (
        SELECT jsonb_array_elements_text(${JSON.stringify(valid)}::jsonb) AS id
      ),
      eligible AS (
        SELECT u.id FROM users u JOIN ids ON ids.id = u.id
        WHERE (u.password_hash IS NULL OR u.password_hash = '')
          AND u.email = u.id || ${'@' + LEGACY_EMAIL_DOMAIN}
          AND u.id <> ${ctx.id}
        FOR UPDATE OF u
      ),
      moved_resumes AS (
        UPDATE resumes SET user_id = ${ctx.id} WHERE user_id IN (SELECT id FROM eligible) RETURNING id
      ),
      moved_versions AS (
        UPDATE resume_versions SET changed_by = ${ctx.id} WHERE changed_by IN (SELECT id FROM eligible) RETURNING id
      ),
      claimed AS (
        UPDATE users SET email = id || ${'@' + CLAIMED_EMAIL_DOMAIN}, updated_at = CURRENT_TIMESTAMP
        WHERE id IN (SELECT id FROM eligible) RETURNING id
      )
      SELECT
        (SELECT count(*) FROM claimed) AS claimed,
        (SELECT count(*) FROM moved_resumes) AS resumes_moved,
        (SELECT count(*) FROM moved_versions) AS versions_moved;
    `;
    const r = rows[0] || {};
    const result = {
      claimed: Number(r.claimed || 0),
      resumesMoved: Number(r.resumes_moved || 0),
      versionsMoved: Number(r.versions_moved || 0),
      rejected: rejected + (valid.length - Number(r.claimed || 0)),
    };
    // Auditoria sem PII: só o id interno do usuário e contagens.
    console.info('claim-legacy', JSON.stringify({ user: ctx.id, ...result }));
    return NextResponse.json(result);
  } catch (e) {
    console.error('auth/claim-legacy falhou:', e instanceof Error ? e.name : 'erro');
    return NextResponse.json({ error: 'AUTH_UNAVAILABLE' }, { status: 503 });
  }
}
