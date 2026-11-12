/**
 * End-to-end evaluation against a running bot.
 *
 *   npm run eval                       # eval/questions.json -> eval/results.{md,json}
 *   npm run eval -- --set required-8.json --out required-8-results
 *   JUDGE=1 npm run eval               # also run an LLM faithfulness judge (uses LLM_API_KEY)
 *
 * Heuristic checks (substring, refusal wording) are kept because they are
 * cheap and deterministic. The metrics section adds checks that do not depend
 * on wording:
 *   - abstention accuracy: answered only when the labelled answer exists
 *   - citation recall / precision: cited pages against the labelled pages
 *   - unsupported amounts: currency figures in the answer that appear nowhere
 *     in the ingested pages (hallucination proxy, independent of the validator)
 *   - disclaimer count per conversation
 *   - optional LLM judge: is each claim supported by the cited page text?
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getSources } from '../config/sources.js';
import { listAllChunks } from '../src/store/db.js';
import { extractMoneyTokens } from '../src/llm/validate.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE_URL = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/+$/, '');
const EVAL_LABEL = process.env.EVAL_LABEL || 'live deployment';
const JUDGE = process.env.JUDGE === '1';

function argValue(flag, fallback) {
  const index = process.argv.indexOf(flag);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const setFile = path.resolve(__dirname, argValue('--set', 'questions.json'));
const outName = argValue('--out', 'results');
const questions = JSON.parse(fs.readFileSync(setFile, 'utf8'));

const NOT_FOUND_RE =
  /could not find|couldn't find|not found|not find|not listed|does not list|doesn't list|not specif|not provide|tidak menemukan|tidak tersedia|tidak ada|no encontr|لم أجد/i;
const DISCLAIMER_RE = /not medical advice|bukan saran medis|no es consejo médico/i;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function postChat(sessionId, message) {
  const started = Date.now();
  const response = await fetch(`${BASE_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, message }),
    signal: AbortSignal.timeout(60_000),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.message || `HTTP ${response.status}`);
  }
  return { ...data, latencyMs: Date.now() - started };
}

// ---------- corpus facts (independent of the bot's runtime path) ----------

const urlToSourceId = new Map(getSources().map((source) => [source.url, source.id]));
const chunks = listAllChunks();
const corpusText = chunks.map((row) => row.content).join('\n');
const corpusAmountKeys = new Set(extractMoneyTokens(corpusText).map((token) => token.key));
const sourceText = new Map();
for (const row of chunks) {
  const id = row.source_id;
  sourceText.set(id, `${sourceText.get(id) || ''}\n${row.content}`);
}

function citedSourceIds(sources = []) {
  return [...new Set(sources.map((source) => urlToSourceId.get(source.url)).filter(Boolean))];
}

function unsupportedAmounts(answer) {
  return extractMoneyTokens(answer).filter((token) => !corpusAmountKeys.has(token.key));
}

// ---------- heuristic checks ----------

function evaluate(item, turns) {
  const expect = item.expect || {};
  const final = turns[turns.length - 1];
  const answer = String(final.answer || '');
  const lower = answer.toLowerCase();
  const checks = [];
  const add = (name, pass, detail = '') => checks.push({ name, pass, detail });

  if (expect.sources) {
    add('has source links', Array.isArray(final.sources) && final.sources.length > 0);
  }
  if (expect.notFound) {
    add('honest not-found', NOT_FOUND_RE.test(answer));
    add(
      'not-found reply has no source links',
      !(Array.isArray(final.sources) && final.sources.length > 0),
      final.sources?.length ? `${final.sources.length} source(s) attached` : ''
    );
  }
  if (expect.refusal) {
    add(
      'refusal language',
      /cannot|could not|can't|not able|unable|hanya|tidak bisa|no puedo|لا يمكنني|only|outside/i.test(answer)
    );
  }
  if (expect.mustContainAny?.length) {
    add(
      `contains one of: ${expect.mustContainAny.join(' / ')}`,
      expect.mustContainAny.some((value) => lower.includes(String(value).toLowerCase()))
    );
  }
  for (const group of expect.mustContainAnyGroups || []) {
    add(
      `contains one of: ${group.join(' / ')}`,
      group.some((value) => lower.includes(String(value).toLowerCase()))
    );
  }
  if (expect.mustNotContain?.length) {
    const found = expect.mustNotContain.filter((value) => lower.includes(String(value).toLowerCase()));
    add(`does not contain: ${expect.mustNotContain.join(' / ')}`, found.length === 0, found.join(', '));
  }
  if (expect.maxDisclaimers !== undefined) {
    const count = turns.reduce(
      (total, turn) => total + (String(turn.answer || '').match(new RegExp(DISCLAIMER_RE.source, 'gi')) || []).length,
      0
    );
    add(`disclaimer shown at most ${expect.maxDisclaimers} time(s)`, count <= expect.maxDisclaimers, `shown ${count}x`);
  }
  if (Array.isArray(final.sources)) {
    const bad = final.sources.filter((source) => !String(source.url || '').startsWith('https://www.placidway.com/'));
    if (bad.length) add('source URLs on placidway.com', false, bad.map((source) => source.url).join(', '));
  }

  return { pass: checks.every((check) => check.pass), checks };
}

// ---------- metric helpers ----------

function metricsFor(item, turns) {
  const final = turns[turns.length - 1];
  const answered = Array.isArray(final.sources) && final.sources.length > 0;
  const cited = citedSourceIds(final.sources);
  const expected = item.expectedSources || [];
  const answerable = typeof item.answerable === 'boolean' ? item.answerable : null;

  const result = {
    answered,
    abstentionCorrect: answerable === null ? null : answerable === answered,
    citationRecallHit: null,
    citationPrecision: null,
    unsupportedAmounts: unsupportedAmounts(turns.map((turn) => turn.answer || '').join('\n')),
  };
  if (answered && expected.length) {
    const hits = cited.filter((id) => expected.includes(id));
    result.citationRecallHit = hits.length > 0;
    result.citationPrecision = cited.length ? hits.length / cited.length : 0;
  }
  return result;
}

async function judgeFaithfulness(item, final) {
  const { chatJson } = await import('../src/llm/client.js');
  const cited = citedSourceIds(final.sources);
  const evidence = cited
    .map((id) => `[${id}]\n${(sourceText.get(id) || '').slice(0, 80000)}`)
    .join('\n\n');
  const messages = [
    {
      role: 'system',
      content:
        'You check whether a chatbot answer is supported by evidence. ' +
        'Return JSON only: {"supported": true|false, "unsupported_claims": ["..."]}. ' +
        'supported is true only if every factual claim (prices, programs, inclusions, dates, medical statements) is stated in the evidence. ' +
        'Refusals and "not listed" statements are supported. Ignore style. ' +
        'Standard boilerplate is not a factual claim and must not count as unsupported: the name of the PlacidWay website or clinic page, and the suggestion to request a free quote or contact PlacidWay.',
    },
    {
      role: 'user',
      content: `QUESTION:\n${item.messages[item.messages.length - 1]}\n\nEVIDENCE:\n${evidence || '(none)'}\n\nANSWER:\n${final.answer}`,
    },
  ];
  try {
    const { parsed } = await chatJson({ messages, temperature: 0, maxTokens: 300 });
    return { supported: parsed?.supported === true, unsupported: parsed?.unsupported_claims || [] };
  } catch (error) {
    return { supported: null, unsupported: [], error: error.message };
  }
}

function pct(numerator, denominator) {
  if (!denominator) return 'n/a';
  return `${numerator}/${denominator} (${Math.round((numerator / denominator) * 100)}%)`;
}

// ---------- rendering ----------

function renderMarkdown(rows, meta, summary) {
  const lines = [];
  lines.push('# Chatbot test results');
  lines.push('');
  lines.push(`- Date: ${new Date().toISOString()}`);
  lines.push(`- Question set: ${path.basename(setFile)}`);
  lines.push(`- Mode: ${EVAL_LABEL}`);
  lines.push(`- Base URL: ${BASE_URL}`);
  lines.push(`- LLM configured: ${meta?.llmConfigured === true ? 'yes' : 'no'}`);
  lines.push(`- Questions: ${rows.length}`);
  lines.push(`- Passed heuristics: ${rows.filter((row) => row.pass).length}/${rows.length}`);
  lines.push('');
  lines.push('## Metrics');
  lines.push('');
  lines.push('| Metric | Result | What it measures |');
  lines.push('|---|---|---|');
  lines.push(`| Heuristic checks | ${pct(summary.heuristicPass, rows.length)} | Required wording, refusal language, sources present |`);
  lines.push(`| Abstention accuracy | ${pct(summary.abstentionCorrect, summary.abstentionTotal)} | Answered when the page has the answer, and declined when it does not |`);
  lines.push(`| Citation recall | ${pct(summary.citationHit, summary.citationTotal)} | Answers that cite at least one labelled page |`);
  lines.push(`| Citation precision (mean) | ${summary.citationPrecision === null ? 'n/a' : `${Math.round(summary.citationPrecision * 100)}%`} | Share of cited pages that were labelled correct |`);
  lines.push(`| Answers with unsupported amount | ${pct(summary.unsupportedAnswers, summary.amountAnswers)} | Currency figures not found anywhere in the ingested pages (hallucination proxy) |`);
  lines.push(`| Disclaimer repeated | ${summary.disclaimerRepeats} | Conversations that showed the medical disclaimer more than once |`);
  lines.push(
    `| LLM judge: claims supported | ${JUDGE ? pct(summary.judgeSupported, summary.judgeTotal) : 'not run (set JUDGE=1)'} | Answers whose claims are all stated in the cited page text |`
  );
  lines.push('');
  lines.push('## Results');
  lines.push('');
  lines.push('| # | ID | Type | Result | Abstention | Latency | Sources |');
  lines.push('|---|----|------|--------|------------|---------|---------|');
  rows.forEach((row, index) => {
    const abstention =
      row.metrics.abstentionCorrect === null ? '-' : row.metrics.abstentionCorrect ? 'correct' : 'WRONG';
    lines.push(
      `| ${index + 1} | ${row.item.id} | ${row.item.type} | ${row.pass ? 'PASS' : 'REVIEW'} | ${abstention} | ${row.latencyMs} ms | ${row.sources.length} |`
    );
  });
  lines.push('');
  lines.push('## Details');
  lines.push('');
  rows.forEach((row, index) => {
    lines.push(`### ${index + 1}. ${row.item.id} (${row.item.type})`);
    lines.push('');
    lines.push(`**Question${row.item.messages.length > 1 ? 's' : ''}:**`);
    row.item.messages.forEach((message) => lines.push(`- ${message}`));
    lines.push('');
    lines.push('**Answer:**');
    lines.push('');
    lines.push('```text');
    lines.push(row.answer || '(empty)');
    lines.push('```');
    lines.push('');
    lines.push('**Sources:**');
    if (row.sources.length) {
      row.sources.forEach((source) => lines.push(`- [${source.id || '?'}] ${source.title} — ${source.url}`));
    } else {
      lines.push('- (none)');
    }
    lines.push('');
    lines.push('**Checks:**');
    row.checks.forEach((check) =>
      lines.push(`- ${check.pass ? 'PASS' : 'FAIL'} — ${check.name}${check.detail ? ` (${check.detail})` : ''}`)
    );
    if (row.metrics.unsupportedAmounts.length) {
      lines.push(`- FLAG — amounts not in the pages: ${row.metrics.unsupportedAmounts.map((t) => t.raw).join(', ')}`);
    }
    if (row.judge) {
      lines.push(
        `- JUDGE — ${row.judge.supported === null ? `error: ${row.judge.error}` : row.judge.supported ? 'supported' : `unsupported: ${row.judge.unsupported.join('; ')}`}`
      );
    }
    if (row.item.expect?.note) {
      lines.push('');
      lines.push(`**Note:** ${row.item.expect.note}`);
    }
    lines.push('');
  });
  return lines.join('\n');
}

// ---------- main ----------

async function main() {
  const meta = await fetch(`${BASE_URL}/api/meta`)
    .then((response) => (response.ok ? response.json() : null))
    .catch(() => null);

  const rows = [];
  for (const item of questions) {
    const sessionId = crypto.randomUUID();
    const turns = [];
    try {
      for (const message of item.messages) {
        const result = await postChat(sessionId, message);
        turns.push({ answer: result.answer, sources: result.sources || [], latencyMs: result.latencyMs });
        await sleep(250);
      }
    } catch (error) {
      rows.push({
        item,
        pass: false,
        answer: `ERROR: ${error.message}`,
        sources: [],
        checks: [{ name: 'request completed', pass: false, detail: error.message }],
        metrics: { answered: false, abstentionCorrect: null, citationRecallHit: null, citationPrecision: null, unsupportedAmounts: [] },
        latencyMs: 0,
      });
      console.log(`ERROR  ${item.id}: ${error.message}`);
      continue;
    }
    const final = turns[turns.length - 1];
    const evaluation = evaluate(item, turns);
    const metrics = metricsFor(item, turns);
    const judge = JUDGE && metrics.answered ? await judgeFaithfulness(item, final) : null;
    rows.push({
      item,
      pass: evaluation.pass,
      answer: final.answer,
      sources: final.sources,
      checks: evaluation.checks,
      metrics,
      judge,
      latencyMs: final.latencyMs,
    });
    console.log(`${(evaluation.pass ? 'PASS' : 'REVIEW').padEnd(6)} ${item.id} (${final.latencyMs} ms)`);
  }

  const judged = rows.filter((row) => row.judge);
  const summary = {
    heuristicPass: rows.filter((row) => row.pass).length,
    abstentionTotal: rows.filter((row) => row.metrics.abstentionCorrect !== null).length,
    abstentionCorrect: rows.filter((row) => row.metrics.abstentionCorrect === true).length,
    citationTotal: rows.filter((row) => row.metrics.citationRecallHit !== null).length,
    citationHit: rows.filter((row) => row.metrics.citationRecallHit === true).length,
    citationPrecision: null,
    amountAnswers: rows.filter((row) => extractMoneyTokens(row.answer || '').length > 0).length,
    unsupportedAnswers: rows.filter((row) => row.metrics.unsupportedAmounts.length > 0).length,
    disclaimerRepeats: rows.filter((row) => row.checks.some((c) => /disclaimer shown/.test(c.name) && !c.pass)).length,
    judgeSupported: judged.filter((row) => row.judge.supported === true).length,
    judgeTotal: judged.filter((row) => row.judge.supported !== null).length,
  };
  const precisions = rows.map((row) => row.metrics.citationPrecision).filter((value) => value !== null);
  if (precisions.length) summary.citationPrecision = precisions.reduce((a, b) => a + b, 0) / precisions.length;

  const markdown = renderMarkdown(rows, meta, summary);
  fs.writeFileSync(path.join(__dirname, `${outName}.md`), markdown);
  fs.writeFileSync(
    path.join(__dirname, `${outName}.json`),
    JSON.stringify(
      rows.map((row) => ({
        id: row.item.id,
        type: row.item.type,
        pass: row.pass,
        latencyMs: row.latencyMs,
        answer: row.answer,
        sources: row.sources,
        checks: row.checks,
        metrics: row.metrics,
        judge: row.judge,
      })),
      null,
      2
    )
  );

  console.log('');
  console.log(`Passed heuristics: ${summary.heuristicPass}/${rows.length}`);
  console.log(`Abstention accuracy: ${pct(summary.abstentionCorrect, summary.abstentionTotal)}`);
  console.log(`Citation recall: ${pct(summary.citationHit, summary.citationTotal)}`);
  console.log(`Wrote eval/${outName}.md and eval/${outName}.json`);
  if (summary.heuristicPass !== rows.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
