import { ChatGoogleGenerativeAI } from "@langchain/google-genai";

export interface ScoreResult {
  nota: number;
  compat: number;
  justificativa: string;
  gaps: string;
}

const SYSTEM_PROMPT = `Você avalia o quanto um currículo combina com uma vaga de emprego.
Responda SOMENTE com um JSON válido, sem texto antes ou depois, sem markdown,
no formato exato:

{"nota": <inteiro 0-100, "vale a pena se candidatar?">, "compat": <inteiro 0-100, "% de cobertura dos requisitos">, "justificativa": "<1-2 frases explicando a nota>", "gaps": "<1-2 frases sobre o que falta, ou 'nenhum gap relevante'>"}

Critérios:
- nota alta exige: stack técnica batendo, modelo de trabalho compatível (se a
  vaga for presencial/híbrida obrigatória e o candidato só aceitar remoto,
  isso derruba a nota mesmo com stack perfeita)
- se a vaga exigir inglês avançado/fluente e o currículo indicar inglês só
  técnico ou não mencionar fluência, isso é um gap real e deve puxar a nota
  pra baixo
- seja honesto e específico nos gaps, não invente conquistas que não estão
  no currículo`;

// Instanciado sob demanda (mesmo motivo do outro projeto: não derrubar o
// processo inteiro só por falta de chave antes da primeira chamada real).
let model: ChatGoogleGenerativeAI | null = null;
function getModel(): ChatGoogleGenerativeAI {
  if (!model) {
    model = new ChatGoogleGenerativeAI({ model: "gemini-2.5-flash", temperature: 0 });
  }
  return model;
}

function parseJsonResponse(raw: string): ScoreResult {
  // Gemini às vezes envolve o JSON em ```json ... ``` mesmo pedindo pra não fazer isso.
  const cleaned = raw.replace(/```json\s*|```\s*/g, "").trim();
  const parsed = JSON.parse(cleaned);
  return {
    nota: Number(parsed.nota),
    compat: Number(parsed.compat),
    justificativa: String(parsed.justificativa ?? ""),
    gaps: String(parsed.gaps ?? ""),
  };
}

export async function scoreVagaAgainstResume(resumeText: string, vagaText: string): Promise<ScoreResult> {
  const prompt = `Currículo:\n${resumeText}\n\n---\n\nVaga:\n${vagaText}`;
  const response = await getModel().invoke([
    { role: "system", content: SYSTEM_PROMPT },
    { role: "human", content: prompt },
  ]);

  const raw = typeof response.content === "string" ? response.content : JSON.stringify(response.content);
  try {
    return parseJsonResponse(raw);
  } catch (err) {
    throw new Error(`Gemini não retornou JSON válido pra essa vaga: ${raw.slice(0, 200)}`);
  }
}
