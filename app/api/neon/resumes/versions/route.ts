import { sql } from '../../../../../lib/neon';
import { NextRequest, NextResponse } from 'next/server';
import { authContext, findAccessibleResume, notFoundResume } from '../../../../../lib/apiAuth';

export const dynamic = 'force-dynamic';

// GET: Listar histórico de versões auditáveis de um currículo
export async function GET(req: NextRequest) {
  const ctx = await authContext(req);
  if (ctx instanceof NextResponse) return ctx;
  try {
    const { searchParams } = new URL(req.url);
    const resumeId = searchParams.get('resumeId');

    if (!resumeId) {
      return NextResponse.json({ error: "resumeId obrigatório" }, { status: 400 });
    }

    if (!(await findAccessibleResume(ctx, resumeId))) return notFoundResume();

    const rows = await sql`
      SELECT id, resume_id, version_number, title, changed_by, change_summary, created_at, data
      FROM resume_versions
      WHERE resume_id = ${resumeId}
      ORDER BY version_number DESC;
    `;

    const versions = rows.map((r: any) => ({
      id: r.id,
      resumeId: r.resume_id,
      versionNumber: r.version_number,
      title: r.title,
      changedBy: r.changed_by,
      changeSummary: r.change_summary,
      createdAt: r.created_at,
      data: typeof r.data === 'string' ? JSON.parse(r.data) : r.data
    }));

    return NextResponse.json({ versions });
  } catch (error: any) {
    console.error("Erro ao listar versões no Neon:", error);
    return NextResponse.json({ error: 'Erro interno ao processar a solicitação.' }, { status: 500 });
  }
}

// POST: Restaurar uma versão específica do histórico
export async function POST(req: NextRequest) {
  const ctx = await authContext(req);
  if (ctx instanceof NextResponse) return ctx;
  try {
    const { resumeId, versionId } = await req.json();

    if (!resumeId || !versionId) {
      return NextResponse.json({ error: "resumeId e versionId obrigatórios" }, { status: 400 });
    }

    if (typeof resumeId !== 'string' || typeof versionId !== 'string') {
      return NextResponse.json({ error: "resumeId e versionId obrigatórios" }, { status: 400 });
    }
    if (!(await findAccessibleResume(ctx, resumeId))) return notFoundResume();

    const versionRows = await sql`
      SELECT * FROM resume_versions 
      WHERE id = ${versionId} AND resume_id = ${resumeId}
      LIMIT 1;
    `;

    if (!versionRows || versionRows.length === 0) {
      return NextResponse.json({ error: "Versão não encontrada." }, { status: 404 });
    }

    const targetVersion = versionRows[0];
    const resumeData = typeof targetVersion.data === 'string' ? JSON.parse(targetVersion.data) : targetVersion.data;

    // Atualiza o currículo atual no banco
    await sql`
      UPDATE resumes
      SET
        full_name = ${resumeData.fullName || ''},
        role = ${resumeData.role || ''},
        email = ${resumeData.email || ''},
        phone = ${resumeData.phone || ''},
        linkedin = ${resumeData.linkedin || ''},
        portfolio = ${resumeData.portfolio || ''},
        summary = ${resumeData.summary || ''},
        template_id = ${resumeData.templateId || 'original'},
        theme_mode = ${resumeData.themeMode || 'dark'},
        data = ${JSON.stringify(resumeData)},
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ${resumeId};
    `;

    // Registra uma nova versão auditável referente à restauração
    const countRows = await sql`SELECT count(*) as total FROM resume_versions WHERE resume_id = ${resumeId};`;
    const nextVer = Number(countRows[0]?.total || 0) + 1;
    const restoreId = `ver-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    await sql`
      INSERT INTO resume_versions (id, resume_id, version_number, title, data, changed_by, change_summary)
      VALUES (
        ${restoreId},
        ${resumeId},
        ${nextVer},
        ${`Restauração da Versão #${targetVersion.version_number}`},
        ${JSON.stringify(resumeData)},
        ${ctx.id},
        ${`Restaurado a partir da Versão #${targetVersion.version_number}`}
      );
    `;

    return NextResponse.json({ success: true, restoredResume: resumeData, newVersionNumber: nextVer });
  } catch (error: any) {
    console.error("Erro ao restaurar versão:", error);
    return NextResponse.json({ error: 'Erro interno ao processar a solicitação.' }, { status: 500 });
  }
}
