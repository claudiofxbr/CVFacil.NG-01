import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { buildAccountEmail, isUniqueViolation } from '../../lib/accountIdentity';

// Erro da foto03: POST /api/neon/resumes -> 500 por users_email_key quando o e-mail
// EXTRAÍDO DO PDF já pertencia a outra linha de users.

const sqlCalls: { query: string; params: any[] }[] = [];
let sqlImpl: (query: string, params: any[]) => any[] | Promise<any[]>;

vi.mock('../../lib/neon', () => ({
  sql: async (strings: TemplateStringsArray, ...values: any[]) => {
    let query = '';
    strings.forEach((s, i) => {
      query += s + (i < values.length ? `$${i + 1}` : '');
    });
    sqlCalls.push({ query, params: values });
    return sqlImpl(query, values);
  },
}));

// Sessão simulada: a identidade vem do servidor (cookie), nunca do corpo.
vi.mock('../../lib/requireUser', async (orig) => ({
  ...(await orig<any>()),
  requireUser: async () => ({ id: 'user-sessao', email: 'sessao@x.com' }),
}));

const PDF_EMAIL = 'diretor@xavierbr.net';

function postRequest(body: any) {
  return new NextRequest('http://localhost/api/neon/resumes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const importedResume = {
  id: 'pdf-v2-1',
  userId: 'admin-claudio',
  fullName: 'Diretor Exemplo',
  email: PDF_EMAIL,
  role: 'Diretor',
  experiences: [],
  education: [],
  skills: [],
};

describe('identidade da conta x conteúdo do currículo', () => {
  beforeEach(() => {
    sqlCalls.length = 0;
    sqlImpl = () => [];
  });

  it('buildAccountEmail nunca usa conteúdo do currículo', () => {
    expect(buildAccountEmail('admin-claudio')).toBe('admin-claudio@cvfacil.local');
  });

  it('isUniqueViolation reconhece o erro do driver Neon e filtra pela constraint', () => {
    const err = new Error(
      'Neon SQL Query Error (400): {"code":"23505","constraint":"users_email_key","message":"duplicate key value violates unique constraint \\"users_email_key\\""}',
    );
    expect(isUniqueViolation(err)).toBe(true);
    expect(isUniqueViolation(err, 'users_email_key')).toBe(true);
    expect(isUniqueViolation(err, 'outra_constraint')).toBe(false);
    expect(isUniqueViolation(new Error('timeout de rede'))).toBe(false);
    expect(isUniqueViolation(undefined)).toBe(false);
  });

  const usersQuery = (query: string) =>
    /SELECT plan, credits FROM users/.test(query) ? [{ plan: 'free', credits: 5 }] : [];

  it('POST nunca cria/atualiza linha em users (sem e-mail sintético nem e-mail do PDF)', async () => {
    const { POST } = await import('../../app/api/neon/resumes/route');
    sqlImpl = usersQuery;

    const res = await POST(postRequest(importedResume));

    expect(res.status).toBe(200);
    expect(sqlCalls.some((c) => /INSERT INTO users/.test(c.query))).toBe(false);
    expect(sqlCalls.some((c) => c.params.includes(PDF_EMAIL) && /users/.test(c.query))).toBe(false);
  });

  it('o e-mail do PDF continua gravado no currículo, dono = usuário da sessão', async () => {
    const { POST } = await import('../../app/api/neon/resumes/route');
    sqlImpl = usersQuery;

    await POST(postRequest(importedResume));

    const resumeWrites = sqlCalls.filter((c) => /INTO resumes/i.test(c.query));
    expect(resumeWrites.length).toBeGreaterThan(0);
    expect(resumeWrites.some((c) => c.params.includes(PDF_EMAIL))).toBe(true);
    expect(resumeWrites.every((c) => !c.params.includes('admin-claudio'))).toBe(true);
    expect(resumeWrites[0].params).toContain('user-sessao');
  });

  it('erro inesperado do banco continua sendo 500', async () => {
    const { POST } = await import('../../app/api/neon/resumes/route');
    sqlImpl = (query) => {
      if (/SELECT plan, credits FROM users/.test(query)) throw new Error('conexão recusada');
      return [];
    };

    const res = await POST(postRequest(importedResume));
    expect(res.status).toBe(500);
  });
});
