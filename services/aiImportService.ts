import { GoogleGenAI, Type } from "@google/genai";
import { ResumeData } from "../types";
import { generateUUID } from "./resumeService";
import * as pdfjsLib from 'pdfjs-dist';

// Configurar o worker do PDF.js
// Usamos a versão do unpkg que é mais confiável para arquivos específicos de pacotes npm
// Adicionamos o protocolo https explicitamente para evitar problemas de carregamento
const PDFJS_VERSION = '5.5.207';
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${PDFJS_VERSION}/build/pdf.worker.min.mjs`;

// Interface para o retorno da IA
interface AIResumeData {
  fullName: string;
  role: string;
  email: string;
  phone: string;
  linkedin: string;
  portfolio: string;
  summary: string;
  experiences: {
    role: string;
    company: string;
    period: string;
    description: string;
  }[];
  education: {
    degree: string;
    institution: string;
    year: string;
    type: string;
  }[];
  skills: {
    name: string;
    level: number;
  }[];
  languages: {
    name: string;
    level: string;
  }[];
  hobbies: string[];
}

/**
 * Serviço robusto para importação de currículos via IA (Gemini 3 Flash)
 */
export const importResumeFromPdf = async (
  file: File,
  userId: string,
  defaultAvatar: string
): Promise<ResumeData> => {
  // 1. Validar PDF e obter metadados básicos usando pdfjs-dist
  try {
    const arrayBuffer = await file.arrayBuffer();
    
    // Configurar timeout para o carregamento do PDF
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error("TIMEOUT_PDF")), 15000)
    );
    
    const pdf = await Promise.race([loadingTask.promise, timeoutPromise]) as any;
    console.log(`PDF validado: ${pdf.numPages} páginas encontradas.`);
    
    if (pdf.numPages === 0) {
      throw new Error("O arquivo PDF parece estar vazio.");
    }
  } catch (error: any) {
    console.error("Erro ao validar PDF com pdfjs-dist:", error);
    
    if (error.message === "TIMEOUT_PDF") {
      throw new Error("O motor de processamento de PDF demorou muito para responder. Tente um arquivo menor ou verifique sua conexão.");
    }
    
    // Se o erro for relacionado ao worker, tentamos uma mensagem mais específica
    if (error.message?.includes("worker") || error.message?.includes("fetch")) {
      throw new Error("Erro ao inicializar o motor de PDF. Por favor, verifique sua conexão ou tente novamente.");
    }
    
    throw new Error("O arquivo fornecido não é um PDF válido ou está corrompido.");
  }

  // 2. Converter arquivo para Base64 para a IA
  const base64Data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = error => reject(error);
  });

  // 3. Obter Chave de API
  const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
  
  if (!apiKey) {
    throw new Error("Chave de API não encontrada. Por favor, verifique se a variável NEXT_PUBLIC_GEMINI_API_KEY está configurada no seu painel da Hostinger.");
  }

  // 4. Inicializar Gemini
  const ai = new GoogleGenAI({ apiKey });
  
  // 5. Definir Schema de Resposta
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

  // 5. Chamar a IA com timeout e retry
  let retries = 0;
  const MAX_RETRIES = 2;
  let response: any;

  while (retries < MAX_RETRIES) {
    try {
      const aiPromise = ai.models.generateContent({
        model: 'gemini-3.1-pro-preview', 
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

      const aiTimeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error("TIMEOUT_AI")), 60000) // Timeout aumentado para 60s
      );

      response = await Promise.race([aiPromise, aiTimeoutPromise]) as any;
      break; // Sucesso
    } catch (error: any) {
      retries++;
      if (error.message === "TIMEOUT_AI" && retries < MAX_RETRIES) {
        console.warn(`Tentativa ${retries} falhou por timeout, tentando novamente...`);
        continue;
      }
      throw error;
    }
  }

  try {
    // 6. Processar Resposta
    const rawText = response.text;
    if (!rawText) {
      throw new Error("A IA não retornou nenhum conteúdo. Tente novamente.");
    }

    let parsedData: AIResumeData;
    try {
      parsedData = JSON.parse(rawText);
    } catch (e) {
      console.error("Erro ao parsear JSON da IA:", rawText);
      throw new Error("Falha ao processar os dados extraídos pela IA.");
    }

    // 7. Mapear para o formato ResumeData do App
    const newResume: ResumeData = {
      id: generateUUID(),
      userId: userId,
      templateId: 'original',
      themeMode: 'dark',
      lastUpdated: new Date().toISOString(),
      fullName: parsedData.fullName || "Novo Currículo",
      role: parsedData.role || "",
      email: parsedData.email || "",
      phone: parsedData.phone || "",
      linkedin: parsedData.linkedin || "",
      portfolio: parsedData.portfolio || "",
      summary: parsedData.summary || "",
      avatarUrl: defaultAvatar,
      experiences: (parsedData.experiences || []).map(exp => ({
        id: generateUUID(),
        role: exp.role || "",
        company: exp.company || "",
        period: exp.period || "",
        description: exp.description || ""
      })),
      education: (parsedData.education || []).map(edu => ({
        id: generateUUID(),
        degree: edu.degree || "",
        institution: edu.institution || "",
        year: edu.year || "",
        type: (edu.type as any) || "Bacharelado"
      })),
      skills: (parsedData.skills || []).map(skill => ({
        id: generateUUID(),
        name: skill.name || "",
        level: typeof skill.level === 'number' ? skill.level : 70
      })),
      languages: (parsedData.languages || []).map(lang => ({
        id: generateUUID(),
        name: lang.name || "",
        level: lang.level || "Básico"
      })),
      hobbies: parsedData.hobbies || [],
      isPinned: false
    };

    return newResume;
  } catch (error: any) {
    if (error.message === "TIMEOUT_AI") {
      throw new Error("A Inteligência Artificial demorou muito para responder. Tente novamente com um arquivo mais simples.");
    }
    throw error;
  }
};
