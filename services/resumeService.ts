import { ResumeData, TemplateOption } from '../types';

// Função auxiliar para gerar IDs únicos de forma segura (funciona em HTTP e HTTPS)
export const generateUUID = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    try {
        return crypto.randomUUID();
    } catch (e) {
        // Fallback silencioso
    }
  }
  return Date.now().toString(36) + Math.random().toString(36).substring(2);
};

// Utilitário de Compressão de Imagem Centralizado
// Evita o erro de QuotaExceededError do localStorage reduzindo o tamanho da imagem
export const compressImage = (file: File, maxWidth: number = 400): Promise<string> => {
    return new Promise((resolve, reject) => {
      // Timeout de segurança para evitar promessas travadas indefinidamente
      const timer = setTimeout(() => {
        reject(new Error("Tempo limite excedido ao processar a imagem."));
      }, 10000);

      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const rawDataUrl = event.target?.result as string;
        if (!rawDataUrl) {
          clearTimeout(timer);
          reject(new Error("Falha ao ler o arquivo de imagem."));
          return;
        }

        const img = new Image();
        img.src = rawDataUrl;
        img.onload = () => {
          clearTimeout(timer);
          try {
            if (!img.width || !img.height) {
              // Se dimensões forem inválidas, devolve a imagem lida diretamente
              resolve(rawDataUrl);
              return;
            }

            const canvas = document.createElement('canvas');
            const scaleSize = maxWidth / img.width;
            
            // Se a imagem for menor que o limite, usa o tamanho original
            if (scaleSize >= 1) {
               canvas.width = img.width;
               canvas.height = img.height;
            } else {
               canvas.width = maxWidth;
               canvas.height = Math.round(img.height * scaleSize);
            }

            const ctx = canvas.getContext('2d');
            if (!ctx) {
               resolve(rawDataUrl);
               return;
            }
            
            // Preencher fundo com branco para evitar fundo preto em PNGs transparentes
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            
            // Converte para JPEG com 75% de qualidade para otimizar armazenamento
            const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.75);
            resolve(compressedDataUrl);
          } catch (e) {
            // Em caso de falha do canvas, utiliza o dataUrl direto com segurança
            console.warn("Fallback para imagem original devido a erro no canvas:", e);
            resolve(rawDataUrl);
          }
        };
        img.onerror = (err) => {
          clearTimeout(timer);
          console.error("Erro no carregamento da imagem:", err);
          // Fallback se o navegador falhar no decode do canvas
          resolve(rawDataUrl);
        };
      };
      reader.onerror = (err) => {
        clearTimeout(timer);
        reject(err);
      };
    });
};

export const templates: TemplateOption[] = [
  { id: 'original', name: 'Original Forest', color: '#d97706', description: 'Estilo padrão com tons terrosos.' },
  { id: 'blue', name: 'Corporate Blue', color: '#2563eb', description: 'Profissional e confiável.' },
  { id: 'red', name: 'Bold Red', color: '#dc2626', description: 'Para quem quer destaque imediato.' },
  { id: 'green', name: 'Eco Green', color: '#059669', description: 'Fresco e equilibrado.' },
  { id: 'purple', name: 'Royal Purple', color: '#7c3aed', description: 'Elegante e criativo.' },
  { id: 'black', name: 'Mono Black', color: '#171717', description: 'Alto contraste e seriedade.' },
  { id: 'magenta', name: 'Vivid Magenta', color: '#db2777', description: 'Moderno e artístico.' },
  { id: 'violet', name: 'Deep Violet', color: '#5b21b6', description: 'Sofisticado e misterioso.' },
  { id: 'gray', name: 'Minimal Gray', color: '#57534e', description: 'Limpo e minimalista.' },
  { id: 'lilac', name: 'Soft Lilac', color: '#c084fc', description: 'Suave e moderno.' },
];

export const initialResumeData: ResumeData = {
  id: 'default-init',
  userId: 'default-user',
  templateId: 'original',
  themeMode: 'dark', // Padrão Escuro
  lastUpdated: new Date().toISOString(),
  isPinned: false,
  fullName: "CLAUDIO FREITAS XAVIER",
  role: "Analista de Sistemas / Suporte / IA",
  email: "diretor@xavierbr.net",
  phone: "(71) 99113-7633",
  linkedin: "https://www.linkedin.com/in/claudio-xavier-117816b6",
  portfolio: "http://xavierbr.net",
  summary: "Profissional com mais de 18 anos de sólida experiência em Tecnologia da Informação, especializado em desenvolvimento e suporte a CPD, implementação e gestão de redes e sistemas em ambientes corporativos. Atualmente atua como Diretor Presidente de empresa de soluções em TI.",
  avatarUrl: "https://lh3.googleusercontent.com/aida-public/AB6AXuBKfd51M6l8RpIQ_jTNw4Id5iOQ4vFkIleM5-ZmYk_pFKjgVZIpKcrSmIL95hwsOwAuCYNwSakYFmOtdUm4J2ikNQCW2kPSOg31LbvXUjn3Oqk-y19GujNITmAgNo0MfuoU0Jtk0KX7g9VR02z_5_M1bQ7M77DwZJsqG6DdHggZuJvcIkoJEuCaKL-ucHhT38o-byQPcrC81timsrnGB1WEK1wJe-HdoJusyqVPpS8k8k9XlzwyX3I_epHxVqT7BSAOZuK-ghfPgsO2",
  experiences: [
    {
      id: "1",
      role: "Diretor Presidente",
      company: "xavier.net.br",
      period: "11/2020 - Atual",
      description: "xavier.net.br – Salvador, Bahia Gestor de Projetos de TI e Novos Negócios Gestão de Contratos e Parcerias: Administração estratégica de contratos corporativos firmados pela xavier.net.br, atuando diretamente na retenção de clientes, mediação de conflitos e garantia de rentabilidade e continuidade das operações vigentes. Prospecção e Expansão Comercial: Liderança em prospecção ativa de clientes no mercado regional, mapeamento de oportunidades comerciais e apresentação executiva do portfólio de soluções digitais e aplicativos da empresa. Ciclo de Contratação e Implantação: Gerenciamento ponta a ponta dos trâmites burocráticos para assinatura de novos acordos e supervisão técnica da implantação dos projetos fechados. Inovação Aplicada (IA): Integração sinérgica dos conceitos da pós-graduação em Inteligência Artificial para Desenvolvedores no portfólio da empresa, promovendo o desenvolvimento e a arquitetura de soluções que utilizam modelos de linguagem (LLMs), engenharia de prompts e automação inteligente para agregar valor comercial aos produtos dos novos clientes."
    },
    {
      id: "2",
      role: "Programador de Sistemas",
      company: "Fundação Bahiana para desenvolvimento das ciências",
      period: "05/1993 - 05/2011",
      description: "Responsável pelos anteprojetos, projetos e implementação de redes Windows Server 2008 R2, Windows 2012 e Linux. Configuração e administração das redes WiFi em secretarias escolares e laboratórios de informática. Gerenciamento dos servidores de e-mail Microsoft corporativo da FBDC. Instalação e configuração dos servidores HP Proliant em formato torre e slim. Desenvolvimento e implementação de novos projetos tecnológicos para a instituição. Implantação e gerenciamento do setor de manutenção das redes de computadores e periféricos. Desenvolvimento e implantação do sistema automatizado de chamada e controle de manutenção de computadores. Execução dos projetos em três campi da FBDC na cidade de Salvador, Bahia."
    }
  ],
  education: [
    {
      id: "1",
      degree: "Pós-graduação em Inteligência Artificial para Devs.",
      institution: "Faculdade Unyleya",
      year: "04/2026 - 12/2026",
      type: "Extensão"
    },
    {
      id: "2",
      degree: "CTS em Análise e Desenvolvimento de Sistemas",
      institution: "POLO UNOPAR BELÉM - I - FAMAC - PA",
      year: "08/2016 - 06/2020",
      type: "Bacharelado"
    }
  ],
  skills: [
    { id: "1", name: "ADMINISTRAÇÃO DE REDES WINDOWS E LINUX", level: 90 },
    { id: "2", name: "IMPLANTAÇÃO E GERENCIAMENTO DE PROJETOS TI", level: 82 },
    { id: "3", name: "GESTÃO DE CONTRATOS E RELACIONAMENTO COM CLIENTES", level: 80 },
    { id: "4", name: "MANUTENÇÃO DE REDES E PERIFÉRICOS", level: 80 },
    { id: "5", name: "DESENVOLVIMENTO E IMPLEMENTAÇÃO DE SISTEMAS AUTOMATIZADOS", level: 80 },
    { id: "6", name: "CONFIGURAÇÃO E GERENCIAMENTO DE SERVIDORES HP PROLIANT", level: 80 },
    { id: "7", name: "DESENVOLVIMENTO COM BORLAND DELPHI", level: 75 },
    { id: "8", name: "PROSPECÇÃO COMERCIAL", level: 75 },
    { id: "9", name: "PROGRAMAÇÃO DE BANCO DE DADOS", level: 75 },
    { id: "10", name: "SEGURANÇA DE REDES E FIREWALL", level: 75 },
    { id: "11", name: "ANALISTA INTELIGÊNCIA ARTIFICIAL - PÓS-GRADUAÇÃO", level: 80 }
  ],
  languages: [
    { id: "1", name: "Português", level: "Fluente / Nativo" },
    { id: "2", name: "Inglês", level: "Avançado" },
    { id: "3", name: "Espanhol", level: "Básico" }
  ],
  hobbies: [
    "Inteligência Artificial",
    "estudar para adquirir conhecimento",
    "Musculação",
    "Praias",
    "Viagens"
  ]
};