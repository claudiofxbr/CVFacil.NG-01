import { randomInt } from 'node:crypto';
import { sql } from './neon';

// Sem 0/O, 1/l/I: a senha temporária é ditada ou copiada pelo administrador e não pode gerar dúvida de leitura.
const TEMP_ALPHABET = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const TEMP_PASSWORD_LENGTH = 16;

export function generateTemporaryPassword(): string {
  let out = '';
  for (let i = 0; i < TEMP_PASSWORD_LENGTH; i++) out += TEMP_ALPHABET[randomInt(TEMP_ALPHABET.length)];
  return out;
}

/**
 * Troca o hash e revoga as sessões do usuário numa única instrução (atômica): ou muda tudo ou nada.
 * keepTokenHash preserva a sessão atual na troca da própria senha; '' revoga todas (redefinição pelo admin).
 * Retorna false se o usuário não existe.
 */
export async function replacePassword(userId: string, newHash: string, keepTokenHash: string): Promise<boolean> {
  const rows = await sql`
    WITH upd AS (
      UPDATE users SET password_hash = ${newHash}, updated_at = CURRENT_TIMESTAMP WHERE id = ${userId} RETURNING id
    ), rev AS (
      UPDATE sessions SET revoked_at = now()
      WHERE user_id IN (SELECT id FROM upd) AND revoked_at IS NULL AND token_hash <> ${keepTokenHash}
      RETURNING 1
    )
    SELECT id FROM upd;
  `;
  return rows.length > 0;
}
