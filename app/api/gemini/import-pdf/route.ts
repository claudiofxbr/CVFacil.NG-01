import { GoogleGenAI, Type } from "@google/genai";
import { NextRequest, NextResponse } from "next/server";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

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
  try {
    const { base64Data } = await req.json();

    if (!base64Data) {
      return NextResponse.json({ error: "Dados em Base64 do PDF não fornecidos." }, { status: 400 });
    }

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: {
        parts: [
          { inlineData: { mimeType: 'application/pdf', data: base64Data } },
          { text: "Você é um especialista em recrutamento e seleção (Tech Recruiter). Analise cuidadosamente este currículo em PDF. Extraia todas as informações relevantes, mesmo que o layout seja complexo (ex: múltiplas colunas, tabelas). Converta os dados para o formato JSON estruturado seguindo rigorosamente o schema fornecido. Se uma informação não estiver presente, use valores vazios ou arrays vazios. Padronize as datas para um formato legível (ex: 'MM/AAAA' ou 'AAAA'). Se o resumo profissional estiver ausente, crie um resumo profissional impactante baseado nas experiências extraídas." }
        ]
      },
      config: {
        responseMimeType: 'application/json',
        responseSchema: resumeSchema
      }
    });

    const rawText = response.text;
    if (!rawText) {
      return NextResponse.json({ error: "A IA não retornou conteúdo." }, { status: 500 });
    }

    const parsedData = JSON.parse(rawText);
    return NextResponse.json({ data: parsedData });
  } catch (error: any) {
    console.error("Erro na rota /api/gemini/import-pdf:", error);
    return NextResponse.json({ error: error.message || "Erro ao processar PDF com a IA." }, { status: 500 });
  }
}
