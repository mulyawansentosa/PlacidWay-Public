import { getMeta, saveMessage, setMeta } from '../store/db.js';
import { isNotFoundTemplate, stripModelDisclaimers } from './answer.js';

export function maybeDisclaimer(conversationId, templates, needed) {
  if (!needed) return null;
  const key = `disclaimer:${conversationId}`;
  if (getMeta(key)) return null;
  setMeta(key, '1');
  return templates.disclaimer;
}

export function finalize({
  conversationId,
  message,
  answer,
  sources = [],
  disclaimer = null,
  leadPrompt = false,
  leadText = '',
  meta = {},
  startedAt,
}) {
  const latencyMs = Date.now() - startedAt;
  const body = stripModelDisclaimers(answer) || answer;
  const answerWithDisclaimer = disclaimer ? `${body}\n\n${disclaimer}` : body;
  // A reply that says the pages do not contain the answer must not show source
  // links; they would suggest the answer came from those pages.
  if (isNotFoundTemplate(body)) sources = [];
  saveMessage({ conversationId, role: 'user', content: message });
  saveMessage({
    conversationId,
    role: 'assistant',
    content: answerWithDisclaimer,
    sources,
    model: meta.model || null,
    latencyMs,
  });
  return {
    ok: true,
    conversationId,
    answer: answerWithDisclaimer,
    sources,
    disclaimer,
    leadPrompt,
    leadText,
    meta: { ...meta, latencyMs },
  };
}
