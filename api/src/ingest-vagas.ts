import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { scoreVagaAgainstResume } from "./scorer.js";
import { embed } from "./voyage.js";
import { clearVagaChunks, insertVagaChunk, getResume } from "./retriever.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Em Docker, VAGAS_DIR aponta pro volume montado (ver docker-compose.yml).
// Local (fora de container), cai no caminho relativo ao projeto.
const VAGAS_DIR = process.env.VAGAS_DIR ?? path.resolve(__dirname, "../../data/vagas-exemplo");

function parseVagaFile(raw: string, filename: string): { empresa: string; cargo: string } {
  // Primeira linha é "# Cargo — Empresa" (formato usado nos arquivos deste projeto).
  const firstLine = raw.split("\n")[0].replace(/^#\s*/, "");
  const [cargo, empresa] = firstLine.split(/—|-/).map((s) => s.trim());
  return { cargo: cargo || filename, empresa: empresa || "Empresa não identificada" };
}

export interface IngestResult {
  vaga: string;
  empresa: string;
  nota: number;
  compat: number;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Tier gratuito do Gemini tem limite por minuto além do limite diário —
// espaçar as chamadas evita estourar o RPM mesmo com cota diária disponível.
const DELAY_BETWEEN_VAGAS_MS = 4000;

/**
 * Repontua e reindexação TODAS as vagas de exemplo contra o currículo salvo.
 * Chamado toda vez que um novo currículo chega — apaga os chunks antigos e
 * recalcula do zero (é rápido o suficiente com dezenas de vagas).
 */
export async function ingestAllVagas(): Promise<IngestResult[]> {
  const resumeText = await getResume();
  if (!resumeText) throw new Error("Nenhum currículo salvo ainda — envie um currículo primeiro.");

  await clearVagaChunks();

  const files = readdirSync(VAGAS_DIR).filter((f) => f.endsWith(".md"));
  const results: IngestResult[] = [];

  for (const [i, file] of files.entries()) {
    if (i > 0) await sleep(DELAY_BETWEEN_VAGAS_MS);
    const raw = readFileSync(path.join(VAGAS_DIR, file), "utf8");
    const { empresa, cargo } = parseVagaFile(raw, file);

    const score = await scoreVagaAgainstResume(resumeText, raw);
    const contentForEmbedding = `${raw}\n\nAvaliação: nota ${score.nota}/100, compatibilidade ${score.compat}%. ${score.justificativa} Gaps: ${score.gaps}`;
    const [embedding] = await embed([contentForEmbedding]);

    await insertVagaChunk({
      vagaId: file,
      empresa,
      cargo,
      content: contentForEmbedding,
      nota: score.nota,
      compat: score.compat,
      justificativa: score.justificativa,
      gaps: score.gaps,
      embedding,
    });

    results.push({ vaga: cargo, empresa, nota: score.nota, compat: score.compat });
  }

  return results.sort((a, b) => b.nota - a.nota);
}
