const DEFAULT_BASE = 'https://cvfacil.xavierbr-vps.tech';

/** URL pública do app (usada em redirect_url e no webhook). Configurável por APP_BASE_URL; sempre https, sem barra final. */
export function appBaseUrl(): string {
  const raw = (process.env.APP_BASE_URL || DEFAULT_BASE).trim().replace(/\/+$/, '');
  try {
    const u = new URL(raw);
    if (u.protocol === 'https:' && !u.username && !u.password && !u.search && !u.hash) return `${u.origin}${u.pathname === '/' ? '' : u.pathname}`;
  } catch {
    /* cai no padrão */
  }
  return DEFAULT_BASE;
}
