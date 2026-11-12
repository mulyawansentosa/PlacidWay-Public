import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizePriceType, packageIncludesFromSections } from '../src/ingest/extract.js';
import { assessRelevance } from '../src/rag/relevance.js';
import { validateAnswer } from '../src/llm/validate.js';

test('normalizePriceType separates starting-from, program, add-on and listed prices', () => {
  assert.equal(normalizePriceType('starting from'), 'starting_from');
  assert.equal(normalizePriceType('out-patient program'), 'program_price');
  assert.equal(normalizePriceType('in-patient program'), 'program_price');
  assert.equal(normalizePriceType('optional/add-on'), 'add_on');
  assert.equal(normalizePriceType('clinic price (standard)'), 'clinic_listed');
  assert.equal(normalizePriceType('package price'), 'package_total');
  assert.equal(normalizePriceType('listed price'), 'listed');
  assert.equal(normalizePriceType(''), 'listed');
});

test('packageIncludesFromSections reads bullets under "Included in the ... Program" headings', () => {
  const sections = [
    { heading: 'Included in the Out-Patient Program ($18,995 USD)', text: 'Intro text.\n- Lab work: CBC and panels.\n- Imaging: one scan.' },
    { heading: 'Included in the In-Patient Program ($30,000 USD)', text: '- 24/7 Medical Supervision.' },
    { heading: 'Excluded Services and Contingency Costs', text: '- Intratumoral Immunotherapy: $6,200' },
  ];
  const map = packageIncludesFromSections(sections);
  assert.deepEqual(Object.keys(map).sort(), ['in-patient program', 'out-patient program']);
  assert.deepEqual(map['out-patient program'], ['Lab work: CBC and panels.', 'Imaging: one scan.']);
  assert.deepEqual(map['in-patient program'], ['24/7 Medical Supervision.']);
});

test('packageIncludesFromSections ignores headings without bullet items', () => {
  const map = packageIncludesFromSections([{ heading: 'Included in the In-Patient Program', text: 'No bullets here.' }]);
  assert.deepEqual(map, {});
});

const base = {
  query: 'What is the success rate of the adrenal cancer treatment?',
  results: [{ id: 1 }],
  maxSimilarity: 0,
  bm25TopScore: 5,
  matchedTerms: 3,
  specificMatches: 1,
  specificTotal: 3,
};

test('relevance gate blocks a BM25 match when most specific query terms are not in the pages', () => {
  const decision = assessRelevance({ ...base, thresholds: { minBm25Score: 2, minTermCoverage: 0.5 } });
  assert.equal(decision.ok, false);
});

test('relevance gate allows the same match when coverage is high enough', () => {
  const decision = assessRelevance({ ...base, specificMatches: 2, thresholds: { minBm25Score: 2, minTermCoverage: 0.5 } });
  assert.equal(decision.ok, true);
});

test('relevance gate keeps old behaviour when specificTotal is not provided', () => {
  const { specificTotal, ...rest } = base;
  const decision = assessRelevance({ ...rest, thresholds: { minBm25Score: 2 } });
  assert.equal(decision.ok, true);
});

import { queryTerms } from '../src/rag/index.js';

test('queryTerms reduces plural forms so "weeks" can match "week" in the pages', () => {
  const terms = queryTerms('How many weeks is the in-patient program?');
  assert.ok(terms.includes('week'));
  assert.ok(!terms.includes('many'));
  assert.ok(terms.includes('patient'));
});

test('queryTerms leaves short and -ss words unchanged', () => {
  assert.deepEqual(queryTerms('cost of bass'), ['cost', 'bass']);
});

test('rejects a negative price claim when price facts are available', () => {
  const result = validateAnswer({
    payload: {
      answer: 'Harga tidak tercantum di halaman [S1].',
      usedSources: ['S1'],
      answerable: true,
      needsDisclaimer: false,
      intent: 'procedure',
    },
    allowedIds: ['S1'],
    contextText: 'Out-Patient Program $18,995 USD. In-Patient Program $30,000 USD.',
    priceFacts: [{ amount: 18995, currency: 'USD' }],
  });
  assert.ok(result.errors.includes('contradicts_price_facts'));
});

test('accepts a package answer that quotes the price fact', () => {
  const result = validateAnswer({
    payload: {
      answer: 'Program out-patient 18.995 USD dan in-patient 30.000 USD [S1].',
      usedSources: ['S1'],
      answerable: true,
      needsDisclaimer: false,
      intent: 'procedure',
    },
    allowedIds: ['S1'],
    contextText: 'Out-Patient Program $18,995 USD. In-Patient Program $30,000 USD.',
    priceFacts: [{ amount: 18995, currency: 'USD' }],
  });
  assert.equal(result.ok, true, result.errors.join(','));
});
