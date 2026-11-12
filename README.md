# PlacidWay Website Knowledge Chatbot

A small, grounded chatbot that answers visitor questions using only seven PlacidWay pages. Every answer is generated from retrieved page content, cites the page(s) it came from, and says "I could not find that" when the pages do not contain the answer.

Built for the AI Automation Engineer assessment. The design prioritizes **accuracy and honesty** over feature count.

## What it does

- Ingests the configured PlacidWay pages with a clear crawler identity, robots.txt check, and a ~1 request/second delay.
- Extracts readable article text, visible tables, JSON-LD offers, and deterministic price facts.
- Retrieves with hybrid search: BM25 (`minisearch`) + cosine similarity over NVIDIA Nemotron 3.5 embeddings, fused with reciprocal rank fusion. The BM25 path remains active as a fallback.
- Answers with a strict prompt that forbids outside knowledge, invented prices, and medical advice.
- Renders source links on the server from retrieved metadata; the model never writes URLs.
- Validates every currency amount in the answer against the retrieved context before showing it.
- Falls back to an honest "not in the pages" answer and a free-quote link when retrieval is weak.
- Logs unanswered questions for content-gap analysis.
- Supports follow-up questions, Spanish/Indonesian/Arabic input, a one-time medical disclaimer, and lead capture.
- Answers catalog questions such as “what treatments are available?” and gives a scope-aware refusal for out-of-scope topics such as eye care.

## Source pages

All seven URLs are configured:

| # | Type | URL |
|---|------|-----|
| 1 | Clinic profile | `https://www.placidway.com/profile/5/Alternative-Cancer-Treatment-by-ITC-Immunity-Therapy-Center` |
| 2 | Treatment package | `https://www.placidway.com/package/7903/Alternative-Adenocarcinoma-Cancer-Treatment-Package-in-Tijuana-Mexico-by-ITC` |
| 3 | Treatment package | `https://www.placidway.com/package/7902/Alternative-Adrenal-Cancer-Treatment-Package-in-Tijuana-Mexico-by-ITC` |
| 4 | Treatment package | `https://www.placidway.com/package/7901/Alternative-Anal-Cancer-Treatment-Package-in-Tijuana-Mexico-by-ITC` |
| 5 | Clinic videos | `https://www.placidway.com/profile-videos/5/Alternative-Cancer-Treatment-by-ITC-Immunity-Therapy-Center` |
| 6 | Price list | `https://www.placidway.com/price-list/5/Alternative-Cancer-Treatment-by-ITC-Immunity-Therapy-Center` |
| 7 | Price comparison | `https://www.placidway.com/search-medical-pricings/Alternative-Medicine/All/1` |

The comparison page is the canonical global alternative-medicine pricing page. It contains clinic-level prices for Mexico and Turkey, so it supports general alternative-medicine comparisons but not like-for-like cancer-package comparisons. `SOURCE_COMPARISON_URL` can override the default if PlacidWay changes the URL.

## Architecture

```text
Visitor
  |
  v
Chat UI (public/index.html, public/app.js)
  |  POST /api/chat
  v
Guard & deterministic intents (src/guard)
  |  greeting / smalltalk / catalog / booking / medical / out-of-scope / currency
  v
Chat orchestrator (src/chat/pipeline.js)
  |  follow-up rewrite (src/chat/rewrite.js)
  |  definition shortcut (src/chat/intents.js)
  v
Hybrid retrieval (src/rag)
  |  MiniSearch BM25 + NVIDIA cosine embeddings -> RRF -> top 6
  |  metadata boosts for treatment, country, page type
  v
Deterministic price facts (src/store/db.js, src/chat/prices.js)
  |
  v
Relevant context? -- no --> AI intent router (src/llm/intent-router.js)
  |                          catalog / clarify / smalltalk / not_found
  | yes
  v
LLM -> JSON {answer, used_sources, answerable, needs_disclaimer, intent}
  |
  v
Validator (src/llm/validate.js)
  |  citation IDs exist
  |  every currency amount appears in cited context
  |  no medical advice
  |  no prompt leak
  v
Answer resolution (src/chat/answer.js)
  |  deterministic fallbacks + once-per-conversation disclaimer
  v
Answer + server-rendered source links + optional disclaimer + lead CTA
```

See [`design/architecture.md`](design/architecture.md) for the full Mermaid
diagrams (system context, module layers, chat/ingest sequences, deployment) and
[`design/database-erd.md`](design/database-erd.md) for the database ERD.

### Main modules

| Path | Responsibility |
|------|----------------|
| `config/sources.js` | The only allowed pages. No link-following. |
| `src/config.js` | Centralized environment parsing and defaults. |
| `src/ingest/fetch.js` | robots.txt, allowlist, User-Agent, 1.1s delay, conditional GET. |
| `src/ingest/extract.js` | Readability + cheerio, tables, JSON-LD, price facts, content hash. |
| `src/ingest/chunk.js` | Heading-aware 800-1200 character chunks with overlap. |
| `src/ingest/embed.js` | Batched OpenAI-compatible embeddings, with graceful degradation. |
| `src/ingest/run.js` | Ingestion pipeline: fetch, extract, chunk, embed, store. |
| `src/ingest/scheduler.js` | Interval refresh plus on-request stale-while-revalidate with a single-flight guard. |
| `src/rag/index.js` | In-memory MiniSearch index + cosine vectors + RRF. |
| `src/rag/relevance.js` | Relevance gate that runs before the LLM. |
| `src/guard/intent.js` | Deterministic intent and entity extraction. |
| `src/guard/templates.js` | Localized deterministic replies and disclaimers. |
| `src/guard/translate.js` | Domain glossary and non-Latin detection. |
| `src/llm/prompt.js` | Static system prompt + per-request context. |
| `src/llm/client.js` | OpenAI-compatible chat/embeddings client, JSON mode, retries. |
| `src/llm/intent-router.js` | LLM classifier for ambiguous requests with no retrieval context. |
| `src/llm/validate.js` | Citation, number, medical-advice, and prompt-leak checks. |
| `src/llm/json.js` | Tolerant JSON extraction from model output. |
| `src/chat/pipeline.js` | One chat turn: wires intents, rewrite, retrieval, answer, persistence. |
| `src/chat/intents.js` | Early deterministic replies and the definition shortcut. |
| `src/chat/rewrite.js` | Follow-up and non-English query rewriting with an entity allow-list. |
| `src/chat/retrieval.js` | Embedding, hybrid search, price facts, relevance gate, rewrite retry. |
| `src/chat/no-context.js` | Routes no-context failures to the AI router or clarify/not-found. |
| `src/chat/no-llm.js` | Deterministic extractive answer when no LLM key is configured. |
| `src/chat/answer.js` | LLM generation, validation outcome, fallbacks, disclaimer stripping. |
| `src/chat/fallbacks.js` | Extractive, definition, recovery-time, and follow-up fallbacks. |
| `src/chat/prices.js` | Price ranking, source labels, deterministic price/comparison replies. |
| `src/chat/context.js` | History/entity context and rewrite allow-lists. |
| `src/chat/respond.js` | Persists messages and applies the disclaimer once per conversation. |
| `src/chat/text.js` | Number and sentence-trim formatting helpers. |
| `src/store/db.js` | SQLite schema, conversations, messages, gaps, leads, ingest runs. |
| `src/routes/chat.js` | `/api/chat`, `/api/leads`, `/api/meta`, rate limits. |
| `src/routes/admin.js` | `/api/admin/unanswered`, `/api/admin/sources`, `/api/admin/refresh`. |
| `src/server.js` | Express app: security middleware, routes, static UI, graceful shutdown. |
| `src/util/logger.js` | Structured pino logger with secret redaction. |

`src/chat/pipeline.js` only orchestrates; each step lives in its own module so a
single behaviour can be reviewed or changed without touching the others.

## Requirements

- Node.js 20+ (tested on Node 22)
- An OpenAI-compatible LLM endpoint and key
- Optional: an OpenAI-compatible embeddings endpoint

The app is provider-agnostic. The recommended setup is the existing FlazCloud AI Gateway / 9Router:

```dotenv
LLM_BASE_URL=https://your-openai-compatible-gateway.example/v1
LLM_API_KEY=<gateway key>
LLM_MODEL=flazhost-agent
```

The chat model is `flazhost-agent` (currently routed by the router to `poolside/laguna-xs-2.1`). Embeddings use NVIDIA's OpenAI-compatible endpoint at `https://integrate.api.nvidia.com/v1` with `nvidia/nemotron-3.5-embed-1b` (2048 dimensions). The NVIDIA model is asymmetric, so ingestion sends `input_type=passage` and queries send `input_type=query`; `src/ingest/embed.js` handles this automatically for Nemotron 3.5. If the embedding endpoint is unavailable, retrieval falls back to BM25.

## Configuration

All settings are read from environment variables. `.env.example` is the
canonical grouped reference; copy it to `.env` and fill in the keys.

| Group | Variables |
|---|---|
| Server / runtime | `PORT`, `NODE_ENV`, `SITE_NAME`, `CONTACT_URL`, `DATA_DIR`, `DB_PATH`, `LOG_LEVEL`, `ADMIN_TOKEN`, `TRUST_PROXY`, `RATE_LIMIT_MAX`, `RATE_LIMIT_WINDOW_MS` |
| LLM | `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`, `LLM_TEMPERATURE`, `LLM_MAX_TOKENS`, `LLM_TIMEOUT_MS` |
| Embeddings | `EMBEDDING_BASE_URL`, `EMBEDDING_API_KEY`, `EMBEDDING_MODEL`, `EMBEDDING_INPUT_TYPE`, `EMBEDDING_TIMEOUT_MS` |
| Crawler / ingest | `CRAWLER_USER_AGENT`, `CRAWL_DELAY_MS`, `CRAWL_TIMEOUT_MS`, `AUTO_REFRESH_MINUTES`, `STALE_REFRESH_MINUTES` |
| Chunking | `CHUNK_MAX_CHARS`, `CHUNK_MIN_CHARS`, `CHUNK_OVERLAP_CHARS` |
| Retrieval | `RETRIEVAL_TOP_K`, `MIN_VECTOR_SIMILARITY`, `MIN_BM25_SCORE`, `MIN_TERM_COVERAGE`, `RRF_K` |
| Sources | `SOURCE_COMPARISON_URL` |
| Deployment (Caddy/Docker) | `DOMAIN`, `HTTP_PORT`, `HTTPS_PORT` |

Only `LLM_API_KEY` is required for free-form answers; without it the bot
returns deterministic extractive answers. Admin endpoints stay disabled while
`ADMIN_TOKEN` is empty, and `/admin` returns 404 so visitors never see a token
prompt.

## Setup

```bash
npm install
cp .env.example .env
# edit .env: LLM_API_KEY, ADMIN_TOKEN (SOURCE_COMPARISON_URL is optional)
npm run ingest
npm run dev
```

Open `http://localhost:3000` (or the `PORT` in your `.env`; this workspace uses
`3200`).

Useful commands:

| Command | Purpose |
|---------|---------|
| `npm start` | Start the production server. |
| `npm run dev` | Start with Node watch mode. |
| `npm run ingest` | Fetch and index all configured sources. |
| `npm run ingest:force` | Re-index even if content hashes/ETags did not change. |
| `npm test` | Unit tests for chunking, intent, retrieval gate, JSON parsing, validation. |
| `npm run eval` | Send the 8+ assessment questions to a running bot and write `eval/results.md`. |
| `npm run gaps` | Print unanswered questions; add `-- --csv` for CSV. |

## Ingestion and refresh

- Requests are sequential and delayed by `CRAWL_DELAY_MS` (default 1100 ms).
- The crawler sends `PlacidWayAssessmentBot/1.0 (+URL; ...)` as its User-Agent. Set `CRAWLER_USER_AGENT` to the project URL or the hiring contact page before deploying. The default deliberately contains no personal email.
- robots.txt is checked before each run.
- Only URLs in `config/sources.js` are fetched. A redirect outside the allowlist fails the source.
- Refresh is conditional: ETag/Last-Modified and a content hash avoid rechunking unchanged pages.
- Content for one source is replaced transactionally only after extraction succeeds. A failed refresh does not wipe the index.
- The index version is stored in SQLite and the server reloads its in-memory index when the version changes.
- **Automatic refresh:** the server polls all configured pages every
  `AUTO_REFRESH_MINUTES` (default 15) and refreshes only changed sources.
  The first poll runs 15 seconds after startup. Set it to `0` to disable
  polling.
- **On-request refresh (stale-while-revalidate):** `/api/meta` and `/api/chat`
  check the last ingest. If it is older than `STALE_REFRESH_MINUTES`
  (default 5), a refresh starts in the background and the current index answers
  the request immediately. A single-flight guard plus a 60-second retry
  cooldown prevent crawl pile-ups. Set it to `0` to disable.
- Because PlacidWay does not send webhooks, detection is still poll/on-request
  based: a change is picked up on the next check, not instantly.
- Manual refresh remains available from the UI/API and CLI.

Refresh from the UI/API:

```bash
TOKEN=your-admin-token
curl -X POST http://localhost:3000/api/admin/refresh \
  -H "x-admin-token: $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"force":false}'
```

Or open `/admin`, paste the token, and use the buttons. `/admin` is optional:
it returns 404 until `ADMIN_TOKEN` is set. The public chat at `/` never asks for
a token.

## Intent routing

High-confidence intents (price, comparison, booking, medical, out-of-scope,
greeting, and messages naming a specific treatment) are handled deterministically.
When retrieval finds no relevant context and the message names no treatment or
country, an LLM intent router classifies the ambiguous message as `catalog`,
`clarify`, `smalltalk`, or `not_found`. Catalog/clarify replies use the same
localized templates; only a genuine, specific content gap becomes `not_found`.
This keeps the safety paths deterministic and calls the router only when it is
needed.

## Retrieval

For this corpus (about 135 chunks from seven pages), an in-process index is simpler and faster than a vector database:

- **BM25**: `minisearch` over title, heading, content, treatment, country, and page type.
- **Vectors**: cosine similarity over 2048-dimensional NVIDIA embeddings stored as SQLite BLOBs.
- **Fusion**: reciprocal rank fusion (`RRF_K=60`).
- **Boosts**: exact treatment/country matches; price queries favor package/price-list/comparison pages; inclusion queries favor package pages; video queries favor the videos page.
- **Gate**: a result must pass vector similarity, or BM25 plus at least one specific (non-generic) query term *and* cover at least `MIN_TERM_COVERAGE` (default 0.5) of the query's specific terms in the top chunks. Otherwise the bot does not call the LLM at all. The coverage rule stops questions such as "success rate of the adrenal cancer treatment" from passing on the word "adrenal" alone. The calibration section below shows the data behind both thresholds.

Upgrade path when the corpus grows: replace `src/rag/index.js` with pgvector or Qdrant behind the same `search()` interface.

## Grounding and honesty

The bot uses five response levels instead of a binary “knows / doesn’t know”:

| Level | Behaviour |
|---|---|
| Complete | Answer directly from retrieved evidence, with citations. |
| Partial | Answer the supported part and explicitly state what is not specified. |
| Clarify | Ask which treatment/package the visitor means when the question is in-domain but underspecified. |
| Unavailable | Explain that the seven pages do not contain the answer and offer a free quote. |
| Out of scope | Politely decline topics outside the seven pages. |

The system prompt is in `prompts/system.md`. It is versioned in code, not editable from a dashboard, so it can be reviewed and tested.

Key controls:

1. **Retrieval gate first.** An unsupported question gets an honest fallback before the model can guess. If the LLM is configured, a safe fallback explains the page scope in the visitor's language; it is rejected if it contains prices, URLs, medical advice, or no clear refusal.
2. **Deterministic intents.** Booking, medical advice, greetings, and obvious out-of-scope questions use tested templates, not free-form generation.
3. **Server-rendered citations.** The model returns `used_sources: ["S1"]`; the server maps IDs to URLs. Raw URLs in model output are stripped.
4. **JSON answer schema.** `answer`, `used_sources`, `answerable`, `needs_disclaimer`, `intent`.
5. **Numeric validator.** Every currency amount in the answer must appear in the cited context. A wrong price such as `$50` is rejected and replaced by a safe fallback.
6. **Medical-advice and prompt-leak checks.** These run after generation, not only inside the prompt.
7. **No answer cache for prices/medical.** This avoids serving stale prices; the sample's 72-hour cache was deliberately not copied.

Price facts are extracted from JSON-LD `Product/Offer` data and visible price tables, including the qualifier ("out-patient program", "in-patient program", "starting from", "optional/add-on"). Each stored fact also has a normalised `price_type` (`starting_from`, `program_price`, `add_on`, `clinic_listed`, `package_total`, `listed`), `last_updated` (ingest time), and, for program prices, `package_includes`: the bullet items under the matching "Included in the ... Program" heading. The database adds these columns on startup, so an existing `data/chatbot.db` keeps working; run `npm run ingest:force` once to fill them. Cost answers are built from these facts, not from the model's memory.

## API

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/chat` | `{sessionId?, message}` -> answer, sources, disclaimer, lead prompt. |
| `POST` | `/api/leads` | `{sessionId?, name, email, message?, consent, website?}` (honeypot). |
| `GET` | `/api/meta` | Site metadata, source status, index stats, last ingest. |
| `GET` | `/healthz` | Liveness/readiness and index summary. |
| `GET` | `/api/admin/unanswered` | Gap log (admin token). |
| `GET` | `/api/admin/sources` | Source status and last ingest run (admin token). |
| `POST` | `/api/admin/refresh` | Re-ingest changed sources (admin token). |

## Deployment

See [`design/production-hardening.md`](design/production-hardening.md) for
Jenkins SSH host-key pinning, production secret handling, rotation, and the
post-deploy verification checklist.

### Local, without Docker

```bash
npm install
npm run ingest       # only needed when the pages change
npm start            # uses PORT from .env, here 3200
```

Open `http://localhost:3200`.

### Local Docker, no Caddy

Useful when port 80 is already used by another service:

```bash
docker build -t placidway-chatbot .
docker run -d --name placidway-chatbot \
  --env-file .env \
  -e PORT=3000 \
  -e NODE_ENV=production \
  -e DATA_DIR=/app/data \
  -p 3300:3000 \
  -v "$PWD/data:/app/data" \
  placidway-chatbot
```

Open `http://localhost:3300`.

### Public deployment with Docker Compose and Caddy

```bash
cp .env.example .env
# set DOMAIN=bot.example.com, LLM_API_KEY, ADMIN_TOKEN
# on a fresh data volume, ingest once first:
docker compose run --rm app node scripts/ingest.js
docker compose up -d --build
```

Compose forces `PORT=3000` inside the container, regardless of the local
`PORT` in `.env`, so Caddy always reaches `app:3000`. Caddy obtains HTTPS
automatically when `DOMAIN` points to the server. The app listens on `3000`
inside the Compose network; only Caddy exposes `80/443`.

If ports 80/443 are already used on the host, set `HTTP_PORT` and `HTTPS_PORT`
in `.env` (for example `HTTP_PORT=8080`, `HTTPS_PORT=8443`) or put Caddy behind
an existing reverse proxy.

The chat request can take several seconds because it performs retrieval, an
embedding call, and an LLM call. If you put another proxy (Nginx, Cloudflare,
or a hosting platform) in front of the app, set its read/response timeout to at
least 120 seconds. A shorter timeout closes the connection and the browser
shows a generic `NetworkError` even though the backend is still working.

Checklist for the assessment's 7-day uptime requirement:

- Point a DNS `A` record at the server.
- Open ports 80 and 443.
- Set `restart: unless-stopped` (already in Compose).
- Monitor `GET /healthz` with UptimeRobot or similar.
- Keep the `data/` volume; it holds the SQLite database and index state.
- Automatic refresh polls every `AUTO_REFRESH_MINUTES` (default 15); an active visitor can also trigger a background refresh after `STALE_REFRESH_MINUTES` (default 5). For a manual check, run `docker compose exec app node scripts/ingest.js` (or `npm run ingest` outside Docker).

## Tests and test results

```bash
npm test          # 48 unit tests
npm run eval:required  # the 8 assessment questions, verbatim from the brief
npm run calibrate # deterministic retrieval check and threshold sweep (no LLM)
npm run eval      # requires a running server and a configured LLM key
```

`npm run eval` writes `eval/results.md` with each question, the answer, the cited sources, latency, and heuristic checks. The suite covers the eight required cases plus Spanish, Arabic, dental-implant-not-in-content, price-list, prompt injection, videos, a general alternative-medicine comparison, accommodation, guaranteed-cure refusal, IDR conversion refusal, phone-not-in-content, cheapest-treatment refusal, and an ambiguous comparison that requires clarification.

If you run the eval repeatedly in a short window, raise the rate limit for the test run:

```bash
RATE_LIMIT_MAX=1000 npm start
BASE_URL=http://localhost:3000 npm run eval
```

The repository has 48/48 unit tests passing and `npm audit --omit=dev` reports **0 vulnerabilities** (zod 4 and @mozilla/readability 0.6). The current `eval/results.md` is a **live LLM run** (44/44 heuristics) using `flazhost-agent`; it includes the eight required cases plus Spanish, Arabic, dental-implant-not-in-content, price-list, prompt injection, videos, a general alternative-medicine comparison, accommodation, guaranteed-cure refusal, IDR conversion refusal, phone-not-in-content, cheapest-treatment refusal, an ambiguous comparison that requires clarification, and the adenocarcinoma-definition case. Rerun `npm run eval` after any prompt, retrieval, or source change.

## Evaluation metrics

`npm run eval` reports two kinds of checks.

- **Heuristic checks** (substring and refusal wording) are cheap and deterministic. They are not evidence of accuracy on their own.
- **Metrics that do not depend on wording**, each computed from the labelled dataset in `eval/questions.json`:

| Metric | Meaning |
|---|---|
| Abstention accuracy | Answered when the labelled answer exists in the pages; declined when it does not. |
| Citation recall | An answer cites at least one labelled page (`expectedSources`). |
| Citation precision | Share of cited pages that are labelled correct, averaged over answers. |
| Unsupported amount | A currency figure in the answer appears nowhere in the ingested pages. This is a hallucination proxy that is independent of the validator. |
| Disclaimer repeated | The medical disclaimer appears more than once in one conversation. |
| LLM judge (`JUDGE=1`) | A second LLM call checks each claim against the cited page text. It is for evaluation only and is never used at runtime. |

`eval/questions.json` has 44 cases: the 22 original cases, the 8 required questions, and 14 additional paraphrase, Indonesian, follow-up, trap, and refusal cases. Each case has `answerable` (true/false/null) and `expectedSources` (any of the listed page IDs is a correct hit).

`eval/required-8.json` holds the eight questions from the assessment brief, with the bracketed parts filled in (adenocarcinoma, Mexico and Turkey). Run it with `npm run eval:required`; it writes `eval/required-8-results.md`.

## Calibration

`npm run calibrate` runs the retrieval step without any LLM call, over `eval/retrieval-cases.json` (14 answerable and 11 not-in-content cases, 25 total). It reports recall@K and sweeps `MIN_BM25_SCORE` and `MIN_TERM_COVERAGE`, then writes `eval/retrieval-calibration.md`.

What the sweep shows:

- `MIN_BM25_SCORE` made no difference between 0.5 and 6 on this set. It is kept at 2.
- `MIN_TERM_COVERAGE` 0.34–0.5 gives the best balanced accuracy. Above 0.5 it blocks correct answers, so 0.5 is used.
- Before the coverage rule, the gate let through one not-in-content question. After it, all 25 gate decisions match the labels.

Caveat: these 25 cases are also the cases used to notice the failure, so the result is optimistic. A held-out set of questions the bot has never seen is the next step. The threshold values are for this seven-page corpus and must be re-checked if the pages change.

## Design choices

**Why not fork the FlazCloud `agent-worker.js`?** It is a production multi-tenant WhatsApp/CS runtime. It depends on PostgreSQL + pgvector, Redis, MongoDB, the AI Gateway, and a worker protocol. More importantly, its response payload returns only a count of knowledge chunks, not source URLs, and its KB-gap check computes `match_score` from a vector query that selects `similarity`, so the vector path always looks like a gap. Reusing the proven patterns was more valuable than inheriting those constraints.

**Why no LangChain or LlamaIndex?** The assessment asks for visible ingestion, retrieval, and grounding logic. Plain modules are easier to review and explain in a 45-minute code walkthrough.

**Why no pgvector?** Seven pages produce ~135 chunks. Brute-force cosine is milliseconds; SQLite + an in-memory index removes a database and an extension from the critical path. The `search()` interface is the upgrade seam.

**Why deterministic price facts?** The sample's own `aiAgentPriceLookup.js` documents that price chunks make models hallucinate. Prices are the highest-risk fact in this assessment, so they are extracted structurally and validated numerically.

## Known limitations

- The comparison page is a dynamic directory of clinic-level prices. Those prices are useful for a general alternative-medicine comparison, but they are not like-for-like treatment quotes; the bot must not present them as such.
- Price facts depend on the page's current JSON-LD/table structure; a redesign can require parser updates.
- The model can still paraphrase qualitative claims; the numeric validator covers prices, not every sentence.
- The embedding endpoint is an external dependency (NVIDIA free endpoint). If it is rate-limited or down, the app falls back to BM25 plus the domain glossary, which is weaker for paraphrase and languages outside the glossary.
- SQLite is single-node. It is sufficient for this assessment, not for a large multi-tenant deployment.
- No streaming responses yet; answers are returned in one request with a 30-second timeout.
- The chat is public by design and rate-limited, but it has no user authentication.
- Clinic-level prices on the comparison page can change independently of the package pages; refresh the index before a review.
- Add-on prices taken from JSON-LD are stored as `listed` rather than `add_on`, because the qualifier inference does not see them as optional. `price_type` is therefore not reliable for those rows. The answer layer does not read `price_type` yet; it only uses the stored fact and its qualifier.
- The relevance gate was calibrated on 25 cases that were also used to find the failure. Results on unseen questions may be lower.
- The live answer path depends on the LLM gateway. When the gateway times out, factual questions return the generic error message instead of an answer built from the retrieved passages. Retrieval and refusals keep working because they run before the LLM.

## What I would improve with another week

- Add a cross-encoder reranker over the top 20 candidates.
- Build a multilingual eval set with native-speaker review.
- Add a content-diff review screen for price changes before publishing.
- Add streaming responses and a typing indicator over SSE.
- Add scheduled ingestion with an alert when a source fails.
- Add per-answer thumbs up/down and link them to the gap log.
- Move to pgvector/Qdrant if the source count grows beyond a few dozen pages.
- Add an automated regression suite that runs the 8 questions on every prompt change.

## Deliverables checklist

- [x] Code in a self-contained repository
- [x] README with setup, architecture, tools, and models
- [x] Live `eval/results.md` from `flazhost-agent` (44/44 heuristics)
- [x] Unit tests (`npm test`)
- [x] Admin gap log and refresh
- [x] Short write-up (half a page) in `WRITEUP.md`
- [x] Public live URL: `https://placidway.apps.flazhost.com`
- [x] Seventh source URL configured
