// Cliente mínimo pra API de embeddings da Voyage AI (parceiro recomendado
// pela Anthropic; nem Claude nem Gemini tem endpoint de embeddings próprio
// tão direto quanto esse). Sem SDK oficial de Node, então REST direto.

const VOYAGE_API_URL = "https://api.voyageai.com/v1/embeddings";
const MODEL = "voyage-4-large"; // 1024 dimensões por padrão

async function callVoyage(texts: string[], inputType: "document" | "query"): Promise<number[][]> {
  const apiKey = process.env.VOYAGE_API_KEY;
  if (!apiKey) throw new Error("VOYAGE_API_KEY não definido no .env");

  const res = await fetch(VOYAGE_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: MODEL, input: texts, input_type: inputType }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Voyage AI retornou ${res.status}: ${body}`);
  }

  const data = (await res.json()) as { data: { embedding: number[] }[] };
  return data.data.map((d) => d.embedding);
}

export async function embed(texts: string[]): Promise<number[][]> {
  return callVoyage(texts, "document");
}

export async function embedQuery(text: string): Promise<number[]> {
  const [vec] = await callVoyage([text], "query");
  return vec;
}
