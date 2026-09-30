import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { RunnableSequence } from "@langchain/core/runnables";
import { embedQuery } from "./voyage.js";
import { retrieve, retrieveAll, type RetrievedChunk } from "./retriever.js";

// Heurística simples: perguntas de agregação (melhor/pior/quantas) precisam
// ver a base inteira, não só os chunks mais parecidos com o texto da
// pergunta — mesma lição aprendida no projeto rag-vagas-assistant.
const AGGREGATION_HINTS =
  /\b(melhor|pior|maior|menor|quantas?|quantos?|total|todas?|todos?|m[eé]dia|soma)\b/i;

function looksLikeAggregation(question: string): boolean {
  return AGGREGATION_HINTS.test(question);
}

const prompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    `Você é um assistente que responde perguntas sobre vagas de emprego já
avaliadas contra o currículo do usuário (nota de 0-100 e % de compatibilidade
já calculados). Use SOMENTE o contexto abaixo. Se não tiver a resposta, diga
que não encontrou — não invente.

Contexto:
{context}`,
  ],
  ["human", "{question}"],
]);

function formatContext(chunks: RetrievedChunk[]): string {
  return chunks
    .map(
      (c, i) =>
        `[${i + 1}] ${c.empresa} — ${c.cargo} | Nota: ${c.nota}/100 · Compat: ${c.compat}%\n${c.content}`
    )
    .join("\n\n---\n\n");
}

let chain: RunnableSequence | null = null;
function getChain(): RunnableSequence {
  if (!chain) {
    const model = new ChatGoogleGenerativeAI({ model: "gemini-2.5-flash", temperature: 0 });
    chain = RunnableSequence.from([prompt, model, new StringOutputParser()]);
  }
  return chain;
}

export async function answer(question: string): Promise<{ answer: string; sources: RetrievedChunk[] }> {
  const chunks = looksLikeAggregation(question)
    ? await retrieveAll()
    : await retrieve(await embedQuery(question), 5);
  const context = formatContext(chunks);

  const result = await getChain().invoke({ context, question });

  return { answer: result, sources: chunks };
}
