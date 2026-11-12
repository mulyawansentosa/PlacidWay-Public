import test from 'node:test';
import assert from 'node:assert/strict';
import { assessRelevance } from '../src/rag/relevance.js';
import { queryTerms } from '../src/rag/index.js';

test('vector similarity above the threshold passes the gate', () => {
  const result = assessRelevance({
    query: 'adrenal cancer cost',
    results: [{ content: 'Price starts from $18,995', treatment: 'adrenal cancer' }],
    maxSimilarity: 0.62,
    bm25TopScore: 0,
    matchedTerms: 2,
  });
  assert.equal(result.ok, true);
  assert.equal(result.reason, 'vector_similarity');
});

test('a price fact passes the gate without a vector', () => {
  const result = assessRelevance({
    query: 'cost',
    results: [],
    priceFacts: [{ amount: 18995 }],
  });
  assert.equal(result.ok, true);
  assert.equal(result.reason, 'price_fact_match');
});

test('empty results fail honestly', () => {
  const result = assessRelevance({
    query: 'dental implant',
    results: [],
    maxSimilarity: 0,
    bm25TopScore: 0,
    matchedTerms: 0,
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'no_results');
});

test('low-signal retrieval fails', () => {
  const result = assessRelevance({
    query: 'what is the weather in Cancun',
    results: [{ content: 'Cancer treatment information', treatment: 'adrenal cancer' }],
    maxSimilarity: 0.11,
    bm25TopScore: 0.4,
    matchedTerms: 0,
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'low_relevance');
});

test('query terms remove stopwords and short tokens', () => {
  assert.deepEqual(queryTerms('How much does the adrenal cancer cost in Mexico?'), [
    'adrenal',
    'cancer',
    'cost',
    'mexico',
  ]);
});
