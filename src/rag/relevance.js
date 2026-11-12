import { config } from '../config.js';

/**
 * Decides whether the retrieved context is strong enough to answer. This gate
 * is deliberately separate from the LLM: an unsupported question should not
 * get a fluent guess just because the model is confident.
 */
export function assessRelevance({
  query,
  results = [],
  maxSimilarity = 0,
  bm25TopScore = 0,
  matchedTerms = 0,
  specificMatches = 0,
  specificTotal,
  priceFacts = [],
  intent = null,
  thresholds = {},
}) {
  const minVectorSimilarity = thresholds.minVectorSimilarity ?? config.retrieval.minVectorSimilarity;
  const minBm25Score = thresholds.minBm25Score ?? config.retrieval.minBm25Score;
  const minTermCoverage = thresholds.minTermCoverage ?? config.retrieval.minTermCoverage;
  // Share of the query's specific terms that appear in the top chunks. A question
  // about something the pages never mention ("success rate") can still match on
  // the treatment name alone, so the uncovered terms must be checked too.
  const coverage = specificTotal ? specificMatches / specificTotal : 1;
  if (priceFacts.length) {
    return { ok: true, reason: 'price_fact_match', matchedTerms };
  }
  if (!results.length) {
    return { ok: false, reason: 'no_results', matchedTerms };
  }
  if (maxSimilarity >= minVectorSimilarity) {
    return { ok: true, reason: 'vector_similarity', matchedTerms };
  }
  if (
    bm25TopScore >= minBm25Score &&
    matchedTerms >= 2 &&
    specificMatches >= 1 &&
    coverage >= minTermCoverage
  ) {
    return { ok: true, reason: 'bm25_terms', matchedTerms };
  }

  const queryLower = String(query || '').toLowerCase();
  const entityInTop = results.slice(0, 3).some((result) => {
    const treatment = String(result.treatment || '').toLowerCase();
    const country = String(result.country || '').toLowerCase();
    return (
      (treatment && treatment.split(/\s+/).some((word) => word.length > 3 && queryLower.includes(word))) ||
      (country && queryLower.includes(country))
    );
  });
  if (entityInTop && matchedTerms >= 1 && specificMatches >= 1 && coverage >= minTermCoverage) {
    return { ok: true, reason: 'entity_match', matchedTerms };
  }

  if (intent?.type === 'comparison' && results.length >= 2) {
    return { ok: true, reason: 'comparison_context', matchedTerms };
  }

  return { ok: false, reason: 'low_relevance', matchedTerms };
}
