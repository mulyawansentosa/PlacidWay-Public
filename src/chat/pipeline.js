import crypto from 'node:crypto';
import { config, hasLlm } from '../config.js';
import { detectIntent, resolveLanguage } from '../guard/intent.js';
import { getTemplates } from '../guard/templates.js';
import { knowledgeIndex } from '../rag/index.js';
import {
  ensureConversation,
  getConversationLocale,
  getHistory,
  logUnanswered,
} from '../store/db.js';
import { logger } from '../util/logger.js';
import { generateAnswer, resolveAnswerOutcome } from './answer.js';
import { resolveDefinition, resolveEarlyIntent } from './intents.js';
import { answerWithoutLlm } from './no-llm.js';
import { resolveNoContext } from './no-context.js';
import { isQuoteIntent } from './prices.js';
import { finalize, maybeDisclaimer } from './respond.js';
import { retrieveContext } from './retrieval.js';
import { resolveEffectiveQuery } from './rewrite.js';

export async function handleChat({ sessionId, message, clientIp = '' }) {
  const startedAt = Date.now();
  const conversationId = String(sessionId || crypto.randomUUID()).slice(0, 80);
  const previousLanguage = getConversationLocale(conversationId);
  const language = resolveLanguage(message, previousLanguage);
  ensureConversation(conversationId, language);
  const history = getHistory(conversationId, 8);
  const intent = { ...detectIntent(message), language };
  const templates = getTemplates(language);

  const logGap = (reason, detail = '', topScore = null) =>
    logUnanswered({
      conversationId,
      question: message,
      reason,
      topScore,
      detail: String(detail || '').slice(0, 500),
    });

  const early = resolveEarlyIntent({ intent, message, templates });
  if (early) {
    if (early.gapReason) logGap(early.gapReason, early.gapDetail);
    const disclaimer = early.needsDisclaimer
      ? maybeDisclaimer(conversationId, templates, true)
      : null;
    return finalize({
      conversationId,
      message,
      answer: early.answer,
      disclaimer,
      leadPrompt: early.leadPrompt || false,
      leadText: early.leadText || '',
      meta: { path: early.path, model: null, intent: intent.type, ip: clientIp },
      startedAt,
    });
  }

  await knowledgeIndex.ensureFresh();
  if (!knowledgeIndex.chunks.length) {
    logGap('empty_index', 'Knowledge base is empty. Run npm run ingest.');
    return finalize({
      conversationId,
      message,
      answer: templates.error,
      meta: { path: 'empty_index', model: null, intent: intent.type, ip: clientIp },
      startedAt,
    });
  }

  const definition = resolveDefinition(intent);
  if (definition) {
    return finalize({
      conversationId,
      message,
      answer: definition.answer,
      sources: definition.sources,
      meta: { path: 'definition', model: null, intent: intent.type, ip: clientIp },
      startedAt,
    });
  }

  let { effectiveQuery, effectiveIntent } = await resolveEffectiveQuery({
    message,
    intent,
    history,
  });

  if (effectiveIntent.type === 'comparison' && !effectiveIntent.treatment) {
    const previous = [...history]
      .reverse()
      .map((item) => detectIntent(item.content))
      .find((item) => item.treatment);
    if (previous) {
      effectiveIntent.treatment = previous.treatment;
      effectiveIntent.countries = [
        ...new Set([...effectiveIntent.countries, ...previous.countries]),
      ];
    }
  }
  if (effectiveIntent.type === 'comparison' && !effectiveIntent.treatment) {
    return finalize({
      conversationId,
      message,
      answer: templates.clarifyComparison,
      meta: { path: 'clarify', model: null, intent: effectiveIntent.type, ip: clientIp },
      startedAt,
    });
  }

  const context = await retrieveContext({
    effectiveQuery,
    effectiveIntent,
    intent,
    history,
    message,
  });
  effectiveQuery = context.effectiveQuery;
  effectiveIntent = context.effectiveIntent;
  const {
    retrieval,
    results,
    priceFacts,
    missingCountries,
    promptNotes,
    relevance,
    retrievalMeta,
  } = context;

  if (!relevance.ok) {
    const fallback = await resolveNoContext({
      relevance,
      effectiveIntent,
      intent,
      retrievalMeta,
      retrieval,
      message,
      templates,
    });
    logGap(fallback.gapReason, fallback.gapDetail, fallback.gapTopScore);
    return finalize({
      conversationId,
      message,
      answer: fallback.answer,
      leadPrompt: fallback.leadPrompt || false,
      leadText: fallback.leadText || '',
      meta: {
        path: fallback.path,
        ...(fallback.router ? { router: fallback.router } : {}),
        model: fallback.model,
        intent: effectiveIntent.type,
        retrieval: retrievalMeta,
        ip: clientIp,
      },
      startedAt,
    });
  }

  if (!hasLlm) {
    const deterministic = answerWithoutLlm({
      results,
      priceFacts,
      missingCountries,
      effectiveIntent,
      intent,
      templates,
      message,
    });
    logGap('no_llm', 'LLM_API_KEY is not configured; served a deterministic answer.');
    return finalize({
      conversationId,
      message,
      answer: deterministic.answer || templates.notFound,
      sources: deterministic.sources,
      leadPrompt: deterministic.leadPrompt,
      leadText: templates.leadPrompt,
      meta: {
        path: 'extractive',
        model: null,
        intent: effectiveIntent.type,
        retrieval: retrievalMeta,
        ip: clientIp,
      },
      startedAt,
    });
  }

  let attempt;
  try {
    attempt = await generateAnswer({
      results,
      priceFacts,
      history,
      question: effectiveQuery,
      language,
      notes: promptNotes,
    });
  } catch (error) {
    logger.error({ err: error.message }, 'LLM generation failed');
    logGap('provider_error', error.message, retrieval.maxSimilarity);
    return finalize({
      conversationId,
      message,
      answer: templates.error,
      meta: {
        path: 'provider_error',
        model: config.llm.model,
        intent: effectiveIntent.type,
        retrieval: retrievalMeta,
        ip: clientIp,
      },
      startedAt,
    });
  }

  const outcome = resolveAnswerOutcome({
    attempt,
    results,
    priceFacts,
    missingCountries,
    effectiveIntent,
    intent,
    language,
    templates,
    message,
  });

  const disclaimer = maybeDisclaimer(conversationId, templates, outcome.needsDisclaimer);
  if (outcome.gapReason) {
    logGap(
      outcome.gapReason,
      JSON.stringify({ errors: attempt.validation?.errors, retrieval: retrievalMeta }),
      retrieval.maxSimilarity
    );
  }

  return finalize({
    conversationId,
    message,
    answer: outcome.answer,
    sources: outcome.sources,
    disclaimer,
    leadPrompt: isQuoteIntent(effectiveIntent, priceFacts),
    leadText: templates.leadPrompt,
    meta: {
      path: outcome.path,
      model: attempt.response?.model || config.llm.model,
      intent: effectiveIntent.type,
      retrieval: retrievalMeta,
      validation: attempt.validation
        ? { ok: attempt.validation.ok, errors: attempt.validation.errors }
        : null,
      usage: attempt.response?.usage || null,
      ip: clientIp,
    },
    startedAt,
  });
}
