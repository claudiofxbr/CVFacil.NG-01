/**
 * Identidade da CONTA do usuário (tabela `users`), separada do conteúdo do currículo.
 *
 * Bug real (foto03): ao salvar um currículo importado de PDF, a rota usava o e-mail
 * EXTRAÍDO DO PDF como e-mail da conta. Se esse e-mail já pertencia a outra linha de
 * `users`, o Postgres devolvia 23505 `users_email_key` e a importação inteira falhava
 * com 500 — mesmo com o Agente de Importação aprovando o documento.
 *
 * Regra: o e-mail da conta nunca vem do conteúdo do currículo. O e-mail do PDF continua
 * gravado no próprio currículo (`resumes.email` / JSON), preservando a fidelidade dos dados.
 */
export function buildAccountEmail(userId: string): string {
  return `${userId}@cvfacil.local`;
}

/** Detecta violação de unicidade (Postgres 23505) na mensagem devolvida pelo driver Neon. */
export function isUniqueViolation(error: unknown, constraint?: string): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  const isUnique =
    message.includes('23505') || /duplicate key value violates unique constraint/i.test(message);
  if (!isUnique) return false;
  return constraint ? message.includes(constraint) : true;
}
