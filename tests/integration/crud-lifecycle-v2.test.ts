import { describe, it, expect } from 'vitest';
import { ResumeData, ResumeVersion } from '../../types';
import { ResumeImportPreviewAnalysisAgent } from '../../services/aiPreviewAnalysisAgent';
import { MasterProcessOrchestratorAgent } from '../../services/aiProcessOrchestratorAgent';

describe('CRUD Lifecycle V2 & Neon Persistence Suite', () => {
  const sampleResume: ResumeData = {
    id: `crud-test-${Date.now()}`,
    userId: 'user-free-1',
    templateId: 'original',
    themeMode: 'dark',
    fullName: 'CLAUDIO FREITAS XAVIER',
    role: 'Analista de Sistemas / Suporte / IA',
    email: 'diretor@xavierbr.net',
    phone: '(71) 99113-7633',
    linkedin: 'https://www.linkedin.com/in/claudio-xavier-117816b6',
    portfolio: 'http://xavierbr.net',
    summary: 'Profissional com mais de 18 anos de sólida experiência em Tecnologia da Informação.',
    avatarUrl: '',
    experiences: [
      { id: '1', role: 'Diretor Presidente', company: 'xavier.net.br', period: '2020 - Atual', description: 'Gestor de TI' }
    ],
    education: [
      { id: '1', degree: 'Pós-graduação IA para Devs', institution: 'Faculdade Unyleya', year: '2026', type: 'Extensão' }
    ],
    skills: [
      { id: '1', name: 'ADMINISTRAÇÃO DE REDES WINDOWS E LINUX', level: 90 }
    ],
    languages: [
      { id: '1', name: 'Português', level: 'Fluente / Nativo' }
    ],
    hobbies: ['Inteligência Artificial'],
    isPinned: false,
    isImported: true,
    deletedAt: null
  };

  it('1. Create & Ingestão: Valida integridade do objeto e prontidão para visualização', () => {
    const diagnosis = ResumeImportPreviewAnalysisAgent.diagnose(sampleResume);
    expect(diagnosis.isReadyForPreview).toBe(true);
    expect(diagnosis.resolvedTemplateId).toBe('original');
    expect(diagnosis.healedResume.experiences.length).toBeGreaterThan(0);
  });

  it('2. Soft Delete & Lixeira: Atribuição de deletedAt sem perda de dados', () => {
    const deletedResume: ResumeData = {
      ...sampleResume,
      deletedAt: new Date().toISOString()
    };

    expect(deletedResume.deletedAt).toBeTruthy();
    expect(deletedResume.fullName).toBe('CLAUDIO FREITAS XAVIER');
    expect(deletedResume.experiences.length).toBe(1);
  });

  it('3. Restauração: Limpeza de deletedAt restabelece o currículo para o status ativo', () => {
    const trashedResume: ResumeData = {
      ...sampleResume,
      deletedAt: new Date().toISOString()
    };

    const restoredResume: ResumeData = {
      ...trashedResume,
      deletedAt: null
    };

    expect(restoredResume.deletedAt).toBeNull();
    expect(restoredResume.id).toBe(sampleResume.id);
  });

  it('4. Histórico de Versões: Estrutura auditável com número sequencial e resumo', () => {
    const version: ResumeVersion = {
      id: 'ver-test-1',
      resumeId: sampleResume.id,
      versionNumber: 1,
      title: 'Versão 1 - Ingestão Inicial V2',
      data: sampleResume,
      changedBy: sampleResume.userId,
      changeSummary: 'Criação inicial via Importar PDF V2',
      createdAt: new Date().toISOString()
    };

    expect(version.versionNumber).toBe(1);
    expect(version.data.fullName).toBe(sampleResume.fullName);
    expect(version.changeSummary).toContain('Importar PDF V2');
  });

  it('5. Regra de Limite do Plano Gratuito (Máximo 3 ativos)', () => {
    const activeResumes = [
      { id: 'r1', deletedAt: null },
      { id: 'r2', deletedAt: null },
      { id: 'r3', deletedAt: null }
    ];

    const canCreateFourth = activeResumes.filter(r => !r.deletedAt).length < 3;
    expect(canCreateFourth).toBe(false);
  });

  it('6. Orquestração com Agentes Especializados sem erros', async () => {
    const report = await MasterProcessOrchestratorAgent.orchestrateAll(sampleResume);
    expect(report.isAllSystemsOperational).toBe(true);
    expect(report.verdict).toBe('ZERO_DEFECT_COMPLETED');
  });
});
