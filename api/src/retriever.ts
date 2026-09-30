import pg from "pg";

export interface RetrievedChunk {
  empresa: string;
  cargo: string;
  content: string;
  nota: number | null;
  compat: number | null;
  justificativa: string | null;
  gaps: string | null;
  distance: number;
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const SELECT_COLS = "empresa, cargo, content, nota, compat, justificativa, gaps";

export async function retrieve(queryEmbedding: number[], k = 5): Promise<RetrievedChunk[]> {
  const vector = `[${queryEmbedding.join(",")}]`;
  const { rows } = await pool.query(
    `SELECT ${SELECT_COLS}, embedding <=> $1 AS distance
     FROM vaga_chunks
     ORDER BY embedding <=> $1
     LIMIT $2`,
    [vector, k]
  );
  return rows;
}

/** Traz todas as linhas — usado pra perguntas de agregação (melhor/pior/quantas). */
export async function retrieveAll(): Promise<RetrievedChunk[]> {
  const { rows } = await pool.query(`SELECT ${SELECT_COLS}, 0 AS distance FROM vaga_chunks ORDER BY id`);
  return rows;
}

export async function clearVagaChunks(): Promise<void> {
  await pool.query("DELETE FROM vaga_chunks");
}

export async function insertVagaChunk(params: {
  vagaId: string;
  empresa: string;
  cargo: string;
  content: string;
  nota: number;
  compat: number;
  justificativa: string;
  gaps: string;
  embedding: number[];
}): Promise<void> {
  const vector = `[${params.embedding.join(",")}]`;
  await pool.query(
    `INSERT INTO vaga_chunks (vaga_id, empresa, cargo, content, nota, compat, justificativa, gaps, embedding)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [params.vagaId, params.empresa, params.cargo, params.content, params.nota, params.compat, params.justificativa, params.gaps, vector]
  );
}

export async function saveResume(content: string): Promise<void> {
  await pool.query(
    `INSERT INTO resume (id, content, updated_at) VALUES (1, $1, now())
     ON CONFLICT (id) DO UPDATE SET content = $1, updated_at = now()`,
    [content]
  );
}

export async function getResume(): Promise<string | null> {
  const { rows } = await pool.query("SELECT content FROM resume WHERE id = 1");
  return rows[0]?.content ?? null;
}
