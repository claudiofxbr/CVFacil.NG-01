import { GoogleGenAI } from "@google/genai";
import { NextRequest, NextResponse } from "next/server";
import { aiGuard } from "../../../../lib/apiAuth";

export async function POST(req: NextRequest) {
  const guard = await aiGuard(req);
  if (guard instanceof NextResponse) return guard;
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "GEMINI_API_KEY não configurada no servidor." }, { status: 500 });
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });

    const { action, text, context, experiences } = await req.json();

    if (action === 'improve') {
      if (!text || text.trim().length < 10) {
        return NextResponse.json({ error: "O texto é muito curto para ser melhorado." }, { status: 400 });
      }

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: {
          parts: [
            { text: `Você é um especialista em escrita de currículos e tech recruiter. 
Sua tarefa é melhorar o seguinte texto para torná-lo mais profissional, impactante e focado em resultados.

Contexto: ${context || ''}
Texto original: "${text}"

Instruções:
1. Mantenha a verdade dos fatos.
2. Use verbos de ação fortes.
3. Destaque conquistas e métricas se possível.
4. O tom deve ser profissional e confiante.
5. Retorne APENAS o texto melhorado, sem explicações ou aspas.` }
          ]
        }
      });

      return NextResponse.json({ result: response.text?.trim() || text });
    }

    if (action === 'suggest-skills') {
      if (!experiences || experiences.length === 0) {
        return NextResponse.json({ error: "Adicione algumas experiências para receber sugestões de habilidades." }, { status: 400 });
      }

      const expContext = experiences.map((e: any) => `${e.role} na ${e.company}: ${e.description}`).join('\n');

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: {
          parts: [
            { text: `Com base nas seguintes experiências profissionais, sugira uma lista de até 10 habilidades técnicas (hard skills) e comportamentais (soft skills) relevantes.

Experiências:
${expContext}

Retorne APENAS uma lista de strings separadas por vírgula.` }
          ]
        }
      });

      const rawText = response.text || '';
      const skills = rawText.split(',').map(s => s.trim()).filter(s => s.length > 0);
      return NextResponse.json({ skills });
    }

    return NextResponse.json({ error: "Ação inválida especificada." }, { status: 400 });
  } catch (error: any) {
    console.error("Erro na rota /api/gemini/editor:", error);
    return NextResponse.json({ error: error.message || "Erro no processamento de IA do editor." }, { status: 500 });
  }
}
