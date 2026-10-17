import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

type PR = { id: string; user_id: string; token_hash: string; expires: number; used: boolean };
const db = vi.hoisted(() => ({ users: [] as any[], sessions: [] as any[], resets: [] as any[], queries: [] as string[], fail: false }));
const mail = vi.hoisted(() => ({ send: vi.fn(), fail: false, created: [] as any[] }));

vi.mock('nodemailer', () => ({
  default: {
    createTransport: (opts: any) => {
      mail.created.push(opts);
      return { sendMail: async (m: any) => { if (mail.fail) throw Object.assign(new Error('smtp down'), { name: 'SmtpError' }); mail.send(m); } };
    },
  },
}));

// Banco falso: só as queries de lib/passwordReset e das duas rotas.
vi.mock('../../lib/neon', () => ({
  sql: async (strings: TemplateStringsArray, ...values: any[]) => {
    if (db.fail) throw new Error('db down');
    const text = strings.join('?');
    db.queries.push(JSON.stringify(values));
    if (text.includes('CREATE TABLE') || text.includes('CREATE INDEX')) return [];
    if (text.includes('SELECT id FROM users WHERE email')) {
      const u = db.users.find((x: any) => x.email === values[0] && x.password_hash);
      return u ? [{ id: u.id }] : [];
    }
    if (text.includes('WITH inv AS')) {
      const [userId, id, , tokenHash, ttl] = values; // ${userId} aparece no CTE e de novo no VALUES
      (db.resets as PR[]).filter((r) => r.user_id === userId && !r.used).forEach((r) => (r.used = true));
      db.resets.push({ id, user_id: userId, token_hash: tokenHash, expires: Date.now() + ttl * 60_000, used: false });
      return [];
    }
    if (text.includes('WITH tok AS')) {
      const [tokenHash, newHash] = values;
      const r = (db.resets as PR[]).find((x) => x.token_hash === tokenHash && !x.used && x.expires > Date.now());
      if (!r) return [];
      r.used = true;
      const u = db.users.find((x: any) => x.id === r.user_id);
      u.password_hash = newHash;
      db.sessions.filter((s: any) => s.user_id === u.id && !s.revoked).forEach((s: any) => (s.revoked = true));
      return [{ id: u.id }];
    }
    if (text.includes('rate_limits')) throw new Error('rate store off');
    throw new Error('query inesperada: ' + text);
  },
}));

import { POST as forgot } from '../../app/api/auth/forgot-password/route';
import { POST as reset } from '../../app/api/auth/reset-password/route';
import { mailConfig } from '../../lib/mailer';
import { hashPassword, verifyPassword } from '../../lib/password';
import { __resetRateLimitStoreForTests } from '../../lib/rateLimit';
import { __resetResetSchemaForTests, RESET_TTL_MINUTES } from '../../lib/passwordReset';

const OLD = 'senha-antiga-123';
const NEW = 'senha-nova-456';
const post = (path: string, body: unknown, ip = '1.2.3.4') =>
  new Request(`http://x${path}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': ip }, body: JSON.stringify(body) });
const ask = (email: string, ip?: string) => forgot(post('/api/auth/forgot-password', { email }, ip));
const settle = () => new Promise((r) => setTimeout(r, 25));
const tokenFromMail = () => /token=([A-Za-z0-9_-]{43})/.exec(mail.send.mock.calls.at(-1)![0].text)![1];

beforeEach(async () => {
  db.users.length = 0; db.sessions.length = 0; db.resets.length = 0; db.queries.length = 0; db.fail = false;
  mail.send.mockClear(); mail.fail = false; mail.created.length = 0;
  __resetRateLimitStoreForTests(); __resetResetSchemaForTests();
  Object.assign(process.env, { SMTP_HOST: 'smtp.exemplo.test', SMTP_PORT: '465', SMTP_USER: 'app@exemplo.test', SMTP_PASS: 's3nh@-smtp', MAIL_FROM: 'CVFacil.NG <app@exemplo.test>' });
  const hash = await hashPassword(OLD);
  db.users.push(
    { id: 'u1', email: 'cliente@exemplo.com', password_hash: hash },
    { id: 'u2', email: 'semsenha@exemplo.com', password_hash: null },
  );
  db.sessions.push({ user_id: 'u1', token_hash: 'a', revoked: false }, { user_id: 'u1', token_hash: 'b', revoked: false });
});
afterEach(() => { for (const k of ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'MAIL_FROM']) delete process.env[k]; });

describe('configuração SMTP', () => {
  it('exige host, usuário, senha e remetente; porta padrão 465 (SSL)', () => {
    expect(mailConfig({})).toBeNull();
    expect(mailConfig({ SMTP_HOST: 'h', SMTP_USER: 'u', SMTP_PASS: 'p' } as any)).toBeNull();
    expect(mailConfig({ SMTP_HOST: 'h', SMTP_USER: 'u', SMTP_PASS: 'p', MAIL_FROM: 'f@x.com' } as any)?.port).toBe(465);
    expect(mailConfig({ SMTP_HOST: 'h', SMTP_PORT: 'abc', SMTP_USER: 'u', SMTP_PASS: 'p', MAIL_FROM: 'f@x.com' } as any)).toBeNull();
  });
});

describe('POST /api/auth/forgot-password', () => {
  it('e-mail inválido -> 400; sem SMTP configurado -> 503 MAIL_UNAVAILABLE (nunca falha em silêncio)', async () => {
    expect((await ask('lixo')).status).toBe(400);
    delete process.env.SMTP_PASS;
    const res = await ask('cliente@exemplo.com');
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe('MAIL_UNAVAILABLE');
    await settle();
    expect(mail.send).not.toHaveBeenCalled();
  });

  it('conta existente: envia 1 e-mail ao endereço normalizado, com link de uso único; só o hash do token vai ao banco', async () => {
    const res = await ask(' Cliente@Exemplo.com ');
    expect(res.status).toBe(200);
    await vi.waitFor(() => expect(mail.send).toHaveBeenCalledTimes(1));
    const m = mail.send.mock.calls[0][0];
    expect(m.to).toBe('cliente@exemplo.com');
    expect(m.from).toBe('CVFacil.NG <app@exemplo.test>');
    expect(m.text).toContain('https://cvfacil.xavierbr-vps.tech/recuperar-senha?token=');
    expect(m.text).toContain(`${RESET_TTL_MINUTES} minutos`);
    const token = tokenFromMail();
    expect(db.queries.join('\n')).not.toContain(token);
    expect(db.resets).toHaveLength(1);
    expect(mail.created[0]).toMatchObject({ host: 'smtp.exemplo.test', port: 465, secure: true });
  });

  it('resposta idêntica exista ou não a conta, e sem e-mail para conta inexistente ou sem senha', async () => {
    const a = await (await ask('cliente@exemplo.com')).text();
    const b = await (await ask('ninguem@exemplo.com')).text();
    const c = await (await ask('semsenha@exemplo.com')).text();
    expect(b).toBe(a);
    expect(c).toBe(a);
    await settle();
    expect(mail.send).toHaveBeenCalledTimes(1);
  });

  it('limite por e-mail (3/h): o 4º pedido responde igual mas não envia; limite por IP (10/h) -> 429', async () => {
    for (let i = 0; i < 4; i++) expect((await ask('cliente@exemplo.com')).status).toBe(200);
    await settle();
    expect(mail.send).toHaveBeenCalledTimes(3);
    __resetRateLimitStoreForTests();
    for (let i = 0; i < 10; i++) expect((await ask(`x${i}@exemplo.com`, '9.9.9.9')).status).toBe(200);
    expect((await ask('y@exemplo.com', '9.9.9.9')).status).toBe(429);
  });

  it('falha do SMTP não vaza para o cliente (200 genérico) e erro de banco -> 503', async () => {
    mail.fail = true;
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await ask('cliente@exemplo.com');
    expect(res.status).toBe(200);
    await vi.waitFor(() => expect(err).toHaveBeenCalledWith('mailer falhou:', 'SmtpError'));
    err.mockRestore();
    db.fail = true;
    expect((await ask('cliente@exemplo.com', '5.5.5.5')).status).toBe(503);
  });

  it('novo pedido invalida o link anterior', async () => {
    await ask('cliente@exemplo.com');
    await vi.waitFor(() => expect(mail.send).toHaveBeenCalledTimes(1));
    const first = tokenFromMail();
    await ask('cliente@exemplo.com', '6.6.6.6');
    await vi.waitFor(() => expect(mail.send).toHaveBeenCalledTimes(2));
    const second = tokenFromMail();
    expect((await reset(post('/api/auth/reset-password', { token: first, newPassword: NEW }))).status).toBe(400);
    expect((await reset(post('/api/auth/reset-password', { token: second, newPassword: NEW }))).status).toBe(200);
  });
});

describe('POST /api/auth/reset-password', () => {
  const issue = async () => { await ask('cliente@exemplo.com'); await vi.waitFor(() => expect(mail.send).toHaveBeenCalled()); return tokenFromMail(); };
  const go = (token: string, newPassword: string, ip?: string) => reset(post('/api/auth/reset-password', { token, newPassword }, ip));

  it('token válido: troca a senha, revoga todas as sessões e o token não vale duas vezes', async () => {
    const token = await issue();
    expect((await go(token, NEW)).status).toBe(200);
    expect(await verifyPassword(NEW, db.users[0].password_hash)).toBe(true);
    expect(await verifyPassword(OLD, db.users[0].password_hash)).toBe(false);
    expect(db.sessions.every((s: any) => s.revoked)).toBe(true);
    const again = await go(token, 'outra-senha-789');
    expect(again.status).toBe(400);
    expect((await again.json()).error).toBe('INVALID_OR_EXPIRED_TOKEN');
    expect(await verifyPassword(NEW, db.users[0].password_hash)).toBe(true);
  });

  it('token expirado, inexistente ou malformado -> 400 sem alterar a senha', async () => {
    const token = await issue();
    (db.resets[0] as PR).expires = Date.now() - 1000;
    const before = db.users[0].password_hash;
    expect((await go(token, NEW)).status).toBe(400);
    expect((await go('a'.repeat(43), NEW)).status).toBe(400);
    expect((await go('curto', NEW)).status).toBe(400);
    expect(db.users[0].password_hash).toBe(before);
  });

  it('senha fora da política -> 400 e o token continua utilizável', async () => {
    const token = await issue();
    expect((await go(token, 'curta')).status).toBe(400);
    expect((await go(token, NEW)).status).toBe(200);
  });

  it('limite por IP (20/h) -> 429; erro de banco -> 503', async () => {
    for (let i = 0; i < 20; i++) await go('a'.repeat(43), NEW, '8.8.8.8');
    expect((await go('a'.repeat(43), NEW, '8.8.8.8')).status).toBe(429);
    db.fail = true;
    expect((await go('b'.repeat(43), NEW, '7.7.7.7')).status).toBe(503);
  });
});

describe('proteção no código-fonte', () => {
  const read = (p: string) => readFileSync(join(__dirname, '..', '..', p), 'utf8');
  const files = ['lib/mailer.ts', 'lib/passwordReset.ts', 'app/api/auth/forgot-password/route.ts', 'app/api/auth/reset-password/route.ts'];

  it('nenhum arquivo registra token, senha, e-mail ou credencial SMTP em log', () => {
    for (const f of files) {
      const src = read(f);
      expect(src).not.toMatch(/console\.(log|info|debug)/);
      expect(src).not.toMatch(/console\.error\([^)]*\b(token|newPassword|email|pass|cfg|body)\b/);
    }
  });

  it('credenciais só do ambiente e deploy passa os 5 secrets sem imprimi-los', () => {
    expect(read('lib/mailer.ts')).not.toMatch(/smtp\.hostinger|@[a-z0-9-]+\.(com|net|tech)/i);
    const deploy = read('.github/workflows/deploy.yml');
    for (const n of ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'MAIL_FROM']) expect(deploy).toContain(`secrets.${n}`);
    expect(deploy).toMatch(/envs: [^\n]*MAIL_B64/);
    expect(deploy).toMatch(/echo "::add-mask::\$B64"\s+echo "MAIL_B64=/);
  });

  it('o link do login vai para a página de recuperação', () => {
    expect(read('components/Auth.tsx')).toMatch(/<a href="\/recuperar-senha"/);
    expect(read('app/recuperar-senha/page.tsx')).toMatch(/replaceState/);
  });
});
