import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { neonResumeService } from '../../services/neonResumeService';

/**
 * Bug visto no F12 (foto06): "Failed to load resource ... action=permanent: 404" e
 * "Erro no neonResumeService.permanentDelete: Currículo não encontrado". O botão "Purgar" não era
 * travado durante a requisição; um clique duplo mandava dois DELETE e o segundo recebia 404.
 */
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

afterEach(() => vi.unstubAllGlobals());

describe('permanentDelete é idempotente', () => {
  it('404 (já excluído) conta como sucesso e não polui o console', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn(async () => json(404, { error: 'Currículo não encontrado ou acesso não autorizado.' })));
    await expect(neonResumeService.permanentDelete('abc')).resolves.toBe(true);
    expect(err).not.toHaveBeenCalled();
    err.mockRestore();
  });

  it('exclui com sucesso (200) e envia o cookie de sessão', async () => {
    const f = vi.fn(async () => json(200, { success: true }));
    vi.stubGlobal('fetch', f);
    await expect(neonResumeService.permanentDelete('abc')).resolves.toBe(true);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/neon/resumes?id=abc&action=permanent');
    expect(init).toMatchObject({ method: 'DELETE', credentials: 'same-origin' });
  });

  it('erro real (500) continua sendo erro', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn(async () => json(500, { error: 'Erro interno ao processar a solicitação.' })));
    await expect(neonResumeService.permanentDelete('abc')).rejects.toThrow('Erro interno');
    err.mockRestore();
  });

  it('401 (sessão expirada) continua sendo erro', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn(async () => json(401, { error: 'UNAUTHENTICATED' })));
    await expect(neonResumeService.permanentDelete('abc')).rejects.toThrow('UNAUTHENTICATED');
    err.mockRestore();
  });
});

describe('Dashboard trava o clique duplo na exclusão', () => {
  const src = readFileSync(join(__dirname, '..', '..', 'components', 'Dashboard.tsx'), 'utf8');

  it('os dois handlers bloqueiam reentrada por ref e liberam no finally', () => {
    expect(src.match(/if \(deletingRef\.current\) return;/g)?.length).toBe(2);
    expect(src.match(/deletingRef\.current = false;/g)?.length).toBe(2);
  });

  it('o botão de confirmar fica desabilitado enquanto exclui', () => {
    expect(src).toMatch(/disabled=\{isDeleting\}/);
  });

  it('após falha, a lista é recarregada do servidor', () => {
    expect(src.match(/void loadAllResumes\(\);/g)?.length).toBe(2);
  });
});
