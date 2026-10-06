import { NextRequest, NextResponse } from "next/server";
import { withImportQuota } from "../../../../lib/entitlements";
import { buildAiFailure, isApiKeyUsable, isAuthError } from "../../../../lib/geminiErrors";
import { GoogleGenAI } from "@google/genai";

async function handle(req: NextRequest) {
  try {
    const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
    if (!isApiKeyUsable(apiKey)) {
      const f = buildAiFailure(null, false);
      return NextResponse.json(
        { success: false, error: f.message, code: f.code, retryable: f.retryable },
        { status: f.status }
      );
    }
    const ai = new GoogleGenAI({ apiKey });
    const body = await req.json();
    const { pdfBase64, textContent, fileName } = body;

    if (!pdfBase64 && !textContent) {
      return NextResponse.json(
        { error: "Nenhum arquivo PDF ou texto foi enviado." },
        { status: 400 }
      );
    }

    const systemPrompt = `Você é um Analista Especialista de RH e Auditor de Extração de Currículos de Alta Fidelidade (CVFacil.NG).
Sua missão fundamental é extrair com 100% de precisão e fidelidade literal as informações contidas no documento PDF do candidato.

Regras Críticas e Estritas de Fidelidade:
1. NUNCA invente, deduza ou substitua informações. Extraia o nome real do candidato exatamente como está escrito no documento.
2. Extraia o cargo/profissão real do candidato tal como consta no cabeçalho ou resumo.
3. Extraia telefone, email, linkedin, cidade/endereço e links exatamente como constam no documento.
4. Resumo Profissional: transcreva o resumo/apresentação/objetivo profissional real do candidato presente no currículo. Não use textos fictícios ou genéricos.
5. Experiências Profissionais: extraia todas as experiências profissionais descritas no documento, preservando o cargo exato, empresa, período/datas e a descrição real das atividades desempenhadas. Se não houver experiências no documento, retorne array vazio [].
6. Formação Acadêmica: extraia os cursos, faculdades/escolas, anos de conclusão e tipos exatamente como citados no PDF.
7. Habilidades: extraia estritamente as competências, tecnologias e conhecimentos mencionados no documento, atribuindo nível compatível com a senioridade (entre 60 e 95).
8. Idiomas: extraia os idiomas citados e a proficiência descrita no currículo.
9. Interesses/Hobbies: inclua apenas o que estiver expressamente mencionado no documento.
10. Responda ESTRITAMENTE em formato JSON válido, de acordo com o schema fornecido.`;

    let contents: any[] = [];

    // Se temos o binário Base64 do PDF, enviamos diretamente ao modelo multimodal
    if (pdfBase64) {
      // Limpa qualquer prefixo data:application/pdf;base64,
      const cleanBase64 = pdfBase64.replace(/^data:application\/pdf;base64,/, '');
      contents = [
        {
          role: "user",
          parts: [
            {
              inlineData: {
                mimeType: "application/pdf",
                data: cleanBase64,
              },
            },
            {
              text: `Analise minuciosamente todas as páginas deste currículo em PDF (arquivo: ${fileName || "curriculo.pdf"}). Extraia com 100% de precisão literal os dados do candidato: Nome completo real, Cargo/Especialidade real, Email, Telefone, LinkedIn, Portfólio/Website, Resumo Profissional literal, todas as Experiências Profissionais completas (sem truncar ou resumir), todas as Formações Acadêmicas com instituições e períodos, todas as Habilidades técnicas/profissionais com seus níveis percentuais correspondentes, todos os Idiomas com proficiência e todos os Hobbies. NUNCA invente nem use dados fictícios ou genéricos. Retorne estritamente o JSON estruturado.`,
            },
          ],
        },
      ];
    } else {
      // Fallback baseado em texto
      contents = [
        {
          role: "user",
          parts: [
            {
              text: `Analise o seguinte conteúdo de currículo e retorne o JSON estruturado com fidelidade literal:\n\n${textContent}`,
            },
          ],
        },
      ];
    }

    const candidateModels = [
      "gemini-3.1-flash-lite",
      "gemini-flash-lite-latest",
      "gemini-3.5-flash-lite",
      "gemini-3.5-flash",
      "gemini-3.7-flash",
      "gemini-flash-latest",
      "gemini-3.8-flash"
    ];
    let response: any = null;
    let lastError: any = null;
    let authFailed = false;

    // Loop de modelos com failover inteligente para erro 429 (Quota) e 503 (Demanda)
    for (const modelName of candidateModels) {
      if (authFailed) break; // chave invalida: testar outros modelos so repete o 401
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          response = await ai.models.generateContent({
            model: modelName,
            contents,
            config: {
              systemInstruction: systemPrompt,
              responseMimeType: "application/json",
              responseSchema: {
                type: "OBJECT" as any,
                properties: {
                  fullName: { type: "STRING" as any },
                  role: { type: "STRING" as any },
                  email: { type: "STRING" as any },
                  phone: { type: "STRING" as any },
                  linkedin: { type: "STRING" as any },
                  portfolio: { type: "STRING" as any },
                  summary: { type: "STRING" as any },
                  experiences: {
                    type: "ARRAY" as any,
                    items: {
                      type: "OBJECT" as any,
                      properties: {
                        role: { type: "STRING" as any },
                        company: { type: "STRING" as any },
                        period: { type: "STRING" as any },
                        description: { type: "STRING" as any },
                      },
                      required: ["role", "company", "period", "description"],
                    },
                  },
                  education: {
                    type: "ARRAY" as any,
                    items: {
                      type: "OBJECT" as any,
                      properties: {
                        degree: { type: "STRING" as any },
                        institution: { type: "STRING" as any },
                        year: { type: "STRING" as any },
                        type: { 
                          type: "STRING" as any,
                          enum: ["Bacharelado", "Certificação", "Mestrado", "Extensão"]
                        },
                      },
                      required: ["degree", "institution", "year"],
                    },
                  },
                  skills: {
                    type: "ARRAY" as any,
                    items: {
                      type: "OBJECT" as any,
                      properties: {
                        name: { type: "STRING" as any },
                        level: { type: "INTEGER" as any },
                      },
                      required: ["name", "level"],
                    },
                  },
                  languages: {
                    type: "ARRAY" as any,
                    items: {
                      type: "OBJECT" as any,
                      properties: {
                        name: { type: "STRING" as any },
                        level: { type: "STRING" as any },
                      },
                      required: ["name", "level"],
                    },
                  },
                  hobbies: {
                    type: "ARRAY" as any,
                    items: { type: "STRING" as any },
                  },
                },
                required: ["fullName", "role", "summary", "experiences", "education", "skills"],
              },
            },
          });
          if (response && response.text) break;
        } catch (err: any) {
          lastError = err;
          if (isAuthError(err)) { authFailed = true; break; }
          const is429 = err?.status === 429 || err?.message?.includes("429") || err?.message?.includes("RESOURCE_EXHAUSTED") || err?.message?.includes("Quota exceeded");
          const is503 = err?.status === 503 || err?.message?.includes("503") || err?.message?.includes("high demand") || err?.message?.includes("UNAVAILABLE");

          // Se for erro de cota 429, pula imediatamente para o próximo modelo do pool sem esperar
          if (is429) {
            console.warn(`[Quota Exceeded] Modelo ${modelName} excedeu limite. Chaveando para próximo modelo...`);
            break;
          }

          if (is503) {
            await new Promise(r => setTimeout(r, 1000 * attempt));
            continue;
          }
          break; // outros erros tentam o próximo modelo do pool
        }
      }
      if (response && response.text) break;
    }

    if (!response || !response.text) {
      const failure = buildAiFailure(lastError, true);
      console.error(`[import-pdf] IA indisponivel (${failure.code}):`, lastError?.message || lastError);
      return NextResponse.json(
        { success: false, error: failure.message, code: failure.code, retryable: failure.retryable },
        { status: failure.status }
      );
    }

    const responseText = response.text || "{}";
    const parsedData = JSON.parse(responseText);

    return NextResponse.json({
      success: true,
      data: parsedData,
      source: "gemini-2.5-flash-v2",
    });

  } catch (error: any) {
    console.error("Erro na rota /api/gemini/import-pdf-v2:", error);
    return NextResponse.json(
      { 
        error: "Falha ao processar o currículo com Inteligência Artificial.",
        code: "IMPORT_FAILED"
      },
      { status: 500 }
    );
  }
}

// Sessão + limite de IA + cota de importações do plano pago (estornada se a importação falhar).
export const POST = (req: NextRequest) => withImportQuota(req, handle);
