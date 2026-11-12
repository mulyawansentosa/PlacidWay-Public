import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stripModelDisclaimers } from '../src/chat/answer.js';

test('stripModelDisclaimers removes a model-written disclaimer paragraph but keeps facts', () => {
  const answer = 'Harga $18,995 USD [S1].\n\nInformasi ini bersifat edukasi umum dan bukan nasihat medis. Silakan konsultasikan dengan tenaga kesehatan berlisensi.';
  assert.equal(stripModelDisclaimers(answer), 'Harga $18,995 USD [S1].');
});

test('stripModelDisclaimers leaves an answer without a disclaimer unchanged', () => {
  assert.equal(stripModelDisclaimers('Only price $30,000 USD [S1].'), 'Only price $30,000 USD [S1].');
});
