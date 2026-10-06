import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fetchSession, identityFromMe, serverLogin, serverLogout, serverRegister } from '../../services/authClient';

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
afterEach(() => vi.unstubAllGlobals());

describe('authClient (fetch mockado)', () => {
  it('login chama POST /api/auth/login com credentials same-origin', async () => {
    const f = vi.fn().mockResolvedValue(json(200, { ok: true }));
    vi.stubGlobal('fetch', f);
    expect(await serverLogin('a@b.com', 'senha-1234')).toEqual({ ok: true });
    const [url, init] = f.mock.calls[0];
    expect(url).toBe('/api/auth/login');
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('same-origin');
    expect(JSON.parse(init.body)).toEqual({ email: 'a@b.com', password: 'senha-1234' });
  });

  it.each([
    [401, /incorretos/], [429, /Muitas tentativas/], [503, /indispon/],
  ])('login %i vira mensagem clara em pt-BR', async (status, re) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(status, { error: 'X' })));
    const r = await serverLogin('a@b.com', 'x');
    expect(r.ok).toBe(false);
    expect((r as { message: string }).message).toMatch(re);
  });

  it('rede fora -> mensagem de indisponível, nunca ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network')));
    const r = await serverLogin('a@b.com', 'x');
    expect(r.ok).toBe(false);
  });

  it('cadastro: POST /api/auth/register; 409, 400 e 429 mapeados', async () => {
    const f = vi.fn().mockResolvedValue(json(201, { ok: true }));
    vi.stubGlobal('fetch', f);
    expect(await serverRegister('a@b.com', 'senha-1234', 'Ana')).toEqual({ ok: true });
    expect(f.mock.calls[0][0]).toBe('/api/auth/register');
    expect(JSON.parse(f.mock.calls[0][1].body)).toEqual({ email: 'a@b.com', password: 'senha-1234', name: 'Ana' });

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(409, { error: 'REGISTRATION_FAILED' })));
    expect(((await serverRegister('a@b.com', 'senha-1234', 'A')) as any).message).toMatch(/LOGIN/);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(400, { error: 'INVALID_PASSWORD' })));
    expect(((await serverRegister('a@b.com', '1', 'A')) as any).message).toMatch(/8 e 128/);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(400, { error: 'INVALID_EMAIL' })));
    expect(((await serverRegister('x', 'senha-1234', 'A')) as any).message).toMatch(/e-mail válido/);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(429, {})));
    expect(((await serverRegister('a@b.com', 'senha-1234', 'A')) as any).message).toMatch(/Muitas/);
  });

  it('logout chama POST /api/auth/logout', async () => {
    const f = vi.fn().mockResolvedValue(json(200, { ok: true }));
    vi.stubGlobal('fetch', f);
    await serverLogout();
    expect(f.mock.calls[0][0]).toBe('/api/auth/logout');
    expect(f.mock.calls[0][1].method).toBe('POST');
  });

  it('me: papel/plano/créditos vêm do servidor; admin só com role admin', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(200, { id: 'u1', email: 'a@b.com', role: 'user', name: 'Ana', plan: 'premium', credits: 7 })));
    const s = await fetchSession();
    expect(s?.isAdmin).toBe(false);
    expect(s?.profile).toMatchObject({ id: 'u1', role: 'Cliente', name: 'Ana', plan: 'Premium', credits: 7 });
    expect(s?.user.id).toBe('u1');

    const adm = identityFromMe({ id: 'u2', email: 'c@d.com', role: 'admin', name: null });
    expect(adm.isAdmin).toBe(true);
    expect(adm.profile).toMatchObject({ role: 'Administrador', credits: 999999, plan: 'Premium', name: 'c' });
  });

  it('me 401, corpo inválido ou rede fora -> sem sessão (null)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(401, { error: 'UNAUTHENTICATED' })));
    expect(await fetchSession()).toBeNull();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(200, { foo: 1 })));
    expect(await fetchSession()).toBeNull();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('x')));
    expect(await fetchSession()).toBeNull();
  });
});

describe('fontes: não há mais entrada sem credencial no servidor', () => {
  const root = join(__dirname, '..', '..');
  const auth = readFileSync(join(root, 'components', 'Auth.tsx'), 'utf8');
  const provider = readFileSync(join(root, 'components', 'AuthProvider.tsx'), 'utf8');

  it('nenhum loginLocal e nenhuma leitura/gravação de identidade no localStorage', () => {
    expect(auth).not.toContain('loginLocal');
    expect(provider).not.toContain('loginLocal');
    expect(provider).not.toMatch(/localStorage/);
    expect(auth).not.toMatch(/localStorage/);
  });

  it('Auth usa login/register do servidor', () => {
    expect(auth).toMatch(/await login\(email, password\)/);
    expect(auth).toMatch(/await register\(email, password, name\)/);
  });
});

describe('fontes: cliente não envia userId/role forjáveis às rotas /api/neon', () => {
  const svc = readFileSync(join(__dirname, '..', '..', 'services', 'neonResumeService.ts'), 'utf8');
  it('sem userId/role em URLs ou corpos e com credentials same-origin', () => {
    expect(svc).not.toMatch(/userId=|role=|&role|JSON\.stringify\(\{[^}]*(userId|role)/);
    expect((svc.match(/credentials: 'same-origin'/g) || []).length).toBeGreaterThanOrEqual(8);
  });
});
