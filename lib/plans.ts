/**
 * Catálogo de planos: FONTE ÚNICA DE VERDADE no servidor. O cliente só escolhe o id do plano;
 * preço, cotas e benefícios nunca vêm dele. Valores em CENTAVOS inteiros (nada de ponto flutuante).
 */
export type PlanId = 'basico' | 'padrao' | 'premium';

export interface Plan {
  readonly id: PlanId;
  readonly name: string;
  readonly priceCents: number;
  readonly maxResumes: number;
  readonly maxPdfImports: number;
  readonly layouts: 'basicos' | 'todos' | 'todos+exclusivos';
  readonly exports: readonly ('PDF' | 'DOCX' | 'HTML')[];
  readonly prioritySupport: boolean;
}

const freeze = <T extends Plan>(p: T): Readonly<T> => Object.freeze({ ...p, exports: Object.freeze([...p.exports]) as T['exports'] });

export const PLANS: Readonly<Record<PlanId, Plan>> = Object.freeze({
  basico: freeze({
    id: 'basico', name: 'Básico', priceCents: 1500, maxResumes: 1, maxPdfImports: 1,
    layouts: 'basicos', exports: ['PDF'], prioritySupport: false,
  }),
  padrao: freeze({
    id: 'padrao', name: 'Padrão', priceCents: 4000, maxResumes: 6, maxPdfImports: 3,
    layouts: 'todos', exports: ['PDF', 'DOCX', 'HTML'], prioritySupport: false,
  }),
  premium: freeze({
    id: 'premium', name: 'Premium', priceCents: 9000, maxResumes: 9, maxPdfImports: 9,
    layouts: 'todos+exclusivos', exports: ['PDF', 'DOCX', 'HTML'], prioritySupport: true,
  }),
});

export class PlanError extends Error {
  constructor(public readonly code: 'UNKNOWN_PLAN') {
    super(code);
    this.name = 'PlanError';
  }
}

/**
 * Resolve o plano a partir do id escolhido pelo cliente. Aceita a string do id ou um objeto
 * `{ planId }`; QUALQUER outro campo (preço, valor, desconto...) é ignorado: o preço devolvido
 * é sempre o do catálogo. Id desconhecido (inclusive chaves herdadas como "__proto__") -> null.
 */
export function resolvePlan(input: unknown): Plan | null {
  const id = typeof input === 'string' ? input : (input && typeof input === 'object' ? (input as { planId?: unknown }).planId : undefined);
  if (typeof id !== 'string' || !Object.prototype.hasOwnProperty.call(PLANS, id)) return null;
  return PLANS[id as PlanId];
}

export function requirePlan(input: unknown): Plan {
  const plan = resolvePlan(input);
  if (!plan) throw new PlanError('UNKNOWN_PLAN');
  return plan;
}

/** "R$ 15,00" a partir de centavos inteiros (apenas apresentação). */
export function formatBRL(cents: number): string {
  if (!Number.isSafeInteger(cents) || cents < 0) throw new RangeError('centavos inválidos');
  const reais = Math.floor(cents / 100);
  return `R$ ${reais},${String(cents % 100).padStart(2, '0')}`;
}
