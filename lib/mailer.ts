import nodemailer from 'nodemailer';

/**
 * Envio de e-mail por SMTP (caixa do domínio na Hostinger). Credenciais só por variáveis de ambiente
 * (GitHub Secrets -> .env da VPS); sem elas o recurso fica desligado e as rotas respondem MAIL_UNAVAILABLE.
 */
export interface MailConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
}

export function mailConfig(env: Record<string, string | undefined> = process.env): MailConfig | null {
  const host = (env.SMTP_HOST || '').trim();
  const user = (env.SMTP_USER || '').trim();
  const pass = env.SMTP_PASS || '';
  const from = (env.MAIL_FROM || '').trim();
  const port = Number(env.SMTP_PORT || 465);
  if (!host || !user || !pass || !from || !Number.isInteger(port) || port < 1 || port > 65535) return null;
  return { host, port, user, pass, from };
}

export const isMailConfigured = (): boolean => mailConfig() !== null;

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** true = o servidor SMTP aceitou a mensagem; false = sem configuração ou falha (só o nome do erro é registrado). */
export async function sendMail(to: string, subject: string, text: string): Promise<boolean> {
  const cfg = mailConfig();
  if (!cfg) return false;
  try {
    const transport = nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.port === 465,
      auth: { user: cfg.user, pass: cfg.pass },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    });
    await transport.sendMail({
      from: cfg.from,
      to,
      subject,
      text,
      html: `<p style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;white-space:pre-line">${escapeHtml(text).replace(
        /(https:\/\/[^\s<]+)/g,
        '<a href="$1">$1</a>',
      )}</p>`,
    });
    return true;
  } catch (e) {
    console.error('mailer falhou:', e instanceof Error ? e.name : 'erro');
    return false;
  }
}
