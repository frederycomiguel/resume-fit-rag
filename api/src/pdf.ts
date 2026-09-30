import pdfParse from "pdf-parse";

/** Extrai o texto puro de um PDF (buffer). Usado no currículo enviado pelo WhatsApp. */
export async function extractPdfText(buffer: Buffer): Promise<string> {
  const result = await pdfParse(buffer);
  return result.text.trim();
}
