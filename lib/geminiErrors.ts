/**
 * Falhas da IA na importação de PDF: sempre devolver um ERRO claro, nunca dados inventados.
 *
 * Bug real (05/10/2026): a GEMINI_API_KEY da VPS era inválida (Google respondia 401 para todos
 * os modelos) e as rotas de importação, em vez de falhar, devolviam um currículo fixo escrito no
 * código (de uma pessoa específica). Resultado: toda importação "funcionava" e trazia sempre o
 * mesmo currículo, qualquer que fosse o PDF escolhido.
 */
export type AiFailureCode = 'AI_NOT_CONFIGURED' | 'AI_QUOTA_EXCEEDED' | 'AI_UNAVAILABLE';

export interface AiFailure {
  status: number;
  code: AiFailureCode;
  message: string;
  retryable: boolean;
}

// Chaves reais do Google têm dezenas de caracteres; abaixo disso é placeholder/lixo.
const MIN_API_KEY_LENGTH = 20;

function describe(err: any): string {
  return `${err?.status ?? ''} ${err?.message ?? err ?? ''}`;
}

export function isApiKeyUsable(apiKey: string | undefined | null): apiKey is string {
  return typeof apiKey === 'string' && apiKey.trim().length >= MIN_API_KEY_LENGTH;
}

export function isAuthError(err: any): boolean {
  return (
    err?.status === 401 ||
    err?.status === 403 ||
    /UNAUTHENTICATED|PERMISSION_DENIED|API key not valid|API_KEY_INVALID/i.test(describe(err))
  );
}

export function isQuotaError(err: any): boolean {
  return err?.status === 429 || /\b429\b|RESOURCE_EXHAUSTED|Quota exceeded/i.test(describe(err));
}

export function buildAiFailure(lastError: any, keyUsable: boolean): AiFailure {
  if (!keyUsable || isAuthError(lastError)) {
    return {
      status: 503,
      code: 'AI_NOT_CONFIGURED',
      message:
        'A importação por IA está indisponível: a chave da API do Gemini no servidor está ausente ou inválida. Avise o administrador.',
      retryable: false,
    };
  }
  if (isQuotaError(lastError)) {
    return {
      status: 429,
      code: 'AI_QUOTA_EXCEEDED',
      message: 'O limite de uso da IA foi atingido. Tente novamente em alguns minutos.',
      retryable: true,
    };
  }
  return {
    status: 503,
    code: 'AI_UNAVAILABLE',
    message: 'A IA não respondeu. Nenhum currículo foi criado ou alterado; tente importar novamente.',
    retryable: true,
  };
}
