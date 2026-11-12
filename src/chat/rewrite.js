import { hasLlm } from '../config.js';
import { detectIntent } from '../guard/intent.js';
import { translateDomainTerms } from '../guard/translate.js';
import { rewriteQuery } from '../llm/client.js';
import { logger } from '../util/logger.js';
import { allowedEntitySets, candidateAllowed, recentEntityContext } from './context.js';

export async function resolveEffectiveQuery({ message, intent, history }) {
  let effectiveQuery = message;
  let effectiveIntent = intent;
  const mappedQuery = translateDomainTerms(message) || message;

  const applyMappedQuery = () => {
    if (!mappedQuery || mappedQuery === message) return;
    const mappedIntent = detectIntent(mappedQuery);
    effectiveQuery = mappedQuery;
    effectiveIntent = {
      ...intent,
      ...mappedIntent,
      language: intent.language,
      type: mappedIntent.type === 'greeting' ? 'question' : mappedIntent.type,
    };
    if (!effectiveIntent.treatment && intent.treatment) {
      effectiveIntent.treatment = intent.treatment;
    }
  };

  if (intent.isFollowUp && history.length) {
    let usedRewrite = false;
    const recent = recentEntityContext(history, intent);
    if (!effectiveIntent.treatment && recent.treatment) {
      effectiveIntent.treatment = recent.treatment;
    }
    if (!effectiveIntent.countries.length && recent.countries.length) {
      effectiveIntent.countries = recent.countries;
    }
    if (hasLlm) {
      try {
        // Give the rewrite model the most recent treatment explicitly. The
        // immediately previous user turn may be a pronoun-only follow-up such
        // as "apakah layanan tersebut tersedia di indonesia?".
        const rewriteQuestion = recent.treatment
          ? `${recent.treatment}: ${message}`
          : message;
        const rewritten = await rewriteQuery({ question: rewriteQuestion, history });
        const candidate = String(rewritten.standaloneQuery || '').trim();
        const candidateIntent = detectIntent(candidate);
        const allowed = allowedEntitySets(intent, history);
        if (candidateAllowed(candidate, candidateIntent, allowed)) {
          effectiveQuery = candidate;
          effectiveIntent = {
            ...intent,
            ...candidateIntent,
            language: intent.language,
            type: candidateIntent.type === 'greeting' ? 'question' : candidateIntent.type,
          };
          if (!effectiveIntent.treatment && recent.treatment) {
            effectiveIntent.treatment = recent.treatment;
          }
          if (!effectiveIntent.countries.length && recent.countries.length) {
            effectiveIntent.countries = recent.countries;
          }
          usedRewrite = true;
        }
      } catch (error) {
        logger.warn({ err: error.message }, 'Follow-up rewrite failed; using local fallback');
      }
    }
    if (!usedRewrite) {
      const topic =
        recent.treatment || recent.countries.join(' ') || message;
      effectiveQuery = `${topic} ${mappedQuery}`.trim();
      if (recent.treatment) effectiveIntent.treatment = recent.treatment;
      if (recent.countries.length) effectiveIntent.countries = recent.countries;
    }
  } else if (intent.language !== 'en') {
    let usedRewrite = false;
    if (hasLlm && intent.hasDomainEntity) {
      try {
        const rewritten = await rewriteQuery({ question: message, history });
        const candidate = String(rewritten.standaloneQuery || '').trim();
        const candidateIntent = detectIntent(candidate);
        const allowed = allowedEntitySets(intent, history);
        // A rewrite that returns the question unchanged has not translated it,
        // so the local glossary must still run.
        const changed = candidate && candidate.toLowerCase() !== String(message).trim().toLowerCase();
        if (changed && candidateAllowed(candidate, candidateIntent, allowed)) {
          effectiveQuery = candidate;
          effectiveIntent = {
            ...intent,
            ...candidateIntent,
            language: intent.language,
            type: candidateIntent.type === 'greeting' ? 'question' : candidateIntent.type,
          };
          usedRewrite = true;
        }
      } catch (error) {
        logger.warn({ err: error.message }, 'Query rewrite failed; using local glossary');
      }
    }
    if (!usedRewrite) applyMappedQuery();
  }

  return { effectiveQuery, effectiveIntent };
}
