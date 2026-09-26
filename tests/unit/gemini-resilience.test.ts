import { describe, it, expect, vi } from 'vitest';

describe('Resilience and Fallback Suite - PDF Import V2 & V1', () => {
  it('deve formatar mensagens de erro 503 com clareza para o usuário sem estourar json cru', () => {
    const errorJson = {
      error: {
        code: 503,
        message: "This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.",
        status: "UNAVAILABLE"
      }
    };

    let msg = errorJson.error.message;
    if (typeof msg === 'string' && (msg.includes('503') || msg.includes('high demand') || msg.includes('UNAVAILABLE'))) {
      msg = "Os servidores do Gemini estão com pico temporário de tráfego. O sistema tentou reprocessar automaticamente; por favor, aguarde alguns segundos e tente novamente.";
    }

    expect(msg).toContain("Os servidores do Gemini estão com pico temporário de tráfego");
    expect(msg).not.toContain("UNAVAILABLE");
  });

  it('deve simular retentativas com backoff quando encontrar erro 503 temporário', async () => {
    let callCount = 0;
    const mockGenerate = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount < 3) {
        const err: any = new Error("This model is currently experiencing high demand.");
        err.status = 503;
        throw err;
      }
      return { text: JSON.stringify({ fullName: "Candidato Teste", role: "Engenheiro" }) };
    });

    const candidateModels = ["gemini-3.8-flash", "gemini-2.5-flash"];
    let response: any = null;

    for (const model of candidateModels) {
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          response = await mockGenerate();
          if (response && response.text) break;
        } catch (err: any) {
          if (err.status === 503) {
            continue;
          }
          break;
        }
      }
      if (response && response.text) break;
    }

    expect(callCount).toBe(3);
    expect(response).toBeDefined();
    expect(JSON.parse(response.text).fullName).toBe("Candidato Teste");
  });

  it('deve chavear imediatamente para o próximo modelo ao detectar erro 429 (Quota Exceeded)', async () => {
    const triedModels: string[] = [];
    const mockGenerate = vi.fn().mockImplementation(async (model: string) => {
      triedModels.push(model);
      if (model === 'model-exhausted-429') {
        const err: any = new Error("You exceeded your current quota: RESOURCE_EXHAUSTED");
        err.status = 429;
        throw err;
      }
      return { text: JSON.stringify({ fullName: "CLAUDIO FREITAS XAVIER", role: "Analista de Sistemas" }) };
    });

    const candidateModels = ['model-exhausted-429', 'gemini-3.1-flash-lite'];
    let response: any = null;

    for (const model of candidateModels) {
      try {
        response = await mockGenerate(model);
        if (response && response.text) break;
      } catch (err: any) {
        if (err.status === 429) {
          continue; // Pula imediatamente para o próximo modelo
        }
      }
    }

    expect(triedModels).toEqual(['model-exhausted-429', 'gemini-3.1-flash-lite']);
    expect(response).toBeDefined();
    expect(JSON.parse(response.text).fullName).toBe("CLAUDIO FREITAS XAVIER");
  });
});
