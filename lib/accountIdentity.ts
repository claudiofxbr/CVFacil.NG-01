/**
 * Domínio reservado: linhas antigas em `users` (criadas antes da sessão de servidor) usam e-mails
 * sintéticos `<id>@cvfacil.local` e não têm senha. Esse domínio não pode ser usado num cadastro real,
 * senão alguém "reivindicaria" uma dessas linhas (e os currículos dela) só registrando o e-mail.
 */
export const RESERVED_EMAIL_DOMAINS: readonly string[] = ['cvfacil.local'];
