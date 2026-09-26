import { neon } from '@neondatabase/serverless';

// Conexão oficial com o pooler do Neon para CVfacil.NG-01
const connectionString = process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_kRVX31WqYgsQ@ep-misty-unit-b6b7q8hh-pooler.c-2.sa-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';

export const sql = neon(connectionString);

/**
 * Utilitário para verificar a integridade da conexão com o banco Neon
 */
export async function testNeonConnection(): Promise<boolean> {
  try {
    const result = await sql`SELECT 1 as connected;`;
    return Array.isArray(result) && result.length > 0;
  } catch (error) {
    console.error("Falha ao conectar no banco Neon CVfacil.NG-01:", error);
    return false;
  }
}
