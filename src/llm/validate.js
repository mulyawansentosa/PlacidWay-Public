import { extractJson } from './json.js';

const ALLOWED_INTENTS = new Set([
  'cost',
  'comparison',
  'procedure',
  'followup',
  'booking',
  'out_of_scope',
  'medical',
  'other',
]);

function normalizeAmount(raw) {
  const cleaned = String(raw || '').replace(/[^\d.,]/g, '');
  if (!cleaned) return null;
  const normalized = cleaned.replace(/[.,](?=\d{3}(\D|$))/g, '').replace(',', '.');
  const value = Number.parseFloat(normalized);
  return Number.isFinite(value) ? value : null;
}

export function extractMoneyTokens(text) {
  const tokens = [];
  const regex =
    /(?:\bUS\s*\$|\$|USD|EUR|GBP|MXN|CAD|AUD)\s*([\d][\d,.]*)\s*(USD|EUR|GBP|MXN|CAD|AUD)?|([\d][\d,.]*)\s*(USD|EUR|GBP|MXN|CAD|AUD)/gi;
  let match;
  while ((match = regex.exec(String(text || '')))) {
    const raw = match[1] || match[3];
    const amount = normalizeAmount(raw);
    if (amount == null) continue;
    const currency = (
      match[2] ||
      match[4] ||
      (match[0].toUpperCase().includes('USD') ? 'USD' : '')
    ).toUpperCase();
    tokens.push({
      raw: match[0],
      amount,
      currency,
      key: `${amount.toFixed(2)}|${currency || 'USD'}`,
    });
  }
  return tokens;
}

function normalizeUsedSources(value) {
  if (!value) return [];
  const list = Array.isArray(value) ? value : String(value).split(/[,;\s]+/);
  return [
    ...new Set(
      list
        .map((item) => String(item).trim().toUpperCase())
        .map((item) => item.replace(/^\[|\]$/g, ''))
        .filter((item) => /^S\d+$/.test(item))
    ),
  ];
}

export function normalizePayload(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const answer = String(raw.answer ?? raw.response ?? '').trim();
  if (!answer) return null;
  const intent = String(raw.intent || 'other').toLowerCase();
  return {
    answer,
    usedSources: normalizeUsedSources(raw.used_sources ?? raw.usedSources),
    answerable: raw.answerable !== false && String(raw.answerable).toLowerCase() !== 'false',
    needsDisclaimer: Boolean(raw.needs_disclaimer ?? raw.needsDisclaimer),
    intent: ALLOWED_INTENTS.has(intent) ? intent : 'other',
  };
}

export function parseModelPayload(text) {
  return normalizePayload(extractJson(text));
}

export function extractCitationIds(answer) {
  const ids = new Set();
  const blocks = String(answer || '').match(/\[[^\]]+\]/g) || [];
  for (const block of blocks) {
    const matches = block.match(/S\d+/gi) || [];
    matches.forEach((id) => ids.add(id.toUpperCase()));
  }
  return [...ids];
}

export function sanitizeAnswer(answer, allowedUrls = []) {
  let value = String(answer || '').trim();
  value = value.replace(/https?:\/\/[^\s)\]]+/gi, (url) => {
    const clean = url.replace(/[.,;]+$/, '');
    return allowedUrls.includes(clean) ? '' : '';
  });
  value = value.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return value.slice(0, 5000);
}

export function containsMedicalAdvice(answer) {
  return /\b(you should (take|undergo|start|stop)|i recommend (surgery|treatment|therapy|medication)|it is safe to|it's safe to|you don't need|no need for|you are (not )?eligible)\b/i.test(
    String(answer || '')
  );
}

export function leaksPrompt(answer) {
  const text = String(answer || '');
  return (
    /absolute rules/i.test(text) ||
    /you are the placidway website assistant/i.test(text) ||
    /return one json object/i.test(text) ||
    /used_sources/.test(text)
  );
}

/**
 * Post-generation validation. The model is not trusted to police itself:
 * citations must exist, and every currency amount in the answer must appear
 * verbatim in the cited context.
 */
export function validateAnswer({
  payload,
  allowedIds,
  allowedUrls = [],
  contextText = '',
  priceFacts = [],
}) {
  const errors = [];
  if (!payload) {
    return { ok: false, errors: ['invalid_json'], answer: '', usedSources: [] };
  }

  const answer = sanitizeAnswer(payload.answer, allowedUrls);
  const citationIds = extractCitationIds(answer).filter((id) => /^S\d+$/.test(id));
  const unknown = citationIds.filter((id) => !allowedIds.includes(id));
  if (unknown.length) errors.push(`unknown_citation:${unknown.join(',')}`);

  if (payload.answerable) {
    if (!payload.usedSources.length && !citationIds.length) errors.push('no_citations');
    if (!citationIds.length) errors.push('no_inline_citation');
  }

  const answerMoney = extractMoneyTokens(answer);
  const contextMoney = new Set(extractMoneyTokens(contextText).map((token) => token.key));
  const unsupported = [];
  for (const token of answerMoney) {
    const usdKey = `${token.amount.toFixed(2)}|USD`;
    const anyKey = `${token.amount.toFixed(2)}|${token.currency || 'USD'}`;
    if (!contextMoney.has(anyKey) && !contextMoney.has(usdKey)) unsupported.push(token);
  }
  if (unsupported.length) {
    errors.push(`unsupported_number:${unsupported.map((token) => token.raw).join(',')}`);
  }

  if (containsMedicalAdvice(answer)) errors.push('medical_advice');
  if (leaksPrompt(answer)) errors.push('prompt_leak');
  if (
    priceFacts.length &&
    extractMoneyTokens(answer).length === 0 &&
    /harga\s+(tidak\s+)?(tercantum|tertera|tersedia)|price\s+(is\s+)?not\s+(listed|available|stated)|no\s+price/i.test(
      answer
    )
  ) {
    errors.push('contradicts_price_facts');
  }

  return {
    ok: errors.length === 0,
    errors,
    answer,
    usedSources: payload.usedSources,
    citationIds,
    answerable: payload.answerable,
    needsDisclaimer: payload.needsDisclaimer,
    intent: payload.intent,
    unsupportedNumbers: unsupported.map((token) => token.raw),
  };
}

export function sourceListFromIds(ids, results) {
  const list = [];
  const byUrl = new Map();
  for (const id of ids) {
    const index = Number.parseInt(id.replace(/^S/, ''), 10) - 1;
    const result = results[index];
    if (!result || !result.url) continue;
    const existing = byUrl.get(result.url);
    if (existing) {
      if (!existing.id.split(', ').includes(id)) existing.id = `${existing.id}, ${id}`;
      continue;
    }
    const source = {
      id,
      title: result.title,
      url: result.url,
      pageType: result.pageType,
      heading: result.heading || '',
    };
    byUrl.set(result.url, source);
    list.push(source);
  }
  return list;
}
