import { sql } from '../../../../lib/neon';
import { authContext, findAccessibleResume, notFoundResume } from '../../../../lib/apiAuth';
import { resolvePlan } from '../../../../lib/plans';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Função de sanitização rigorosa contra injeções de script e XSS
 */
function sanitizeText(value: any, fallback = ''): string {
  if (typeof value !== 'string') return fallback;
  return value
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/onload\s*=/gi, '')
    .replace(/onerror\s*=/gi, '')
    .trim();
}

/**
 * Sanitiza recursivamente o objeto do currículo
 */
function sanitizeResumePayload(resume: any) {
  return {
    ...resume,
    fullName: sanitizeText(resume.fullName, 'Candidato'),
    role: sanitizeText(resume.role, 'Profissional'),
    email: sanitizeText(resume.email, ''),
    phone: sanitizeText(resume.phone, ''),
    linkedin: sanitizeText(resume.linkedin, ''),
    portfolio: sanitizeText(resume.portfolio, ''),
    summary: sanitizeText(resume.summary, ''),
    experiences: Array.isArray(resume.experiences)
      ? resume.experiences.map((exp: any) => ({
          ...exp,
          role: sanitizeText(exp.role),
          company: sanitizeText(exp.company),
          period: sanitizeText(exp.period),
          description: sanitizeText(exp.description)
        }))
      : [],
    education: Array.isArray(resume.education)
      ? resume.education.map((edu: any) => ({
          ...edu,
          degree: sanitizeText(edu.degree),
          institution: sanitizeText(edu.institution),
          year: sanitizeText(edu.year)
        }))
      : [],
    skills: Array.isArray(resume.skills)
      ? resume.skills.map((sk: any) => ({
          ...sk,
          name: sanitizeText(sk.name)
        }))
      : [],
    languages: Array.isArray(resume.languages)
      ? resume.languages.map((l: any) => ({
          ...l,
          name: sanitizeText(l.name),
          level: sanitizeText(l.level)
        }))
      : [],
    hobbies: Array.isArray(resume.hobbies)
      ? resume.hobbies.map((h: any) => sanitizeText(h)).filter(Boolean)
      : []
  };
}

// GET: Buscar currículos do usuário da sessão (admin: ?scope=all lista todos) com suporte à lixeira
export async function GET(req: NextRequest) {
  const ctx = await authContext(req);
  if (ctx instanceof NextResponse) return ctx;
  try {
    const { searchParams } = new URL(req.url);
    const resumeId = searchParams.get('id');
    const onlyDeleted = searchParams.get('status') === 'trash' || searchParams.get('onlyDeleted') === 'true';
    // userId e role da URL são ignorados: a identidade é a da sessão.
    const listAll = ctx.isAdmin && searchParams.get('scope') === 'all';

    // 1. Busca por ID específico (alheio => 404, igual a inexistente)
    if (resumeId) {
      const rows = ctx.isAdmin
        ? await sql`SELECT * FROM resumes WHERE id = ${resumeId} LIMIT 1;`
        : await sql`SELECT * FROM resumes WHERE id = ${resumeId} AND user_id = ${ctx.id} LIMIT 1;`;
      if (!rows || rows.length === 0) return notFoundResume();

      const item = rows[0];
      const parsedData = typeof item.data === 'string' ? JSON.parse(item.data) : (item.data || {});
      return NextResponse.json({
        resume: {
          ...parsedData,
          id: item.id,
          userId: item.user_id,
          templateId: item.template_id || parsedData.templateId || 'original',
          themeMode: item.theme_mode || parsedData.themeMode || 'dark',
          fullName: item.full_name || parsedData.fullName || '',
          role: item.role || parsedData.role || '',
          email: item.email || parsedData.email || '',
          phone: item.phone || parsedData.phone || '',
          linkedin: item.linkedin || parsedData.linkedin || '',
          portfolio: item.portfolio || parsedData.portfolio || '',
          summary: item.summary || parsedData.summary || '',
          experiences: parsedData.experiences || [],
          education: parsedData.education || [],
          skills: parsedData.skills || [],
          languages: parsedData.languages || [],
          hobbies: parsedData.hobbies || [],
          isPinned: item.is_pinned,
          deletedAt: item.deleted_at,
          lastUpdated: item.updated_at
        }
      });
    }

    // 2. Listagem de currículos (Ativos vs Lixeira)
    let rows;
    if (listAll) {
      rows = onlyDeleted
        ? await sql`SELECT * FROM resumes WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC;`
        : await sql`SELECT * FROM resumes WHERE deleted_at IS NULL ORDER BY is_pinned DESC, updated_at DESC;`;
    } else {
      rows = onlyDeleted
        ? await sql`SELECT * FROM resumes WHERE user_id = ${ctx.id} AND deleted_at IS NOT NULL ORDER BY deleted_at DESC;`
        : await sql`SELECT * FROM resumes WHERE user_id = ${ctx.id} AND deleted_at IS NULL ORDER BY is_pinned DESC, updated_at DESC;`;
    }

    const resumes = rows.map((item: any) => {
      const parsedData = typeof item.data === 'string' ? JSON.parse(item.data) : (item.data || {});
      return {
        ...parsedData,
        id: item.id,
        userId: item.user_id,
        templateId: item.template_id || parsedData.templateId || 'original',
        themeMode: item.theme_mode || parsedData.themeMode || 'dark',
        fullName: item.full_name || parsedData.fullName || '',
        role: item.role || parsedData.role || '',
        email: item.email || parsedData.email || '',
        phone: item.phone || parsedData.phone || '',
        linkedin: item.linkedin || parsedData.linkedin || '',
        portfolio: item.portfolio || parsedData.portfolio || '',
        summary: item.summary || parsedData.summary || '',
        experiences: parsedData.experiences || [],
        education: parsedData.education || [],
        skills: parsedData.skills || [],
        languages: parsedData.languages || [],
        hobbies: parsedData.hobbies || [],
        isPinned: item.is_pinned,
        deletedAt: item.deleted_at,
        lastUpdated: item.updated_at
      };
    });

    return NextResponse.json({ resumes });
  } catch (error: any) {
    console.error("Erro ao listar currículos no Neon:", error);
    return NextResponse.json({ error: 'Erro interno ao processar a solicitação.' }, { status: 500 });
  }
}

// POST: Salvar ou atualizar currículo com regras de negócio, limites e histórico auditável
export async function POST(req: NextRequest) {
  const ctx = await authContext(req);
  if (ctx instanceof NextResponse) return ctx;
  try {
    const rawResume = await req.json();
    if (!rawResume || typeof rawResume.id !== 'string' || !rawResume.id || rawResume.id.length > 100) {
      return NextResponse.json({ error: "Dados incompletos do currículo (id é obrigatório)." }, { status: 400 });
    }

    // Sanitização rigorosa contra injeções de script e tags maliciosas.
    // userId do corpo é descartado: o dono é sempre o usuário da sessão.
    const resume = { ...sanitizeResumePayload(rawResume), userId: ctx.id };

    // 1. Plano e créditos do usuário da sessão (a linha em users já existe desde o cadastro).
    const userRows = await sql`SELECT plan, credits FROM users WHERE id = ${ctx.id} LIMIT 1;`;
    if (!userRows[0]) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
    const userProfile = userRows[0];
    const isAdmin = ctx.isAdmin;
    const isFreePlan = (userProfile.plan || 'free').toLowerCase() === 'free';
    // Plano pago (users.plan = basico|padrao|premium): limite de currículos do plano, sem consumo de créditos.
    const paidPlan = resolvePlan(userProfile.plan);

    // 2. Verificar se o currículo já existe no banco
    const existingRows = await sql`
      SELECT id, user_id FROM resumes WHERE id = ${resume.id} LIMIT 1;
    `;
    const isUpdate = existingRows && existingRows.length > 0;

    // Autorização rígida: currículo alheio é tratado como inexistente (404), exceto para admin
    if (isUpdate && !isAdmin && existingRows[0].user_id !== ctx.id) {
      return notFoundResume();
    }

    // 3. Limite de documentos: plano pago usa o limite do plano; free mantém 3 currículos ativos
    const documentLimit = paidPlan ? paidPlan.maxResumes : (isFreePlan ? 3 : null);
    if (!isUpdate && !isAdmin && documentLimit !== null) {
      const countRows = await sql`
        SELECT count(*) as total FROM resumes
        WHERE user_id = ${resume.userId} AND deleted_at IS NULL;
      `;
      const currentActiveCount = Number(countRows[0]?.total || 0);
      if (currentActiveCount >= documentLimit) {
        return NextResponse.json({
          error: paidPlan
            ? `Limite de Documentos Atingido: o plano ${paidPlan.name} permite no máximo ${documentLimit} currículos ativos simultâneos. Mova um currículo para a lixeira ou faça upgrade do plano para continuar.`
            : "Limite de Documentos Atingido: Usuários do plano gratuito podem manter no máximo 3 currículos ativos simultâneos. Mova um currículo para a lixeira ou faça upgrade do plano para continuar.",
          code: "DOCUMENT_LIMIT_EXCEEDED",
          currentCount: currentActiveCount,
          maxAllowed: documentLimit
        }, { status: 403 });
      }
    }

    // 4. Regra de Consumo de Créditos (aplicável se for importação nova ou se requisitado consumo)
    const shouldConsumeCredit = (!isUpdate || rawResume.consumeCredit === true) && !paidPlan;
    if (shouldConsumeCredit && !isAdmin) {
      const currentCredits = Number(userProfile.credits ?? 5);
      if (currentCredits <= 0) {
        return NextResponse.json({
          error: "Créditos Insuficientes: Seu saldo atual é de 0 créditos. Recarregue seus créditos para continuar criando e importando currículos.",
          code: "INSUFFICIENT_CREDITS",
          credits: 0
        }, { status: 402 });
      }

      // Debita 1 crédito do usuário
      await sql`
        UPDATE users
        SET credits = GREATEST(0, credits - 1), updated_at = CURRENT_TIMESTAMP
        WHERE id = ${resume.userId};
      `;
    }

    // 5. Upsert no Neon PostgreSQL
    await sql`
      INSERT INTO resumes (
        id, user_id, title, template_id, theme_mode, full_name, role,
        email, phone, linkedin, portfolio, summary, is_pinned, deleted_at, data, updated_at
      ) VALUES (
        ${resume.id},
        ${resume.userId},
        ${resume.title || resume.role || 'Meu Currículo'},
        ${resume.templateId || 'original'},
        ${resume.themeMode || 'dark'},
        ${resume.fullName || ''},
        ${resume.role || ''},
        ${resume.email || ''},
        ${resume.phone || ''},
        ${resume.linkedin || ''},
        ${resume.portfolio || ''},
        ${resume.summary || ''},
        ${Boolean(resume.isPinned)},
        NULL,
        ${JSON.stringify(resume)},
        CURRENT_TIMESTAMP
      )
      ON CONFLICT (id) DO UPDATE SET
        template_id = EXCLUDED.template_id,
        theme_mode = EXCLUDED.theme_mode,
        full_name = EXCLUDED.full_name,
        role = EXCLUDED.role,
        email = EXCLUDED.email,
        phone = EXCLUDED.phone,
        linkedin = EXCLUDED.linkedin,
        portfolio = EXCLUDED.portfolio,
        summary = EXCLUDED.summary,
        is_pinned = EXCLUDED.is_pinned,
        data = EXCLUDED.data,
        updated_at = CURRENT_TIMESTAMP;
    `;

    // 6. Geração de Histórico de Versões Auditáveis (Tabela resume_versions)
    try {
      const versionCountRows = await sql`
        SELECT count(*) as total FROM resume_versions WHERE resume_id = ${resume.id};
      `;
      const nextVersionNumber = Number(versionCountRows[0]?.total || 0) + 1;
      const versionId = `ver-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const summaryChange = isUpdate 
        ? (rawResume.changeSummary || 'Edição no editor visual') 
        : 'Criação inicial via Importar PDF V2';

      await sql`
        INSERT INTO resume_versions (
          id, resume_id, version_number, title, data, changed_by, change_summary, created_at
        ) VALUES (
          ${versionId},
          ${resume.id},
          ${nextVersionNumber},
          ${resume.title || resume.role || 'Versão ' + nextVersionNumber},
          ${JSON.stringify(resume)},
          ${resume.userId},
          ${summaryChange},
          CURRENT_TIMESTAMP
        );
      `;
    } catch (verErr) {
      console.warn("Aviso ao gerar histórico de versão auditável:", verErr);
    }

    return NextResponse.json({
      success: true,
      id: resume.id,
      isUpdate,
      creditConsumed: shouldConsumeCredit && !isAdmin
    });
  } catch (error: any) {
    console.error("Erro ao persistir currículo no Neon:", error);
    return NextResponse.json({ error: 'Erro interno ao processar a solicitação.' }, { status: 500 });
  }
}

// DELETE: Mover para a Lixeira (Soft Delete) ou Exclusão Permanente (Hard Delete)
export async function DELETE(req: NextRequest) {
  const ctx = await authContext(req);
  if (ctx instanceof NextResponse) return ctx;
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const action = searchParams.get('action') || 'trash'; // 'trash' ou 'permanent'

    if (!id) {
      return NextResponse.json({ error: "ID obrigatório para deleção." }, { status: 400 });
    }

    if (!(await findAccessibleResume(ctx, id))) return notFoundResume();

    if (action === 'permanent') {
      await sql`DELETE FROM resumes WHERE id = ${id};`;
      return NextResponse.json({ success: true, action: 'permanent', deletedId: id });
    } else {
      await sql`
        UPDATE resumes
        SET deleted_at = CURRENT_TIMESTAMP
        WHERE id = ${id};
      `;
      return NextResponse.json({ success: true, action: 'trash', movedToTrashId: id });
    }
  } catch (error: any) {
    console.error("Erro na exclusão do currículo no Neon:", error);
    return NextResponse.json({ error: 'Erro interno ao processar a solicitação.' }, { status: 500 });
  }
}

// PATCH: Restaurar currículo da Lixeira
export async function PATCH(req: NextRequest) {
  const ctx = await authContext(req);
  if (ctx instanceof NextResponse) return ctx;
  try {
    const { id } = await req.json();

    if (!id || typeof id !== 'string') {
      return NextResponse.json({ error: "ID obrigatório para restauração." }, { status: 400 });
    }

    if (!(await findAccessibleResume(ctx, id))) return notFoundResume();

    await sql`
      UPDATE resumes
      SET deleted_at = NULL, updated_at = CURRENT_TIMESTAMP
      WHERE id = ${id};
    `;

    return NextResponse.json({ success: true, restoredId: id });
  } catch (error: any) {
    console.error("Erro ao restaurar currículo da lixeira no Neon:", error);
    return NextResponse.json({ error: 'Erro interno ao processar a solicitação.' }, { status: 500 });
  }
}
