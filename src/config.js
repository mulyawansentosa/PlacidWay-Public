import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

function int(name, fallback) {
  const value = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(value) ? value : fallback;
}

function float(name, fallback) {
  const value = Number.parseFloat(process.env[name] ?? '');
  return Number.isFinite(value) ? value : fallback;
}

function trimUrl(value) {
  return String(value || '').replace(/\/+$/, '');
}

const dataDir = process.env.DATA_DIR
  ? path.resolve(rootDir, process.env.DATA_DIR)
  : path.join(rootDir, 'data');

const llmBaseUrl = trimUrl(process.env.LLM_BASE_URL || 'https://your-openai-compatible-gateway.example/v1');
const llmApiKey = process.env.LLM_API_KEY || '';
const embeddingBaseUrl = trimUrl(process.env.EMBEDDING_BASE_URL || '');

export const config = {
  rootDir,
  dataDir,
  dbPath: process.env.DB_PATH ? path.resolve(rootDir, process.env.DB_PATH) : path.join(dataDir, 'chatbot.db'),
  publicDir: path.join(rootDir, 'public'),
  promptPath: path.join(rootDir, 'prompts', 'system.md'),
  port: int('PORT', 3000),
  siteName: process.env.SITE_NAME || 'PlacidWay Assistant',
  contactUrl:
    process.env.CONTACT_URL ||
    'https://www.placidway.com/rfi/5/Alternative-Cancer-Treatment-by-ITC-Immunity-Therapy-Center',
  adminToken: process.env.ADMIN_TOKEN || '',
  isProduction: process.env.NODE_ENV === 'production',
  llm: {
    baseUrl: llmBaseUrl,
    apiKey: llmApiKey,
    model: process.env.LLM_MODEL || 'flazhost-agent',
    temperature: float('LLM_TEMPERATURE', 0),
    maxTokens: int('LLM_MAX_TOKENS', 700),
    timeoutMs: int('LLM_TIMEOUT_MS', 30_000),
  },
  embedding: {
    baseUrl: embeddingBaseUrl,
    apiKey: process.env.EMBEDDING_API_KEY || (embeddingBaseUrl ? llmApiKey : ''),
    model: process.env.EMBEDDING_MODEL || 'openai/text-embedding-3-small',
    inputType: process.env.EMBEDDING_INPUT_TYPE || '',
    timeoutMs: int('EMBEDDING_TIMEOUT_MS', 60_000),
  },
  ingest: {
    userAgent:
      process.env.CRAWLER_USER_AGENT ||
      'PlacidWayAssessmentBot/1.0 (+https://example.com/bot; set CRAWLER_USER_AGENT to a project URL or contact page)',
    delayMs: int('CRAWL_DELAY_MS', 1_100),
    timeoutMs: int('CRAWL_TIMEOUT_MS', 30_000),
    maxChunkChars: int('CHUNK_MAX_CHARS', 1_100),
    minChunkChars: int('CHUNK_MIN_CHARS', 80),
    overlapChars: int('CHUNK_OVERLAP_CHARS', 150),
    autoRefreshMinutes: int('AUTO_REFRESH_MINUTES', 15),
    staleRefreshMinutes: int('STALE_REFRESH_MINUTES', 5),
  },
  retrieval: {
    topK: int('RETRIEVAL_TOP_K', 6),
    minVectorSimilarity: float('MIN_VECTOR_SIMILARITY', 0.35),
    minBm25Score: float('MIN_BM25_SCORE', 2),
    minTermCoverage: float('MIN_TERM_COVERAGE', 0.5),
    rrfK: int('RRF_K', 60),
  },
  rateLimit: {
    windowMs: int('RATE_LIMIT_WINDOW_MS', 60_000),
    max: int('RATE_LIMIT_MAX', 20),
  },
  trustProxy: process.env.TRUST_PROXY === 'false' ? false : int('TRUST_PROXY', 1),
};

export const hasLlm = Boolean(config.llm.apiKey);
export const hasEmbeddings = Boolean(config.embedding.baseUrl && config.embedding.apiKey);
