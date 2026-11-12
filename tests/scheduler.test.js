import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isStale } from '../src/ingest/scheduler.js';

const NOW = Date.parse('2026-11-11T12:00:00.000Z');
const minutesAgo = (minutes) => new Date(NOW - minutes * 60_000).toISOString();
const MAX_AGE_MS = 5 * 60_000;

test('a missing ingest run is treated as stale', () => {
  assert.equal(isStale(null, NOW, MAX_AGE_MS), true);
});

test('a recent ingest run is fresh', () => {
  assert.equal(isStale({ finished_at: minutesAgo(1) }, NOW, MAX_AGE_MS), false);
  assert.equal(isStale({ started_at: minutesAgo(4) }, NOW, MAX_AGE_MS), false);
});

test('an old ingest run is stale', () => {
  assert.equal(isStale({ finished_at: minutesAgo(6) }, NOW, MAX_AGE_MS), true);
  assert.equal(isStale({ started_at: minutesAgo(60) }, NOW, MAX_AGE_MS), true);
});

test('finished_at wins over started_at', () => {
  const run = { started_at: minutesAgo(60), finished_at: minutesAgo(1) };
  assert.equal(isStale(run, NOW, MAX_AGE_MS), false);
});

test('an unparseable timestamp is treated as stale', () => {
  assert.equal(isStale({ finished_at: 'not-a-date' }, NOW, MAX_AGE_MS), true);
});

test('a non-positive max age disables stale refresh', () => {
  assert.equal(isStale({ finished_at: minutesAgo(60) }, NOW, 0), false);
  assert.equal(isStale(null, NOW, -1), false);
});
