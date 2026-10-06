import type { User } from '../types';

/** Cliente das rotas /api/auth/* (sessão por cookie HttpOnly; o token nunca é visível ao JS). */

export interface SessionIdentity {
  user: { id: string; email: string; user_metadata: { full_name: string } };
  profile: User;
  isAdmin: boolean;
}

export const SESSION_EXPIRED_MESSAGE = 'Sua sessão expirou. Entre novamente para continuar.';

export type AuthResult = { ok: true } | { ok: false; message: string };

const MESSAGES: Record<number, string> = {
  401: 'E-mail ou senha incorretos.',
  409: 'Não foi possível concluir o cadastro com este e-mail. Se você já tem conta, use a aba LOGIN.',
  429: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.',
  503: 'Serviço de autenticação indisponível no momento. Tente novamente em instantes.',
};

export function messageForRegisterError(status: number, code?: string): string {
  if (status === 400 && code === 'INVALID_EMAIL') return 'Por favor, insira um endereço de e-mail válido.';
  if (status === 400) return 'A senha deve ter entre 8 e 128 caracteres.';
  return MESSAGES[status] || 'Erro ao processar autenticação.';
}

async function post(path: string, body?: unknown): Promise<Response | null> {
  try {
    return await fetch(path, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    return null;
  }
}

const errorCode = async (res: Response): Promise<string | undefined> => {
  try { return (await res.json())?.error; } catch { return undefined; }
};

export async function serverLogin(email: string, password: string): Promise<AuthResult> {
  const res = await post('/api/auth/login', { email, password });
  if (!res) return { ok: false, message: MESSAGES[503] };
  if (res.ok) return { ok: true };
  return { ok: false, message: MESSAGES[res.status] || 'Erro ao processar autenticação.' };
}

export async function serverRegister(email: string, password: string, name: string, avatar?: string | null): Promise<AuthResult> {
  const res = await post('/api/auth/register', avatar ? { email, password, name, avatar } : { email, password, name });
  if (!res) return { ok: false, message: MESSAGES[503] };
  if (res.ok) return { ok: true };
  return { ok: false, message: messageForRegisterError(res.status, await errorCode(res)) };
}

const PROFILE_MESSAGES: Record<string, string> = {
  INVALID_NAME: 'O nome deve ter entre 1 e 120 caracteres.',
  INVALID_AVATAR: 'Foto inválida: use PNG, JPEG ou WEBP de até 150 KB.',
  EMAIL_NOT_EDITABLE: 'O e-mail não pode ser alterado.',
};

/** Salva nome e/ou avatar no servidor (PATCH /api/auth/profile). avatar null remove a foto. */
export async function serverUpdateProfile(patch: { name?: string; avatar?: string | null }): Promise<AuthResult> {
  let res: Response;
  try {
    res = await fetch('/api/auth/profile', {
      method: 'PATCH',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
  } catch {
    return { ok: false, message: MESSAGES[503] };
  }
  if (res.ok) return { ok: true };
  if (res.status === 401) return { ok: false, message: SESSION_EXPIRED_MESSAGE };
  const code = await errorCode(res);
  return { ok: false, message: (code && PROFILE_MESSAGES[code]) || MESSAGES[res.status] || 'Não foi possível salvar o perfil.' };
}

/** true = sessão revogada no servidor; false = falha (rede/5xx), o cookie pode continuar válido. */
export async function serverLogout(): Promise<boolean> {
  const res = await post('/api/auth/logout');
  return !!res && res.ok;
}

/** Converte a resposta de /api/auth/me no formato que o app já consome (papel vem do servidor). */
export function identityFromMe(me: {
  id: string; email: string; role?: string; name?: string | null; plan?: string; credits?: number; avatar?: string | null;
}): SessionIdentity {
  const isAdmin = me.role === 'admin';
  const name = me.name || me.email.split('@')[0] || 'Usuário';
  const avatar = me.avatar || (isAdmin ? `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name)}` : '');
  return {
    user: { id: me.id, email: me.email, user_metadata: { full_name: name } },
    profile: {
      id: me.id,
      name,
      email: me.email,
      avatar,
      role: isAdmin ? 'Administrador' : 'Cliente',
      // plano comprado (basico|padrao|premium) conta como pago na interface; o limite real é aplicado no servidor
      plan: isAdmin || ['basico', 'padrao', 'premium'].includes(me.plan?.toLowerCase() ?? '') ? 'Premium' : 'Free',
      credits: isAdmin ? 999999 : me.credits ?? 0,
      status: 'Ativo',
    },
    isAdmin,
  };
}

/**
 * null = sem sessão válida (ou servidor indisponível: nunca assume identidade).
 * Usa ?optional=1: sem sessão o servidor responde 200 {authenticated:false} em vez de 401 (sem ruído no console).
 */
export async function fetchSession(): Promise<SessionIdentity | null> {
  try {
    const res = await fetch('/api/auth/me?optional=1', { credentials: 'same-origin', cache: 'no-store' });
    if (!res.ok) return null;
    const me = await res.json();
    if (!me || me.authenticated === false || typeof me.id !== 'string' || typeof me.email !== 'string') return null;
    return identityFromMe(me);
  } catch {
    return null;
  }
}
