import test from 'node:test';
import assert from 'node:assert/strict';
import { chunkSections } from '../src/ingest/chunk.js';

const source = {
  id: 'package-test',
  title: 'Adrenal Cancer Package',
  pageType: 'package',
  treatment: 'adrenal cancer',
  country: 'Mexico',
  city: 'Tijuana',
  clinic: 'ITC',
  url: 'https://www.placidway.com/package/7902/example',
};

test('chunks keep the section heading and metadata', () => {
  const chunks = chunkSections(
    [
      {
        heading: 'What is included',
        text: 'Consultation. Lab work. Treatments. Follow-up after three months.',
      },
    ],
    source,
    { maxChars: 200, minChars: 20, overlapChars: 0 }
  );
  assert.ok(chunks.length >= 1);
  assert.match(chunks[0].content, /What is included/);
  assert.equal(chunks[0].metadata.pageType, 'package');
  assert.equal(chunks[0].metadata.treatment, 'adrenal cancer');
});

test('long paragraphs are split close to the configured size', () => {
  const sentence = 'The package includes a detailed medical evaluation and follow-up care. ';
  const chunks = chunkSections(
    [{ heading: 'Inclusions', text: sentence.repeat(30) }],
    source,
    { maxChars: 300, minChars: 40, overlapChars: 0 }
  );
  assert.ok(chunks.length > 1);
  for (const chunk of chunks) {
    assert.ok(chunk.content.length < 500, `chunk too large: ${chunk.content.length}`);
  }
});

test('small sections merge instead of producing tiny chunks', () => {
  const chunks = chunkSections(
    [
      { heading: 'A', text: 'Short but useful information about the clinic.' },
      { heading: 'B', text: 'Another short section about follow-up care.' },
    ],
    source,
    { maxChars: 500, minChars: 50, overlapChars: 0 }
  );
  assert.equal(chunks.length, 1);
});
