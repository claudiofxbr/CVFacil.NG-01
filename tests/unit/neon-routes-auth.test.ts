import { describe, it, expect, vi, beforeEach } from 'vitest';

const db = vi.hoisted(() => ({
  users: [] as any[], resumes: [] as any[], versions: [] as any[], sessionUser: null as any, log: [] as string[],
}));

// Sessão controlada pelo teste (a lógica de sessão em si é coberta em auth-session.test.ts).
vi.mock('../../lib/session', async (orig) => {
  const real: any = await orig();
  return { ...real, getSessionUser: async () => db.sessionUser };
});

// Banco falso em memória: interpreta apenas as queries das rotas /api/neon/resumes .
vi.mock('../../lib/neon', () => ({
  sql: async (strings: TemplateStringsArray, ...v: any[]) => {
    const t = strings.join('?').replace(/\s+/g, ' ').trim();
    db.log.push(t);
    const { users, resumes, versions } = db;
    if (t.startsWith('SELECT plan, credits FROM users')) {
      const u = users.find((x) => x.id === v[0]);
      return u ? [{ plan: u.plan, credits: u.credits }] : [];
    }
    if (t.startsWith('SELECT id, user_id FROM resumes WHERE id = ?')) {
      return resumes.filter((r) => r.id === v[0] && (!t.includes('AND user_id') || r.user_id === v[1])).slice(0, 1);
    }
    if (t.startsWith('SELECT * FROM resumes WHERE id = ?')) {
      return resumes.filter((r) => r.id === v[0] && (!t.includes('AND user_id') || r.user_id === v[1])).slice(0, 1);
    }
    if (t.startsWith('SELECT * FROM resumes WHERE user_id = ?')) {
      const trash = t.includes('IS NOT NULL');
      return resumes.filter((r) => r.user_id === v[0] && (trash ? r.deleted_at : !r.deleted_at));
    }
    if (t.startsWith('SELECT * FROM resumes WHERE deleted_at')) {
      const trash = t.includes('IS NOT NULL');
      return resumes.filter((r) => (trash ? r.deleted_at : !r.deleted_at));
    }
    if (t.startsWith('SELECT count(*) as total FROM resumes')) {
      return [{ total: resumes.filter((r) => r.user_id === v[0] && !r.deleted_at).length }];
    }
    if (t.startsWith('SELECT count(*) as total FROM resume_versions')) {
      return [{ total: versions.filter((x) => x.resume_id === v[0]).length }];
    }
    if (t.startsWith('UPDATE users SET credits')) {
      const u = users.find((x) => x.id === v[0]); if (u) u.credits = Math.max(0, u.credits - 1); return [];
    }
    if (t.startsWith('INSERT INTO resumes')) {
      const ex = resumes.find((r) => r.id === v[0]);
      if (ex) { ex.data = v[13]; ex.updated = true; } // ON CONFLICT: dono nunca muda
      else resumes.push({ id: v[0], user_id: v[1], data: v[13], deleted_at: null });
      return [];
    }
    if (t.startsWith('INSERT INTO resume_versions')) {
      versions.push({ id: v[0], resume_id: v[1], changed_by: v[5], data: v[4], version_number: v[2] }); return [];
    }
    if (t.startsWith('DELETE FROM resumes')) { const i = resumes.findIndex((r) => r.id === v[0]); if (i >= 0) resumes.splice(i, 1); return []; }
    if (t.startsWith('UPDATE resumes SET deleted_at = CURRENT_TIMESTAMP')) { resumes.find((r) => r.id === v[0]).deleted_at = 'now'; return []; }
    if (t.startsWith('UPDATE resumes SET deleted_at = NULL')) { resumes.find((r) => r.id === v[0]).deleted_at = null; return []; }
    if (t.startsWith('SELECT id, resume_id, version_number')) {
      return versions.filter((x) => x.resume_id === v[0]).map((x) => ({ ...x, changed_by: x.changed_by, created_at: 'x', title: 't', change_summary: 's' }));
    }
    if (t.startsWith('SELECT * FROM resume_versions')) {
      return versions.filter((x) => x.id === v[0] && x.resume_id === v[1]);
    }
    if (t.startsWith('UPDATE resumes SET full_name')) { resumes.find((r) => r.id === v[v.length - 1]).data = v[v.length - 2]; return []; }
    throw new Error('query inesperada: ' + t);
  },
}));

import { GET, POST, DELETE, PATCH } from '../../app/api/neon/resumes/route';
import { GET as vGET, POST as vPOST } from '../../app/api/neon/resumes/versions/route';
import { POST as register } from '../../app/api/auth/register/route';
import { __resetRateLimitForTests } from '../../lib/authRateLimit';
import { NextRequest } from 'next/server';

const A = { id: 'user-a', email: 'a@x.com' };
const B = { id: 'user-b', email: 'b@x.com' };
const as = (u: any) => { db.sessionUser = u; };
const nreq = (url: string, init?: RequestInit) => new NextRequest(`http://x${url}`, init as any);
const body = (b: unknown): RequestInit => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) });

beforeEach(() => {
  db.users.length = 0; db.resumes.length = 0; db.versions.length = 0; db.log.length = 0; db.sessionUser = null;
  delete process.env.ADMIN_EMAILS;
  __resetRateLimitForTests();
  db.users.push(
    { id: 'user-a', email: 'a@x.com', password_hash: 'scrypt$x', plan: 'free', credits: 5 },
    { id: 'user-b', email: 'b@x.com', password_hash: 'scrypt$x', plan: 'free', credits: 5 },
  );
  db.resumes.push({ id: 'r-b', user_id: 'user-b', data: JSON.stringify({ fullName: 'Bia' }), deleted_at: null });
  db.versions.push({ id: 'v-b1', resume_id: 'r-b', changed_by: 'user-b', data: JSON.stringify({ fullName: 'Bia' }), version_number: 1 });
});

describe('/api/neon/resumes exige sessão e ignora userId/role forjados', () => {
  it('sem sessão -> 401 em todos os métodos e rotas', async () => {
    as(null);
    const rs = [
      await GET(nreq('/api/neon/resumes?userId=user-b&role=admin')),
      await POST(nreq('/api/neon/resumes', body({ id: 'n', userId: 'user-b' }))),
      await DELETE(nreq('/api/neon/resumes?id=r-b&userId=user-b&role=admin', { method: 'DELETE' })),
      await PATCH(nreq('/api/neon/resumes', { ...body({ id: 'r-b', userId: 'user-b', role: 'admin' }), method: 'PATCH' })),
      await vGET(nreq('/api/neon/resumes/versions?resumeId=r-b')),
      await vPOST(nreq('/api/neon/resumes/versions', body({ resumeId: 'r-b', versionId: 'v-b1' }))),
    ];
    for (const r of rs) expect(r.status).toBe(401);
    expect(db.resumes).toHaveLength(1);
  });

  it('A não lê currículo de B (404), mesmo com ?userId=B&role=admin', async () => {
    as(A);
    const byId = await GET(nreq('/api/neon/resumes?id=r-b&userId=user-b&role=admin'));
    expect(byId.status).toBe(404);
    const list = await (await GET(nreq('/api/neon/resumes?userId=user-b&role=admin&scope=all'))).json();
    expect(list.resumes).toEqual([]);
  });

  it('A não edita nem apaga nem restaura currículo de B (404) e nada muda', async () => {
    as(A);
    const edit = await POST(nreq('/api/neon/resumes', body({ id: 'r-b', userId: 'user-b', role: 'admin', fullName: 'Hack' })));
    expect(edit.status).toBe(404);
    const del = await DELETE(nreq('/api/neon/resumes?id=r-b&action=permanent&userId=user-b&role=admin', { method: 'DELETE' }));
    expect(del.status).toBe(404);
    const trash = await DELETE(nreq('/api/neon/resumes?id=r-b&userId=user-b', { method: 'DELETE' }));
    expect(trash.status).toBe(404);
    const rest = await PATCH(nreq('/api/neon/resumes', { ...body({ id: 'r-b', userId: 'user-b', role: 'admin' }), method: 'PATCH' }));
    expect(rest.status).toBe(404);
    expect(db.resumes).toHaveLength(1);
    expect(db.resumes[0].user_id).toBe('user-b');
    expect(db.resumes[0].data).not.toContain('Hack');
    expect(db.resumes[0].deleted_at).toBeNull();
  });

  it('A não vê nem restaura versões de B (404)', async () => {
    as(A);
    expect((await vGET(nreq('/api/neon/resumes/versions?resumeId=r-b'))).status).toBe(404);
    expect((await vPOST(nreq('/api/neon/resumes/versions', body({ resumeId: 'r-b', versionId: 'v-b1', userId: 'user-b' })))).status).toBe(404);
  });

  it('POST grava SEMPRE com o id da sessão, mesmo com userId forjado no corpo', async () => {
    as(A);
    const res = await POST(nreq('/api/neon/resumes', body({ id: 'r-a', userId: 'user-b', fullName: 'Ana' })));
    expect(res.status).toBe(200);
    const row = db.resumes.find((r) => r.id === 'r-a');
    expect(row.user_id).toBe('user-a');
    expect(JSON.parse(row.data).userId).toBe('user-a');
    expect(db.versions.find((x) => x.resume_id === 'r-a').changed_by).toBe('user-a');
    // não cria mais linha em users a partir de userId do cliente
    expect(db.log.some((q) => q.startsWith('INSERT INTO users'))).toBe(false);
    expect(db.users).toHaveLength(2);
  });

  it('dono lê, lista, move para a lixeira, restaura e exclui o próprio currículo', async () => {
    as(B);
    expect((await (await GET(nreq('/api/neon/resumes?id=r-b'))).json()).resume.fullName).toBe('Bia');
    expect((await (await GET(nreq('/api/neon/resumes'))).json()).resumes).toHaveLength(1);
    expect((await DELETE(nreq('/api/neon/resumes?id=r-b', { method: 'DELETE' }))).status).toBe(200);
    expect((await (await GET(nreq('/api/neon/resumes?status=trash'))).json()).resumes).toHaveLength(1);
    expect((await PATCH(nreq('/api/neon/resumes', { ...body({ id: 'r-b' }), method: 'PATCH' }))).status).toBe(200);
    expect((await vGET(nreq('/api/neon/resumes/versions?resumeId=r-b'))).status).toBe(200);
    expect((await DELETE(nreq('/api/neon/resumes?id=r-b&action=permanent', { method: 'DELETE' }))).status).toBe(200);
    expect(db.resumes).toHaveLength(0);
  });

  it('?role=admin forjado não dá privilégio de listagem global (scope=all só para admin da sessão)', async () => {
    as(A);
    const r = await (await GET(nreq('/api/neon/resumes?role=admin&scope=all'))).json();
    expect(r.resumes).toEqual([]);
  });

  it('admin real (ADMIN_EMAILS) lê, lista tudo, edita e apaga currículo alheio; dono não muda', async () => {
    process.env.ADMIN_EMAILS = 'a@x.com';
    as(A);
    expect((await (await GET(nreq('/api/neon/resumes?id=r-b'))).json()).resume.userId).toBe('user-b');
    expect((await (await GET(nreq('/api/neon/resumes?scope=all'))).json()).resumes).toHaveLength(1);
    expect((await POST(nreq('/api/neon/resumes', body({ id: 'r-b', fullName: 'Editado' })))).status).toBe(200);
    expect(db.resumes[0].user_id).toBe('user-b');
    expect(db.resumes[0].data).toContain('Editado');
    expect((await vGET(nreq('/api/neon/resumes/versions?resumeId=r-b'))).status).toBe(200);
    expect((await DELETE(nreq('/api/neon/resumes?id=r-b&action=permanent', { method: 'DELETE' }))).status).toBe(200);
  });

  it('mantém limite do plano gratuito e créditos com o usuário da sessão', async () => {
    as(A);
    for (const id of ['n1', 'n2', 'n3']) expect((await POST(nreq('/api/neon/resumes', body({ id })))).status).toBe(200);
    const limit = await POST(nreq('/api/neon/resumes', body({ id: 'n4' })));
    expect(limit.status).toBe(403);
    expect((await limit.json()).code).toBe('DOCUMENT_LIMIT_EXCEEDED');
    db.users[1].credits = 0;
    as(B);
    const noCredit = await POST(nreq('/api/neon/resumes', body({ id: 'b2' })));
    expect(noCredit.status).toBe(402);
    expect((await noCredit.json()).code).toBe('INSUFFICIENT_CREDITS');
    expect(db.users[0].credits).toBe(2); // 3 criações debitaram só A
  });
});

describe('domínio reservado dos e-mails sintéticos', () => {
  it('registro com @cvfacil.local é recusado (não permite tomar conta legada pelo e-mail)', async () => {
    const res = await register(new Request('http://x/r', { ...body({ email: 'local-1700000000001@cvfacil.local', password: 'senha-forte-123' }), headers: { 'content-type': 'application/json', 'x-forwarded-for': '5.5.5.5' } }));
    expect(res.status).toBe(400);
    expect(db.users).toHaveLength(2);
  });
});
