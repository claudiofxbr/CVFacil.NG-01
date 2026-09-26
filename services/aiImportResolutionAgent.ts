/**
 * Agente Especialista em Soluções Rápidas, Seguras e Correções de Importação (CVFacil.NG)
 * Responsável por:
 * 1. Reparar imediatamente discrepâncias de importação
 * 2. Assegurar conformidade absoluta com o schema ResumeData
 * 3. Garantir compatibilidade nativa com o banco de dados Neon PostgreSQL
 * 4. Impedir contaminações de dados legados ou mock
 */

import { ResumeData, Experience, Education, Skill, Language } from '../types';

export class ResumeImportResolutionAgent {
  /**
   * Corrige e garante que os dados extraídos pelo Gemini correspondam com precisão
   * milimétrica ao perfil do candidato, sem admitir dados de template legado.
   */
  public static resolveAndEnforceFidelity(
    rawCandidate: any,
    userId: string,
    avatarUrl?: string
  ): ResumeData {
    // Limpeza de texto contra scripts e caracteres de controle
    const sanitize = (val: any, fallback = ''): string => {
      if (typeof val !== 'string' || !val.trim()) return fallback;
      return val
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/javascript:/gi, '')
        .trim();
    };

    // Mapeamento de experiências com IDs únicos e preservação de descrições completas
    const resolvedExperiences: Experience[] = Array.isArray(rawCandidate?.experiences)
      ? rawCandidate.experiences.map((exp: any, idx: number) => ({
          id: `res-exp-${Date.now()}-${idx}`,
          role: sanitize(exp.role, 'Cargo'),
          company: sanitize(exp.company, 'Empresa'),
          period: sanitize(exp.period, 'Período'),
          description: sanitize(exp.description, '')
        }))
      : [];

    // Mapeamento de formação acadêmica
    const resolvedEducation: Education[] = Array.isArray(rawCandidate?.education)
      ? rawCandidate.education.map((edu: any, idx: number) => ({
          id: `res-edu-${Date.now()}-${idx}`,
          degree: sanitize(edu.degree, 'Curso'),
          institution: sanitize(edu.institution, 'Instituição'),
          year: sanitize(edu.year, ''),
          type: (edu.type || 'Bacharelado') as any
        }))
      : [];

    // Mapeamento de habilidades com clamping de nível 0-100
    const resolvedSkills: Skill[] = Array.isArray(rawCandidate?.skills)
      ? rawCandidate.skills.map((sk: any, idx: number) => {
          const name = typeof sk === 'string' ? sk : sk?.name;
          const rawLvl = typeof sk === 'object' && sk?.level ? Number(sk.level) : 80;
          const level = Math.max(10, Math.min(100, isNaN(rawLvl) ? 80 : rawLvl));
          return {
            id: `res-skill-${Date.now()}-${idx}`,
            name: sanitize(name, 'Habilidade'),
            level
          };
        })
      : [];

    // Mapeamento de idiomas
    const resolvedLanguages: Language[] = Array.isArray(rawCandidate?.languages)
      ? rawCandidate.languages.map((lg: any, idx: number) => ({
          id: `res-lang-${Date.now()}-${idx}`,
          name: sanitize(typeof lg === 'string' ? lg : lg?.name, 'Idioma'),
          level: sanitize(typeof lg === 'object' && lg?.level ? lg.level : 'Básico', 'Básico')
        }))
      : [];

    // Mapeamento de hobbies
    const resolvedHobbies: string[] = Array.isArray(rawCandidate?.hobbies)
      ? rawCandidate.hobbies.map((h: any) => sanitize(h)).filter(Boolean)
      : [];

    return {
      id: `resolved-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      userId: userId || 'visitante',
      templateId: 'original',
      themeMode: 'dark',
      fullName: sanitize(rawCandidate?.fullName, 'Candidato'),
      role: sanitize(rawCandidate?.role, 'Profissional de TI'),
      email: sanitize(rawCandidate?.email, ''),
      phone: sanitize(rawCandidate?.phone, ''),
      linkedin: sanitize(rawCandidate?.linkedin, ''),
      portfolio: sanitize(rawCandidate?.portfolio, ''),
      summary: sanitize(rawCandidate?.summary, ''),
      avatarUrl: avatarUrl || rawCandidate?.avatarUrl || '',
      experiences: resolvedExperiences,
      education: resolvedEducation,
      skills: resolvedSkills,
      languages: resolvedLanguages,
      hobbies: resolvedHobbies,
      isPinned: false,
      lastUpdated: new Date().toLocaleDateString('pt-BR')
    };
  }

  /**
   * Retorna os dados oficiais e autoritativos de Claudio Freitas Xavier
   * com fidelidade integral para testes e benchmarks
   */
  public static getAuthoritativeClaudioResume(): ResumeData {
    return {
      id: "claudio-authoritative",
      userId: "claudio-user",
      templateId: "original",
      themeMode: "dark",
      fullName: "CLAUDIO FREITAS XAVIER",
      role: "Analista de Sistemas / Suporte / IA",
      email: "diretor@xavierbr.net",
      phone: "(71) 99113-7633",
      linkedin: "https://www.linkedin.com/in/claudio-xavier-117816b6",
      portfolio: "http://xavierbr.net",
      summary: "Profissional com mais de 18 anos de sólida experiência em Tecnologia da Informação, especializado em desenvolvimento e suporte a CPD, implementação e gestão de redes e sistemas em ambientes corporativos. Atualmente atua como Diretor Presidente de empresa de soluções em TI.",
      avatarUrl: "",
      experiences: [
        {
          id: "exp-1",
          role: "Diretor Presidente",
          company: "xavier.net.br",
          period: "11/2020 - Atual",
          description: "xavier.net.br – Salvador, Bahia Gestor de Projetos de TI e Novos Negócios"
        },
        {
          id: "exp-2",
          role: "Programador de Sistemas",
          company: "Fundação Bahiana para desenvolvimento das ciências",
          period: "05/1993 - 05/2011",
          description: "Responsável pelos anteprojetos, projetos e implementação de redes Windows Server."
        }
      ],
      education: [
        {
          id: "edu-1",
          degree: "Pós-graduação em Inteligência Artificial para Devs.",
          institution: "Faculdade Unyleya",
          year: "04/2026 - 12/2026",
          type: "Extensão"
        },
        {
          id: "edu-2",
          degree: "CTS em Análise e Desenvolvimento de Sistemas",
          institution: "POLO UNOPAR BELÉM - I - FAMAC - PA",
          year: "08/2016 - 06/2020",
          type: "Bacharelado"
        }
      ],
      skills: [
        { id: "sk-1", name: "ADMINISTRAÇÃO DE REDES WINDOWS E LINUX", level: 90 },
        { id: "sk-2", name: "IMPLANTAÇÃO E GERENCIAMENTO DE PROJETOS TI", level: 82 },
        { id: "sk-3", name: "GESTÃO DE CONTRATOS E RELACIONAMENTO COM CLIENTES", level: 80 },
        { id: "sk-4", name: "MANUTENÇÃO DE REDES E PERIFÉRICOS", level: 80 },
        { id: "sk-5", name: "DESENVOLVIMENTO E IMPLEMENTAÇÃO DE SISTEMAS AUTOMATIZADOS", level: 80 },
        { id: "sk-6", name: "CONFIGURAÇÃO E GERENCIAMENTO DE SERVIDORES HP PROLIANT", level: 80 },
        { id: "sk-7", name: "DESENVOLVIMENTO COM BORLAND DELPHI", level: 75 },
        { id: "sk-8", name: "PROSPECÇÃO COMERCIAL", level: 75 },
        { id: "sk-9", name: "PROGRAMAÇÃO DE BANCO DE DADOS", level: 75 },
        { id: "sk-10", name: "SEGURANÇA DE REDES E FIREWALL", level: 75 },
        { id: "sk-11", name: "ANALISTA INTELIGÊNCIA ARTIFICIAL - PÓS-GRADUAÇÃO", level: 80 }
      ],
      languages: [
        { id: "lang-1", name: "Português", level: "Fluente / Nativo" },
        { id: "lang-2", name: "Inglês", level: "Avançado" },
        { id: "lang-3", name: "Espanhol", level: "Básico" }
      ],
      hobbies: [
        "Inteligência Artificial",
        "estudar para adquirir conhecimento",
        "Musculação",
        "Praias",
        "Viagens"
      ],
      isPinned: false,
      lastUpdated: new Date().toISOString()
    };
  }
}
