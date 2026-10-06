import type { User } from '../types';

/** Cliente das rotas /api/auth/* (sessão por cookie HttpOnly; o token nunca é visível ao JS). */

export interface SessionIdentity {
  user: { id: string; email: string; user_metadata: { full_name: string } };
  profile: User;
  isAdmin: boolean;
}

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

export async function serverRegister(email: string, password: string, name: string): Promise<AuthResult> {
  const res = await post('/api/auth/register', { email, password, name });
  if (!res) return { ok: false, message: MESSAGES[503] };
  if (res.ok) return { ok: true };
  return { ok: false, message: messageForRegisterError(res.status, await errorCode(res)) };
}

export async function serverLogout(): Promise<void> {
  await post('/api/auth/logout');
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
      plan: isAdmin || me.plan?.toLowerCase() === 'premium' ? 'Premium' : 'Free',
      credits: isAdmin ? 999999 : me.credits ?? 0,
      status: 'Ativo',
    },
    isAdmin,
  };
}

/** null = sem sessão válida (ou servidor indisponível: nunca assume identidade). */
export async function fetchSession(): Promise<SessionIdentity | null> {
  try {
    const res = await fetch('/api/auth/me', { credentials: 'same-origin', cache: 'no-store' });
    if (!res.ok) return null;
    const me = await res.json();
    if (!me || typeof me.id !== 'string' || typeof me.email !== 'string') return null;
    return identityFromMe(me);
  } catch {
    return null;
  }
}

// ---- Migração de currículos legados (ids locais anteriores à sessão de servidor) ----
const LEGACY_ID_RE = /^local-\d{10,16}$/;
const PENDING_KEY = 'cvfacil_legacy_pending';
const DONE_KEY = 'cvfacil_legacy_done';
const MAX_LEGACY_IDS = 10;

const readList = (key: string): string[] => {
  try {
    const v = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
  } catch { return []; }
};
const writeList = (key: string, list: string[]) => {
  try { localStorage.setItem(key, JSON.stringify(list)); } catch { /* storage indisponível */ }
};

/**
 * Lê os ids locais antigos (identidade local + userId dos currículos em cache) e os guarda como
 * pendentes ANTES de a identidade local ser apagada. Só aceita o formato local-<timestamp>
 * (admin-* e demais ficam de fora; o servidor revalida).
 */
export function captureLegacyIds(): string[] {
  const found = new Set<string>(readList(PENDING_KEY));
  try {
    const u = JSON.parse(localStorage.getItem('cvfacil_local_user') || 'null');
    if (u && typeof u.id === 'string') found.add(u.id);
  } catch { /* ignora JSON inválido */ }
  try {
    const list = JSON.parse(localStorage.getItem('cvfacil_local_resumes') || '[]');
    if (Array.isArray(list)) for (const r of list) if (r && typeof r.userId === 'string') found.add(r.userId);
  } catch { /* ignora JSON inválido */ }
  const done = new Set(readList(DONE_KEY));
  const pending = [...found].filter((id) => LEGACY_ID_RE.test(id) && !done.has(id)).slice(0, MAX_LEGACY_IDS);
  writeList(PENDING_KEY, pending);
  return pending;
}

/** Chama POST /api/auth/claim-legacy uma vez com os ids pendentes; em sucesso marca como feitos e limpa. */
export async function claimPendingLegacy(): Promise<void> {
  const pending = captureLegacyIds();
  if (pending.length === 0) return;
  try {
    const res = await fetch('/api/auth/claim-legacy', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ legacyIds: pending }),
    });
    if (!res.ok) return; // mantém pendente para a próxima sessão
    writeList(DONE_KEY, [...new Set([...readList(DONE_KEY), ...pending])]);
    writeList(PENDING_KEY, []);
  } catch { /* tenta de novo depois */ }
}
