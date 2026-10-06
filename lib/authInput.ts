import { PASSWORD_MAX, PASSWORD_MIN } from './password';
import { RESERVED_EMAIL_DOMAINS } from './accountIdentity';

const EMAIL_RE = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/;

export function normalizeEmail(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const e = v.trim().toLowerCase();
  if (e.length > 254 || !EMAIL_RE.test(e)) return null;
  // Domínios reservados dos e-mails sintéticos legados: não podem ser registrados.
  return RESERVED_EMAIL_DOMAINS.includes(e.split('@')[1]) ? null : e;
}

export function validPasswordShape(v: unknown): v is string {
  return typeof v === 'string' && v.length >= 1 && v.length <= PASSWORD_MAX;
}

export const passwordPolicyOk = (v: string) => v.length >= PASSWORD_MIN && v.length <= PASSWORD_MAX;

export async function readJson(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const raw = await req.text();
    if (raw.length > 4096) return null;
    const b = JSON.parse(raw);
    return b && typeof b === 'object' && !Array.isArray(b) ? (b as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
