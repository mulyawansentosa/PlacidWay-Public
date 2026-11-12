import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractMoneyTokens,
  leaksPrompt,
  normalizePayload,
  sourceListFromIds,
  validateAnswer,
} from '../src/llm/validate.js';

const basePayload = {
  answer: 'The adrenal cancer package starts from $18,995 USD [S1].',
  usedSources: ['S1'],
  answerable: true,
  needsDisclaimer: false,
  intent: 'cost',
};

test('extracts money amounts from common formats', () => {
  const tokens = extractMoneyTokens('From $18,995 USD, add-ons $3,950 - $4,250 USD.');
  assert.equal(tokens.length, 3);
  assert.equal(tokens[0].amount, 18995);
  assert.equal(tokens[0].currency, 'USD');
  assert.equal(tokens[1].amount, 3950);
});

test('accepts an answer whose amount appears in context and has a citation', () => {
  const result = validateAnswer({
    payload: basePayload,
    allowedIds: ['S1'],
    contextText: 'Price: starting from $18,995 USD for the 3-week program.',
  });
  assert.equal(result.ok, true, result.errors.join(','));
  assert.deepEqual(result.citationIds, ['S1']);
});

test('rejects a wrong price that is not in context', () => {
  const result = validateAnswer({
    payload: { ...basePayload, answer: 'Yes, it costs $50 USD [S1].' },
    allowedIds: ['S1'],
    contextText: 'Price: starting from $18,995 USD.',
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.startsWith('unsupported_number')));
});

test('rejects an answer without a citation', () => {
  const result = validateAnswer({
    payload: { ...basePayload, answer: 'It costs $18,995 USD.' },
    allowedIds: ['S1'],
    contextText: 'Price: $18,995 USD.',
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.includes('no_inline_citation'));
});

test('rejects unknown citations', () => {
  const result = validateAnswer({
    payload: { ...basePayload, answer: 'It costs $18,995 USD [S9].' },
    allowedIds: ['S1'],
    contextText: 'Price: $18,995 USD.',
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.startsWith('unknown_citation')));
});

test('rejects medical advice', () => {
  const result = validateAnswer({
    payload: {
      ...basePayload,
      answer: 'It is safe to have this surgery, you should take it [S1].',
      usedSources: ['S1'],
    },
    allowedIds: ['S1'],
    contextText: 'General information.',
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.includes('medical_advice'));
});

test('normalizes model payload variants', () => {
  const payload = normalizePayload({
    answer: 'Test',
    used_sources: '[s1, S2]',
    answerable: 'false',
    needs_disclaimer: 1,
    intent: 'cost',
  });
  assert.deepEqual(payload.usedSources, ['S1', 'S2']);
  assert.equal(payload.answerable, false);
  assert.equal(payload.needsDisclaimer, true);
});

test('maps source ids to source metadata and dedupes URLs', () => {
  const results = [
    { title: 'Package', url: 'https://www.placidway.com/package/1', pageType: 'package', heading: 'A' },
    { title: 'Package duplicate', url: 'https://www.placidway.com/package/1', pageType: 'package', heading: 'B' },
  ];
  const sources = sourceListFromIds(['S1', 'S2'], results);
  assert.equal(sources.length, 1);
  assert.equal(sources[0].url, 'https://www.placidway.com/package/1');
});

test('detects prompt leaks', () => {
  assert.equal(leaksPrompt('You are the PlacidWay website assistant.'), true);
  assert.equal(leaksPrompt('The page says it starts from $18,995.'), false);
});
