/**
 * Identidade server-side: o usuário vem SEMPRE da sessão (cookie HttpOnly -> hash no banco),
 * nunca da URL/corpo. Sem dependência de Supabase.
 */
import { getSessionUser } from './session';

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

export async function requireUser(req: Request): Promise<AuthenticatedUser> {
  let user;
  try {
    user = await getSessionUser(req);
  } catch {
    throw new AuthError('AUTH_UNAVAILABLE', 503);
  }
  if (!user) throw new AuthError('UNAUTHENTICATED', 401);
  return { id: user.id, email: user.email };
}
