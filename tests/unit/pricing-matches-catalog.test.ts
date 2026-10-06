import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PLANS, type PlanId } from '../../lib/plans';

/**
 * A tela Planos precisa dizer exatamente o que o servidor aplica (lib/plans.ts): preço, número de
 * currículos e cota de importações de PDF. Antes, a cota de importações não aparecia nos cartões.
 */
const src = readFileSync(join(__dirname, '..', '..', 'components', 'Pricing.tsx'), 'utf8');
const pad2 = (n: number) => String(n).padStart(2, '0');
const brl = (cents: number) => (cents / 100).toFixed(2).replace('.', ',');

describe('Pricing.tsx reflete o catálogo do servidor', () => {
  it.each(Object.keys(PLANS) as PlanId[])('plano %s: preço, currículos e importações', (id) => {
    const p = PLANS[id];
    expect(src).toContain(`${brl(p.priceCents)}</span>`);
    expect(src).toContain(`Para ${p.maxResumes} Currículo`);
    expect(src).toContain(`Importação de PDF ${pad2(p.maxPdfImports)}`);
  });

  it('cada cota de importação aparece uma única vez (um cartão por plano)', () => {
    for (const p of Object.values(PLANS)) {
      const n = src.split(`Importação de PDF ${pad2(p.maxPdfImports)}`).length - 1;
      expect(n).toBe(1);
    }
  });

  it('o texto de pagamento cita o PagBank (e não mais o Stripe)', () => {
    expect(src).toContain('via PagBank');
    expect(src).not.toMatch(/Stripe/i);
  });
});
