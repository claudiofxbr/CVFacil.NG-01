import { GoogleGenAI, Type } from "@google/genai";
import { buildAiFailure, isApiKeyUsable, isAuthError } from "../../../../lib/geminiErrors";
import { NextRequest, NextResponse } from "next/server";
import { aiGuard } from "../../../../lib/apiAuth";

const resumeSchema = {
  type: Type.OBJECT,
  properties: {
    fullName: { type: Type.STRING, description: "Nome completo do candidato" },
    role: { type: Type.STRING, description: "Cargo ou profissão principal" },
    email: { type: Type.STRING, description: "E-mail de contato" },
    phone: { type: Type.STRING, description: "Telefone de contato" },
    linkedin: { type: Type.STRING, description: "URL do perfil no LinkedIn" },
    portfolio: { type: Type.STRING, description: "URL do portfólio ou site pessoal" },
    summary: { type: Type.STRING, description: "Resumo profissional ou objetivo" },
    experiences: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          role: { type: Type.STRING, description: "Cargo ocupado" },
          company: { type: Type.STRING, description: "Nome da empresa" },
          period: { type: Type.STRING, description: "Período (ex: Jan 2020 - Mar 2022)" },
          description: { type: Type.STRING, description: "Descrição das atividades e conquistas" },
        },
        required: ["role", "company"]
      }
    },
    education: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          degree: { type: Type.STRING, description: "Nome do curso ou grau" },
          institution: { type: Type.STRING, description: "Nome da instituição" },
          year: { type: Type.STRING, description: "Ano de conclusão ou período" },
          type: { 
            type: Type.STRING, 
            description: "Tipo de formação",
            enum: ["Bacharelado", "Certificação", "Mestrado", "Extensão"]
          },
        },
        required: ["degree", "institution"]
      }
    },
    skills: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING, description: "Nome da habilidade" },
          level: { type: Type.NUMBER, description: "Nível de proficiência de 0 a 100" }
        },
        required: ["name", "level"]
      }
    },
    languages: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING, description: "Nome do idioma" },
          level: { type: Type.STRING, description: "Nível (ex: Básico, Intermediário, Avançado, Fluente)" }
        },
        required: ["name", "level"]
      }
    },
    hobbies: {
      type: Type.ARRAY,
      items: { type: Type.STRING }
    }
  },
  required: ["fullName", "role", "summary", "experiences", "education", "skills"]
};

export async function POST(req: NextRequest) {
  const guard = await aiGuard(req);
  if (guard instanceof NextResponse) return guard;
  try {
    const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
    if (!isApiKeyUsable(apiKey)) {
      const f = buildAiFailure(null, false);
      return NextResponse.json(
        { success: false, error: f.message, code: f.code, retryable: f.retryable },
        { status: f.status }
      );
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });

    const { base64Data } = await req.json();

    if (!base64Data) {
      return NextResponse.json({ error: "Dados em Base64 do PDF não fornecidos." }, { status: 400 });
    }

    const candidateModels = [
      'gemini-3.1-flash-lite',
      'gemini-flash-lite-latest',
      'gemini-3.5-flash-lite',
      'gemini-3.5-flash',
      'gemini-3.7-flash',
      'gemini-flash-latest',
      'gemini-3.8-flash'
    ];
    let response: any = null;
    let lastError: any = null;
    let authFailed = false;

    const systemPrompt = `Você é um Analista Especialista de RH e Auditor de Extração de Currículos de Alta Fidelidade (CVFacil.NG).
Sua missão fundamental é extrair com 100% de precisão e fidelidade literal as informações contidas no documento PDF do candidato.

Regras Críticas e Estritas de Fidelidade:
1. NUNCA invente, deduza ou substitua dados do candidato por modelos genéricos. Extraia o nome real do candidato exatamente como está escrito no documento.
2. Extraia o cargo/profissão real do candidato tal como consta no cabeçalho ou resumo.
3. Extraia telefone, email, linkedin, cidade/endereço e links exatamente como constam no documento.
4. Resumo Profissional: transcreva o resumo/apresentação/objetivo profissional real do candidato presente no currículo. Não invente textos genéricos.
5. Experiências Profissionais: extraia todas as experiências profissionais descritas no documento, preservando o cargo exato, empresa, período/datas e a descrição real das atividades desempenhadas.
6. Formação Acadêmica: extraia os cursos, faculdades/escolas, anos de conclusão e tipos exatamente como citados no PDF.
7. Habilidades: extraia estritamente as competências, tecnologias e conhecimentos citados no documento.
8. Idiomas: extraia os idiomas citados e a proficiência descrita no currículo.
9. Interesses/Hobbies: inclua apenas o que estiver expressamente mencionado no documento.
10. Responda ESTRITAMENTE em formato JSON válido, de acordo com o schema fornecido.`;

    // Loop de resiliência com modelos alternativos e failover para 429 e 503
    for (const modelName of candidateModels) {
      if (authFailed) break; // chave invalida: testar outros modelos so repete o 401
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          response = await ai.models.generateContent({
            model: modelName,
            contents: {
              parts: [
                { inlineData: { mimeType: 'application/pdf', data: base64Data } },
                { text: "Analise este currículo em PDF e extraia fielmente todas as informações conforme as regras do sistema." }
              ]
            },
            config: {
              systemInstruction: systemPrompt,
              responseMimeType: 'application/json',
              responseSchema: resumeSchema
            }
          });
          if (response && response.text) break;
        } catch (err: any) {
          lastError = err;
          if (isAuthError(err)) { authFailed = true; break; }
          const is429 = err?.status === 429 || err?.message?.includes("429") || err?.message?.includes("RESOURCE_EXHAUSTED") || err?.message?.includes("Quota exceeded");
          if (is429) {
            console.warn(`[Quota Exceeded] Modelo ${modelName} excedeu limite. Chaveando para próximo modelo...`);
            break;
          }
          if (err?.status === 503 || err?.message?.includes('503') || err?.message?.includes('high demand')) {
            await new Promise(r => setTimeout(r, 1000 * attempt));
            continue;
          }
          break; // outros erros tentam o próximo modelo
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

    const rawText = response.text;
    if (!rawText) {
      return NextResponse.json({ error: "A IA não retornou conteúdo." }, { status: 500 });
    }

    const parsedData = JSON.parse(rawText);
    return NextResponse.json({ data: parsedData });
  } catch (error: any) {
    console.error("Erro na rota /api/gemini/import-pdf:", error);
    return NextResponse.json({ error: "Erro ao processar PDF com a IA.", code: "IMPORT_FAILED" }, { status: 500 });
  }
}
