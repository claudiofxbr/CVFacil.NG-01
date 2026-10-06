import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

/**
 * A identidade e o papel (admin) existem SÓ no servidor: sessão por cookie HttpOnly +
 * ADMIN_EMAILS. Nada no código do app pode reintroduzir elevação de papel, identidade em
 * localStorage, código de admin embutido ou e-mail de admin hardcoded.
 */
const root = join(__dirname, '..', '..');
const DIRS = ['app', 'components', 'services', 'lib'];
const FILES = ['App.tsx', 'types.ts'];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : ['.ts', '.tsx'].includes(extname(p)) ? [p] : [];
  });
}
const sources = [...DIRS.flatMap((d) => walk(join(root, d))), ...FILES.map((f) => join(root, f))].map((p) => ({
  path: p.replace(root, '').split(String.fromCharCode(92)).join('/'),
  text: readFileSync(p, 'utf8'),
}));

const FORBIDDEN: [string, RegExp][] = [
  ['código de admin embutido (7511/1234)', /['"`]7511['"`]|['"`]1234['"`]|\b7511\b/],
  ['elevação de papel no cliente', /isMasterAdminAccount|enforceAdminParity|ADMIN_MASTER_|CLAUDIO_ADMIN_/],
  ['identidade/currículos no localStorage', /cvfacil_local_|cvfacil_current_editing|loginLocal|logoutLocal/],
  ['Supabase como caminho de login', /@supabase\/supabase-js|from ['"]\.\.?\/supabase['"]/],
  ['e-mail de admin hardcoded', /claudio\.xavier@|admin@cvfacil\.ng/i],
];

describe('sem privilégio nem identidade no cliente', () => {
  it.each(FORBIDDEN)('nenhum arquivo do app contém: %s', (_nome, re) => {
    const hits = sources.filter((s) => re.test(s.text)).map((s) => s.path);
    expect(hits).toEqual([]);
  });

  it('rotas de dados não vazam mensagem interna em 500', () => {
    const leaks = sources.filter((x) => x.path.includes('api') && /error: (error|e)\.message/.test(x.text)).map((x) => x.path);
    // /api/neon/setup (acionada manualmente) e /api/gemini/* ficam fora desta etapa
    expect(leaks.filter((p) => p.includes('neon/resumes'))).toEqual([]);
  });

  it('/api/auth/me é a única origem do papel no cliente', () => {
    const client = readFileSync(join(root, 'services', 'authClient.ts'), 'utf8');
    expect(client).toMatch(/me\.role === 'admin'/);
    const ui = sources.filter((s) => s.path.startsWith('/components') || s.path === '/App.tsx');
    // nenhum componente deriva admin de nome/e-mail
    expect(ui.filter((s) => /role === 'Administrador'.*(name|email)|\.name ===|\.email ===/.test(s.text)).map((s) => s.path)).toEqual([]);
  });
});
