import "dotenv/config";
import express from "express";
import { extractPdfText } from "./pdf.js";
import { saveResume } from "./retriever.js";
import { ingestAllVagas } from "./ingest-vagas.js";
import { answer } from "./rag-chain.js";

const app = express();
app.use(express.json({ limit: "15mb" })); // currículo em PDF/base64 pode passar de 1mb

app.use((_req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  next();
});
app.options("*", (_req, res) => res.sendStatus(204));

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

// Chamado pelo n8n quando chega uma mensagem com PDF anexado no WhatsApp.
// Aceita { resumeBase64 } (PDF) ou { resumeText } (texto já extraído).
app.post("/upload-resume", async (req, res) => {
  const { resumeBase64, resumeText } = req.body as { resumeBase64?: string; resumeText?: string };

  if (!resumeBase64 && !resumeText) {
    return res.status(400).json({ error: "Envie 'resumeBase64' (PDF) ou 'resumeText' (texto)." });
  }

  try {
    const text = resumeText ?? (await extractPdfText(Buffer.from(resumeBase64!, "base64")));
    if (!text || text.length < 50) {
      return res.status(400).json({ error: "Não consegui extrair texto legível do currículo." });
    }

    await saveResume(text);
    const results = await ingestAllVagas();

    res.json({
      message: `Currículo recebido. ${results.length} vagas analisadas.`,
      results,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Falha ao processar o currículo." });
  }
});

// Chamado pelo n8n a cada mensagem de texto (pergunta) no WhatsApp.
app.post("/ask", async (req, res) => {
  const { question } = req.body as { question?: string };
  if (!question || typeof question !== "string") {
    return res.status(400).json({ error: "Campo 'question' (string) é obrigatório." });
  }

  try {
    const result = await answer(question);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Falha ao gerar resposta." });
  }
});

const port = Number(process.env.PORT ?? 3002);
app.listen(port, () => {
  console.log(`resume-fit-rag-api ouvindo em http://localhost:${port}`);
});
