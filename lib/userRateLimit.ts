// Limite por usuário em memória (janela deslizante). Protege a cota do Gemini contra uso excessivo.
// Limitação: vive no processo; reiniciar/trocar de instância zera os contadores e réplicas não compartilham.
const buckets = new Map<string, number[]>();
const MAX_KEYS = 10000;

export const AI_LIMIT_PER_MINUTE = 20;

/** Registra uma chamada e devolve true se ela EXCEDE o limite (a chamada excedente não conta). */
export function exceedsUserLimit(key: string, max = AI_LIMIT_PER_MINUTE, windowMs = 60_000, now = Date.now()): boolean {
  const recent = (buckets.get(key) || []).filter((t) => now - t < windowMs);
  if (recent.length >= max) {
    buckets.set(key, recent);
    return true;
  }
  if (buckets.size >= MAX_KEYS) buckets.clear();
  buckets.set(key, [...recent, now]);
  return false;
}

export function __resetUserRateLimitForTests(): void {
  buckets.clear();
}
