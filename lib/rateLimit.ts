import { createHash } from 'node:crypto';
import { sql } from './neon';

/**
 * Limitador persistente no Neon (tabela rate_limits), compartilhado entre reinícios e instâncias.
 * - Janela fixa por chave: PRIMARY KEY (key, window_start); UPSERT atômico incrementa o contador.
 * - A chave é sempre um SHA-256 (nunca grava IP nem e-mail em claro).
 * - Fail-open: se o banco falhar, cai para um limitador em memória (por processo). Nunca bloqueia
 *   todo mundo nem derruba a rota; o log não leva PII.
 * - O esquema é criado de forma lazy e idempotente na primeira utilização.
 */

const CLEANUP_EVERY_MS = 10 * 60 * 1000;
const KEEP_MS = 24 * 60 * 60 * 1000;
const MAX_MEMORY_KEYS = 10000;

let schemaReady = false;
let lastCleanup = 0;
const memory = new Map<string, number[]>();

const hashKey = (key: string): string => createHash('sha256').update(key).digest('hex');
const windowStart = (windowMs: number, now: number): number => Math.floor(now / windowMs) * windowMs;

async function ensureSchema(): Promise<void> {
  if (schemaReady) return;
  await sql`
    CREATE TABLE IF NOT EXISTS rate_limits (
      key VARCHAR(64) NOT NULL,
      window_start BIGINT NOT NULL,
      count INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (key, window_start)
    );
  `;
  schemaReady = true; // só depois do sucesso: falha de DDL é tentada de novo na próxima chamada
}

async function cleanupIfDue(now: number): Promise<void> {
  if (now - lastCleanup < CLEANUP_EVERY_MS) return;
  lastCleanup = now;
  try {
    await sql`DELETE FROM rate_limits WHERE window_start < ${now - KEEP_MS};`;
  } catch {
    /* limpeza é oportunista: a próxima tentativa ocorre em 10 min */
  }
}

function warnFallback(e: unknown): void {
  console.warn('rate-limit: banco indisponível, usando memória por processo', e instanceof Error ? e.name : 'erro');
}

// ---- fallback em memória (janela deslizante) ----
const recent = (key: string, windowMs: number, now: number) => (memory.get(key) || []).filter((t) => now - t < windowMs);
function memRecord(key: string, windowMs: number, now: number): number {
  if (memory.size >= MAX_MEMORY_KEYS) memory.clear();
  const list = [...recent(key, windowMs, now), now];
  memory.set(key, list);
  return list.length;
}

const toCount = (rows: any[]): number | null => {
  const n = Number(rows?.[0]?.count);
  return Number.isFinite(n) ? n : null;
};

/** Registra uma ocorrência e devolve o total na janela atual. */
async function record(rawKey: string, windowMs: number, now: number): Promise<number> {
  const key = hashKey(rawKey);
  try {
    await ensureSchema();
    const rows = await sql`
      INSERT INTO rate_limits (key, window_start, count)
      VALUES (${key}, ${windowStart(windowMs, now)}, 1)
      ON CONFLICT (key, window_start) DO UPDATE SET count = rate_limits.count + 1
      RETURNING count;
    `;
    const n = toCount(rows);
    if (n === null) throw new Error('resposta inesperada');
    void cleanupIfDue(now);
    return n;
  } catch (e) {
    warnFallback(e);
    return memRecord(key, windowMs, now);
  }
}

/** Conta a chamada e diz se EXCEDEU o máximo (uso: limite por chamada, ex.: IA). */
export async function hitExceeds(rawKey: string, max: number, windowMs: number, now = Date.now()): Promise<boolean> {
  return (await record(rawKey, windowMs, now)) > max;
}

/** Só consulta: a chave já atingiu o máximo na janela atual? (uso: bloqueio por falhas de login) */
export async function isLimited(rawKey: string, max: number, windowMs: number, now = Date.now()): Promise<boolean> {
  const key = hashKey(rawKey);
  try {
    await ensureSchema();
    const rows = await sql`
      SELECT count FROM rate_limits WHERE key = ${key} AND window_start = ${windowStart(windowMs, now)} LIMIT 1;
    `;
    if (rows.length === 0) return recent(key, windowMs, now).length >= max;
    const n = toCount(rows);
    if (n === null) throw new Error('resposta inesperada');
    return n >= max;
  } catch (e) {
    warnFallback(e);
    return recent(key, windowMs, now).length >= max;
  }
}

/** Registra uma falha (não decide nada). */
export async function recordFailure(rawKey: string, windowMs: number, now = Date.now()): Promise<void> {
  await record(rawKey, windowMs, now);
}

/** Zera a chave (login bem-sucedido). */
export async function resetKey(rawKey: string): Promise<void> {
  const key = hashKey(rawKey);
  memory.delete(key);
  try {
    await ensureSchema();
    await sql`DELETE FROM rate_limits WHERE key = ${key};`;
  } catch (e) {
    warnFallback(e);
  }
}

export function __resetRateLimitStoreForTests(): void {
  schemaReady = false;
  lastCleanup = 0;
  memory.clear();
}
