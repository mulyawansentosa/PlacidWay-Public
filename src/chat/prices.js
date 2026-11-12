import { knowledgeIndex } from '../rag/index.js';
import { formatAmount } from './text.js';

export function attachPriceSources(priceFacts, results) {
  for (const fact of priceFacts) {
    let index = results.findIndex((result) => result.sourceId === fact.source_id);
    if (index < 0) {
      const extra = knowledgeIndex.chunks.find((chunk) => chunk.sourceId === fact.source_id);
      if (extra && results.length < 8) {
        results.push({ ...extra, score: 0, similarity: 0 });
        index = results.length - 1;
      }
    }
    fact.sourceLabel = index >= 0 ? `S${index + 1}` : 'unknown';
  }
  return priceFacts;
}

export function isHeadlinePrice(fact) {
  const qualifier = String(fact.qualifier || '').toLowerCase();
  const treatment = String(fact.treatment || '').toLowerCase();
  if (/optional|add-on/.test(qualifier)) return false;
  if (/lak|killer|ethanol|ablation|mononuclear|intratumoral|transfusion|consultation/.test(treatment)) {
    return false;
  }
  return /starting from|program|package|listed price|price list/.test(qualifier);
}

export function prioritizePriceFacts(facts, treatment) {
  const normalized = String(treatment || '').toLowerCase();
  const headline = facts.filter(isHeadlinePrice);
  const pool = headline.length ? headline : facts;
  return pool
    .slice()
    .sort((a, b) => {
      const aMatch = normalized && String(a.treatment || '').toLowerCase().includes(normalized) ? 1 : 0;
      const bMatch = normalized && String(b.treatment || '').toLowerCase().includes(normalized) ? 1 : 0;
      if (aMatch !== bMatch) return bMatch - aMatch;
      return (a.amount || 0) - (b.amount || 0);
    })
    .slice(0, 8);
}

export function priceFallback(priceFacts) {
  if (!priceFacts.length) return null;
  const lines = priceFacts.slice(0, 3).map((fact) => {
    const amount =
      fact.amount_max != null && fact.amount_max !== fact.amount
        ? `${fact.currency || 'USD'} ${formatAmount(fact.amount)} - ${formatAmount(fact.amount_max)}`
        : `${fact.currency || 'USD'} ${formatAmount(fact.amount)}`;
    const where = [fact.treatment, fact.country].filter(Boolean).join(' in ');
    return `- ${where || 'Listed price'}: ${amount}${fact.qualifier ? ` (${fact.qualifier})` : ''} [${fact.sourceLabel}]`;
  });
  return [
    'The PlacidWay pages list the following price information:',
    ...lines,
    '',
    'I can only quote what the pages state. For an exact quote that matches your case, please request a free quote from the PlacidWay team.',
  ].join('\n');
}

export function comparisonFallback(priceFacts, missingCountries) {
  const countries = [...new Set(priceFacts.map((fact) => fact.country).filter(Boolean))];
  if (missingCountries.length) {
    return [
      `The pages I have list treatment-specific prices for ${countries.join(', ') || 'one destination'}, but not for ${missingCountries.join(
        ' or '
      )}. I cannot make a like-for-like comparison without inventing data.`,
      '',
      priceFallback(priceFacts),
    ].join('\n');
  }
  return [
    'The PlacidWay pages list these prices for the destinations in your question:',
    ...priceFacts.slice(0, 6).map((fact) => {
      const amount =
        fact.amount_max != null && fact.amount_max !== fact.amount
          ? `${fact.currency || 'USD'} ${formatAmount(fact.amount)} - ${formatAmount(fact.amount_max)}`
          : `${fact.currency || 'USD'} ${formatAmount(fact.amount)}`;
      return `- ${fact.country}: ${amount}${fact.qualifier ? ` (${fact.qualifier})` : ''} [${fact.sourceLabel}]`;
    }),
    '',
    'I can only compare the prices that appear on the pages. For an exact quote, please request a free quote from the PlacidWay team.',
  ].join('\n');
}

export function isQuoteIntent(intent, priceFacts) {
  return Boolean(priceFacts.length) || ['cost', 'comparison', 'procedure'].includes(intent.type);
}
