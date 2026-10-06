import { describe, it, expect, vi, beforeEach } from 'vitest';

const db = vi.hoisted(() => ({
  rows: new Map<string, number>(),
  calls: [] as { text: string; values: any[] }[],
  fail: false,
  failDdlOnce: false,
  garbage: false,
}));

vi.mock('../../lib/neon', () => ({
  sql: async (strings: TemplateStringsArray, ...v: any[]) => {
    const text = strings.join('?').replace(/\s+/g, ' ').trim();
    db.calls.push({ text, values: v });
    if (db.fail) throw new Error('db down (segredo-interno)');
    if (text.startsWith('CREATE TABLE IF NOT EXISTS rate_limits')) {
      if (db.failDdlOnce) { db.failDdlOnce = false; throw new Error('ddl falhou'); }
      return [];
    }
    if (db.garbage) return [{ nada: 1 }];
    if (text.startsWith('INSERT INTO rate_limits')) {
      const k = `${v[0]}:${v[1]}`; const n = (db.rows.get(k) || 0) + 1; db.rows.set(k, n); return [{ count: n }];
    }
    if (text.startsWith('SELECT count FROM rate_limits')) {
      const k = `${v[0]}:${v[1]}`; return db.rows.has(k) ? [{ count: db.rows.get(k) }] : [];
    }
    if (text.startsWith('DELETE FROM rate_limits WHERE key')) {
      [...db.rows.keys()].filter((k) => k.startsWith(v[0] + ':')).forEach((k) => db.rows.delete(k)); return [];
    }
    if (text.startsWith('DELETE FROM rate_limits WHERE window_start')) return [];
    throw new Error('query inesperada: ' + text);
  },
}));

import { hitExceeds, isLimited, recordFailure, resetKey, __resetRateLimitStoreForTests } from '../../lib/rateLimit';

const W = 60_000;
const T = 1_700_000_000_000;

beforeEach(() => {
  db.rows.clear(); db.calls.length = 0; db.fail = false; db.failDdlOnce = false; db.garbage = false;
  __resetRateLimitStoreForTests();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('limite persistente no Neon', () => {
  it('cria a tabela uma única vez (lazy, idempotente) e conta pelo UPSERT', async () => {
    for (let i = 0; i < 3; i++) await hitExceeds('ai:u1', 20, W, T);
    expect(db.calls.filter((c) => c.text.startsWith('CREATE TABLE IF NOT EXISTS rate_limits'))).toHaveLength(1);
    expect(db.calls.filter((c) => c.text.startsWith('INSERT INTO rate_limits'))).toHaveLength(3);
    expect(db.calls.find((c) => c.text.includes('ON CONFLICT (key, window_start) DO UPDATE SET count = rate_limits.count + 1'))).toBeTruthy();
  });

  it('excede só a partir do máximo+1; outra chave e janela seguinte não são afetadas', async () => {
    for (let i = 0; i < 20; i++) expect(await hitExceeds('ai:u1', 20, W, T)).toBe(false);
    expect(await hitExceeds('ai:u1', 20, W, T)).toBe(true);
    expect(await hitExceeds('ai:u2', 20, W, T)).toBe(false);
    expect(await hitExceeds('ai:u1', 20, W, T + W)).toBe(false);
  });

  it('o limite sobrevive a "reinício" do processo (estado está no banco, não na memória)', async () => {
    for (let i = 0; i < 20; i++) await hitExceeds('ai:u1', 20, W, T);
    // reinício: zera memória/flags do módulo, mas o banco (db.rows) permanece
    __resetRateLimitStoreForTests();
    expect(await hitExceeds('ai:u1', 20, W, T)).toBe(true);
  });

  it('login: isLimited só consulta; falhas bloqueiam no 5o; resetKey libera', async () => {
    const k = 'login:1.2.3.4:a@b.com';
    for (let i = 0; i < 4; i++) { await recordFailure(k, 900_000, T); expect(await isLimited(k, 5, 900_000, T)).toBe(false); }
    await recordFailure(k, 900_000, T);
    expect(await isLimited(k, 5, 900_000, T)).toBe(true);
    await resetKey(k);
    expect(await isLimited(k, 5, 900_000, T)).toBe(false);
  });

  it('não grava IP nem e-mail em claro (chave é SHA-256)', async () => {
    await recordFailure('login:9.9.9.9:pessoa@x.com', 900_000, T);
    const all = JSON.stringify(db.calls);
    expect(all).not.toContain('9.9.9.9');
    expect(all).not.toContain('pessoa@x.com');
    expect(db.calls.find((c) => c.text.startsWith('INSERT'))!.values[0]).toMatch(/^[0-9a-f]{64}$/);
  });

  it('limpa janelas antigas de forma oportunista (no máximo a cada 10 min)', async () => {
    await hitExceeds('k', 5, W, T);
    await hitExceeds('k', 5, W, T + 1000);
    await new Promise((r) => setTimeout(r, 0));
    expect(db.calls.filter((c) => c.text.startsWith('DELETE FROM rate_limits WHERE window_start'))).toHaveLength(1);
  });
});

describe('falhas do banco: fail-open com fallback em memória, sem PII e sem derrubar', () => {
  it('banco fora: não lança, nunca bloqueia no começo e ainda limita em memória', async () => {
    db.fail = true;
    for (let i = 0; i < 20; i++) expect(await hitExceeds('ai:u1', 20, W, T)).toBe(false);
    expect(await hitExceeds('ai:u1', 20, W, T)).toBe(true); // memória continua protegendo a cota
    expect(await hitExceeds('ai:outro', 20, W, T)).toBe(false); // nunca bloqueia todos
  });

  it('banco fora: isLimited/recordFailure/resetKey não lançam', async () => {
    db.fail = true;
    for (let i = 0; i < 5; i++) await recordFailure('login:k', 900_000, T);
    expect(await isLimited('login:k', 5, 900_000, T)).toBe(true);
    expect(await isLimited('login:outro', 5, 900_000, T)).toBe(false);
    await expect(resetKey('login:k')).resolves.toBeUndefined();
    expect(await isLimited('login:k', 5, 900_000, T)).toBe(false);
  });

  it('log do fallback não vaza a mensagem do erro', async () => {
    db.fail = true;
    await hitExceeds('ai:u1', 20, W, T);
    const logged = JSON.stringify((console.warn as any).mock.calls);
    expect(logged).not.toContain('segredo-interno');
  });

  it('falha no DDL não é cacheada: tenta de novo e volta a usar o banco', async () => {
    db.failDdlOnce = true;
    await hitExceeds('ai:u1', 20, W, T); // cai para memória
    await hitExceeds('ai:u1', 20, W, T);
    expect(db.calls.filter((c) => c.text.startsWith('CREATE TABLE')).length).toBe(2);
    expect(db.calls.some((c) => c.text.startsWith('INSERT INTO rate_limits'))).toBe(true);
  });

  it('resposta inesperada do banco é tratada como falha (fallback), não como "0" nem exceção', async () => {
    db.garbage = true;
    expect(await hitExceeds('ai:u1', 2, W, T)).toBe(false);
    expect(await hitExceeds('ai:u1', 2, W, T)).toBe(false);
    expect(await hitExceeds('ai:u1', 2, W, T)).toBe(true);
  });
});
