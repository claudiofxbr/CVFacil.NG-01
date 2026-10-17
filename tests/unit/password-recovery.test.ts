import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

type U = { id: string; email: string; password_hash: string };
type S = { user_id: string; token_hash: string; revoked: boolean };
const db = vi.hoisted(() => ({ users: [] as any[], sessions: [] as any[], queries: [] as { text: string; values: any[] }[], fail: false }));

// Banco falso: só as queries usadas por lib/session, lib/passwordAdmin e pelas duas rotas novas.
vi.mock('../../lib/neon', () => ({
  sql: async (strings: TemplateStringsArray, ...values: any[]) => {
    if (db.fail) throw new Error('db down');
    const text = strings.join('?');
    db.queries.push({ text, values });
    const users = db.users as U[];
    const sessions = db.sessions as S[];
    if (text.includes('FROM sessions s JOIN users')) {
      const s = sessions.find((x) => x.token_hash === values[0] && !x.revoked);
      const u = s && users.find((x) => x.id === s.user_id);
      return u ? [{ id: u.id, email: u.email }] : [];
    }
    if (text.includes('SELECT password_hash FROM users WHERE id')) {
      const u = users.find((x) => x.id === values[0]);
      return u ? [{ password_hash: u.password_hash }] : [];
    }
    if (text.includes('SELECT id FROM users WHERE email')) {
      const u = users.find((x) => x.email === values[0]);
      return u ? [{ id: u.id }] : [];
    }
    if (text.includes('WITH upd AS')) {
      const [newHash, userId, keep] = values;
      const u = users.find((x) => x.id === userId);
      if (!u) return [];
      u.password_hash = newHash;
      sessions.filter((s) => s.user_id === userId && !s.revoked && s.token_hash !== keep).forEach((s) => (s.revoked = true));
      return [{ id: u.id }];
    }
    if (text.includes('rate_limits')) throw new Error('rate store off');
    throw new Error('query inesperada: ' + text);
  },
}));

import { POST as changePassword } from '../../app/api/auth/password/route';
import { POST as adminReset } from '../../app/api/admin/users/reset-password/route';
import { hashPassword, verifyPassword } from '../../lib/password';
import { hashToken, SESSION_COOKIE } from '../../lib/session';
import { generateTemporaryPassword, TEMP_PASSWORD_LENGTH } from '../../lib/passwordAdmin';
import { __resetRateLimitStoreForTests } from '../../lib/rateLimit';

const OLD = 'senha-antiga-123';
const NEW = 'senha-nova-456';
const tok = (c: string) => c.repeat(43).slice(0, 43);
const T_ADMIN = tok('a'), T_USER = tok('b'), T_USER2 = tok('c'), T_OTHER = tok('d');

const req = (path: string, body: unknown, token?: string) =>
  new Request(`http://x${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '1.2.3.4', ...(token ? { cookie: `${SESSION_COOKIE}=${token}` } : {}) },
    body: JSON.stringify(body),
  });

beforeEach(async () => {
  db.users.length = 0; db.sessions.length = 0; db.queries.length = 0; db.fail = false;
  __resetRateLimitStoreForTests();
  process.env.ADMIN_EMAILS = 'admin@exemplo.com';
  const hash = await hashPassword(OLD);
  db.users.push(
    { id: 'adm', email: 'admin@exemplo.com', password_hash: hash },
    { id: 'usr', email: 'cliente@exemplo.com', password_hash: hash },
    { id: 'oth', email: 'outro@exemplo.com', password_hash: hash },
  );
  db.sessions.push(
    { user_id: 'adm', token_hash: hashToken(T_ADMIN), revoked: false },
    { user_id: 'usr', token_hash: hashToken(T_USER), revoked: false },
    { user_id: 'usr', token_hash: hashToken(T_USER2), revoked: false },
    { user_id: 'oth', token_hash: hashToken(T_OTHER), revoked: false },
  );
});

describe('POST /api/auth/password (trocar a própria senha)', () => {
  it('sem sessão -> 401', async () => {
    expect((await changePassword(req('/api/auth/password', { currentPassword: OLD, newPassword: NEW }))).status).toBe(401);
  });

  it('troca a senha, mantém a sessão atual e revoga as outras do mesmo usuário', async () => {
    const res = await changePassword(req('/api/auth/password', { currentPassword: OLD, newPassword: NEW }, T_USER));
    expect(res.status).toBe(200);
    expect(await verifyPassword(NEW, db.users[1].password_hash)).toBe(true);
    expect(await verifyPassword(OLD, db.users[1].password_hash)).toBe(false);
    const byHash = (t: string) => db.sessions.find((s: S) => s.token_hash === hashToken(t))!;
    expect(byHash(T_USER).revoked).toBe(false);
    expect(byHash(T_USER2).revoked).toBe(true);
    expect(byHash(T_OTHER).revoked).toBe(false);
    expect(JSON.stringify(db.queries)).not.toContain(NEW);
  });

  it('senha atual errada -> 403 sem alterar nada; 5 erros -> 429', async () => {
    const before = db.users[1].password_hash;
    for (let i = 0; i < 5; i++) {
      expect((await changePassword(req('/api/auth/password', { currentPassword: 'errada-errada', newPassword: NEW }, T_USER))).status).toBe(403);
    }
    expect(db.users[1].password_hash).toBe(before);
    expect((await changePassword(req('/api/auth/password', { currentPassword: OLD, newPassword: NEW }, T_USER))).status).toBe(429);
  });

  it('valida a nova senha: curta -> 400, igual à atual -> 400, corpo inválido -> 400', async () => {
    const r = async (b: unknown) => (await changePassword(req('/api/auth/password', b, T_USER))).status;
    expect(await r({ currentPassword: OLD, newPassword: 'curta' })).toBe(400);
    expect(await r({ currentPassword: OLD, newPassword: OLD })).toBe(400);
    expect(await r({ currentPassword: OLD })).toBe(400);
    expect(await r({ newPassword: NEW })).toBe(400);
  });

  it('o usuário vem só da sessão: id no corpo é ignorado', async () => {
    const res = await changePassword(req('/api/auth/password', { currentPassword: OLD, newPassword: NEW, id: 'oth', userId: 'oth' }, T_USER));
    expect(res.status).toBe(200);
    expect(await verifyPassword(OLD, db.users[2].password_hash)).toBe(true);
  });

  it('erro de banco -> 503 sem vazar detalhe', async () => {
    db.fail = true;
    const res = await changePassword(req('/api/auth/password', { currentPassword: OLD, newPassword: NEW }, T_USER));
    expect(res.status).toBe(503);
    expect(JSON.stringify(await res.json())).not.toMatch(/db down|stack/i);
  });
});

describe('POST /api/admin/users/reset-password (admin redefine a senha de outro usuário)', () => {
  const call = (body: unknown, token?: string) => adminReset(req('/api/admin/users/reset-password', body, token));

  it('sem sessão -> 401; usuário comum -> 403', async () => {
    expect((await call({ email: 'cliente@exemplo.com' })).status).toBe(401);
    expect((await call({ email: 'outro@exemplo.com' }, T_USER)).status).toBe(403);
  });

  it('e-mail inválido -> 400; própria conta -> 400; inexistente -> 404', async () => {
    expect((await call({ email: 'lixo' }, T_ADMIN)).status).toBe(400);
    expect((await call({ email: 'admin@exemplo.com' }, T_ADMIN)).status).toBe(400);
    expect((await call({ email: 'ninguem@exemplo.com' }, T_ADMIN)).status).toBe(404);
  });

  it('gera senha temporária (uma vez, sem cache), grava só o hash e desconecta o usuário', async () => {
    const res = await call({ email: 'Cliente@Exemplo.com ' }, T_ADMIN);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const { temporaryPassword } = await res.json();
    expect(temporaryPassword).toHaveLength(TEMP_PASSWORD_LENGTH);
    expect(await verifyPassword(temporaryPassword, db.users[1].password_hash)).toBe(true);
    expect(JSON.stringify(db.queries)).not.toContain(temporaryPassword);
    const byHash = (t: string) => db.sessions.find((s: S) => s.token_hash === hashToken(t))!;
    expect(byHash(T_USER).revoked).toBe(true);
    expect(byHash(T_USER2).revoked).toBe(true);
    expect(byHash(T_ADMIN).revoked).toBe(false);
    expect(byHash(T_OTHER).revoked).toBe(false);
  });

  it('cada redefinição gera uma senha diferente; mais de 10 por hora -> 429', async () => {
    const a = (await (await call({ email: 'cliente@exemplo.com' }, T_ADMIN)).json()).temporaryPassword;
    const b = (await (await call({ email: 'cliente@exemplo.com' }, T_ADMIN)).json()).temporaryPassword;
    expect(a).not.toBe(b);
    for (let i = 0; i < 8; i++) await call({ email: 'cliente@exemplo.com' }, T_ADMIN);
    expect((await call({ email: 'cliente@exemplo.com' }, T_ADMIN)).status).toBe(429);
  });

  it('erro de banco -> 503', async () => {
    db.fail = true;
    expect((await call({ email: 'cliente@exemplo.com' }, T_ADMIN)).status).toBe(503);
  });
});

describe('senha temporária', () => {
  it('só usa caracteres sem ambiguidade de leitura', () => {
    for (let i = 0; i < 200; i++) expect(generateTemporaryPassword()).toMatch(/^[a-km-zA-HJ-NP-Z2-9]{16}$/);
  });
});

describe('proteção no código-fonte', () => {
  const read = (p: string) => readFileSync(join(__dirname, '..', '..', p), 'utf8');
  it('rota admin usa adminGuard; rota de troca usa a sessão', () => {
    expect(read('app/api/admin/users/reset-password/route.ts')).toMatch(/adminGuard\(req\)/);
    expect(read('app/api/auth/password/route.ts')).toMatch(/authContext\(req\)/);
  });
  it('nenhuma das rotas registra senha em log', () => {
    for (const f of ['app/api/admin/users/reset-password/route.ts', 'app/api/auth/password/route.ts', 'lib/passwordAdmin.ts']) {
      expect(read(f)).not.toMatch(/console\.(log|info|debug)/);
      // o texto da mensagem cita a rota ("reset-password"); o que não pode aparecer é a variável com a senha
      expect(read(f)).not.toMatch(/console\.error\([^)]*\b(temporaryPassword|newPassword|currentPassword|next|current|body)\b/);
    }
  });
  it('a tela só mostra o cartão do admin quando isAdmin', () => {
    expect(read('components/Settings.tsx')).toMatch(/\{isAdmin && \(\s*<div[^>]*>\s*<h3[^>]*>\s*<span[^>]*>admin_panel_settings/);
  });
});
