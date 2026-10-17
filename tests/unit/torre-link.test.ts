import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const root = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');
const walk = (dir: string): string[] =>
  readdirSync(join(root, dir)).flatMap((n) => {
    const rel = `${dir}/${n}`;
    return statSync(join(root, rel)).isDirectory() ? walk(rel) : ['.ts', '.tsx'].includes(extname(n)) ? [rel] : [];
  });

describe('atalho da Torre de Controle no menu lateral', () => {
  const side = read('components/Sidebar.tsx');

  it('só aparece para administrador (isAdmin vem do servidor)', () => {
    expect(side).toMatch(/const \{ isAdmin \} = useAuth\(\)/);
    expect(side).toMatch(/\{isAdmin && \(\s*<a[^>]*href=\{TORRE_DE_CONTROLE_URL\}/);
    // fora do bloco isAdmin o link não pode ser renderizado
    const before = side.split('{isAdmin && (')[0];
    expect(before).not.toMatch(/href=\{TORRE_DE_CONTROLE_URL\}/);
  });

  it('abre em nova aba sem vazar window.opener', () => {
    expect(side).toMatch(/target="_blank"/);
    expect(side).toMatch(/rel="noopener noreferrer"/);
  });

  it('aponta para o artifact privado da Torre e só o menu lateral o referencia', () => {
    expect(side).toContain("'https://claude.ai/code/artifact/5571a2a0-087b-4ff3-9cbe-15d76b05564e'");
    const users = ['app', 'components', 'services', 'lib'].flatMap(walk).filter((f) => read(f).includes('5571a2a0'));
    expect(users).toEqual(['components/Sidebar.tsx']);
  });

  it('mantém o rótulo "Torre de Controle"', () => {
    expect(side).toContain('Torre de Controle');
  });
});
