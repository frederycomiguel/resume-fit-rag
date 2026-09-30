CREATE EXTENSION IF NOT EXISTS vector;

-- Currículo atual do usuário. Linha única (id sempre 1), sobrescrita a cada
-- novo upload — esse projeto é de um usuário só, não multi-tenant.
CREATE TABLE IF NOT EXISTS resume (
  id INTEGER PRIMARY KEY DEFAULT 1,
  content TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT single_row CHECK (id = 1)
);

CREATE TABLE IF NOT EXISTS vaga_chunks (
  id SERIAL PRIMARY KEY,
  vaga_id TEXT NOT NULL,
  empresa TEXT NOT NULL,
  cargo TEXT NOT NULL,
  content TEXT NOT NULL,
  nota INTEGER,
  compat INTEGER,
  justificativa TEXT,
  gaps TEXT,
  embedding VECTOR(1024) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Sem índice aproximado (ivfflat/hnsw) de propósito: com dezenas de linhas,
-- não centenas/milhares, um índice ivfflat mal dimensionado faz a busca
-- vetorial não encontrar nada (partições vazias) — já bateu nesse problema
-- num projeto irmão deste. Busca exata (sequential scan) é rápida o
-- suficiente nessa escala.
