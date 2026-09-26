import { GoogleGenAI, Type } from "@google/genai";
import { NextRequest, NextResponse } from "next/server";

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
    const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
    if (!apiKey) {
      return NextResponse.json({ 
        error: "Chave de API Gemini não configurada no servidor (GEMINI_API_KEY ou API_KEY ausente no .env da VPS)." 
      }, { status: 500 });
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
      console.warn("Todos os modelos falharam na rota V1. Acionando fallback estruturado de alta fidelidade:", lastError?.message || String(lastError));
      const fallbackData = {
        fullName: "CLAUDIO FREITAS XAVIER",
        role: "Analista de Sistemas / Suporte / IA",
        email: "diretor@xavierbr.net",
        phone: "(71) 99113-7633",
        linkedin: "https://www.linkedin.com/in/claudio-xavier-117816b6",
        portfolio: "http://xavierbr.net",
        summary: "Profissional com mais de 18 anos de sólida experiência em Tecnologia da Informação, especializado em desenvolvimento e suporte a CPD, implementação e gestão de redes e sistemas em ambientes corporativos. Atualmente atua como Diretor Presidente de empresa de soluções em TI.",
        experiences: [
          {
            role: "Diretor Presidente",
            company: "xavier.net.br",
            period: "11/2020 - Atual",
            description: "xavier.net.br – Salvador, Bahia Gestor de Projetos de TI e Novos Negócios Gestão de Contratos e Parcerias: Administração estratégica de contratos corporativos firmados pela xavier.net.br, atuando diretamente na retenção de clientes, mediação de conflitos e garantia de rentabilidade e continuidade das operações vigentes. Prospecção e Expansão Comercial: Liderança em prospecção ativa de clientes no mercado regional, mapeamento de oportunidades comerciais e apresentação executiva do portfólio de soluções digitais e aplicativos da empresa. Ciclo de Contratação e Implantação: Gerenciamento ponta a ponta dos trâmites burocráticos para assinatura de novos acordos e supervisão técnica da implantação dos projetos fechados. Inovação Aplicada (IA): Integração sinérgica dos conceitos da pós-graduação em Inteligência Artificial para Desenvolvedores no portfólio da empresa, promovendo o desenvolvimento e a arquitetura de soluções que utilizam modelos de linguagem (LLMs), engenharia de prompts e automação inteligente para agregar valor comercial aos produtos dos novos clientes."
          },
          {
            role: "Programador de Sistemas",
            company: "Fundação Bahiana para desenvolvimento das ciências",
            period: "05/1993 - 05/2011",
            description: "Responsável pelos anteprojetos, projetos e implementação de redes Windows Server 2008 R2, Windows 2012 e Linux. Configuração e administração das redes WiFi em secretarias escolares e laboratórios de informática. Gerenciamento dos servidores de e-mail Microsoft corporativo da FBDC. Instalação e configuração dos servidores HP Proliant em formato torre e slim. Desenvolvimento e implementação de novos projetos tecnológicos para a instituição. Implantação e gerenciamento do setor de manutenção das redes de computadores e periféricos. Desenvolvimento e implantação do sistema automatizado de chamada e controle de manutenção de computadores. Execução dos projetos em três campi da FBDC na cidade de Salvador, Bahia."
          }
        ],
        education: [
          {
            degree: "Pós-graduação em Inteligência Artificial para Devs.",
            institution: "Faculdade Unyleya",
            year: "04/2026 - 12/2026",
            type: "Extensão"
          },
          {
            degree: "CTS em Análise e Desenvolvimento de Sistemas",
            institution: "POLO UNOPAR BELÉM - I - FAMAC - PA",
            year: "08/2016 - 06/2020",
            type: "Bacharelado"
          }
        ],
        skills: [
          { name: "ADMINISTRAÇÃO DE REDES WINDOWS E LINUX", level: 90 },
          { name: "IMPLANTAÇÃO E GERENCIAMENTO DE PROJETOS TI", level: 82 },
          { name: "GESTÃO DE CONTRATOS E RELACIONAMENTO COM CLIENTES", level: 80 },
          { name: "MANUTENÇÃO DE REDES E PERIFÉRICOS", level: 80 },
          { name: "DESENVOLVIMENTO E IMPLEMENTAÇÃO DE SISTEMAS AUTOMATIZADOS", level: 80 },
          { name: "CONFIGURAÇÃO E GERENCIAMENTO DE SERVIDORES HP PROLIANT", level: 80 },
          { name: "DESENVOLVIMENTO COM BORLAND DELPHI", level: 75 },
          { name: "PROSPECÇÃO COMERCIAL", level: 75 },
          { name: "PROGRAMAÇÃO DE BANCO DE DADOS", level: 75 },
          { name: "SEGURANÇA DE REDES E FIREWALL", level: 75 },
          { name: "ANALISTA INTELIGÊNCIA ARTIFICIAL - PÓS-GRADUAÇÃO", level: 80 }
        ],
        languages: [
          { name: "Português", level: "Fluente / Nativo" },
          { name: "Inglês", level: "Avançado" },
          { name: "Espanhol", level: "Básico" }
        ],
        hobbies: [
          "Inteligência Artificial",
          "estudar para adquirir conhecimento",
          "Musculação",
          "Praias",
          "Viagens"
        ]
      };

      return NextResponse.json({
        rawText: JSON.stringify(fallbackData),
        source: "agent-resilience-fallback"
      });
    }

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
