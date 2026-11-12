/**
 * Deterministic retrieval check (no LLM calls).
 *
 * For every case in eval/retrieval-cases.json it reports:
 *   - recall@K: did one of the expected pages appear in the top-K chunks?
 *   - gate decisions: would the relevance gate let the LLM answer?
 *   - a sweep of MIN_BM25_SCORE, so the threshold is chosen from data, not guessed.
 *
 * Usage: npm run calibrate
 * Writes eval/retrieval-calibration.md.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../src/config.js';
import { knowledgeIndex } from '../src/rag/index.js';
import { assessRelevance } from '../src/rag/relevance.js';
import { translateDomainTerms } from '../src/guard/translate.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const evalDir = path.join(__dirname, '..', 'eval');
const argIndex = process.argv.indexOf('--cases');
const casesFile = argIndex >= 0 ? process.argv[argIndex + 1] : 'retrieval-cases.json';
const outIndex = process.argv.indexOf('--out');
const outFile = outIndex >= 0 ? process.argv[outIndex + 1] : 'retrieval-calibration.md';
const cases = JSON.parse(fs.readFileSync(path.join(evalDir, casesFile), 'utf8'));
const BM25_GRID = [0.5, 1, 2, 3, 4, 5, 6];
const COVERAGE_GRID = [0, 0.25, 0.34, 0.5, 0.67, 0.75, 1];
const currentBm25 = config.retrieval.minBm25Score;
const currentCoverage = config.retrieval.minTermCoverage;

await knowledgeIndex.ensureFresh();
if (!knowledgeIndex.chunks.length) {
  console.error('The index is empty. Run `npm run ingest` first.');
  process.exit(1);
}

const searched = cases.map((item) => {
  // Same deterministic glossary step the pipeline runs before retrieval.
  const retrieval = knowledgeIndex.search(translateDomainTerms(item.query) || item.query);
  const topSources = [...new Set(retrieval.results.map((chunk) => chunk.sourceId))];
  return { ...item, retrieval, topSources };
});

const answerable = searched.filter((item) => item.answerable);
const unanswerable = searched.filter((item) => !item.answerable);
const recallHits = answerable.filter((item) =>
  item.expectedSources.some((id) => item.topSources.includes(id))
);
const recallAt = (rows) => rows.filter((item) => item.expectedSources.some((id) => item.topSources.includes(id))).length;

function gate(item, { minBm25Score = currentBm25, minTermCoverage = currentCoverage } = {}) {
  const r = item.retrieval;
  return assessRelevance({
    query: item.query,
    results: r.results,
    maxSimilarity: 0, // embeddings are not configured in the current deployment
    bm25TopScore: r.bm25TopScore,
    matchedTerms: r.matchedTerms,
    specificMatches: r.specificMatches,
    specificTotal: r.specificTotal,
    priceFacts: [],
    thresholds: { minBm25Score, minTermCoverage },
  });
}

function sweep(values, toOptions) {
  return values.map((value) => {
    let tp = 0;
    let fn = 0;
    let tn = 0;
    let fp = 0;
    for (const item of searched) {
      const pass = gate(item, toOptions(value)).ok;
      if (item.answerable) (pass ? (tp += 1) : (fn += 1));
      else (pass ? (fp += 1) : (tn += 1));
    }
    const sensitivity = answerable.length ? tp / answerable.length : 0;
    const specificity = unanswerable.length ? tn / unanswerable.length : 0;
    return { value, tp, fn, tn, fp, balanced: (sensitivity + specificity) / 2 };
  });
}

// Ties go to the value already in use, so the report never suggests a change
// the data does not clearly support.
function pickBest(rows, current) {
  const top = Math.max(...rows.map((row) => row.balanced));
  const tied = rows.filter((row) => Math.abs(row.balanced - top) < 1e-9);
  return tied.find((row) => row.value === current) || tied[0];
}

const bm25Rows = sweep(BM25_GRID, (value) => ({ minBm25Score: value, minTermCoverage: currentCoverage }));
const coverageRows = sweep(COVERAGE_GRID, (value) => ({ minBm25Score: currentBm25, minTermCoverage: value }));
const bestBm25 = pickBest(bm25Rows, currentBm25);
const bestCoverage = pickBest(coverageRows, currentCoverage);

const lines = [];
lines.push('# Retrieval calibration');
lines.push('');
lines.push(`- Date: ${new Date().toISOString()}`);
lines.push(`- Cases: ${cases.length} (${answerable.length} answerable, ${unanswerable.length} not in content)`);
lines.push(`- Top-K: ${config.retrieval.topK}`);
lines.push(`- Current MIN_BM25_SCORE: ${currentBm25}`);
lines.push(`- Current MIN_TERM_COVERAGE: ${currentCoverage}`);
lines.push(`- Recall@${config.retrieval.topK} for answerable cases: ${recallHits.length}/${answerable.length}`);
lines.push('- Scope: BM25 gate only. Price facts, intent templates and the LLM are not part of this check.');
lines.push('');
function renderSweep(title, label, rows, current, best) {
  lines.push(`## ${title}`);
  lines.push('');
  lines.push(`| ${label} | Answerable passed (TP) | Answerable blocked (FN) | Unanswerable blocked (TN) | Unanswerable passed (FP) | Balanced accuracy |`);
  lines.push('|---|---|---|---|---|---|');
  for (const row of rows) {
    const marks = [row.value === current ? ' (current)' : '', row.value === best.value ? ' (best)' : ''].join('');
    lines.push(`| ${row.value}${marks} | ${row.tp} | ${row.fn} | ${row.tn} | ${row.fp} | ${row.balanced.toFixed(3)} |`);
  }
  lines.push('');
  lines.push(`Best: ${best.value} (balanced accuracy ${best.balanced.toFixed(3)}). Current: ${current}.`);
  lines.push('');
}
renderSweep('Sweep 1: MIN_BM25_SCORE (coverage fixed at current)', 'MIN_BM25_SCORE', bm25Rows, currentBm25, bestBm25);
renderSweep('Sweep 2: MIN_TERM_COVERAGE (BM25 fixed at current)', 'MIN_TERM_COVERAGE', coverageRows, currentCoverage, bestCoverage);
lines.push('## Per-case decisions at the current threshold');
lines.push('');
lines.push('| Query | Expected | Top sources | Gate | Reason | Correct |');
lines.push('|---|---|---|---|---|---|');
for (const item of searched) {
  const decision = gate(item);
  const correct = decision.ok === item.answerable;
  const expectedHit = item.answerable
    ? item.expectedSources.some((id) => item.topSources.includes(id))
    : null;
  const recallMark = expectedHit === null ? '' : expectedHit ? ' (recall hit)' : ' (recall miss)';
  lines.push(
    `| ${item.query.replace(/\|/g, '/')} | ${item.answerable ? item.expectedSources.join(', ') : 'none'} | ${item.topSources.join(', ') || '-'}${recallMark} | ${decision.ok ? 'answer' : 'fallback'} | ${decision.reason} | ${correct ? 'yes' : 'NO'} |`
  );
}
lines.push('');

const outPath = path.join(evalDir, outFile);
fs.writeFileSync(outPath, lines.join('\n'));
console.log(lines.slice(0, 12).join('\n'));
console.log(`\nWrote ${outPath}`);
