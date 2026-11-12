import { hasLlm } from '../config.js';
import { detectIntent } from '../guard/intent.js';
import { embedOne } from '../ingest/embed.js';
import { rewriteQuery } from '../llm/client.js';
import { knowledgeIndex, queryTerms } from '../rag/index.js';
import { assessRelevance } from '../rag/relevance.js';
import { findPriceFacts } from '../store/db.js';
import { logger } from '../util/logger.js';
import { allowedEntitySets, candidateAllowed } from './context.js';
import { attachPriceSources, prioritizePriceFacts } from './prices.js';

export async function retrieveContext({ effectiveQuery, effectiveIntent, intent, history, message }) {
  let queryEmbedding = null;
  try {
    queryEmbedding = await embedOne(effectiveQuery);
  } catch (_) {
    queryEmbedding = null;
  }

  let retrieval = knowledgeIndex.search(effectiveQuery, queryEmbedding);
  let results = retrieval.results.slice();
  if (intent.isFollowUp) {
    const focusTerms = queryTerms(message).filter(
      (term) => !['about', 'what', 'and', 'the', 'is', 'it', 'this', 'that'].includes(term)
    );
    const treatment = String(effectiveIntent.treatment || '').toLowerCase();
    const followScore = (result) => {
      const text = String(result.content || '').toLowerCase();
      let score = 0;
      for (const term of focusTerms) {
        if (text.includes(term)) score += 2;
      }
      if (treatment && text.includes(treatment)) score += 1;
      return score;
    };
    results.sort((a, b) => followScore(b) - followScore(a) || b.score - a.score);
  }
  const wantsPriceFacts =
    Boolean(effectiveIntent.treatment) &&
    (effectiveIntent.type === 'cost' ||
      effectiveIntent.type === 'comparison' ||
      effectiveIntent.type === 'procedure' ||
      effectiveIntent.type === 'catalog' ||
      effectiveIntent.isPrice ||
      effectiveIntent.isComparison ||
      /\b(package|paket|include|included|termasuk|isi paket|apa saja)\b/i.test(message));
  let priceFacts = wantsPriceFacts
    ? prioritizePriceFacts(
        findPriceFacts({
          treatment: effectiveIntent.treatment,
          countries: effectiveIntent.countries,
        }),
        effectiveIntent.treatment
      )
    : [];
  attachPriceSources(priceFacts, results);

  const missingCountries =
    effectiveIntent.type === 'comparison'
      ? effectiveIntent.countries.filter(
          (country) =>
            !priceFacts.some((fact) =>
              String(fact.country || '').toLowerCase().includes(country.toLowerCase())
            )
        )
      : [];
  const comparisonNotes = missingCountries.length
    ? [
        `The visitor asked about ${missingCountries.join(
          ' or '
        )}, but no SOURCE contains a treatment-specific price for that destination. Do not invent one. State that only ${[
          ...new Set(priceFacts.map((fact) => fact.country).filter(Boolean)),
        ].join(', ') || 'the available destination'} has a treatment-specific price in the pages and give the available price.`,
      ]
    : [];
  const followUpNotes = intent.isFollowUp
    ? [
        `The visitor's current question is: "${message}". Answer that exact question. If SOURCES mention related facts (for example program duration or follow-up schedule) but not the exact requested detail, state what is available and clearly say the missing detail is not listed. Do not substitute a different FAQ or topic.`,
      ]
    : [];
  const promptNotes = [...comparisonNotes, ...followUpNotes];

  let relevance = assessRelevance({
    query: effectiveQuery,
    results,
    maxSimilarity: retrieval.maxSimilarity,
    bm25TopScore: retrieval.bm25TopScore,
    matchedTerms: retrieval.matchedTerms,
    specificMatches: retrieval.specificMatches,
    specificTotal: retrieval.specificTotal,
    priceFacts,
    intent: effectiveIntent,
  });

  let retrievalMeta = {
    query: effectiveQuery,
    chunks: results.length,
    maxSimilarity: Number(retrieval.maxSimilarity.toFixed(4)),
    bm25TopScore: Number(retrieval.bm25TopScore.toFixed(4)),
    matchedTerms: retrieval.matchedTerms,
    gate: relevance.reason,
    priceFacts: priceFacts.length,
    missingCountries,
    retried: false,
  };

  if (!relevance.ok && hasLlm && !intent.isFollowUp && effectiveIntent.hasDomainEntity) {
    try {
      const expanded = await rewriteQuery({ question: effectiveQuery, history });
      const candidate = String(expanded.standaloneQuery || '').trim();
      const candidateIntent = detectIntent(candidate);
      const allowed = allowedEntitySets(effectiveIntent, history);
      if (candidateAllowed(candidate, candidateIntent, allowed)) {
        const retryEmbedding = await embedOne(candidate).catch(() => null);
        const retryRetrieval = knowledgeIndex.search(candidate, retryEmbedding);
        const retryResults = retryRetrieval.results.slice();
        const retryPriceFacts = priceFacts.map((fact) => ({ ...fact }));
        attachPriceSources(retryPriceFacts, retryResults);
        const retryRelevance = assessRelevance({
          query: candidate,
          results: retryResults,
          maxSimilarity: retryRetrieval.maxSimilarity,
          bm25TopScore: retryRetrieval.bm25TopScore,
          matchedTerms: retryRetrieval.matchedTerms,
          specificMatches: retryRetrieval.specificMatches,
          specificTotal: retryRetrieval.specificTotal,
          priceFacts: retryPriceFacts,
          intent: { ...effectiveIntent, ...candidateIntent },
        });
        if (retryRelevance.ok) {
          effectiveQuery = candidate;
          effectiveIntent = {
            ...effectiveIntent,
            ...candidateIntent,
            language: intent.language,
            type: candidateIntent.type === 'greeting' ? 'question' : candidateIntent.type,
          };
          retrieval = retryRetrieval;
          results = retryResults;
          priceFacts = retryPriceFacts;
          relevance = retryRelevance;
          retrievalMeta = {
            query: candidate,
            chunks: retryResults.length,
            maxSimilarity: Number(retryRetrieval.maxSimilarity.toFixed(4)),
            bm25TopScore: Number(retryRetrieval.bm25TopScore.toFixed(4)),
            matchedTerms: retryRetrieval.matchedTerms,
            gate: retryRelevance.reason,
            priceFacts: retryPriceFacts.length,
            missingCountries,
            retried: true,
          };
          logger.info({ candidate }, 'Retrieval succeeded after query rewrite');
        }
      }
    } catch (error) {
      logger.warn({ err: error.message }, 'Query rewrite retry failed');
    }
  }

  return {
    effectiveQuery,
    effectiveIntent,
    retrieval,
    results,
    priceFacts,
    missingCountries,
    promptNotes,
    relevance,
    retrievalMeta,
  };
}
