import { sourceListFromIds } from '../llm/validate.js';
import { queryTerms } from '../rag/index.js';
import { followUpResult } from './context.js';
import { extractiveFallback } from './fallbacks.js';
import { comparisonFallback, isQuoteIntent, priceFallback } from './prices.js';

export function answerWithoutLlm({
  results,
  priceFacts,
  missingCountries,
  effectiveIntent,
  intent,
  templates,
  message,
}) {
  let deterministicPrice = null;
  if (effectiveIntent.type === 'comparison' && priceFacts.length) {
    deterministicPrice = comparisonFallback(priceFacts, missingCountries);
  } else if (effectiveIntent.type === 'cost' && priceFacts.length) {
    deterministicPrice = priceFallback(priceFacts);
  }
  let selectedResults = results;
  let focusTerms = [];
  if (!deterministicPrice && intent.isFollowUp) {
    const followUp = followUpResult(results, message);
    selectedResults = followUp ? [followUp] : [];
    focusTerms = queryTerms(message).filter(
      (term) => !['about', 'what', 'and'].includes(term)
    );
  }
  const answer =
    deterministicPrice || extractiveFallback(selectedResults, templates, focusTerms);
  const sources = deterministicPrice
    ? sourceListFromIds(priceFacts.map((fact) => fact.sourceLabel), results)
    : sourceListFromIds(['S1'], selectedResults);

  return { answer, sources, leadPrompt: isQuoteIntent(effectiveIntent, priceFacts) };
}
