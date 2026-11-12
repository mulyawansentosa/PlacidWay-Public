import fs from 'node:fs';
import { config } from '../config.js';

let cachedSystemPrompt = null;

export function systemPrompt() {
  if (!cachedSystemPrompt) {
    cachedSystemPrompt = fs.readFileSync(config.promptPath, 'utf8');
  }
  return cachedSystemPrompt;
}

function sourceBlock(results) {
  return results
    .map((result, index) => {
      const id = `S${index + 1}`;
      const lines = [
        `[${id}] ${result.title}`,
        `URL: ${result.url}`,
        `PAGE TYPE: ${result.pageType}`,
        result.heading ? `SECTION: ${result.heading}` : null,
        'TEXT:',
        result.content,
      ].filter(Boolean);
      return lines.join('\n');
    })
    .join('\n\n');
}

// package_includes is stored as a JSON array string in the database; accept an
// array too so callers that already parsed it still work.
function includesList(fact) {
  const raw = fact.packageIncludes ?? fact.package_includes;
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function priceFactBlock(priceFacts) {
  if (!priceFacts.length) return '';
  return priceFacts
    .map((fact, index) => {
      const includes = includesList(fact);
      const parts = [
        `PRICE FACT ${index + 1}`,
        `treatment=${fact.treatment || 'not specified'}`,
        `country=${fact.country || 'not specified'}`,
        fact.amount != null ? `amount=${fact.amount} ${fact.currency || ''}`.trim() : 'amount=not listed',
        fact.amountMax != null ? `amount_max=${fact.amountMax} ${fact.currency || ''}`.trim() : null,
        fact.qualifier ? `qualifier=${fact.qualifier}` : null,
        fact.price_type || fact.priceType ? `price_type=${fact.price_type || fact.priceType}` : null,
        includes.length
          ? `includes=${includes.map((item) => String(item).slice(0, 160)).join(' | ')}`
          : null,
        `source=${fact.sourceLabel || 'unknown'}`,
        fact.rawText ? `raw="${fact.rawText.replace(/"/g, "'").slice(0, 300)}"` : null,
      ].filter(Boolean);
      return parts.join('; ');
    })
    .join('\n');
}

export function buildContext({ results, priceFacts = [], notes = [] }) {
  const blocks = [];
  if (results.length) blocks.push(`SOURCES\n\n${sourceBlock(results)}`);
  if (priceFacts.length) blocks.push(`PRICE FACTS\n\n${priceFactBlock(priceFacts)}`);
  if (notes.length) blocks.push(`NOTES\n\n${notes.map((note) => `- ${note}`).join('\n')}`);
  return blocks.join('\n\n');
}

export function buildUserMessage({ question, context, language }) {
  return [
    context ? `CONTEXT\n\n${context}` : 'CONTEXT\n\n(no context)',
    `VISITOR LANGUAGE: ${language}`,
    'QUESTION',
    question,
    'Answer using only CONTEXT. Return the JSON object described in the system message.',
  ].join('\n\n');
}

export function buildMessages({ history = [], userMessage }) {
  const recent = history
    .filter((message) => message.role === 'user' || message.role === 'assistant')
    .slice(-6)
    .map((message) => ({ role: message.role, content: message.content }));
  return [{ role: 'system', content: systemPrompt() }, ...recent, { role: 'user', content: userMessage }];
}
