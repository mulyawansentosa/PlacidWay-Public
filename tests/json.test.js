import test from 'node:test';
import assert from 'node:assert/strict';
import { extractJson } from '../src/llm/json.js';

test('parses plain JSON', () => {
  assert.deepEqual(extractJson('{"answer":"ok"}'), { answer: 'ok' });
});

test('parses JSON wrapped in a code fence', () => {
  assert.deepEqual(extractJson('```json\n{"answer":"ok"}\n```'), { answer: 'ok' });
});

test('tolerates trailing commas', () => {
  assert.deepEqual(extractJson('{"answer":"ok","used_sources":["S1",],}'), {
    answer: 'ok',
    used_sources: ['S1'],
  });
});

test('returns null for non-JSON', () => {
  assert.equal(extractJson('I could not find that.'), null);
  assert.equal(extractJson(''), null);
});
