// Rate limit simples em memória (por processo) por chave IP+e-mail. Suficiente contra força bruta básica
// numa única instância; não é compartilhado entre réplicas (blue-green troca de cor, zerando o contador).
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const MAX_KEYS = 10000;
const hits = new Map<string, number[]>();

export function clientIp(req: Request): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown';
}

const recent = (key: string, now: number) => (hits.get(key) || []).filter((t) => now - t < WINDOW_MS);

export function isRateLimited(key: string, now = Date.now()): boolean {
  return recent(key, now).length >= MAX_ATTEMPTS;
}

export function recordFailure(key: string, now = Date.now()): void {
  if (hits.size >= MAX_KEYS) hits.clear();
  hits.set(key, [...recent(key, now), now]);
}

export function resetAttempts(key: string): void {
  hits.delete(key);
}

export function __resetRateLimitForTests(): void {
  hits.clear();
}
