// Parâmetros do limite de tentativas de login/cadastro. A contagem em si vive em lib/rateLimit.ts
// (persistente no Neon, com fallback em memória).
export const AUTH_WINDOW_MS = 15 * 60 * 1000;
export const AUTH_MAX_ATTEMPTS = 5;

export function clientIp(req: Request): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown';
}
