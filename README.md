# Resume Fit RAG

Envie seu currículo pelo WhatsApp. O sistema avalia — via Gemini, uma chamada
por vaga — contra um conjunto de vagas reais e abertas, calcula nota e
compatibilidade de verdade, e depois você pergunta o que quiser sobre o
resultado, com busca vetorial (RAG) por trás.

<p>
  <img alt="Node.js" src="https://img.shields.io/badge/Node.js-22-339933?style=flat-square&logo=nodedotjs&logoColor=white">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5.7-3178C6?style=flat-square&logo=typescript&logoColor=white">
  <img alt="Express" src="https://img.shields.io/badge/Express-4-000000?style=flat-square&logo=express&logoColor=white">
  <img alt="LangChain.js" src="https://img.shields.io/badge/LangChain.js-orquestra%C3%A7%C3%A3o-1C3C3C?style=flat-square">
  <img alt="Google Gemini" src="https://img.shields.io/badge/Gemini-2.5--flash-8E75B2?style=flat-square&logo=googlegemini&logoColor=white">
  <img alt="Voyage AI" src="https://img.shields.io/badge/Voyage_AI-embeddings-5865F2?style=flat-square">
  <img alt="PostgreSQL" src="https://img.shields.io/badge/PostgreSQL-pgvector-4169E1?style=flat-square&logo=postgresql&logoColor=white">
  <img alt="Docker" src="https://img.shields.io/badge/Docker-Compose-2496ED?style=flat-square&logo=docker&logoColor=white">
  <img alt="n8n" src="https://img.shields.io/badge/n8n-workflow-EA4B71?style=flat-square&logo=n8n&logoColor=white">
  <img alt="WhatsApp" src="https://img.shields.io/badge/WhatsApp-WAHA-25D366?style=flat-square&logo=whatsapp&logoColor=white">
</p>

Projeto irmão do [rag-vagas-assistant](https://github.com/frederycomiguel/rag-vagas-assistant),
mas com um propósito diferente: lá a nota já vem pronta num histórico; aqui a
nota é **calculada na hora**, currículo contra vaga, pelo Gemini.

## Arquitetura

```
WhatsApp (WAHA) → n8n (webhook)
                     │
         ┌───────────┴───────────┐
         │                       │
   mensagem com PDF        mensagem de texto
         │                       │
         ▼                       ▼
  POST /upload-resume       POST /ask
         │                       │
  extrai texto do PDF      embed a pergunta (Voyage AI)
         │                       │
  pra CADA vaga salva:     busca no pgvector (top-k)
  Gemini avalia currículo         │
  x vaga → nota, compat,          ▼
  justificativa, gaps      Gemini responde com base
         │                  no contexto recuperado
  embed + grava no                │
  Postgres/pgvector                │
         │                       │
         └───────────┬───────────┘
                      ▼
        n8n envia a resposta de volta
              no WhatsApp (WAHA)
```

## Por que essa combinação de ferramentas

| Peça | Por quê |
|---|---|
| **n8n** | Orquestra o fluxo (webhook → API → resposta) de forma visual — é a peça que várias vagas de emprego pedem e eu não tinha. |
| **LangChain.js** (não a versão Python) | Já sou forte em Node/TypeScript — não fazia sentido aprender framework novo e linguagem nova ao mesmo tempo. |
| **PostgreSQL + `pgvector`** | Banco vetorial em cima do banco que já uso todo dia, em vez de somar uma ferramenta nova (Pinecone/Chroma) só pra ter no currículo. |
| **Voyage AI** | Embeddings — nem Claude nem Gemini têm endpoint de embeddings tão direto; a Anthropic recomenda a Voyage AI como parceiro pra isso. |
| **Gemini** (`gemini-2.5-flash`) | Scoring do currículo + geração das respostas. Tier gratuito, sem cartão. Já uso Gemini em produção em outro projeto. |

A diferença real deste projeto pro irmão: o Gemini não é usado só pra
responder perguntas no fim — ele é usado **como avaliador**, currículo
contra vaga, uma chamada por vaga (`api/src/scorer.ts`). Isso é um padrão
diferente de RAG comum (que só recupera e responde) — aqui tem uma etapa de
**classificação estruturada** (nota, compat, gaps) antes da etapa de busca.

## Estrutura

```
db/init.sql              tabelas resume (currículo atual) e vaga_chunks
data/vagas-exemplo/      12 vagas reais e abertas (peguei via LinkedIn, texto público)
api/src/
  pdf.ts                 extrai texto de PDF (pdf-parse)
  scorer.ts              chama o Gemini pra pontuar currículo x vaga
  ingest-vagas.ts        roda o scorer pra todas as vagas, embeda e grava
  voyage.ts              embeddings (documento e query)
  retriever.ts           busca no pgvector + CRUD do currículo/vagas
  rag-chain.ts           responde perguntas com RAG (mesma lógica do projeto irmão)
  server.ts              endpoints /upload-resume e /ask
n8n/workflow.json        webhook → ramifica (PDF vs texto) → API → resposta no WhatsApp
test.html                página de teste local (upload de currículo + perguntas)
```

## Dados

As 12 vagas em `data/vagas-exemplo/` são **reais e estavam abertas** quando
peguei (LinkedIn, texto público de cada anúncio) — não inventei nenhuma.
Escolhi de propósito uma mistura de fits fortes (PHP/Laravel, Node/React),
fracos (Python, Ruby, Go com inglês avançado obrigatório) e uma híbrida
disfarçada de remota, pra a pontuação do Gemini ter variação de verdade pra
testar.

## Rodar local

1. Copie `.env.example` para `.env`, preencha `VOYAGE_API_KEY` e
   `GOOGLE_API_KEY`.

2. Suba Postgres + n8n:
   ```bash
   docker compose up -d postgres n8n
   ```

3. Build e sobe a API:
   ```bash
   docker compose up -d --build api
   ```

4. Teste sem WhatsApp, direto no endpoint (currículo em base64):
   ```bash
   curl -X POST http://localhost:3002/upload-resume \
     -H "Content-Type: application/json" \
     -d "{\"resumeBase64\": \"$(base64 -w0 seu-curriculo.pdf)\"}"
   ```

5. Depois, pergunte:
   ```bash
   curl -X POST http://localhost:3002/ask \
     -H "Content-Type: application/json" \
     -d '{"question": "qual vaga tem a melhor nota?"}'
   ```

6. Ou abra `test.html` no navegador — tem upload de arquivo + caixa de
   pergunta, sem precisar de curl.

7. Pra WhatsApp de verdade: suba um WAHA, importe `n8n/workflow.json`, ajuste
   o nó "Baixar PDF do WAHA" conforme o formato real do payload da sua
   versão do WAHA (não deu pra testar isso sem um WAHA rodando).

## Limitações conhecidas (de propósito, não são bugs esquecidos)

- **Reavalia tudo do zero a cada currículo novo.** Com 12 vagas isso é
  rápido; com milhares, precisaria de fila/background job.
- **Perguntas de agregação** (melhor, pior, quantas) usam heurística por
  palavra-chave pra decidir se trazem a base inteira em vez de top-k — não é
  NLP de verdade, é regex. Funciona bem no tamanho desse projeto.
- **Um usuário só.** A tabela `resume` tem uma linha fixa (`id = 1`) — não é
  multi-tenant, é uma ferramenta pessoal.
- **Tier gratuito do Gemini tem limite diário** (20 requisições/dia no
  `gemini-2.5-flash`) — pontuar 12 vagas de uma vez consome boa parte disso.

## Licença

MIT.
