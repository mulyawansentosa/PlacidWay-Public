import { config, hasEmbeddings } from '../config.js';
import { logger } from '../util/logger.js';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toFloat32Array(values) {
  const array = new Float32Array(values.length);
  for (let index = 0; index < values.length; index += 1) {
    array[index] = Number(values[index]);
  }
  return array;
}

function inputTypeFor(role) {
  if (config.embedding.inputType) {
    return config.embedding.inputType === 'none' ? '' : config.embedding.inputType;
  }
  // Nemotron 3.5 embedding models are asymmetric: queries and passages must
  // use different input_type values.
  if (/nemotron-3\.5-embed/i.test(config.embedding.model)) return role;
  return '';
}

async function requestEmbeddings(input, inputType = '') {
  const url = `${config.embedding.baseUrl}/embeddings`;
  const headers = { 'Content-Type': 'application/json' };
  if (config.embedding.apiKey) headers.Authorization = `Bearer ${config.embedding.apiKey}`;
  const body = { model: config.embedding.model, input };
  if (inputType) body.input_type = inputType;

  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(config.embedding.timeoutMs),
      });
      if (response.status === 429 || response.status >= 500) {
        throw new Error(`Embedding API ${response.status}`);
      }
      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(`Embedding API ${response.status}: ${body.slice(0, 300)}`);
      }
      const payload = await response.json();
      const rows = payload.data || [];
      return rows
        .slice()
        .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
        .map((row) => toFloat32Array(row.embedding || []));
    } catch (error) {
      lastError = error;
      if (attempt < 2) await sleep(400 * (attempt + 1));
    }
  }
  throw lastError || new Error('Embedding request failed');
}

export async function embedTexts(texts, { batchSize = 16 } = {}) {
  if (!hasEmbeddings) {
    logger.warn('Embeddings are not configured; chunks will be stored without vectors.');
    return null;
  }
  const vectors = [];
  for (let start = 0; start < texts.length; start += batchSize) {
    const batch = texts.slice(start, start + batchSize);
    const batchVectors = await requestEmbeddings(batch, inputTypeFor('passage'));
    vectors.push(...batchVectors);
  }
  return vectors;
}

export async function embedOne(text) {
  if (!hasEmbeddings) return null;
  try {
    const [vector] = await requestEmbeddings([text], inputTypeFor('query'));
    return vector || null;
  } catch (error) {
    logger.warn({ err: error.message }, 'Embedding query failed; falling back to BM25');
    return null;
  }
}
