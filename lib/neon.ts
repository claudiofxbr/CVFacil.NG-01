// Conexão com o pooler do Neon para CVfacil.NG-01.
// A connection string vem SEMPRE da variável de ambiente DATABASE_URL (no servidor: .env com
// permissão 600, alimentado pelo GitHub Secret DATABASE_URL a cada deploy). Nunca escreva
// credenciais neste arquivo: o repositório é público.
// Implementação autônoma de alta performance com zero dependências externas

function getConnectionString(): string {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL não configurada: defina a variável de ambiente do servidor.');
  }
  return connectionString;
}

function getNeonEndpoint(connStr: string): string {
  const match = connStr.match(/@([^/:?]+)/);
  if (!match) {
    throw new Error('DATABASE_URL inválida: não foi possível identificar o host do Neon.');
  }
  return `https://${match[1]}/sql`;
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

  const connectionString = getConnectionString();
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

