import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const db = vi.hoisted(() => ({ sessionUser: null as any, sqlCalls: [] as string[], failSql: false }));

vi.mock('../../lib/session', async (orig) => {
  const real: any = await orig();
  return { ...real, getSessionUser: async () => db.sessionUser };
});
vi.mock('../../lib/neon', () => ({
  sql: async (strings: TemplateStringsArray) => {
    db.sqlCalls.push(strings.join('?').replace(/\s+/g, ' ').trim());
    if (db.failSql) throw new Error('segredo-interno: tabela users quebrou');
    return [{ total: 7 }];
  },
}));
vi.mock('@google/genai', () => ({
  Type: {},
  GoogleGenAI: class {
    models = { generateContent: async () => ({ text: ' texto melhorado ' }) };
  },
}));

import { POST as setupPost, GET as setupGet } from '../../app/api/neon/setup/route';
import { POST as editor } from '../../app/api/gemini/editor/route';
import { POST as importV1 } from '../../app/api/gemini/import-pdf/route';
import { POST as importV2 } from '../../app/api/gemini/import-pdf-v2/route';
import { __resetRateLimitStoreForTests as __resetUserRateLimitForTests } from '../../lib/rateLimit';
import { NextRequest } from 'next/server';

const USER = { id: 'u1', email: 'user@x.com' };
const ADMIN = { id: 'adm', email: 'boss@x.com' };
const json = (b: unknown) => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) });
const improve = () => new NextRequest('http://x/api/gemini/editor', json({ action: 'improve', text: 'Profissional dedicado a currículos.' }));

beforeEach(() => {
  db.sessionUser = null; db.sqlCalls.length = 0; db.failSql = false;
  process.env.ADMIN_EMAILS = 'boss@x.com';
  delete process.env.GEMINI_API_KEY; delete process.env.API_KEY;
  __resetUserRateLimitForTests();
});
afterEach(() => { delete process.env.ADMIN_EMAILS; vi.unstubAllEnvs(); });

describe('/api/neon/setup exige admin', () => {
  it('sem sessão -> 401 (POST e GET) e nenhuma query ao banco', async () => {
    expect((await setupPost(new Request('http://x/s', { method: 'POST' }))).status).toBe(401);
    expect((await setupGet(new Request('http://x/s'))).status).toBe(401);
    expect(db.sqlCalls).toEqual([]);
  });
  it('usuário comum -> 403 e nenhuma query ao banco', async () => {
    db.sessionUser = USER;
    expect((await setupPost(new Request('http://x/s', { method: 'POST' }))).status).toBe(403);
    expect((await setupGet(new Request('http://x/s'))).status).toBe(403);
    expect(db.sqlCalls).toEqual([]);
  });
  it('sem ADMIN_EMAILS ninguém é admin', async () => {
    delete process.env.ADMIN_EMAILS;
    db.sessionUser = ADMIN;
    expect((await setupPost(new Request('http://x/s', { method: 'POST' }))).status).toBe(403);
  });
  it('admin: POST cria o schema (inclui sessions) e GET não expõe contagens', async () => {
    db.sessionUser = ADMIN;
    const post = await setupPost(new Request('http://x/s', { method: 'POST' }));
    expect(post.status).toBe(200);
    expect(db.sqlCalls.some((q) => q.includes('CREATE TABLE IF NOT EXISTS sessions'))).toBe(true);
    const get = await setupGet(new Request('http://x/s'));
    expect(get.status).toBe(200);
    expect(await get.json()).toEqual({ connected: true });
  });
  it('erros do banco não vazam detalhes', async () => {
    db.sessionUser = ADMIN; db.failSql = true;
    const a = await setupPost(new Request('http://x/s', { method: 'POST' }));
    const b = await setupGet(new Request('http://x/s'));
    expect(a.status).toBe(500); expect(b.status).toBe(500);
    expect((await a.text()) + (await b.text())).not.toContain('segredo-interno');
  });
});

describe('/api/gemini/* exige sessão', () => {
  it('sem sessão -> 401 nas três rotas, sem chamar a IA', async () => {
    process.env.GEMINI_API_KEY = 'k'.repeat(40);
    for (const [fn, url] of [[editor, 'editor'], [importV1, 'import-pdf'], [importV2, 'import-pdf-v2']] as const) {
      const res = await fn(new NextRequest(`http://x/api/gemini/${url}`, json({ action: 'improve', text: 'x'.repeat(30), pdfBase64: 'AAAA', base64Data: 'AAAA' })));
      expect(res.status).toBe(401);
      expect((await res.json()).error).toBe('UNAUTHENTICATED');
    }
  });
  it('com sessão mantém o contrato: editor devolve { result }', async () => {
    process.env.GEMINI_API_KEY = 'k'.repeat(40);
    db.sessionUser = USER;
    const res = await editor(improve());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ result: 'texto melhorado' });
  });
  it('com sessão mantém códigos de erro: validação 400, chave ausente 500/AI_NOT_CONFIGURED', async () => {
    db.sessionUser = USER;
    expect((await editor(improve())).status).toBe(500); // sem GEMINI_API_KEY
    process.env.GEMINI_API_KEY = 'k'.repeat(40);
    const short = await editor(new NextRequest('http://x/e', json({ action: 'improve', text: 'curto' })));
    expect(short.status).toBe(400);
    delete process.env.GEMINI_API_KEY;
    for (const fn of [importV1, importV2]) {
      const res = await fn(new NextRequest('http://x/i', json({ pdfBase64: 'AAAA', base64Data: 'AAAA' })));
      expect(res.status).toBe(503);
      expect((await res.json()).code).toBe('AI_NOT_CONFIGURED');
    }
  });
  it('limite por usuário: 20/min, 429 AI_RATE_LIMITED; outro usuário não é afetado', async () => {
    process.env.GEMINI_API_KEY = 'k'.repeat(40);
    db.sessionUser = USER;
    for (let i = 0; i < 20; i++) expect((await editor(improve())).status).toBe(200);
    const blocked = await editor(improve());
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('retry-after')).toBe('60');
    expect((await blocked.json()).code).toBe('AI_RATE_LIMITED');
    db.sessionUser = { id: 'u2', email: 'u2@x.com' };
    expect((await editor(improve())).status).toBe(200);
  });
});
