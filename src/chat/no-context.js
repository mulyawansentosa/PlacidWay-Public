import { config, hasLlm } from '../config.js';
import { classifyAmbiguousIntent } from '../llm/intent-router.js';

export async function resolveNoContext({
  relevance,
  effectiveIntent,
  intent,
  retrievalMeta,
  retrieval,
  message,
  templates,
}) {
  const asksPriceOrPackage =
    effectiveIntent.isPrice ||
    effectiveIntent.type === 'cost' ||
    effectiveIntent.type === 'procedure' ||
    /\b(package|paket|treatment|perawatan|layanan)\b/i.test(message);
  const looksLikeUnsupportedClaim =
    /\$\s?\d|i heard|katanya|saya dengar|confirm that|benar.*\d/i.test(message);
  const outOfDomainService =
    /\b(dental|implant|gigi|mata|eye|ophthalm|orthopedic|cardiac|heart)\b/i.test(message);

  // A broad or indirect request ("I am looking for healthcare services",
  // "هل تقدمون خدمات صحية؟") should not become a hard "I don't know". Ask
  // the model to route only this ambiguous, no-entity failure; safety
  // intents and specific treatment questions never reach this branch.
  if (
    !effectiveIntent.treatment &&
    !effectiveIntent.countries.length &&
    hasLlm &&
    !looksLikeUnsupportedClaim &&
    !outOfDomainService
  ) {
    const routed = await classifyAmbiguousIntent(message, intent.language);
    if (routed === 'catalog' || routed === 'clarify' || routed === 'smalltalk') {
      return {
        path: 'intent_router',
        router: routed,
        model: config.llm.model,
        answer:
          routed === 'catalog'
            ? templates.catalog
            : routed === 'clarify'
              ? templates.clarify
              : templates.howAreYou,
        leadPrompt: routed !== 'smalltalk',
        leadText: templates.leadPrompt,
        gapReason: `intent_router:${routed}`,
        gapDetail: JSON.stringify(retrievalMeta),
        gapTopScore: retrieval.maxSimilarity,
      };
    }
  }

  if (
    !effectiveIntent.treatment &&
    asksPriceOrPackage &&
    !effectiveIntent.isOutOfScope &&
    !looksLikeUnsupportedClaim &&
    !outOfDomainService
  ) {
    return {
      path: 'clarify',
      model: null,
      answer: templates.clarify,
      leadPrompt: true,
      leadText: templates.leadPrompt,
      gapReason: 'clarify',
      gapDetail: JSON.stringify(retrievalMeta),
      gapTopScore: retrieval.maxSimilarity,
    };
  }

  return {
    path: 'fallback',
    model: null,
    answer: templates.notFound,
    leadPrompt: true,
    leadText: templates.leadPrompt,
    gapReason: relevance.reason,
    gapDetail: JSON.stringify(retrievalMeta),
    gapTopScore: retrieval.maxSimilarity,
  };
}
