import { NextResponse } from 'next/server';
import { sql } from '../../../../lib/neon';
import { clientIp } from '../../../../lib/authRateLimit';
import { normalizeEmail, readJson } from '../../../../lib/authInput';
import { hitExceeds } from '../../../../lib/rateLimit';
import { appBaseUrl } from '../../../../lib/appUrl';
import { isMailConfigured, sendMail } from '../../../../lib/mailer';
import { createResetToken, RESET_TTL_MINUTES } from '../../../../lib/passwordReset';

export const dynamic = 'force-dynamic';

const HOUR = 60 * 60 * 1000;
const PER_IP = 10;
const PER_EMAIL = 3;
const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

/**
 * Pede o link de redefinição por e-mail. A resposta é a MESMA exista ou não a conta (não revela cadastro) e o
 * envio roda sem aguardar, para o tempo de resposta também não revelar. Sem SMTP configurado responde
 * MAIL_UNAVAILABLE (503) em vez de falhar em silêncio: o usuário é orientado a falar com o administrador.
 */
export async function POST(req: Request) {
  const body = await readJson(req);
  const email = normalizeEmail(body?.email);
  if (!email) return fail('INVALID_EMAIL', 400);
  if (!isMailConfigured()) return fail('MAIL_UNAVAILABLE', 503);

  if (await hitExceeds(`forgot-ip:${clientIp(req)}`, PER_IP, HOUR)) {
    return NextResponse.json({ error: 'TOO_MANY_ATTEMPTS' }, { status: 429, headers: { 'Retry-After': '3600' } });
  }
  const generic = NextResponse.json({ ok: true });
  // Limite por e-mail: acima dele a resposta continua igual, mas nada é enviado (evita inundar a caixa de alguém).
  if (await hitExceeds(`forgot:${email}`, PER_EMAIL, HOUR)) return generic;

  try {
    const rows = await sql`SELECT id FROM users WHERE email = ${email} AND password_hash IS NOT NULL LIMIT 1;`;
    if (rows[0]) {
      const token = await createResetToken(String(rows[0].id));
      const link = `${appBaseUrl()}/recuperar-senha?token=${token}`;
      const text =
        `Recebemos um pedido para redefinir a senha da sua conta no CVFacil.NG.\n\n` +
        `Para criar uma nova senha, abra o link abaixo (vale por ${RESET_TTL_MINUTES} minutos e só pode ser usado uma vez):\n\n${link}\n\n` +
        `Se você não fez este pedido, ignore esta mensagem: sua senha continua a mesma.`;
      void sendMail(email, 'Redefinição de senha — CVFacil.NG', text);
    }
    return generic;
  } catch (e) {
    console.error('auth/forgot-password falhou:', e instanceof Error ? e.name : 'erro');
    return fail('AUTH_UNAVAILABLE', 503);
  }
}
