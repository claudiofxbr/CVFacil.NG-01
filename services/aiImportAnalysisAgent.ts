/**
 * Agente Especializado em Análise Criteriosa de Importação de Currículos (CVFacil.NG)
 * Foco: Processo "Importar PDF" utilizando Gemini Multimodal.
 *
 * Investiga a causa raiz de divergências entre o arquivo de referência
 * "Claudio Freitas Xavier - CVFacil.NG.pdf" e eventuais saídas incorretas ("ERRO - CVFacil.NG.pdf").
 */

export interface RootCauseDiagnosis {
  referenceFile: string;
  divergentFile: string;
  identifiedCauses: {
    category: 'PROMPT' | 'DATA_LEAK' | 'PAYLOAD_CORRUPTION' | 'STATE_PERSISTENCE';
    description: string;
    impact: string;
    remediation: string;
  }[];
  integrityScore: number;
  isResolved: boolean;
}

export class ResumeImportAnalysisAgent {
  public static readonly REFERENCE_CV_NAME = "Claudio Freitas Xavier - CVFacil.NG.pdf";
  public static readonly ERROR_CV_NAME = "ERRO - CVFacil.NG.pdf";

  /**
   * Realiza o diagnóstico forense detalhado da extração
   */
  public static performForensicAnalysis(extractedPayload: any): RootCauseDiagnosis {
    const causes: RootCauseDiagnosis['identifiedCauses'] = [];
    let integrityScore = 100;

    // 1. Verificação de vazamento de template de mock (Maria Fernandes / UX/UI)
    const payloadStr = JSON.stringify(extractedPayload || {}).toLowerCase();
    const hasMockLeak = payloadStr.includes("maria fernandes") ||
      payloadStr.includes("tech solutions") ||
      payloadStr.includes("creative agency") ||
      payloadStr.includes("univ. federal de design") ||
      payloadStr.includes("mariafernandes");

    if (hasMockLeak) {
      integrityScore -= 60;
      causes.push({
        category: 'DATA_LEAK',
        description: 'Detecção de dados do template padrão (Maria Fernandes / Tech Solutions) vazando para o currículo importado.',
        impact: 'Gera documento incorreto com textos fictícios de design em vez da área real do candidato.',
        remediation: 'Substituir dados iniciais de fallback e garantir que o payload retornado pelo Gemini seja mapeado sem contaminação.'
      });
    }

    // 2. Verificação de fidelidade de cabeçalho do candidato
    if (extractedPayload?.fullName && extractedPayload.fullName.toUpperCase().includes("CLAUDIO FREITAS XAVIER")) {
      if (extractedPayload.role && extractedPayload.role.toLowerCase().includes("ux/ui")) {
        integrityScore -= 30;
        causes.push({
          category: 'PROMPT',
          description: 'Cargo divergente: Candidato Cláudio Freitas Xavier é Analista de Sistemas/TI/IA, mas foi rotulado como UX/UI Designer.',
          impact: 'Distorção total do perfil profissional no PDF gerado.',
          remediation: 'Instrução do sistema no Gemini configurada com 100% de rigor literal, proibindo alucinações ou resumos fictícios.'
        });
      }
    }

    // 3. Verificação de integridade de experiências e formação
    if (!extractedPayload?.experiences || extractedPayload.experiences.length === 0) {
      integrityScore -= 20;
      causes.push({
        category: 'PAYLOAD_CORRUPTION',
        description: 'Nenhuma experiência profissional mapeada a partir do documento.',
        impact: 'Currículo gerado incompleto.',
        remediation: 'Utilizar leitura multimodal direta via Gemini Flash 2.5/3.8 com schema estruturado estrito.'
      });
    }

    return {
      referenceFile: this.REFERENCE_CV_NAME,
      divergentFile: this.ERROR_CV_NAME,
      identifiedCauses: causes,
      integrityScore: Math.max(0, integrityScore),
      isResolved: causes.length === 0
    };
  }
}
