import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

type U = { id: string; email: string; name: string; password_hash: string | null };
type S = { id: string; user_id: string; token_hash: string; expires: number; revoked: boolean };
const db = vi.hoisted(() => ({ users: [] as any[], sessions: [] as any[], queries: [] as { text: string; values: any[] }[], fail: false }));

// Banco falso: interpreta só as queries usadas por lib/session e pelas rotas /api/auth/*.
vi.mock('../../lib/neon', () => ({
  sql: async (strings: TemplateStringsArray, ...values: any[]) => {
    if (db.fail) throw new Error('db down');
    const text = strings.join('?');
    db.queries.push({ text, values });
    const users = db.users as U[];
    const sessions = db.sessions as S[];
    if (text.includes('SELECT id, password_hash FROM users')) {
      const u = users.find((x) => x.email === values[0]);
      return u ? [{ id: u.id, password_hash: u.password_hash }] : [];
    }
    if (text.includes('INSERT INTO users')) {
      if (users.some((x) => x.email === values[1])) return [];
      users.push({ id: values[0], email: values[1], name: values[2], password_hash: values[3] });
      return [{ id: values[0] }];
    }
    if (text.includes('UPDATE users SET password_hash')) {
      const u = users.find((x) => x.email === values[1] && !x.password_hash);
      if (!u) return [];
      u.password_hash = values[0];
      return [{ id: u.id }];
    }
    if (text.includes('SELECT name, plan, credits, avatar_url FROM users')) {
      const u = users.find((x) => x.id === values[0]);
      return u ? [{ name: u.name, plan: 'free', credits: 5, avatar_url: null }] : [];
    }
    if (text.includes('INSERT INTO sessions')) {
      sessions.push({ id: values[0], user_id: values[1], token_hash: values[2], expires: Date.now() + values[3] * 1000, revoked: false });
      return [];
    }
    if (text.includes('FROM sessions s JOIN users')) {
      const s = sessions.find((x) => x.token_hash === values[0] && !x.revoked && x.expires > Date.now());
      const u = s && users.find((x) => x.id === s.user_id);
      return u ? [{ id: u.id, email: u.email }] : [];
    }
    if (text.includes('UPDATE sessions SET revoked_at')) {
      sessions.filter((x) => x.token_hash === values[0]).forEach((x) => (x.revoked = true));
      return [];
    }
    throw new Error('query inesperada: ' + text);
  },
}));

import { POST as register } from '../../app/api/auth/register/route';
import { POST as login } from '../../app/api/auth/login/route';
import { POST as logout } from '../../app/api/auth/logout/route';
import { GET as me } from '../../app/api/auth/me/route';
import { GET as whoami } from '../../app/api/payments/whoami/route';
import { requireUser } from '../../lib/requireUser';
import { hashPassword, verifyPassword } from '../../lib/password';
import { hashToken, SESSION_COOKIE } from '../../lib/session';
import { __resetRateLimitForTests } from '../../lib/authRateLimit';

const PW = 'senha-forte-123';
const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(`http://x${path}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': '1.2.3.4', ...headers }, body: JSON.stringify(body) });
const cookieOf = (res: Response) => /cvfacil_session=([^;]*)/.exec(res.headers.get('set-cookie') || '')?.[1] || '';
const withCookie = (token: string, url = 'http://x/api/auth/me') => new Request(url, { headers: { cookie: `${SESSION_COOKIE}=${token}` } });

async function signup(email = 'a@b.com', pw = PW) {
  const res = await register(post('/api/auth/register', { email, password: pw, name: 'Ana' }));
  return { res, token: cookieOf(res) };
}

beforeEach(() => {
  db.users.length = 0; db.sessions.length = 0; db.queries.length = 0; db.fail = false;
  __resetRateLimitForTests();
  delete process.env.ADMIN_EMAILS;
});
afterEach(() => { vi.useRealTimers(); });

describe('hash scrypt', () => {
  it('formato versionado, salt único e verificação correta', async () => {
    const h1 = await hashPassword(PW);
    const h2 = await hashPassword(PW);
    expect(h1).toMatch(/^scrypt\$16384\$8\$1\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/);
    expect(h1).not.toBe(h2);
    expect(h1).not.toContain(PW);
    expect(await verifyPassword(PW, h1)).toBe(true);
    expect(await verifyPassword(PW + 'x', h1)).toBe(false);
  });
  it('hash adulterado/parâmetros absurdos -> false sem custo excessivo', async () => {
    expect(await verifyPassword(PW, null)).toBe(false);
    expect(await verifyPassword(PW, 'lixo')).toBe(false);
    expect(await verifyPassword(PW, 'scrypt$1073741824$8$1$c2FsdHNhbHQ=$aGFzaGhhc2hoYXNoaGFzaA==')).toBe(false);
    expect(await verifyPassword(PW, 'plain$16384$8$1$c2FsdHNhbHQ=$aGFzaGhhc2hoYXNoaGFzaA==')).toBe(false);
  });
});

describe('registro', () => {
  it('cria usuário com hash scrypt e cookie HttpOnly/SameSite=Lax/7 dias; token só como hash no banco', async () => {
    const { res, token } = await signup();
    expect(res.status).toBe(201);
    const setCookie = res.headers.get('set-cookie')!;
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=lax/i);
    expect(setCookie).toMatch(/Path=\//);
    expect(setCookie).toMatch(/Max-Age=604800/);
    expect(token).toHaveLength(43);
    expect(db.users[0].password_hash).toMatch(/^scrypt\$/);
    const stored = JSON.stringify([db.sessions, db.queries]);
    expect(stored).not.toContain(token);
    expect(db.sessions[0].token_hash).toBe(hashToken(token));
    expect(db.sessions[0].token_hash).toMatch(/^[0-9a-f]{64}$/);
  });
  it('Secure em produção', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const { res } = await signup();
    vi.unstubAllEnvs();
    expect(res.headers.get('set-cookie')).toMatch(/Secure/i);
  });
  it('valida e-mail, senha mínima 8 e máxima 128; normaliza e-mail', async () => {
    expect((await signup('invalido')).res.status).toBe(400);
    expect((await signup('a@b.com', '1234567')).res.status).toBe(400);
    expect((await signup('a@b.com', 'x'.repeat(129))).res.status).toBe(400);
    expect((await signup('  Ana@B.COM  ')).res.status).toBe(201);
    expect(db.users[0].email).toBe('ana@b.com');
  });
  it('e-mail que já tem senha -> 409 genérico, sem sessão nem sobrescrita', async () => {
    await signup();
    const original = db.users[0].password_hash;
    const { res, token } = await signup('a@b.com', 'outra-senha-999');
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'REGISTRATION_FAILED' });
    expect(token).toBe('');
    expect(db.users[0].password_hash).toBe(original);
  });
  it('reivindica linha pré-existente sem senha (mesmo id, currículos intactos)', async () => {
    db.users.push({ id: 'local-123', email: 'a@b.com', name: 'Ana', password_hash: null });
    const { res, token } = await signup();
    expect(res.status).toBe(201);
    expect(db.users).toHaveLength(1);
    expect(db.users[0].id).toBe('local-123');
    expect(db.users[0].password_hash).toMatch(/^scrypt\$/);
    expect(db.sessions[0].user_id).toBe('local-123');
    expect(token).toHaveLength(43);
  });
});

describe('login', () => {
  it('válido cria sessão com cookie HttpOnly', async () => {
    await signup();
    const res = await login(post('/api/auth/login', { email: 'A@b.com', password: PW }));
    expect(res.status).toBe(200);
    expect(res.headers.get('set-cookie')).toMatch(/HttpOnly/i);
    expect(db.sessions).toHaveLength(2);
  });
  it('senha errada e e-mail inexistente dão a MESMA resposta 401', async () => {
    await signup();
    const wrong = await login(post('/api/auth/login', { email: 'a@b.com', password: 'errada-1234' }));
    const none = await login(post('/api/auth/login', { email: 'nao@existe.com', password: 'errada-1234' }));
    expect(wrong.status).toBe(401);
    expect(none.status).toBe(401);
    expect(await wrong.text()).toBe(await none.text());
    expect(wrong.headers.get('set-cookie')).toBeNull();
    expect(none.headers.get('set-cookie')).toBeNull();
  });
  it('usuário sem senha (legado) não loga', async () => {
    db.users.push({ id: 'local-1', email: 'a@b.com', name: 'x', password_hash: null });
    expect((await login(post('/api/auth/login', { email: 'a@b.com', password: PW }))).status).toBe(401);
  });
  it('rate limit: 5 falhas -> 429, mesmo com a senha certa depois', async () => {
    await signup();
    for (let i = 0; i < 5; i++) {
      expect((await login(post('/api/auth/login', { email: 'a@b.com', password: 'errada-1234' }))).status).toBe(401);
    }
    const blocked = await login(post('/api/auth/login', { email: 'a@b.com', password: PW }));
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('set-cookie')).toBeNull();
    // outro IP não é afetado
    const other = await login(post('/api/auth/login', { email: 'a@b.com', password: PW }, { 'x-forwarded-for': '9.9.9.9' }));
    expect(other.status).toBe(200);
  });
  it('corpo inválido -> 401 genérico; falha de banco -> 503 sem vazar detalhe', async () => {
    expect((await login(new Request('http://x/l', { method: 'POST', body: 'nao-json' }))).status).toBe(401);
    db.fail = true;
    const res = await login(post('/api/auth/login', { email: 'a@b.com', password: PW }));
    expect(res.status).toBe(503);
    expect(await res.text()).not.toContain('db down');
  });
});

describe('sessão / requireUser / me / whoami', () => {
  it('token válido -> usuário da sessão; userId forjado na URL/corpo é ignorado', async () => {
    const { token } = await signup();
    const id = db.users[0].id;
    const res = await whoami(withCookie(token, 'http://x/api/payments/whoami?userId=attacker&role=admin'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ userId: id });
    const forged = new Request('http://x/p?userId=attacker', {
      method: 'POST', headers: { cookie: `${SESSION_COOKIE}=${token}` }, body: JSON.stringify({ userId: 'attacker2' }),
    });
    expect(await requireUser(forged)).toEqual({ id, email: 'a@b.com' });
  });
  it('sem cookie, token adulterado, malformado e Bearer do Supabase -> 401', async () => {
    const { token } = await signup();
    const tampered = (token[0] === 'A' ? 'B' : 'A') + token.slice(1);
    for (const req of [
      new Request('http://x/w'),
      withCookie(tampered),
      withCookie('curto'),
      new Request('http://x/w', { headers: { authorization: 'Bearer aaa.bbb.ccc' } }),
    ]) {
      const res = await whoami(req);
      expect(res.status).toBe(401);
      expect((await res.json()).error).toBe('UNAUTHENTICATED');
    }
  });
  it('sessão expirada -> 401', async () => {
    const { token } = await signup();
    db.sessions[0].expires = Date.now() - 1000;
    expect((await whoami(withCookie(token))).status).toBe(401);
  });
  it('banco indisponível -> 503, nunca autentica', async () => {
    const { token } = await signup();
    db.fail = true;
    expect((await whoami(withCookie(token))).status).toBe(503);
  });
  it('logout revoga a sessão e limpa o cookie', async () => {
    const { token } = await signup();
    const out = await logout(new Request('http://x/api/auth/logout', { method: 'POST', headers: { cookie: `${SESSION_COOKIE}=${token}` } }));
    expect(out.status).toBe(200);
    expect(out.headers.get('set-cookie')).toMatch(/Max-Age=0/);
    expect(db.sessions[0].revoked).toBe(true);
    expect((await me(withCookie(token))).status).toBe(401);
  });
  it('me: role admin só se e-mail estiver em ADMIN_EMAILS; sem env ninguém é admin', async () => {
    const { token } = await signup('boss@x.com');
    expect((await (await me(withCookie(token))).json()).role).toBe('user');
    process.env.ADMIN_EMAILS = ' Outro@x.com , BOSS@x.com ';
    expect(await (await me(withCookie(token))).json()).toMatchObject({ id: db.users[0].id, email: 'boss@x.com', role: 'admin', plan: 'free', credits: 5 });
    const other = await signup('comum@x.com');
    expect((await (await me(withCookie(other.token))).json()).role).toBe('user');
  });
  it('respostas não vazam token nem hash', async () => {
    const { token } = await signup();
    const body = await (await me(withCookie(token))).text();
    expect(body).not.toContain(token);
    expect(body).not.toContain('scrypt$');
  });
});
