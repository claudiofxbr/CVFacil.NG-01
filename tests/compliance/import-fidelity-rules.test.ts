import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * REGRA CRÍTICA DA IMPORTAÇÃO DE PDF: os dados importados devem ser idênticos aos do
 * currículo que o cliente escolheu. Nenhum prompt de importação pode mandar a IA inventar,
 * melhorar, resumir ou padronizar dados do candidato.
 *
 * Bug real corrigido: o fallback do navegador (services/aiImportService.ts) mandava o
 * Gemini "criar um resumo profissional impactante" quando o PDF não tinha resumo e
 * "padronizar as datas" — dados que não existiam no arquivo do cliente.
 */
const root = join(__dirname, '..', '..');
const fontes = [
  'services/aiImportService.ts',
  'app/api/gemini/import-pdf/route.ts',
  'app/api/gemini/import-pdf-v2/route.ts',
];

describe('prompts de importação de PDF preservam os dados do cliente', () => {
  it.each(fontes)('%s não manda inventar, melhorar nem padronizar dados', (arquivo) => {
    const codigo = readFileSync(join(root, arquivo), 'utf8');
    expect(codigo).not.toMatch(/crie um resumo/i);
    expect(codigo).not.toMatch(/impactante/i);
    expect(codigo).not.toMatch(/padronize/i);
  });

  it.each(fontes)('%s proíbe explicitamente inventar dados', (arquivo) => {
    const codigo = readFileSync(join(root, arquivo), 'utf8');
    expect(codigo).toMatch(/NUNCA invente/);
  });
});
