import { config } from '../config.js';
import { chatJson } from '../llm/client.js';
import { buildContext, buildMessages, buildUserMessage } from '../llm/prompt.js';
import { normalizePayload, sourceListFromIds, validateAnswer } from '../llm/validate.js';
import { logger } from '../util/logger.js';
import { followUpNotFound, followUpPartialAnswer, extractiveFallback } from './fallbacks.js';
import { comparisonFallback, priceFallback } from './prices.js';

export async function generateAnswer({ results, priceFacts, history, question, language, notes = [] }) {
  const context = buildContext({ results, priceFacts, notes });
  const userMessage = buildUserMessage({ question, context, language });
  const messages = buildMessages({ history, userMessage });
  const allowedIds = results.map((_, index) => `S${index + 1}`);
  const allowedUrls = results.map((result) => result.url);

  const run = async (inputMessages) => {
    const response = await chatJson({
      messages: inputMessages,
      model: config.llm.model,
      temperature: config.llm.temperature,
      maxTokens: config.llm.maxTokens,
    });
    const payload = normalizePayload(response.parsed);
    const validation = payload
      ? validateAnswer({ payload, allowedIds, allowedUrls, contextText: context, priceFacts })
      : null;
    return { response, payload, validation, context, messages: inputMessages };
  };

  let attempt = await run(messages);
  const shouldRetry = (current) => {
    if (!current.payload) return true;
    return current.validation.errors.some(
      (error) =>
        error.startsWith('no_') ||
        error.startsWith('unknown_citation') ||
        error.startsWith('unsupported_number') ||
        error === 'contradicts_price_facts'
    );
  };

  if (shouldRetry(attempt)) {
    const priceContradiction = attempt.validation?.errors?.includes('contradicts_price_facts');
    const reason = !attempt.payload
      ? 'Your previous reply was not valid JSON. Reply again with ONLY the JSON object described in the system message.'
      : priceContradiction
        ? 'PRICE FACTS are present in CONTEXT. Do not say the price is not listed. Quote the relevant price fact with its currency and qualifier. Cite [S#] for every factual claim.'
        : `Your previous answer failed validation: ${attempt.validation.errors.join(', ')}. Reply again using ONLY the CONTEXT. Cite [S#] for every factual claim, and use only numbers that appear verbatim in CONTEXT. If a price is not in CONTEXT, say it is not listed.`;
    attempt = await run([...messages, { role: 'user', content: reason }]);
  }

  return attempt;
}

// The model sometimes writes its own medical disclaimer at the end of an answer.
// The pipeline adds the disclaimer once per conversation, so those paragraphs
// are removed first; otherwise the same disclaimer appears twice.
const DISCLAIMER_PARAGRAPH_RE =
  /not medical advice|bukan (nasihat|saran) medis|tidak merupakan (nasihat|saran) medis|for general education|informasi ini bersifat edukasi|bersifat edukasi umum|educational purposes|no es (un )?consejo m[eé]dico/i;

export function stripModelDisclaimers(answer) {
  const paragraphs = String(answer || '').split(/\n\s*\n/);
  return paragraphs
    .filter((paragraph) => !DISCLAIMER_PARAGRAPH_RE.test(paragraph))
    .join('\n\n')
    .trim();
}

const NOT_FOUND_PREFIXES = ['I could not find that on the PlacidWay', 'I could not find a specific answer', 'Saya tidak menemukan jawaban itu', 'Saya tidak menemukan jawaban spesifik', 'No encontré esa respuesta', 'No encontré una respuesta específica', 'لم أجد هذه الإجابة', 'لم أجد إجابة محددة'];

export function isNotFoundTemplate(text) {
  const value = String(text || '');
  return NOT_FOUND_PREFIXES.some((prefix) => value.startsWith(prefix));
}

export function resolveAnswerOutcome({
  attempt,
  results,
  priceFacts,
  missingCountries,
  effectiveIntent,
  intent,
  language,
  templates,
  message,
}) {
  const { validation, payload } = attempt;
  let answer = validation?.answer || '';
  const mappedSourceIds = [];
  answer = answer.replace(/\[P(\d+)\]/g, (match, number) => {
    const fact = priceFacts[Number(number) - 1];
    const label = fact?.sourceLabel;
    if (!label || !/^S\d+$/.test(label)) return match;
    mappedSourceIds.push(label);
    return `[${label}]`;
  });
  answer = answer.replace(/(\[S\d+\])(?:\s*\1)+/g, '$1');
  let usedSources = validation?.usedSources || [];
  if (validation?.citationIds?.length || mappedSourceIds.length) {
    usedSources = [
      ...new Set([...usedSources, ...(validation?.citationIds || []), ...mappedSourceIds]),
    ];
  }
  let sources = sourceListFromIds(usedSources, results);
  let path = 'llm';
  let needsDisclaimer = validation?.needsDisclaimer || false;
  let gapReason = null;

  if (!validation) {
    path = 'fallback_json';
    answer = extractiveFallback(results, templates) || templates.notFound;
    sources = sourceListFromIds(['S1'], results);
    gapReason = 'invalid_json';
  } else if (!validation.ok) {
    logger.warn({ errors: validation.errors, intent: effectiveIntent.type }, 'Answer validation failed');
    if (validation.errors.includes('medical_advice')) {
      path = 'fallback_medical';
      answer = templates.medical;
      needsDisclaimer = true;
      gapReason = 'medical_advice';
    } else if (
      validation.errors.some((error) => error.startsWith('unsupported_number')) &&
      priceFacts.length
    ) {
      if (effectiveIntent.type === 'comparison') {
        path = 'comparison_fallback';
        answer = comparisonFallback(priceFacts, missingCountries);
      } else {
        path = 'fallback_price';
        answer = priceFallback(priceFacts) || templates.notFound;
      }
      sources = sourceListFromIds(priceFacts.map((fact) => fact.sourceLabel), results);
      gapReason = 'unsupported_number';
    } else if (
      validation.errors.includes('contradicts_price_facts') &&
      priceFacts.length
    ) {
      path = 'fallback_price_context';
      const extractive = extractiveFallback(results, templates);
      const priceText = priceFallback(priceFacts);
      answer = [extractive, priceText].filter(Boolean).join('\n\n') || templates.notFound;
      const ids = ['S1', ...priceFacts.map((fact) => fact.sourceLabel)];
      sources = sourceListFromIds(ids, results);
      gapReason = 'contradicts_price_facts';
    } else if (
      validation.errors.some((error) => error.startsWith('no_') || error.startsWith('unknown_citation'))
    ) {
      path = 'fallback_extractive';
      answer = extractiveFallback(results, templates) || templates.notFound;
      sources = sourceListFromIds(['S1'], results);
      gapReason = validation.errors.join(',');
    } else {
      path = 'fallback';
      answer = templates.notFound;
      sources = [];
      gapReason = validation.errors.join(',');
    }
  } else if (!payload.answerable) {
    if (effectiveIntent.type === 'comparison' && priceFacts.length) {
      path = 'comparison_fallback';
      answer = comparisonFallback(priceFacts, missingCountries);
      sources = sourceListFromIds(priceFacts.map((fact) => fact.sourceLabel), results);
    } else if (effectiveIntent.type === 'cost' && priceFacts.length) {
      path = 'price_fallback';
      answer = priceFallback(priceFacts);
      sources = sourceListFromIds(priceFacts.map((fact) => fact.sourceLabel), results);
    } else {
      const partial = intent.isFollowUp
        ? followUpPartialAnswer(message, results, effectiveIntent, language)
        : null;
      if (partial) {
        path = 'followup_partial';
        answer = partial.answer;
        sources = partial.sources;
      } else {
        path = 'model_unknown';
        answer = intent.isFollowUp
          ? followUpNotFound(message, effectiveIntent, templates)
          : templates.notFound;
      }
    }
    gapReason = 'model_unknown';
  }

  if (
    missingCountries.length &&
    effectiveIntent.type === 'comparison' &&
    path.startsWith('llm')
  ) {
    const answerLower = answer.toLowerCase();
    const alreadyMentionsMissing = missingCountries.some((country) =>
      answerLower.includes(country.toLowerCase())
    );
    if (!alreadyMentionsMissing) {
      const note = `The pages I have do not include ${missingCountries.join(
        ' or '
      )}, so I cannot make that comparison. I can only compare destinations that appear in the provided pages.`;
      answer = `${answer}\n\n${note}`;
    }
  }

  return { answer, sources, path, needsDisclaimer, gapReason };
}
