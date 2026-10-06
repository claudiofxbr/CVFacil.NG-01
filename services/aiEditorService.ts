import { SESSION_EXPIRED_MESSAGE } from './authClient';
import { GoogleGenAI } from "@google/genai";

/**
 * Serviço para assistência de IA dentro do editor de currículos
 */
export const improveTextWithAI = async (text: string, context: string): Promise<string> => {
  if (!text || text.trim().length < 10) {
    throw new Error("O texto é muito curto para ser melhorado.");
  }

  // 1. Tentar via servidor (/api/gemini/editor)
  let unauthorized = false;
  try {
    const res = await fetch('/api/gemini/editor', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'improve', text, context })
    });
    if (res.status === 401) unauthorized = true;
    else if (res.ok) {
      const data = await res.json();
      if (data.result) return data.result;
    }
  } catch (e) {
    console.warn("Rota /api/gemini/editor indisponível, fallback client-side:", e);
  }
  if (unauthorized) throw new Error(SESSION_EXPIRED_MESSAGE);

  // Fallback Client-Side
  const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Chave de API não configurada. Por favor, verifique as configurações do ambiente.");
  }

  const ai = new GoogleGenAI({ apiKey });
  
  const response = await ai.models.generateContent({
    model: 'gemini-3.6-flash',
    contents: {
      parts: [
        { text: `Você é um especialista em escrita de currículos e tech recruiter. 
        Sua tarefa é melhorar o seguinte texto para torná-lo mais profissional, impactante e focado em resultados.
        
        Contexto: ${context}
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

  const improvedText = response.text;
  if (!improvedText) {
    throw new Error("A IA não conseguiu processar o texto.");
  }

  return improvedText.trim();
};

/**
 * Sugere habilidades baseadas na experiência
 */
export const suggestSkillsWithAI = async (experiences: any[]): Promise<string[]> => {
    if (!experiences || experiences.length === 0) {
        throw new Error("Adicione algumas experiências para receber sugestões de habilidades.");
    }

    // 1. Tentar via servidor (/api/gemini/editor)
    let unauthorized = false;
    try {
      const res = await fetch('/api/gemini/editor', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'suggest-skills', experiences })
      });
      if (res.status === 401) unauthorized = true;
      else if (res.ok) {
        const data = await res.json();
        if (data.skills) return data.skills;
      }
    } catch (e) {
      console.warn("Rota /api/gemini/editor indisponível, fallback client-side:", e);
    }
    if (unauthorized) throw new Error(SESSION_EXPIRED_MESSAGE);

    // Fallback Client-Side
    const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) {
        throw new Error("Chave de API não configurada.");
    }

    const ai = new GoogleGenAI({ apiKey });
    
    const expContext = experiences.map(e => `${e.role} na ${e.company}: ${e.description}`).join('\n');

    const response = await ai.models.generateContent({
        model: 'gemini-3.6-flash',
        contents: {
            parts: [
                { text: `Com base nas seguintes experiências profissionais, sugira uma lista de até 10 habilidades técnicas (hard skills) e comportamentais (soft skills) relevantes.
                
                Experiências:
                ${expContext}
                
                Retorne APENAS uma lista de strings separadas por vírgula.` }
            ]
        }
      });

    const text = response.text;
    if (!text) return [];

    return text.split(',').map(s => s.trim()).filter(s => s.length > 0);
};

