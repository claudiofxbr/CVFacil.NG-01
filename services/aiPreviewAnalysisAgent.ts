import { ResumeData } from '../types';

/**
 * Agente Especializado em Análise e Diagnóstico de Falhas no Preview de Importação PDF V2
 * 
 * Missão: Identificar exatamente por que o preview do processo Importar PDF V2 falha,
 * diagnosticar causas raiz no payload, schema de templates, renderização React e persistência,
 * e fornecer autocura determinística com 100% de confiabilidade.
 */

export interface PreviewDiagnosticCause {
  code: 'UNSUPPORTED_TEMPLATE_ID' | 'STRINGIFIED_DATABASE_PAYLOAD' | 'MISSING_ARRAY_STRUCTURE' | 'NULL_FALLBACK_TERMINATION' | 'CSS_CONTAINER_CLIPPING' | 'LOCAL_STORAGE_DESYNC';
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM';
  description: string;
  detectedValue?: any;
  recommendation: string;
}

export interface PreviewDiagnosticReport {
  timestamp: string;
  isReadyForPreview: boolean;
  score: number; // 0 a 100
  causes: PreviewDiagnosticCause[];
  resolvedTemplateId: string;
  healedResume: ResumeData;
}

export const VALID_TEMPLATES = [
  'original', 'blue', 'red', 'green', 'purple', 
  'black', 'magenta', 'violet', 'gray', 'lilac'
];

export class ResumeImportPreviewAnalysisAgent {
  /**
   * Executa a auditoria completa de viabilidade do Preview para um currículo importado via V2
   */
  public static diagnose(rawResume: any): PreviewDiagnosticReport {
    const causes: PreviewDiagnosticCause[] = [];
    let score = 100;

    if (!rawResume || typeof rawResume !== 'object') {
      return {
        timestamp: new Date().toISOString(),
        isReadyForPreview: false,
        score: 0,
        causes: [{
          code: 'MISSING_ARRAY_STRUCTURE',
          severity: 'CRITICAL',
          description: 'O objeto de currículo fornecido é nulo ou inválido.',
          recommendation: 'Instanciar currículo seguro a partir de initialResumeData.'
        }],
        resolvedTemplateId: 'original',
        healedResume: this.heal(rawResume)
      };
    }

    // 1. Causa Raiz #1: templateId incompatível que disparava 'return null;' no componente
    const currentTemplate = rawResume.templateId;
    if (!currentTemplate || !VALID_TEMPLATES.includes(currentTemplate)) {
      score -= 40;
      causes.push({
        code: 'UNSUPPORTED_TEMPLATE_ID',
        severity: 'CRITICAL',
        description: `Template ID '${currentTemplate || 'undefined'}' não é suportado pelo ResumePreview e provocava retorno nulo (tela em branco).`,
        detectedValue: currentTemplate,
        recommendation: "Mapear automaticamente para o template oficial 'original' (Forest / Terracotta)."
      });
    }

    // 2. Causa Raiz #2: Payload vindo como string JSON do banco de dados Neon
    if (typeof rawResume.data === 'string') {
      score -= 30;
      causes.push({
        code: 'STRINGIFIED_DATABASE_PAYLOAD',
        severity: 'HIGH',
        description: 'Campo data do Neon armazenado como string JSON em vez de objeto JSONB parseado.',
        recommendation: 'Aplicar JSON.parse defensivo antes de alimentar o componente de Preview.'
      });
    }

    // 3. Causa Raiz #3: Ausência de estruturas de array obrigatórias (provoca crash no .map)
    const arrayFields = ['experiences', 'education', 'skills', 'languages', 'hobbies'];
    for (const field of arrayFields) {
      if (!Array.isArray(rawResume[field])) {
        score -= 10;
        causes.push({
          code: 'MISSING_ARRAY_STRUCTURE',
          severity: 'HIGH',
          description: `Campo '${field}' não é um array válido (valor atual: ${typeof rawResume[field]}). Quebra a renderização com TypeError.`,
          detectedValue: rawResume[field],
          recommendation: `Inicializar '${field}' com array vazio padrão [].`
        });
      }
    }

    // 4. Causa Raiz #4: Presença de template legado de mock que contamina o visual
    const summaryStr = (rawResume.summary || '').toLowerCase();
    if (summaryStr.includes('maria fernandes') || summaryStr.includes('tech solutions')) {
      score -= 20;
      causes.push({
        code: 'LOCAL_STORAGE_DESYNC',
        severity: 'MEDIUM',
        description: 'Dados de mock legado detectados no resumo.',
        recommendation: 'Substituir pelos dados oficiais e limpos de Claudio Freitas Xavier.'
      });
    }

    score = Math.max(0, score);
    const healed = this.heal(rawResume);

    return {
      timestamp: new Date().toISOString(),
      isReadyForPreview: causes.filter(c => c.severity === 'CRITICAL').length === 0,
      score,
      causes,
      resolvedTemplateId: healed.templateId,
      healedResume: healed
    };
  }

  /**
   * Autocura do currículo: normaliza todas as propriedades para renderização imediata sem erros
   */
  public static heal(raw: any): ResumeData {
    const rawData = typeof raw?.data === 'string' ? (() => {
      try { return JSON.parse(raw.data); } catch { return {}; }
    })() : (raw?.data || {});

    const merged = { ...rawData, ...raw };
    const validTemplate = (!merged.templateId || !VALID_TEMPLATES.includes(merged.templateId))
      ? 'original'
      : merged.templateId;

    return {
      id: merged.id || `pdf-v2-${Date.now()}`,
      userId: merged.userId || 'visitante',
      templateId: validTemplate,
      themeMode: merged.themeMode === 'light' ? 'light' : 'dark',
      fullName: merged.fullName || 'CLAUDIO FREITAS XAVIER',
      role: merged.role || 'Analista de Sistemas / Suporte / IA',
      email: merged.email || 'diretor@xavierbr.net',
      phone: merged.phone || '(71) 99113-7633',
      linkedin: merged.linkedin || 'https://www.linkedin.com/in/claudio-xavier-117816b6',
      portfolio: merged.portfolio || 'http://xavierbr.net',
      summary: merged.summary || 'Profissional com mais de 18 anos de sólida experiência em Tecnologia da Informação.',
      avatarUrl: merged.avatarUrl || '',
      experiences: Array.isArray(merged.experiences) ? merged.experiences : [],
      education: Array.isArray(merged.education) ? merged.education : [],
      skills: Array.isArray(merged.skills) ? merged.skills : [],
      languages: Array.isArray(merged.languages) ? merged.languages : [],
      hobbies: Array.isArray(merged.hobbies) ? merged.hobbies : [],
      isPinned: Boolean(merged.isPinned),
      isImported: true,
      lastUpdated: merged.lastUpdated || new Date().toISOString()
    };
  }
}
