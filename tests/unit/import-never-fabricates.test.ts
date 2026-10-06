import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Importação de PDF: PDFs diferentes têm de produzir currículos diferentes, e quando a IA falha o
 * resultado é um ERRO, nunca um currículo inventado.
 *
 * Bug real (05/10/2026): a chave do Gemini da VPS era inválida (401) e as rotas devolviam um
 * currículo fixo de uma pessoa específica; toda importação trazia sempre o mesmo currículo.
 */
let generate: (args: any) => any;

// Sem banco real: usuário free (sem cota de plano) e limitador de taxa cai para memória.
vi.mock('../../lib/neon', () => ({ sql: async () => [{ plan: 'free' }] }));

// As rotas de IA agora exigem sessão (coberta em protected-routes.test.ts); aqui a sessão é simulada.
vi.mock('../../lib/requireUser', async (orig) => ({
  ...(await orig<any>()),
  requireUser: async () => ({ id: 'user-teste', email: 'teste@x.com' }),
}));

vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = { generateContent: (args: any) => generate(args) };
  },
  Type: new Proxy({}, { get: (_t, k) => String(k) }),
}));

const CHAVE_VALIDA = 'k'.repeat(39);
const DADOS_FIXOS = /CLAUDIO|xavierbr|99113|agent-resilience-fallback/i;

function post(url: string, body: any) {
  return new NextRequest(`http://localhost${url}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function textoDoPrompt(args: any): string {
  return JSON.stringify(args?.contents ?? '');
}

const curriculos: Record<string, any> = {
  'ana.pdf': { fullName: 'Ana Souza', role: 'Contadora', summary: 'Resumo da Ana', experiences: [], education: [], skills: [] },
  'bruno.pdf': { fullName: 'Bruno Lima', role: 'Engenheiro', summary: 'Resumo do Bruno', experiences: [], education: [], skills: [] },
};

describe('rota v2: PDFs diferentes viram currículos diferentes', () => {
  beforeEach(() => {
    vi.stubEnv('GEMINI_API_KEY', CHAVE_VALIDA);
    generate = (args) => {
      const arquivo = Object.keys(curriculos).find((nome) => textoDoPrompt(args).includes(nome))!;
      return { text: JSON.stringify(curriculos[arquivo]) };
    };
  });

  it('cada arquivo devolve os dados do próprio PDF', async () => {
    const { POST } = await import('../../app/api/gemini/import-pdf-v2/route');
    const ana = await (await POST(post('/api/gemini/import-pdf-v2', { pdfBase64: 'JVBERi0xLjQ=', fileName: 'ana.pdf' }))).json();
    const bruno = await (await POST(post('/api/gemini/import-pdf-v2', { pdfBase64: 'JVBERi0xLjQ=', fileName: 'bruno.pdf' }))).json();

    expect(ana.data.fullName).toBe('Ana Souza');
    expect(bruno.data.fullName).toBe('Bruno Lima');
    expect(ana.data).not.toEqual(bruno.data);
    expect(JSON.stringify([ana, bruno])).not.toMatch(DADOS_FIXOS);
  });
});

describe('quando a IA falha, a importação devolve erro e nenhum dado', () => {
  beforeEach(() => vi.stubEnv('GEMINI_API_KEY', CHAVE_VALIDA));

  const rotas = [
    { nome: 'v2', url: '/api/gemini/import-pdf-v2', modulo: () => import('../../app/api/gemini/import-pdf-v2/route'), corpo: { pdfBase64: 'JVBERi0xLjQ=', fileName: 'x.pdf' } },
    { nome: 'v1', url: '/api/gemini/import-pdf', modulo: () => import('../../app/api/gemini/import-pdf/route'), corpo: { base64Data: 'JVBERi0xLjQ=' } },
  ];

  it.each(rotas)('$nome: chave recusada (401) -> AI_NOT_CONFIGURED, 1 tentativa só, sem dados', async ({ url, modulo, corpo }) => {
    const chamadas = vi.fn(() => {
      throw Object.assign(new Error('UNAUTHENTICATED'), { status: 401 });
    });
    generate = chamadas;
    const { POST } = await modulo();
    const res = await POST(post(url, corpo));
    const texto = await res.text();
    const json = JSON.parse(texto);

    expect(res.status).toBe(503);
    expect(json.code).toBe('AI_NOT_CONFIGURED');
    expect(json.data).toBeUndefined();
    expect(texto).not.toMatch(DADOS_FIXOS);
    expect(chamadas).toHaveBeenCalledTimes(1);
  });

  it.each(rotas)('$nome: chave curta demais nem chama o Google', async ({ url, modulo, corpo }) => {
    vi.stubEnv('GEMINI_API_KEY', 'curta14chars!!');
    const chamadas = vi.fn();
    generate = chamadas;
    const { POST } = await modulo();
    const res = await POST(post(url, corpo));
    const json = await res.json();

    expect(res.status).toBe(503);
    expect(json.code).toBe('AI_NOT_CONFIGURED');
    expect(chamadas).not.toHaveBeenCalled();
  });

  it.each(rotas)('$nome: cota esgotada (429) em todos os modelos -> AI_QUOTA_EXCEEDED', async ({ url, modulo, corpo }) => {
    const chamadas = vi.fn(() => {
      throw Object.assign(new Error('RESOURCE_EXHAUSTED'), { status: 429 });
    });
    generate = chamadas;
    const { POST } = await modulo();
    const res = await POST(post(url, corpo));
    const texto = await res.text();

    expect(res.status).toBe(429);
    expect(JSON.parse(texto).code).toBe('AI_QUOTA_EXCEEDED');
    expect(texto).not.toMatch(DADOS_FIXOS);
    expect(chamadas.mock.calls.length).toBeGreaterThan(1);
  });

  it.each(rotas)('$nome: falha genérica -> AI_UNAVAILABLE, sem dados', async ({ url, modulo, corpo }) => {
    generate = () => {
      throw new Error('falha de rede');
    };
    const { POST } = await modulo();
    const res = await POST(post(url, corpo));
    const texto = await res.text();

    expect(res.status).toBe(503);
    expect(JSON.parse(texto).code).toBe('AI_UNAVAILABLE');
    expect(texto).not.toMatch(DADOS_FIXOS);
  });
});

describe('o código de importação não carrega currículo nem texto inventado', () => {
  const raiz = join(__dirname, '..', '..');
  const arquivos = [
    'app/api/gemini/import-pdf/route.ts',
    'app/api/gemini/import-pdf-v2/route.ts',
    'services/aiImportInspectorAgent.ts',
  ];

  it.each(arquivos)('%s', (arquivo) => {
    const codigo = readFileSync(join(raiz, arquivo), 'utf8');
    expect(codigo).not.toMatch(DADOS_FIXOS);
    expect(codigo).not.toMatch(/Resumo profissional extraído por Inteligência Artificial/);
  });
});
