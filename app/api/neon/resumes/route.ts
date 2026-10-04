import { sql } from '../../../../lib/neon';
import { buildAccountEmail, isUniqueViolation } from '../../../../lib/accountIdentity';
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

// GET: Buscar currículos de um usuário (ou todos se admin) com suporte à lixeira
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');
    const resumeId = searchParams.get('id');
    const onlyDeleted = searchParams.get('status') === 'trash' || searchParams.get('onlyDeleted') === 'true';
    const requesterRole = searchParams.get('role'); // 'admin' ou 'user'

    // 1. Busca por ID específico
    if (resumeId) {
      let query;
      if (requesterRole === 'admin') {
        query = sql`SELECT * FROM resumes WHERE id = ${resumeId} LIMIT 1;`;
      } else if (userId) {
        query = sql`SELECT * FROM resumes WHERE id = ${resumeId} AND user_id = ${userId} LIMIT 1;`;
      } else {
        query = sql`SELECT * FROM resumes WHERE id = ${resumeId} LIMIT 1;`;
      }

      const rows = await query;
      if (!rows || rows.length === 0) {
        return NextResponse.json({ error: "Currículo não encontrado ou acesso não autorizado." }, { status: 404 });
      }

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

    if (!userId && requesterRole !== 'admin') {
      return NextResponse.json({ error: "userId obrigatório para consulta." }, { status: 400 });
    }

    // 2. Listagem de currículos (Ativos vs Lixeira)
    let rows;
    if (requesterRole === 'admin' && !userId) {
      // Admin acessa todos
      if (onlyDeleted) {
        rows = await sql`
          SELECT * FROM resumes 
          WHERE deleted_at IS NOT NULL
          ORDER BY deleted_at DESC;
        `;
      } else {
        rows = await sql`
          SELECT * FROM resumes 
          WHERE deleted_at IS NULL
          ORDER BY is_pinned DESC, updated_at DESC;
        `;
      }
    } else {
      // Usuário comum: Autorização rígida ao seu próprio user_id
      if (onlyDeleted) {
        rows = await sql`
          SELECT * FROM resumes 
          WHERE user_id = ${userId} AND deleted_at IS NOT NULL
          ORDER BY deleted_at DESC;
        `;
      } else {
        rows = await sql`
          SELECT * FROM resumes 
          WHERE user_id = ${userId} AND deleted_at IS NULL
          ORDER BY is_pinned DESC, updated_at DESC;
        `;
      }
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
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST: Salvar ou atualizar currículo com regras de negócio, limites e histórico auditável
export async function POST(req: NextRequest) {
  try {
    const rawResume = await req.json();
    if (!rawResume || !rawResume.id || !rawResume.userId) {
      return NextResponse.json({ error: "Dados incompletos do currículo (id e userId são obrigatórios)." }, { status: 400 });
    }

    // Sanitização rigorosa contra injeções de script e tags maliciosas
    const resume = sanitizeResumePayload(rawResume);

    // 1. Garante que o usuário existe na tabela users e obtém informações de plano e créditos
    // O e-mail da conta NUNCA vem do conteúdo do currículo (ex.: e-mail extraído do PDF):
    // se já pertencesse a outra linha de users, o INSERT quebrava em users_email_key (500).
    let userRows: any[];
    try {
      userRows = await sql`
        INSERT INTO users (id, email, name, role)
        VALUES (${resume.userId}, ${buildAccountEmail(resume.userId)}, ${resume.fullName || 'Usuário'}, 'user')
        ON CONFLICT (id) DO UPDATE SET updated_at = CURRENT_TIMESTAMP
        RETURNING plan, credits, role;
      `;
    } catch (error: any) {
      if (isUniqueViolation(error, 'users_email_key')) {
        console.error("Conflito de identidade ao registrar usuário do currículo:", error);
        return NextResponse.json({
          error: "Não foi possível vincular o currículo à sua conta: já existe outro usuário com esta identidade.",
          code: "USER_IDENTITY_CONFLICT"
        }, { status: 409 });
      }
      throw error;
    }

    const userProfile = userRows[0] || { plan: 'free', credits: 5, role: 'user' };
    const isAdmin = userProfile.role === 'admin';
    const isFreePlan = (userProfile.plan || 'free').toLowerCase() === 'free';

    // 2. Verificar se o currículo já existe no banco
    const existingRows = await sql`
      SELECT id, user_id FROM resumes WHERE id = ${resume.id} LIMIT 1;
    `;
    const isUpdate = existingRows && existingRows.length > 0;

    // Autorização rígida: se for atualização e não for admin, verificar se pertence ao usuário
    if (isUpdate && !isAdmin && existingRows[0].user_id !== resume.userId) {
      return NextResponse.json({ error: "Acesso negado: Você não tem permissão para editar este currículo." }, { status: 403 });
    }

    // 3. Regra de Limite de Documentos: Plano Free permite no máximo 3 currículos ativos simultâneos
    if (!isUpdate && isFreePlan && !isAdmin) {
      const countRows = await sql`
        SELECT count(*) as total FROM resumes
        WHERE user_id = ${resume.userId} AND deleted_at IS NULL;
      `;
      const currentActiveCount = Number(countRows[0]?.total || 0);
      if (currentActiveCount >= 3) {
        return NextResponse.json({
          error: "Limite de Documentos Atingido: Usuários do plano gratuito podem manter no máximo 3 currículos ativos simultâneos. Mova um currículo para a lixeira ou faça upgrade do plano para continuar.",
          code: "DOCUMENT_LIMIT_EXCEEDED",
          currentCount: currentActiveCount,
          maxAllowed: 3
        }, { status: 403 });
      }
    }

    // 4. Regra de Consumo de Créditos (aplicável se for importação nova ou se requisitado consumo)
    const shouldConsumeCredit = !isUpdate || rawResume.consumeCredit === true;
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
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE: Mover para a Lixeira (Soft Delete) ou Exclusão Permanente (Hard Delete)
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const action = searchParams.get('action') || 'trash'; // 'trash' ou 'permanent'
    const userId = searchParams.get('userId');
    const requesterRole = searchParams.get('role'); // 'admin' ou 'user'

    if (!id) {
      return NextResponse.json({ error: "ID obrigatório para deleção." }, { status: 400 });
    }

    // Autorização Rígida
    if (requesterRole !== 'admin' && userId) {
      const checkRows = await sql`SELECT user_id FROM resumes WHERE id = ${id} LIMIT 1;`;
      if (checkRows && checkRows.length > 0 && checkRows[0].user_id !== userId) {
        return NextResponse.json({ error: "Acesso negado: Você não pode excluir este currículo." }, { status: 403 });
      }
    }

    if (action === 'permanent') {
      // Exclusão definitiva
      await sql`DELETE FROM resumes WHERE id = ${id};`;
      return NextResponse.json({ success: true, action: 'permanent', deletedId: id });
    } else {
      // Soft Delete: Move para a Lixeira com registro de deleted_at
      await sql`
        UPDATE resumes 
        SET deleted_at = CURRENT_TIMESTAMP 
        WHERE id = ${id};
      `;
      return NextResponse.json({ success: true, action: 'trash', movedToTrashId: id });
    }
  } catch (error: any) {
    console.error("Erro na exclusão do currículo no Neon:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PATCH: Restaurar currículo da Lixeira
export async function PATCH(req: NextRequest) {
  try {
    const { id, userId, role } = await req.json();

    if (!id) {
      return NextResponse.json({ error: "ID obrigatório para restauração." }, { status: 400 });
    }

    // Autorização Rígida
    if (role !== 'admin' && userId) {
      const checkRows = await sql`SELECT user_id FROM resumes WHERE id = ${id} LIMIT 1;`;
      if (checkRows && checkRows.length > 0 && checkRows[0].user_id !== userId) {
        return NextResponse.json({ error: "Acesso negado: Você não pode restaurar este currículo." }, { status: 403 });
      }
    }

    // Restaura da lixeira limpando deleted_at
    await sql`
      UPDATE resumes 
      SET deleted_at = NULL, updated_at = CURRENT_TIMESTAMP
      WHERE id = ${id};
    `;

    return NextResponse.json({ success: true, restoredId: id });
  } catch (error: any) {
    console.error("Erro ao restaurar currículo da lixeira no Neon:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
