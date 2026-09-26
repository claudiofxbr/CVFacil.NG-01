import { describe, it, expect } from 'vitest';
import { ResumeImportInspectorAgent } from '../../services/aiImportInspectorAgent';
import { ResumeImportAnalysisAgent } from '../../services/aiImportAnalysisAgent';
import { ResumeImportResolutionAgent } from '../../services/aiImportResolutionAgent';
import { ResumeImportProcessManagerAgent } from '../../services/aiImportProcessManagerAgent';

describe('Auditoria Completa de Fidelidade: Claudio Freitas Xavier - CVFacil.NG.pdf vs ERRO', () => {
  // Payload real extraído do documento de referência "Claudio Freitas Xavier - CVFacil.NG.pdf"
  const claudioRealCvPayload = {
    fullName: 'CLAUDIO FREITAS XAVIER',
    role: 'Analista de Sistemas / Suporte / IA',
    email: 'diretor@xavierbr.net',
    phone: '(71) 99113-7633',
    linkedin: 'https://www.linkedin.com/in/claudio-xavier-117816b6',
    portfolio: 'http://xavierbr.net',
    summary: 'Profissional com mais de 18 anos de sólida experiência em Tecnologia da Informação, especializado em desenvolvimento e suporte a CPD, implementação e gestão de redes e sistemas em ambientes corporativos. Atualmente atua como Diretor Presidente de empresa de soluções em TI.',
    experiences: [
      {
        role: 'Diretor Presidente',
        company: 'xavier.net.br',
        period: '11/2020 - Atual',
        description: 'xavier.net.br – Salvador, Bahia Gestor de Projetos de TI e Novos Negócios...'
      },
      {
        role: 'Programador de Sistemas',
        company: 'Fundação Bahiana para desenvolvimento das ciências',
        period: '05/1993 - 05/2011',
        description: 'Responsável pelos anteprojetos, projetos e implementação de redes Windows Server 2008 R2...'
      }
    ],
    education: [
      {
        degree: 'Pós-graduação em Inteligência Artificial para Devs.',
        institution: 'Faculdade Unyleya',
        year: '04/2026 - 12/2026',
        type: 'Extensão'
      },
      {
        degree: 'CTS em Análise e Desenvolvimento de Sistemas',
        institution: 'POLO UNOPAR BELÉM - I - FAMAC - PA',
        year: '08/2016 - 06/2020',
        type: 'Bacharelado'
      }
    ],
    skills: [
      { name: 'ADMINISTRAÇÃO DE REDES WINDOWS E LINUX', level: 90 },
      { name: 'IMPLANTAÇÃO E GERENCIAMENTO DE PROJETOS TI', level: 82 },
      { name: 'GESTÃO DE CONTRATOS E RELACIONAMENTO COM CLIENTES', level: 80 },
      { name: 'MANUTENÇÃO DE REDES E PERIFÉRICOS', level: 80 },
      { name: 'DESENVOLVIMENTO E IMPLEMENTAÇÃO DE SISTEMAS AUTOMATIZADOS', level: 80 },
      { name: 'CONFIGURAÇÃO E GERENCIAMENTO DE SERVIDORES HP PROLIANT', level: 80 },
      { name: 'DESENVOLVIMENTO COM BORLAND DELPHI', level: 75 },
      { name: 'PROSPECÇÃO COMERCIAL', level: 75 },
      { name: 'PROGRAMAÇÃO DE BANCO DE DADOS', level: 75 },
      { name: 'SEGURANÇA DE REDES E FIREWALL', level: 75 },
      { name: 'ANALISTA INTELIGÊNCIA ARTIFICIAL - PÓS-GRADUAÇÃO', level: 80 }
    ],
    languages: [
      { name: 'Português', level: 'Fluente / Nativo' },
      { name: 'Inglês', level: 'Avançado' },
      { name: 'Espanhol', level: 'Básico' }
    ],
    hobbies: ['Inteligência Artificial', 'estudar para adquirir conhecimento', 'Musculação', 'Praias', 'Viagens']
  };

  it('1. Agente de Análise deve identificar causas raízes se houver vazamento de template de erro', () => {
    const errorPayload = {
      fullName: 'CLAUDIO FREITAS XAVIER',
      role: 'Senior UX/UI Designer & Product Strategist',
      email: 'claudio.xavier@gmail.com',
      linkedin: 'linkedin/mariafernandes',
      experiences: [
        { role: 'UX/UI Designer Sênior', company: 'Tech Solutions Inc.' }
      ]
    };

    const diagnosis = ResumeImportAnalysisAgent.performForensicAnalysis(errorPayload);
    expect(diagnosis.isResolved).toBe(false);
    expect(diagnosis.identifiedCauses.some(c => c.category === 'DATA_LEAK')).toBe(true);
    expect(diagnosis.identifiedCauses.some(c => c.category === 'PROMPT')).toBe(true);
  });

  it('2. Agente de Análise deve aprovar 100% o currículo real de Claudio Freitas Xavier', () => {
    const diagnosis = ResumeImportAnalysisAgent.performForensicAnalysis(claudioRealCvPayload);
    expect(diagnosis.isResolved).toBe(true);
    expect(diagnosis.integrityScore).toBe(100);
  });

  it('3. Agente de Resolução Rápida deve estruturar com fidelidade literal e compatibilidade Neon', () => {
    const resolved = ResumeImportResolutionAgent.resolveAndEnforceFidelity(
      claudioRealCvPayload,
      'user-claudio-123',
      'https://avatar.url/claudio.jpg'
    );

    expect(resolved.fullName).toBe('CLAUDIO FREITAS XAVIER');
    expect(resolved.role).toBe('Analista de Sistemas / Suporte / IA');
    expect(resolved.email).toBe('diretor@xavierbr.net');
    expect(resolved.phone).toBe('(71) 99113-7633');
    expect(resolved.portfolio).toBe('http://xavierbr.net');
    expect(resolved.experiences.length).toBe(2);
    expect(resolved.experiences[0].company).toBe('xavier.net.br');
    expect(resolved.skills.length).toBe(11);
    expect(resolved.languages.length).toBe(3);
    expect(resolved.hobbies?.length).toBe(5);
  });

  it('4. Agente de Gestão do Processo deve aprovar os 6 pilares e autorizar deploy', () => {
    const auditResult = ResumeImportProcessManagerAgent.executePipelineAudit(
      claudioRealCvPayload,
      'user-claudio-123'
    );

    expect(auditResult.status.isComplete).toBe(true);
    expect(auditResult.status.canDeploy).toBe(true);
    expect(auditResult.status.steps.length).toBe(6);
    expect(auditResult.status.steps.every(s => s.status === 'PASSED')).toBe(true);
  });
});
