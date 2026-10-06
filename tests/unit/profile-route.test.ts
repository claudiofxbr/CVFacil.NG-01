import { describe, it, expect, vi, beforeEach } from 'vitest';

const db = vi.hoisted(() => ({ users: [] as any[], calls: [] as { t: string; v: any[] }[], sessionUser: null as any, failUpdate: false }));

vi.mock('../../lib/session', async (orig) => {
  const real: any = await orig();
  return { ...real, getSessionUser: async () => db.sessionUser };
});
vi.mock('../../lib/neon', () => ({
  sql: async (strings: TemplateStringsArray, ...v: any[]) => {
    const t = strings.join('?').replace(/\s+/g, ' ').trim();
    db.calls.push({ t, v });
    if (t.includes('rate_limits')) throw new Error('rate store off');
    if (t.startsWith('UPDATE users SET name = COALESCE')) {
      if (db.failUpdate) throw new Error('segredo-interno');
      const [name, hasAvatar, avatar, id] = v;
      const u = db.users.find((x) => x.id === id);
      if (!u) return [];
      if (name) u.name = name;
      if (hasAvatar) u.avatar_url = avatar;
      return [{ name: u.name, avatar_url: u.avatar_url ?? null }];
    }
    if (t.startsWith('SELECT name, plan, credits, avatar_url FROM users')) {
      const u = db.users.find((x) => x.id === v[0]);
      return u ? [{ name: u.name, plan: 'free', credits: 5, avatar_url: u.avatar_url ?? null }] : [];
    }
    if (t.startsWith('INSERT INTO users')) {
      db.users.push({ id: v[0], email: v[1], name: v[2], password_hash: v[3], avatar_url: v[4] });
      return [{ id: v[0] }];
    }
    if (t.startsWith('INSERT INTO sessions')) return [];
    throw new Error('query inesperada: ' + t);
  },
}));

import { PATCH } from '../../app/api/auth/profile/route';
import { POST as register } from '../../app/api/auth/register/route';
import { GET as me } from '../../app/api/auth/me/route';
import { __resetRateLimitStoreForTests } from '../../lib/rateLimit';
import { validateAvatar } from '../../lib/profile';

const PNG_HEADER = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const png = (pad = 20) => `data:image/png;base64,${Buffer.from([...PNG_HEADER, ...new Array(pad).fill(1)]).toString('base64')}`;
const JPG = `data:image/jpeg;base64,${Buffer.from([0xff, 0xd8, 0xff, 0xe0, ...new Array(20).fill(1)]).toString('base64')}`;
const WEBP = `data:image/webp;base64,${Buffer.concat([Buffer.from('RIFF'), Buffer.from([1, 2, 3, 4]), Buffer.from('WEBPVP8 '), Buffer.alloc(10)]).toString('base64')}`;

const A = { id: 'user-a', email: 'a@x.com' };
const patch = (body: unknown) =>
  PATCH(new Request('http://x/api/auth/profile', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }));

beforeEach(() => {
  db.users.length = 0; db.calls.length = 0; db.sessionUser = null; db.failUpdate = false;
  db.users.push({ id: 'user-a', email: 'a@x.com', name: 'Ana', avatar_url: null }, { id: 'user-b', email: 'b@x.com', name: 'Beto', avatar_url: null });
  __resetRateLimitStoreForTests();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('PATCH /api/auth/profile', () => {
  it('sem sessão -> 401 e nenhuma escrita', async () => {
    expect((await patch({ name: 'X' })).status).toBe(401);
    expect(db.calls.some((c) => c.t.startsWith('UPDATE users'))).toBe(false);
  });

  it('atualiza nome (trim) e avatar do usuário da sessão', async () => {
    db.sessionUser = A;
    const res = await patch({ name: '  Ana Maria  ', avatar: png() });
    expect(res.status).toBe(200);
    expect(db.users[0]).toMatchObject({ name: 'Ana Maria', avatar_url: png() });
    expect(await res.json()).toMatchObject({ ok: true, name: 'Ana Maria' });
  });

  it('aceita jpeg e webp; null remove a foto; só nome não mexe no avatar', async () => {
    db.sessionUser = A;
    expect((await patch({ avatar: JPG })).status).toBe(200);
    expect((await patch({ avatar: WEBP })).status).toBe(200);
    expect(db.users[0].avatar_url).toBe(WEBP);
    expect((await patch({ name: 'Novo' })).status).toBe(200);
    expect(db.users[0].avatar_url).toBe(WEBP);
    expect((await patch({ avatar: null })).status).toBe(200);
    expect(db.users[0].avatar_url).toBeNull();
  });

  it.each([
    ['nome vazio', { name: '   ' }],
    ['nome com 121 caracteres', { name: 'a'.repeat(121) }],
    ['nome não string', { name: 42 }],
    ['avatar SVG', { avatar: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=' }],
    ['avatar GIF', { avatar: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=' }],
    ['avatar com tipo certo e conteúdo falso', { avatar: 'data:image/png;base64,' + Buffer.from('<script>alert(1)</script>').toString('base64') }],
    ['avatar que não é data URL', { avatar: 'https://evil.com/x.png' }],
    ['avatar com base64 inválido', { avatar: 'data:image/png;base64,@@@@' }],
    ['avatar acima de 150 KB', { avatar: png(160 * 1024) }],
    ['avatar não string', { avatar: 123 }],
  ])('rejeita %s com 400 e não escreve', async (_n, body) => {
    db.sessionUser = A;
    expect((await patch(body)).status).toBe(400);
    expect(db.calls.some((c) => c.t.startsWith('UPDATE users'))).toBe(false);
  });

  it('e-mail não é editável (400); corpo vazio ou inválido também', async () => {
    db.sessionUser = A;
    expect((await patch({ name: 'X', email: 'novo@x.com' })).status).toBe(400);
    expect((await patch({})).status).toBe(400);
    expect((await PATCH(new Request('http://x/p', { method: 'PATCH', body: 'nao-json' }))).status).toBe(400);
    expect(db.users[0].email).toBe('a@x.com');
    expect(db.users[0].name).toBe('Ana');
  });

  it('outro usuário não é alterado: id/userId forjados no corpo são ignorados', async () => {
    db.sessionUser = A;
    expect((await patch({ name: 'Hack', id: 'user-b', userId: 'user-b' })).status).toBe(200);
    expect(db.users[0].name).toBe('Hack');
    expect(db.users[1].name).toBe('Beto');
    const upd = db.calls.find((c) => c.t.startsWith('UPDATE users'))!;
    expect(upd.v[3]).toBe('user-a');
  });

  it('linha inexistente -> 401; erro de banco -> 503 sem vazar detalhe', async () => {
    db.sessionUser = { id: 'fantasma', email: 'f@x.com' };
    expect((await patch({ name: 'X' })).status).toBe(401);
    db.sessionUser = A;
    db.failUpdate = true;
    const res = await patch({ name: 'X' });
    expect(res.status).toBe(503);
    expect(await res.text()).not.toContain('segredo-interno');
  });
});

describe('cadastro e /me com avatar', () => {
  const reg = (avatar: unknown) =>
    register(new Request('http://x/r', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '7.7.7.7' },
      body: JSON.stringify({ email: 'novo@x.com', password: 'senha-forte-123', name: 'Novo', avatar }),
    }));

  it('cadastro grava avatar válido; inválido é ignorado sem impedir o cadastro', async () => {
    expect((await reg(png())).status).toBe(201);
    expect(db.users.find((u) => u.email === 'novo@x.com').avatar_url).toBe(png());
    db.users.pop();
    __resetRateLimitStoreForTests();
    expect((await reg('data:image/gif;base64,AAAA')).status).toBe(201);
    expect(db.users.find((u) => u.email === 'novo@x.com').avatar_url).toBeNull();
  });

  it('/api/auth/me devolve o avatar salvo', async () => {
    db.sessionUser = A;
    db.users[0].avatar_url = png();
    expect((await (await me(new Request('http://x/me'))).json()).avatar).toBe(png());
  });

  it('validateAvatar: exatamente 150 KB passa e 150 KB + 1 não', () => {
    const mk = (n: number) => `data:image/png;base64,${Buffer.from([...PNG_HEADER, ...new Array(n - PNG_HEADER.length).fill(1)]).toString('base64')}`;
    expect(validateAvatar(mk(150 * 1024))).not.toBeNull();
    expect(validateAvatar(mk(150 * 1024 + 1))).toBeNull();
  });
});
