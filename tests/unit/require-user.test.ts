import { describe, it, expect, vi, beforeEach } from 'vitest';

const state = vi.hoisted(() => ({ impl: async (): Promise<unknown> => null }));
vi.mock('../../lib/session', () => ({ getSessionUser: () => state.impl() }));

import { GET } from '../../app/api/payments/whoami/route';
import { requireUser, AuthError } from '../../lib/requireUser';

const call = (url = 'http://x/api/payments/whoami', init: RequestInit = {}) => GET(new Request(url, init));

describe('requireUser / whoami (sessão de servidor)', () => {
  beforeEach(() => { state.impl = async () => null; });

  it('sem sessão -> 401 UNAUTHENTICATED', async () => {
    state.impl = async () => null;
    const res = await call();
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe('UNAUTHENTICATED');
  });

  it('erro de banco -> 503 AUTH_UNAVAILABLE, nunca autentica', async () => {
    state.impl = async () => { throw new Error('db down'); };
    const res = await call();
    expect(res.status).toBe(503);
    const text = await res.text();
    expect(text).toContain('AUTH_UNAVAILABLE');
    expect(text).not.toContain('db down');
    await expect(requireUser(new Request('http://x'))).rejects.toBeInstanceOf(AuthError);
  });

  it('sessão válida -> userId da SESSÃO, ignora ?userId= e corpo forjados', async () => {
    state.impl = async () => ({ id: 'user-from-session', email: 'a@b.com' });
    const res = await call('http://x/api/payments/whoami?userId=attacker&role=admin');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ userId: 'user-from-session' });
    const post = new Request('http://x/p?userId=attacker', { method: 'POST', body: JSON.stringify({ userId: 'attacker2' }) });
    expect(await requireUser(post)).toEqual({ id: 'user-from-session', email: 'a@b.com' });
  });

  it('não depende de Supabase nem de fetch', async () => {
    const f = vi.fn(); vi.stubGlobal('fetch', f);
    state.impl = async () => ({ id: 'u', email: 'a@b.com' });
    await call(undefined, { headers: { authorization: 'Bearer aaa.bbb.ccc' } });
    expect(f).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
