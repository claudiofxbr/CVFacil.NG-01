import { randomBytes, randomUUID } from 'node:crypto';
import { sql } from './neon';
import { hashToken } from './session';

export const RESET_TTL_MINUTES = 30;
export const RESET_TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

// Esquema aditivo, idempotente e lazy (mesmo padrão de lib/payments.ts).
let schemaReady = false;

export async function ensureResetSchema(): Promise<void> {
  if (schemaReady) return;
  await sql`
    CREATE TABLE IF NOT EXISTS password_resets (
      id VARCHAR(64) PRIMARY KEY,
      user_id VARCHAR(100) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash VARCHAR(64) NOT NULL UNIQUE,
      expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
      used_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_password_resets_user_id ON password_resets(user_id);`;
  schemaReady = true; // só após o sucesso: falha de DDL é tentada de novo
}

export function __resetResetSchemaForTests(): void {
  schemaReady = false;
}

/** Gera o token (só o SHA-256 vai ao banco) e invalida os pedidos anteriores ainda não usados do mesmo usuário. */
export async function createResetToken(userId: string): Promise<string> {
  await ensureResetSchema();
  const token = randomBytes(32).toString('base64url');
  await sql`
    WITH inv AS (
      UPDATE password_resets SET used_at = now() WHERE user_id = ${userId} AND used_at IS NULL RETURNING 1
    )
    INSERT INTO password_resets (id, user_id, token_hash, expires_at)
    VALUES (${randomUUID()}, ${userId}, ${hashToken(token)}, now() + (${RESET_TTL_MINUTES} * interval '1 minute'));
  `;
  return token;
}

/**
 * Consome o token (uso único, não expirado), troca o hash e revoga todas as sessões — tudo numa única
 * instrução: ou muda tudo ou nada, e dois pedidos simultâneos com o mesmo token não passam ambos.
 */
export async function consumeResetToken(token: string, newHash: string): Promise<boolean> {
  await ensureResetSchema();
  const rows = await sql`
    WITH tok AS (
      UPDATE password_resets SET used_at = now()
      WHERE token_hash = ${hashToken(token)} AND used_at IS NULL AND expires_at > now()
      RETURNING user_id
    ), upd AS (
      UPDATE users SET password_hash = ${newHash}, updated_at = CURRENT_TIMESTAMP
      WHERE id IN (SELECT user_id FROM tok) RETURNING id
    ), rev AS (
      UPDATE sessions SET revoked_at = now()
      WHERE user_id IN (SELECT id FROM upd) AND revoked_at IS NULL RETURNING 1
    )
    SELECT id FROM upd;
  `;
  return rows.length > 0;
}
