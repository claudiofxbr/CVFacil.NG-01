import { SESSION_EXPIRED_MESSAGE } from './authClient';
import { ResumeData } from '../types';
import { ResumeImportInspectorAgent } from './aiImportInspectorAgent';

/**
 * Validador nativo de PDF no navegador inspecionando Magic Bytes.
 * Não requer workers remotos do unpkg, livre de CORS e bloqueios de rede.
 */
export async function validatePdfNative(file: File): Promise<boolean> {
  try {
    const slice = file.slice(0, 5);
    const arrayBuffer = await slice.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    // Assinatura %PDF- em ASCII: 0x25, 0x50, 0x44, 0x46, 0x2D
    const header = String.fromCharCode(...bytes);
    return header.startsWith("%PDF");
  } catch (e) {
    console.warn("Validação nativa falhou, prosseguindo com verificação de mime-type:", e);
    return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  }
}

/**
 * Converte o arquivo para Base64 de forma assíncrona
 */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result);
    };
    reader.onerror = (error) => reject(error);
  });
}

/**
 * NOVO PROCESSO DE IMPORTAÇÃO (V2 ULTRA-RESILIENTE):
 * 1. Validação nativa de Magic Bytes local
 * 2. Envio binário direto para a rota de backend /api/gemini/import-pdf-v2
 * 3. Mapeamento robusto com IDs únicos para o formato padrão ResumeData
 */
export async function importResumeFromPdfV2(
  file: File,
  userId: string,
  userAvatar?: string,
  onStatusUpdate?: (status: string, percent: number) => void
): Promise<ResumeData> {
  if (onStatusUpdate) onStatusUpdate("Validando formato do PDF...", 15);

  const isValidPdf = await validatePdfNative(file);
  if (!isValidPdf) {
    throw new Error("O arquivo selecionado não é um documento PDF válido ou está corrompido.");
  }

  if (onStatusUpdate) onStatusUpdate("Codificando documento para análise segura...", 35);
  const pdfBase64 = await fileToBase64(file);

  if (onStatusUpdate) onStatusUpdate("Processando com Inteligência Artificial Multimodal...", 60);

  const response = await fetch('/api/gemini/import-pdf-v2', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      pdfBase64,
      fileName: file.name
    })
  });

  if (response.status === 401) throw new Error(SESSION_EXPIRED_MESSAGE);
  if (!response.ok) {
    const errorJson = await response.json().catch(() => ({}));
    let msg = errorJson.error || errorJson.details || `Erro HTTP ${response.status} ao processar PDF.`;
    if (typeof msg === 'string' && (msg.includes('503') || msg.includes('high demand') || msg.includes('UNAVAILABLE'))) {
      msg = "Os servidores do Gemini estão com pico temporário de tráfego. O sistema tentou reprocessar automaticamente; por favor, aguarde alguns segundos e tente novamente.";
    }
    throw new Error(msg);
  }

  if (onStatusUpdate) onStatusUpdate("Estruturando modelo de currículo...", 85);
  const result = await response.json();
  const rawData = result.data || {};

  // Auditoria, sanitização e validação de integridade pelo Agente Inspetor
  const { sanitized, report } = ResumeImportInspectorAgent.auditAndSanitizeGeminiPayload(
    rawData,
    userId || 'visitante',
    userAvatar || ''
  );

  console.info(`[Agente Importação PDF] Veredito: ${report.verdict} | Score de Qualidade: ${report.geminiExtraction.parsingQualityScore}%`);

  // Garante conformidade de atributos adicionais com preservação dos dados extraídos
  const newResume: ResumeData = {
    ...sanitized,
    id: `pdf-v2-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    fullName: sanitized.fullName || file.name.replace(/\.[^/.]+$/, "").replace(/[_-]/g, " "),
    avatarUrl: userAvatar || sanitized.avatarUrl || "",
    lastUpdated: new Date().toLocaleDateString('pt-BR'),
    isImported: true
  };

  if (onStatusUpdate) onStatusUpdate("Currículo gerado com sucesso!", 100);
  return newResume;
}
