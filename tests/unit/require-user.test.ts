import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GET } from '../../app/api/payments/whoami/route';
import { requireUser } from '../../lib/requireUser';

const SB = 'https://proj.supabase.co';
const ANON = 'anon-test-key';
const TOKEN = 'aaa.bbb.ccc';
const REAL_ID = 'user-from-token';

const call = (url = 'http://x/api/payments/whoami', init: RequestInit = {}) =>
  GET(new Request(url, init));
const auth = (v: string) => ({ headers: { authorization: v } });

describe('requireUser / whoami (E0)', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = SB;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = ANON;
  });
  afterEach(() => vi.unstubAllGlobals());

  it('sem header -> 401 UNAUTHENTICATED, sem chamar o Supabase', async () => {
    const f = vi.fn(); vi.stubGlobal('fetch', f);
    const res = await call();
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe('UNAUTHENTICATED');
    expect(f).not.toHaveBeenCalled();
  });

  it.each(['Basic abc', 'Bearer', 'Bearer ', 'Bearer a b', 'token-solto', 'Bearer <script>'])(
    'header malformado %j -> 401', async (h) => {
      const f = vi.fn(); vi.stubGlobal('fetch', f);
      expect((await call(undefined, auth(h))).status).toBe(401);
      expect(f).not.toHaveBeenCalled();
    });

  it('token inválido (Supabase 401) -> 401', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"msg":"bad"}', { status: 401 })));
    const res = await call(undefined, auth(`Bearer ${TOKEN}`));
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe('UNAUTHENTICATED');
  });

  it('Supabase fora (rede) -> 503 AUTH_UNAVAILABLE', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network')));
    const res = await call(undefined, auth(`Bearer ${TOKEN}`));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe('AUTH_UNAVAILABLE');
  });

  it('timeout -> 503', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('timeout', 'TimeoutError')));
    expect((await call(undefined, auth(`Bearer ${TOKEN}`))).status).toBe(503);
  });

  it('Supabase 5xx / corpo inválido -> 503, nunca autentica', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('x', { status: 500 })));
    expect((await call(undefined, auth(`Bearer ${TOKEN}`))).status).toBe(503);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 200 })));
    expect((await call(undefined, auth(`Bearer ${TOKEN}`))).status).toBe(503);
  });

  it('envs ausentes -> 503', async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    const f = vi.fn(); vi.stubGlobal('fetch', f);
    expect((await call(undefined, auth(`Bearer ${TOKEN}`))).status).toBe(503);
    expect(f).not.toHaveBeenCalled();
  });

  it('token válido -> userId do TOKEN, ignora ?userId= e corpo forjados', async () => {
    const f = vi.fn().mockImplementation(async () =>
      new Response(JSON.stringify({ id: REAL_ID, email: 'a@b.com' }), { status: 200 }));
    vi.stubGlobal('fetch', f);
    const res = await call('http://x/api/payments/whoami?userId=attacker&role=admin', auth(`Bearer ${TOKEN}`));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ userId: REAL_ID });
    const post = new Request('http://x/p?userId=attacker', {
      method: 'POST', headers: { authorization: `Bearer ${TOKEN}` },
      body: JSON.stringify({ userId: 'attacker2' }),
    });
    expect(await requireUser(post)).toEqual({ id: REAL_ID, email: 'a@b.com' });
    const [url, init] = f.mock.calls[0];
    expect(url).toBe(`${SB}/auth/v1/user`);
    expect(init.headers).toEqual({ Authorization: `Bearer ${TOKEN}`, apikey: ANON });
  });

  it('respostas não vazam token nem anon key', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 401 })));
    const bodies = [
      await (await call(undefined, auth(`Bearer ${TOKEN}`))).text(),
      await (await call()).text(),
    ];
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error(`boom ${TOKEN} ${ANON}`)));
    bodies.push(await (await call(undefined, auth(`Bearer ${TOKEN}`))).text());
    for (const b of bodies) {
      expect(b).not.toContain(TOKEN);
      expect(b).not.toContain(ANON);
    }
  });
});
