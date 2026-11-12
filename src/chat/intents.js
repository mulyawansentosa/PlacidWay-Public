import { sourceListFromIds } from '../llm/validate.js';
import { knowledgeIndex } from '../rag/index.js';
import { definitionAnswer } from './fallbacks.js';

const GREETING_FALLBACK =
  /^(hi|hello|hey|halo|hallo|helo|hai|hola|مرحبا|salam|assalamualaikum|selamat|pagi|siang|sore|malam|permisi)\b/i;

export function resolveEarlyIntent({ intent, message, templates }) {
  if (intent.type === 'greeting' || (GREETING_FALLBACK.test(message) && message.length < 40)) {
    return { path: 'greeting', answer: templates.greeting };
  }

  if (intent.type === 'smalltalk') {
    const answer =
      intent.smalltalk === 'thanks'
        ? templates.thanks
        : intent.smalltalk === 'goodbye'
          ? templates.goodbye
          : intent.smalltalk === 'who_are_you'
            ? templates.whoAreYou
            : templates.howAreYou;
    return { path: 'smalltalk', answer };
  }

  if (intent.type === 'catalog') {
    return { path: 'catalog', answer: templates.catalog };
  }

  if (intent.type === 'booking') {
    return {
      path: 'booking',
      answer: templates.booking,
      leadPrompt: true,
      leadText: templates.leadPrompt,
      gapReason: 'booking',
      gapDetail: 'User asked to book or check availability.',
    };
  }

  if (intent.type === 'medical') {
    return {
      path: 'medical',
      answer: templates.medical,
      leadPrompt: true,
      leadText: templates.leadPrompt,
      needsDisclaimer: true,
      gapReason: 'medical',
      gapDetail: 'User asked for medical advice or safety assessment.',
    };
  }

  if (intent.type === 'out_of_scope') {
    return {
      path: 'out_of_scope',
      answer: templates.outOfScope,
      gapReason: 'out_of_scope',
      gapDetail: 'Question is outside the provided PlacidWay pages.',
    };
  }

  if (intent.type === 'currency') {
    return {
      path: 'currency',
      answer: templates.currency,
      leadPrompt: true,
      leadText: templates.leadPrompt,
      gapReason: 'currency',
      gapDetail: 'User asked for a non-USD price or currency conversion.',
    };
  }

  return null;
}

export function resolveDefinition(intent) {
  if (intent.type !== 'definition') return null;
  const results = knowledgeIndex.search(intent.treatment, null).results.slice(0, 3);
  if (!results.length) return null;
  return {
    answer: definitionAnswer(intent.language, intent.treatment),
    sources: sourceListFromIds(['S1'], results),
  };
}
