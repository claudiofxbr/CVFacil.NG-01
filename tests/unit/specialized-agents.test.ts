import { describe, it, expect } from 'vitest';
import { ResumeImportPreviewAnalysisAgent } from '../../services/aiPreviewAnalysisAgent';
import { ResumeDeployAndVerificationAgent } from '../../services/aiDeployAndVerificationAgent';
import { MasterProcessOrchestratorAgent } from '../../services/aiProcessOrchestratorAgent';

describe('Specialized Agents Suite (CVFacil.NG)', () => {
  describe('Agente 1: ResumeImportPreviewAnalysisAgent', () => {
    it('deve identificar templateId inválido e auto-curar para template padrão oficial', () => {
      const problematicResume = {
        fullName: "Claudio Freitas Xavier",
        templateId: "modern-slate", // Template antigo que quebrava o preview
        experiences: null, // Quebrava no .map
        skills: undefined
      };

      const diagnosis = ResumeImportPreviewAnalysisAgent.diagnose(problematicResume);
      expect(diagnosis.isReadyForPreview).toBe(false);
      expect(diagnosis.causes.some(c => c.code === 'UNSUPPORTED_TEMPLATE_ID')).toBe(true);
      expect(diagnosis.causes.some(c => c.code === 'MISSING_ARRAY_STRUCTURE')).toBe(true);

      // Valida autocura
      const healed = diagnosis.healedResume;
      expect(healed.templateId).toBe('original');
      expect(Array.isArray(healed.experiences)).toBe(true);
      expect(Array.isArray(healed.skills)).toBe(true);
    });

    it('deve diagnosticar currículo perfeito com score 100', () => {
      const perfectResume = {
        fullName: "Claudio Freitas Xavier",
        role: "Analista de Sistemas",
        templateId: "original",
        summary: "Profissional de TI",
        experiences: [{ id: '1', role: 'Diretor', company: 'xavier.net.br', period: '2020', description: 'Desc' }],
        education: [{ id: '1', degree: 'Devs', institution: 'Unyleya', year: '2026', type: 'Extensão' }],
        skills: [{ id: '1', name: 'Redes', level: 90 }],
        languages: [{ id: '1', name: 'Português', level: 'Fluente' }],
        hobbies: ['IA']
      };

      const diagnosis = ResumeImportPreviewAnalysisAgent.diagnose(perfectResume);
      expect(diagnosis.isReadyForPreview).toBe(true);
      expect(diagnosis.score).toBe(100);
      expect(diagnosis.causes.length).toBe(0);
    });
  });

  describe('Agente 2: ResumeDeployAndVerificationAgent', () => {
    it('deve auditar os 4 pilares com veredito ALL_GREEN', () => {
      const cycleReport = ResumeDeployAndVerificationAgent.runContinuousVerificationCycle(1);
      expect(cycleReport.overallStatus).toBe('ALL_GREEN');
      expect(cycleReport.pillars.code.status).toBe('SUCCESS');
      expect(cycleReport.pillars.neon.status).toBe('SUCCESS');
      expect(cycleReport.pillars.git.status).toBe('SUCCESS');
      expect(cycleReport.pillars.vps.status).toBe('SUCCESS');
    });
  });

  describe('Agente 3: MasterProcessOrchestratorAgent', () => {
    it('deve orquestrar todas as 4 fases e concluir com ZERO_DEFECT_COMPLETED', async () => {
      const report = await MasterProcessOrchestratorAgent.orchestrateAll();
      expect(report.isAllSystemsOperational).toBe(true);
      expect(report.verdict).toBe('ZERO_DEFECT_COMPLETED');
      expect(report.phases.length).toBe(4);
      expect(report.phases.every(p => p.status === 'COMPLETED')).toBe(true);
    });
  });
});
