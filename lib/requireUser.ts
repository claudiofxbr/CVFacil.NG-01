/**
 * Identidade server-side para as rotas de pagamento (etapa E0).
 * O userId vem SEMPRE do access token validado no Supabase Auth, nunca da URL/corpo.
 * Validação: GET {SUPABASE_URL}/auth/v1/user com Authorization: Bearer <jwt> + apikey
 * (mesmo request que supabase.auth.getUser(jwt) faz). Sem novas dependências.
 */

export type AuthErrorCode = 'UNAUTHENTICATED' | 'AUTH_UNAVAILABLE';

export class AuthError extends Error {
  constructor(public readonly code: AuthErrorCode, public readonly status: 401 | 503) {
    super(code);
    this.name = 'AuthError';
  }
}

export interface AuthenticatedUser {
  id: string;
  email: string | null;
}

const AUTH_TIMEOUT_MS = 5000;
const BEARER_RE = /^Bearer\s+([A-Za-z0-9\-._~+/]+=*)$/i;

export async function requireUser(req: Request): Promise<AuthenticatedUser> {
  const header = req.headers.get('authorization');
  const match = header ? BEARER_RE.exec(header.trim()) : null;
  if (!match) throw new AuthError('UNAUTHENTICATED', 401);
  const token = match[1];

  const baseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/+$/, '');
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  if (!baseUrl.startsWith('http') || !anonKey) throw new AuthError('AUTH_UNAVAILABLE', 503);

  let res: Response;
  try {
    res = await fetch(`${baseUrl}/auth/v1/user`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}`, apikey: anonKey },
      signal: AbortSignal.timeout(AUTH_TIMEOUT_MS),
      cache: 'no-store',
    });
  } catch {
    throw new AuthError('AUTH_UNAVAILABLE', 503);
  }

  if (res.status === 401 || res.status === 403) throw new AuthError('UNAUTHENTICATED', 401);
  if (!res.ok) throw new AuthError('AUTH_UNAVAILABLE', 503);

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new AuthError('AUTH_UNAVAILABLE', 503);
  }
  const u = body as { id?: unknown; email?: unknown } | null;
  if (!u || typeof u.id !== 'string' || !u.id) throw new AuthError('AUTH_UNAVAILABLE', 503);
  return { id: u.id, email: typeof u.email === 'string' ? u.email : null };
}
