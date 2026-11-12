import MiniSearch from 'minisearch';
import { config } from '../config.js';
import { getIndexVersion, listAllChunks } from '../store/db.js';

function bufferToVector(buffer) {
  if (!buffer || !buffer.byteLength) return null;
  if (buffer.byteLength % 4 !== 0) return null;
  try {
    return new Float32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 4);
  } catch (_) {
    return null;
  }
}

function cosine(a, b) {
  if (!a || !b || a.length !== b.length || !a.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let index = 0; index < a.length; index += 1) {
    dot += a[index] * b[index];
    normA += a[index] * a[index];
    normB += b[index] * b[index];
  }
  if (!normA || !normB) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

const STOPWORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'to', 'of', 'in', 'on', 'for', 'and', 'or',
  'what', 'how', 'much', 'does', 'do', 'can', 'i', 'you', 'it', 'this', 'that', 'with', 'about',
  'please', 'tell', 'me', 'my', 'we', 'our', 'be', 'been', 'from', 'at', 'by', 'as', 'if',
  'apa', 'berapa', 'yang', 'dan', 'di', 'ke', 'dari', 'untuk', 'itu', 'ini', 'saya', 'bisa',
  'cuanto', 'cuesta', 'que', 'el', 'la', 'los', 'las', 'de', 'en', 'y', 'es', 'por', 'para',
  'many', 'long', 'there', 'have', 'has', 'any', 'which', 'when', 'where', 'who', 'your', 'their',
]);

const GENERIC_TERMS = new Set([
  'cost', 'costs', 'price', 'prices', 'pricing', 'treatment', 'treatments', 'cancer',
  'clinic', 'clinics', 'package', 'packages', 'include', 'included', 'inclusion',
  'program', 'programs', 'procedure', 'procedures', 'country', 'mexico', 'tijuana', 'therapy', 'therapies',
  'offer', 'offers',
]);

// "weeks" must match "week" in the pages, so plural forms are reduced to a
// singular stem before matching. Only words of 5+ letters ending in "s" change.
function stem(term) {
  return term.length >= 5 && term.endsWith('s') && !term.endsWith('ss') ? term.slice(0, -1) : term;
}

export function queryTerms(query) {
  return String(query || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((term) => term.length >= 3 && !STOPWORDS.has(term))
    .map(stem)
    .slice(0, 14);
}

// Whole-word match with an optional plural ending, so "option" does not match
// "optional" and "week" matches "3-week" or "weeks".
function termPattern(term) {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}(s|es)?(?![\\p{L}\\p{N}])`, 'u');
}

function countMatchedTerms(terms, text) {
  const haystack = String(text || '').toLowerCase();
  let matches = 0;
  for (const term of terms) {
    if (termPattern(term).test(haystack)) matches += 1;
  }
  return matches;
}

export class KnowledgeIndex {
  constructor() {
    this.version = null;
    this.chunks = [];
    this.byId = new Map();
    this.mini = null;
  }

  async ensureFresh() {
    const version = getIndexVersion();
    if (this.version === version && this.mini) return false;
    this.load();
    this.version = version;
    return true;
  }

  load() {
    const rows = listAllChunks();
    this.chunks = rows.map((row) => {
      let metadata = {};
      try {
        metadata = row.metadata ? JSON.parse(row.metadata) : {};
      } catch (_) {
        metadata = {};
      }
      return {
        id: row.id,
        sourceId: row.source_id,
        chunkIndex: row.chunk_index,
        heading: row.heading || '',
        content: row.content || '',
        url: row.url,
        title: row.source_title || '',
        pageType: row.page_type || 'page',
        treatment: row.source_treatment || metadata.treatment || '',
        country: row.source_country || metadata.country || '',
        clinic: row.source_clinic || metadata.clinic || '',
        embedding: bufferToVector(row.embedding),
      };
    });
    this.byId = new Map(this.chunks.map((chunk) => [chunk.id, chunk]));

    this.mini = new MiniSearch({
      fields: ['title', 'heading', 'content', 'treatment', 'country', 'pageType'],
      storeFields: ['id'],
      idField: 'id',
      searchOptions: {
        boost: { title: 2.2, heading: 1.8, treatment: 2.2, country: 1.8, content: 1 },
        fuzzy: 0.2,
        prefix: true,
        combineWith: 'OR',
      },
    });
    this.mini.addAll(
      this.chunks.map((chunk) => ({
        id: chunk.id,
        title: chunk.title,
        heading: chunk.heading,
        content: chunk.content,
        treatment: chunk.treatment,
        country: chunk.country,
        pageType: chunk.pageType,
      }))
    );
  }

  stats() {
    return {
      version: this.version,
      chunks: this.chunks.length,
      embeddedChunks: this.chunks.filter((chunk) => chunk.embedding).length,
      sources: new Set(this.chunks.map((chunk) => chunk.sourceId)).size,
    };
  }

  /**
   * Hybrid retrieval: BM25 and cosine rankings are fused with reciprocal rank
   * fusion. A small metadata boost keeps treatment/country queries on topic.
   */
  search(query, queryEmbedding = null, options = {}) {
    const topK = options.topK || config.retrieval.topK;
    const terms = queryTerms(query);
    let bm25 = [];
    try {
      bm25 = this.mini.search(query, { boost: { title: 2.2, heading: 1.8, treatment: 2.2, country: 1.8 } });
    } catch (_) {
      bm25 = [];
    }

    const vectorRanked = [];
    if (queryEmbedding) {
      for (const chunk of this.chunks) {
        if (!chunk.embedding) continue;
        const similarity = cosine(queryEmbedding, chunk.embedding);
        if (similarity > 0) vectorRanked.push({ chunk, similarity });
      }
      vectorRanked.sort((a, b) => b.similarity - a.similarity);
    }

    const fused = new Map();
    const bump = (id, amount) => {
      if (!fused.has(id)) fused.set(id, 0);
      fused.set(id, fused.get(id) + amount);
    };

    bm25.slice(0, 30).forEach((result, rank) => {
      bump(result.id, 1 / (config.retrieval.rrfK + rank + 1));
    });
    vectorRanked.slice(0, 30).forEach((result, rank) => {
      bump(result.chunk.id, 1 / (config.retrieval.rrfK + rank + 1));
    });

    const queryLower = String(query || '').toLowerCase();
    const isPriceQuery = /\b(price|cost|how much|harga|biaya|cuanto|cuesta|تكلفة|سعر)\b/i.test(query);
    const isInclusionQuery = /\b(includ|what.*package|apa saja|qué incluye|يشمل)\b/i.test(query);
    const isVideoQuery = /\b(video|watch)\b/i.test(query);

    const results = [];
    for (const [id, score] of fused) {
      const chunk = this.byId.get(id);
      if (!chunk) continue;
      let boosted = score;
      if (chunk.treatment && queryLower.includes(chunk.treatment.toLowerCase())) boosted += 0.01;
      if (chunk.country && queryLower.includes(chunk.country.toLowerCase())) boosted += 0.01;
      if (isPriceQuery && ['price_list', 'comparison', 'package'].includes(chunk.pageType)) boosted += 0.012;
      if (isInclusionQuery && chunk.pageType === 'package') boosted += 0.01;
      if (isVideoQuery && chunk.pageType === 'videos') boosted += 0.02;
      results.push({ ...chunk, score: boosted });
    }
    results.sort((a, b) => b.score - a.score);

    const top = results.slice(0, topK);
    const maxSimilarity = vectorRanked.length ? vectorRanked[0].similarity : 0;
    const bm25TopScore = bm25[0]?.score || 0;
    const topText = top
      .slice(0, 3)
      .map((chunk) => `${chunk.title} ${chunk.heading} ${chunk.content}`)
      .join(' ');
    const matchedTerms = terms.length ? countMatchedTerms(terms, topText) : 0;
    const specificTerms = terms.filter((term) => !GENERIC_TERMS.has(term));
    const specificMatches = specificTerms.length ? countMatchedTerms(specificTerms, topText) : 0;

    return {
      results: top,
      maxSimilarity,
      bm25TopScore,
      matchedTerms,
      specificMatches,
      specificTotal: specificTerms.length,
      queryTerms: terms,
      hasVector: Boolean(queryEmbedding),
    };
  }
}

export const knowledgeIndex = new KnowledgeIndex();
