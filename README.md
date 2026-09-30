# Resume Fit RAG

Envie seu currículo pelo WhatsApp, o sistema pontua contra um conjunto de
vagas reais e abertas (usando Gemini pra avaliar cada uma), e depois você
pergunta o que quiser sobre o resultado — tudo via RAG.

Projeto irmão do [rag-vagas-assistant](../rag-vagas-assistant), mas com um
propósito diferente: lá a nota já vem pronta num histórico; aqui a nota é
**calculada na hora**, currículo contra vaga, pelo Gemini.

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

Mesmas escolhas do projeto irmão, pelos mesmos motivos (n8n pra orquestração
visual, LangChain.js por já ser forte em Node/TS, pgvector em cima do banco
que já uso, Voyage AI pra embeddings, Gemini de graça pra geração) — ver o
README do `rag-vagas-assistant` pra detalhe de cada escolha.

A diferença real deste projeto: o Gemini não é usado só pra responder
perguntas no fim — ele é usado **como avaliador**, currículo contra vaga, uma
chamada por vaga (`api/src/scorer.ts`). Isso é um padrão diferente de RAG
comum (que só recupera e responde) — aqui tem uma etapa de **classificação
estruturada** (nota, compat, gaps) antes da etapa de busca.

## Estrutura

```
db/init.sql              tabelas resume (currículo atual) e vaga_chunks
data/vagas-exemplo/      12 vagas reais e abertas (peguei via LinkedIn, texto público)
api/src/
  pdf.ts                 extrai texto de PDF (pdf-parse)
  scorer.ts              chama o Gemini pra pontuar currículo x vaga
  ingest-vagas.ts         roda o scorer pra todas as vagas, embeda e grava
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
  instantâneo; com milhares, precisaria de fila/background job.
- **Perguntas de agregação** (melhor, pior, quantas) usam heurística por
  palavra-chave pra decidir se trazem a base inteira em vez de top-k — não é
  NLP de verdade, é regex. Funciona bem no tamanho desse projeto.
- **Um usuário só.** A tabela `resume` tem uma linha fixa (`id = 1`) — não é
  multi-tenant, é uma ferramenta pessoal.
