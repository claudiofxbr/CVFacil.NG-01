import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * Este repositório é PÚBLICO. Credenciais nunca podem ser versionadas: o banco Neon já foi
 * exposto uma vez por uma connection string escrita em lib/neon.ts. Este teste falha se
 * qualquer arquivo de código/documentação trouxer senha do Neon, connection string com senha
 * ou chave de API do Google. Segredos ficam em variáveis de ambiente (VPS: .env 600; CI:
 * GitHub Secrets).
 */
const root = join(__dirname, '..', '..');
const IGNORAR_DIRS = new Set(['node_modules', '.next', '.git', 'coverage']);
const IGNORAR_ARQUIVOS = new Set(['package-lock.json', 'bun.lock']);
const EXTENSOES = /\.(ts|tsx|js|jsx|mjs|cjs|json|md|yml|yaml|sh|txt|html|css|patch)$/i;

const PADROES: { nome: string; regex: RegExp }[] = [
  { nome: 'senha/token do Neon (npg_...)', regex: /npg_[A-Za-z0-9]{8,}/ },
  {
    nome: 'connection string postgres com senha',
    regex: /postgres(?:ql)?:\/\/[^\s:@/'"`]+:(?!senha-ficticia)[^\s@'"`]{6,}@[^\s'"`]+/,
  },
  { nome: 'chave de API do Google (AIza...)', regex: /AIza[0-9A-Za-z_-]{30,}/ },
];

function* arquivos(dir: string): Generator<string> {
  for (const nome of readdirSync(dir)) {
    if (IGNORAR_DIRS.has(nome) || nome.startsWith('.env')) continue;
    const caminho = join(dir, nome);
    const info = statSync(caminho);
    if (info.isDirectory()) yield* arquivos(caminho);
    else if (EXTENSOES.test(nome) && !IGNORAR_ARQUIVOS.has(nome)) yield caminho;
  }
}

describe('nenhum segredo versionado no repositório público', () => {
  const todos = [...arquivos(root)];

  it('o varredor encontra os arquivos do projeto', () => {
    expect(todos.length).toBeGreaterThan(20);
  });

  it.each(PADROES)('nenhum arquivo contém $nome', ({ regex }) => {
    const suspeitos = todos
      .filter((arquivo) => regex.test(readFileSync(arquivo, 'utf8')))
      .map((arquivo) => relative(root, arquivo));
    expect(suspeitos).toEqual([]);
  });
});
