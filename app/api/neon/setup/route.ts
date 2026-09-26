import { sql } from '../../../../lib/neon';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Migration inicial e DDL da base CVfacil.NG-01 no Neon
 */
export async function POST() {
  try {
    // 1. Criar extensão para UUID
    await sql`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`;

    // 2. Tabela de Usuários (users)
    await sql`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(100) PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        name VARCHAR(255),
        password_hash VARCHAR(255),
        role VARCHAR(50) DEFAULT 'user',
        plan VARCHAR(50) DEFAULT 'free',
        credits INTEGER DEFAULT 5,
        avatar_url TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `;

    // 3. Tabela de Currículos (resumes) com JSONB otimizado e Soft Delete
    await sql`
      CREATE TABLE IF NOT EXISTS resumes (
        id VARCHAR(100) PRIMARY KEY,
        user_id VARCHAR(100) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title VARCHAR(255) DEFAULT 'Meu Currículo',
        template_id VARCHAR(100) DEFAULT 'original',
        theme_mode VARCHAR(50) DEFAULT 'dark',
        full_name VARCHAR(255),
        role VARCHAR(255),
        email VARCHAR(255),
        phone VARCHAR(100),
        linkedin VARCHAR(255),
        portfolio VARCHAR(255),
        summary TEXT,
        is_pinned BOOLEAN DEFAULT FALSE,
        deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
        data JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `;

    // Garante coluna deleted_at caso a tabela já exista
    await sql`ALTER TABLE resumes ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;`;

    // 4. Tabela de Histórico de Versões Auditáveis (resume_versions)
    await sql`
      CREATE TABLE IF NOT EXISTS resume_versions (
        id VARCHAR(100) PRIMARY KEY,
        resume_id VARCHAR(100) NOT NULL REFERENCES resumes(id) ON DELETE CASCADE,
        version_number INTEGER NOT NULL,
        title VARCHAR(255),
        data JSONB NOT NULL,
        changed_by VARCHAR(100) NOT NULL,
        change_summary TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `;

    // 5. Índices para performance e escalabilidade de busca
    await sql`CREATE INDEX IF NOT EXISTS idx_resumes_user_id ON resumes(user_id);`;
    await sql`CREATE INDEX IF NOT EXISTS idx_resumes_deleted_at ON resumes(deleted_at);`;
    await sql`CREATE INDEX IF NOT EXISTS idx_resumes_data_gin ON resumes USING gin(data);`;
    await sql`CREATE INDEX IF NOT EXISTS idx_resume_versions_resume_id ON resume_versions(resume_id);`;
    await sql`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);`;

    return NextResponse.json({
      success: true,
      message: "Estrutura do banco de dados Neon CVfacil.NG-01 inicializada com sucesso!",
      tables: ["users", "resumes", "resume_versions"]
    });
  } catch (error: any) {
    console.error("Erro na inicialização do schema no Neon:", error);
    return NextResponse.json(
      { error: "Erro ao criar schema no Neon", details: error.message || String(error) },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const usersCount = await sql`SELECT count(*) as total FROM users;`;
    const resumesCount = await sql`SELECT count(*) as total FROM resumes;`;
    return NextResponse.json({
      connected: true,
      database: "neondb (CVfacil.NG-01)",
      users: usersCount[0]?.total || 0,
      resumes: resumesCount[0]?.total || 0
    });
  } catch (error: any) {
    return NextResponse.json({ connected: false, error: error.message }, { status: 500 });
  }
}
