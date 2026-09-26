// Conexão oficial com o pooler do Neon para CVfacil.NG-01
// Implementação autônoma de alta performance com zero dependências externas
const connectionString = process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_kRVX31WqYgsQ@ep-misty-unit-b6b7q8hh-pooler.c-2.sa-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';

function getNeonEndpoint(connStr: string): string {
  try {
    const match = connStr.match(/@([^/:?]+)/);
    const host = match ? match[1] : 'ep-misty-unit-b6b7q8hh-pooler.c-2.sa-east-1.aws.neon.tech';
    return `https://${host}/sql`;
  } catch {
    return 'https://ep-misty-unit-b6b7q8hh-pooler.c-2.sa-east-1.aws.neon.tech/sql';
  }
}

/**
 * Cliente SQL Tagged Template Literal compatível com a API Neon Serverless
 * Não requer instalação de pacotes externos no ambiente do servidor
 */
export async function sql(strings: TemplateStringsArray, ...values: any[]): Promise<any[]> {
  let query = '';
  const params: any[] = [];

  for (let i = 0; i < strings.length; i++) {
    query += strings[i];
    if (i < values.length) {
      params.push(values[i]);
      query += `$${params.length}`;
    }
  }

  const endpoint = getNeonEndpoint(connectionString);
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Neon-Connection-String': connectionString,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, params }),
    cache: 'no-store',
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Neon SQL Query Error (${response.status}): ${errText}`);
  }

  const result = await response.json();
  if (result.message && !result.rows) {
    throw new Error(`Neon SQL Error: ${result.message}`);
  }

  return (result.rows || []) as any[];
}

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

