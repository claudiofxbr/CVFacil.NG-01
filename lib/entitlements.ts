import { NextResponse } from 'next/server';
import { sql } from './neon';
import { aiGuard } from './apiAuth';
import { ensurePaymentsSchema } from './payments';
import { resolvePlan } from './plans';

/**
 * Direitos do plano comprado (users.plan = basico|padrao|premium).
 * Importações de PDF: contador users.pdf_imports_used, zerado a cada compra paga (ver markOrderPaidAndGrant).
 * Usuário free (sem compra) e admin não têm cota de importação (comportamento anterior preservado).
 */

/** Reserva 1 importação de forma atômica. null = não há cota a aplicar; 'reserved' = reservou; 'exhausted' = esgotada. */
export async function reserveImport(userId: string, isAdmin: boolean): Promise<'none' | 'reserved' | 'exhausted'> {
  if (isAdmin) return 'none';
  const rows = await sql`SELECT plan FROM users WHERE id = ${userId} LIMIT 1;`;
  const plan = resolvePlan(rows[0]?.plan);
  if (!plan) return 'none';
  await ensurePaymentsSchema(); // garante a coluna do contador (só é necessário para planos pagos)
  const upd = await sql`
    UPDATE users SET pdf_imports_used = pdf_imports_used + 1
    WHERE id = ${userId} AND plan = ${plan.id} AND pdf_imports_used < ${plan.maxPdfImports}
    RETURNING pdf_imports_used;
  `;
  return upd[0] ? 'reserved' : 'exhausted';
}

export async function releaseImport(userId: string): Promise<void> {
  await sql`UPDATE users SET pdf_imports_used = GREATEST(0, pdf_imports_used - 1) WHERE id = ${userId};`;
}

/** Envolve a rota de importação: sessão (401) + limite de IA (429) + cota do plano (403 IMPORT_QUOTA_EXCEEDED). */
export async function withImportQuota(req: Request, handler: (req: any) => Promise<Response>): Promise<Response> {
  const ctx = await aiGuard(req);
  if (ctx instanceof NextResponse) return ctx;

  let state: 'none' | 'reserved' | 'exhausted';
  try {
    state = await reserveImport(ctx.id, ctx.isAdmin);
  } catch (e) {
    console.error('cota de importação indisponível:', e instanceof Error ? e.name : 'erro');
    return NextResponse.json({ error: 'Serviço temporariamente indisponível.', code: 'QUOTA_UNAVAILABLE' }, { status: 503 });
  }
  if (state === 'exhausted') {
    return NextResponse.json(
      { error: 'A cota de importações de PDF do seu plano acabou. Faça upgrade do plano para importar mais.', code: 'IMPORT_QUOTA_EXCEEDED' },
      { status: 403 },
    );
  }

  let res: Response;
  try {
    res = await handler(req);
  } catch (e) {
    if (state === 'reserved') await releaseImport(ctx.id).catch(() => undefined);
    throw e;
  }
  // Importação que falhou não consome cota.
  if (state === 'reserved' && res.status >= 400) await releaseImport(ctx.id).catch(() => undefined);
  return res;
}
