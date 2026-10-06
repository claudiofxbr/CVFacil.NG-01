import { createHash, randomBytes } from 'node:crypto';
import { sql } from './neon';

export const SESSION_COOKIE = 'cvfacil_session';
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

export interface SessionUser {
  id: string;
  email: string;
}

export const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex');

export function readSessionToken(req: Request): string | null {
  const header = req.headers.get('cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    if (part.slice(0, idx).trim() === SESSION_COOKIE) {
      const v = part.slice(idx + 1).trim();
      return TOKEN_RE.test(v) ? v : null;
    }
  }
  return null;
}

/** Cria sessão: só o SHA-256 do token vai ao banco; o token em claro só existe no cookie. */
export async function createSession(userId: string): Promise<{ token: string; maxAge: number }> {
  const token = randomBytes(32).toString('base64url');
  const id = randomBytes(16).toString('hex');
  await sql`
    INSERT INTO sessions (id, user_id, token_hash, expires_at)
    VALUES (${id}, ${userId}, ${hashToken(token)}, now() + (${SESSION_TTL_SECONDS} * interval '1 second'));
  `;
  return { token, maxAge: SESSION_TTL_SECONDS };
}

/** Retorna o usuário da sessão ou null (ausente, adulterada, expirada ou revogada). Erros de banco propagam. */
export async function getSessionUser(req: Request): Promise<SessionUser | null> {
  const token = readSessionToken(req);
  if (!token) return null;
  const rows = await sql`
    SELECT u.id AS id, u.email AS email
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ${hashToken(token)} AND s.revoked_at IS NULL AND s.expires_at > now()
    LIMIT 1;
  `;
  const row = rows[0];
  return row ? { id: String(row.id), email: String(row.email) } : null;
}

export async function revokeSession(req: Request): Promise<void> {
  const token = readSessionToken(req);
  if (!token) return;
  await sql`UPDATE sessions SET revoked_at = now() WHERE token_hash = ${hashToken(token)} AND revoked_at IS NULL;`;
}

/** Admin só no servidor: ADMIN_EMAILS (separada por vírgula). Sem a env, ninguém é admin. */
export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const list = (process.env.ADMIN_EMAILS || '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
  return list.includes(email.trim().toLowerCase());
}

/**
 * "Testador de pagamentos" (ex.: avaliador do PagBank): SANDBOX_TESTER_EMAILS (vírgula). Sem a env, ninguém é.
 * NÃO é administrador: só habilita comprar no sandbox (ver canUseSandboxPayments); nenhum outro privilégio.
 */
export function isSandboxTesterEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const list = (process.env.SANDBOX_TESTER_EMAILS || '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
  return list.includes(email.trim().toLowerCase());
}

export const sessionCookieOptions = (maxAge: number) => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge,
});
