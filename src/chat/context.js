import { detectIntent } from '../guard/intent.js';
import { containsNonLatin } from '../guard/translate.js';
import { queryTerms } from '../rag/index.js';

export function followUpResult(results, message) {
  const terms = queryTerms(message).filter((term) => !['about', 'what', 'time', 'and'].includes(term));
  if (!terms.length) return null;
  let best = null;
  let bestScore = 0;
  for (const result of results) {
    const text = String(result.content || '').toLowerCase();
    const score = terms.filter((term) => text.includes(term)).length;
    if (score > bestScore) {
      best = result;
      bestScore = score;
    }
  }
  return bestScore > 0 ? best : null;
}

export function recentEntityContext(history = [], fallbackIntent = {}) {
  let treatment = fallbackIntent.treatment || '';
  let countries = [...(fallbackIntent.countries || [])];
  // Newest first. A generic "alternative cancer treatment" from an assistant
  // answer must not overwrite a specific treatment ("adenocarcinoma") from the
  // user's earlier turn.
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const previous = detectIntent(history[index].content);
    if (
      previous.treatment &&
      (!treatment ||
        (treatment === 'alternative cancer treatment' &&
          previous.treatment !== 'alternative cancer treatment'))
    ) {
      treatment = previous.treatment;
    }
    if (!countries.length && previous.countries.length) countries = previous.countries;
  }
  return { treatment, countries };
}

export function allowedEntitySets(intent, history = []) {
  const treatments = new Set([intent.treatment].filter(Boolean));
  const countries = new Set(intent.countries || []);
  for (const item of history) {
    const previous = detectIntent(item.content);
    if (previous.treatment) treatments.add(previous.treatment);
    for (const country of previous.countries) countries.add(country);
  }
  return { treatments, countries };
}

export function candidateAllowed(candidate, candidateIntent, allowed) {
  if (!candidate || candidate.length > 200 || containsNonLatin(candidate)) return false;
  if (!candidateIntent.hasDomainEntity) return false;
  if (candidateIntent.treatment && !allowed.treatments.has(candidateIntent.treatment)) return false;
  if (candidateIntent.countries.some((country) => !allowed.countries.has(country))) return false;
  return true;
}
