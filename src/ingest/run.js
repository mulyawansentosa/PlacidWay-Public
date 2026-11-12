import { config } from '../config.js';
import { enabledSources, getSources, missingSources } from '../../config/sources.js';
import { logger } from '../util/logger.js';
import { extractPage } from './extract.js';
import { chunkSections } from './chunk.js';
import { embedTexts } from './embed.js';
import { assertAllowedSourceUrl, assertFinalUrl, isAllowedByRobots, politeFetch } from './fetch.js';
import {
  finishIngestRun,
  getSourceRow,
  replaceSourceContent,
  startIngestRun,
  touchIndexVersion,
  updateSourceState,
  upsertSource,
} from '../store/db.js';

/**
 * Ingest the configured source pages. Content is replaced per source only
 * after a successful extraction, so a failed refresh never leaves the bot with
 * a half-empty knowledge base.
 */
export async function runIngest({ force = false, log = console } = {}) {
  const runId = startIngestRun();
  const started = Date.now();
  const stats = {
    startedAt: new Date(started).toISOString(),
    force,
    sources: [],
    missing: missingSources().map((source) => ({ id: source.id, title: source.title })),
    changedSources: 0,
    chunks: 0,
    priceFacts: 0,
    embeddedChunks: 0,
  };

  const logLine = (message) => {
    if (typeof log === 'function') log(message);
    else if (log && typeof log.info === 'function') log.info(message);
    else logger.info(message);
  };

  try {
    const allSources = getSources();
    for (const source of allSources) {
      if (source.url) continue;
      upsertSource(source);
      updateSourceState(source.id, {
        status: 'missing_url',
        error: 'SOURCE_COMPARISON_URL is empty',
      });
    }

    const sources = enabledSources();
    if (!sources.length) throw new Error('No source URLs are configured.');
    const allowedUrls = sources.map((source) => source.url);

    for (const source of sources) {
      const sourceStat = {
        id: source.id,
        title: source.title,
        status: 'pending',
        chunks: 0,
        priceFacts: 0,
        error: null,
      };
      stats.sources.push(sourceStat);

      try {
        assertAllowedSourceUrl(source.url, allowedUrls);
        upsertSource(source);
        const existing = getSourceRow(source.id);

        const robotsAllowed = await isAllowedByRobots(source.url);
        if (!robotsAllowed) {
          updateSourceState(source.id, {
            status: 'blocked_by_robots',
            error: 'robots.txt disallows this URL for the configured crawler',
          });
          sourceStat.status = 'blocked_by_robots';
          sourceStat.error = 'robots.txt disallowed';
          logLine(`[ingest] ${source.id}: blocked by robots.txt`);
          continue;
        }

        const response = await politeFetch(source.url, {
          etag: force ? null : existing?.etag,
          lastModified: force ? null : existing?.last_modified,
        });

        if (response.status === 304) {
          updateSourceState(source.id, {
            status: 'not_modified',
            fetched_at: new Date().toISOString(),
          });
          sourceStat.status = 'not_modified';
          logLine(`[ingest] ${source.id}: not modified (304)`);
          continue;
        }
        if (!response.ok) {
          throw new Error(`HTTP ${response.status} for ${source.url}`);
        }

        assertFinalUrl(response.finalUrl, source.url, allowedUrls);
        const extracted = extractPage(response.body, { ...source, url: response.finalUrl });
        if (!extracted.text || extracted.text.length < 200) {
          throw new Error('Extracted content is too short; refusing to replace the index.');
        }

        if (!force && existing?.content_hash === extracted.contentHash) {
          updateSourceState(source.id, {
            status: 'unchanged',
            fetched_at: new Date().toISOString(),
            etag: response.etag || existing.etag,
            last_modified: response.lastModified || existing.last_modified,
          });
          sourceStat.status = 'unchanged';
          sourceStat.chunks = existing.chunk_count || 0;
          logLine(`[ingest] ${source.id}: content unchanged`);
          continue;
        }

        const chunks = chunkSections(extracted.sections, source);
        if (!chunks.length) throw new Error('No chunks were produced.');

        let embeddings = null;
        try {
          embeddings = await embedTexts(
            chunks.map((chunk) => `${source.title}\n${chunk.heading}\n${chunk.content}`)
          );
        } catch (embeddingError) {
          logLine(
            `[ingest] ${source.id}: embedding failed (${embeddingError.message}); storing BM25-only chunks`
          );
        }
        chunks.forEach((chunk, index) => {
          chunk.embedding = embeddings?.[index] || null;
        });

        replaceSourceContent(source, chunks, extracted.priceFacts);
        updateSourceState(source.id, {
          status: 'ready',
          error: null,
          content_hash: extracted.contentHash,
          etag: response.etag || null,
          last_modified: response.lastModified || null,
          fetched_at: new Date().toISOString(),
          chunk_count: chunks.length,
        });

        sourceStat.status = 'ready';
        sourceStat.chunks = chunks.length;
        sourceStat.priceFacts = extracted.priceFacts.length;
        stats.changedSources += 1;
        stats.chunks += chunks.length;
        stats.priceFacts += extracted.priceFacts.length;
        stats.embeddedChunks += embeddings ? embeddings.length : 0;

        logLine(
          `[ingest] ${source.id}: ${chunks.length} chunks, ${extracted.priceFacts.length} price facts` +
            (embeddings ? '' : ' (no embeddings, BM25 only)')
        );
      } catch (error) {
        sourceStat.status = 'failed';
        sourceStat.error = error.message;
        updateSourceState(source.id, { status: 'failed', error: error.message });
        logLine(`[ingest] ${source.id}: FAILED - ${error.message}`);
      }
    }

    if (stats.changedSources > 0) touchIndexVersion();

    stats.durationMs = Date.now() - started;
    const status = stats.sources.some((source) => source.status === 'failed')
      ? 'partial'
      : stats.missing.length
        ? 'partial'
        : 'success';
    finishIngestRun(runId, status, stats);
    return stats;
  } catch (error) {
    stats.durationMs = Date.now() - started;
    finishIngestRun(runId, 'failed', stats, error.message);
    throw error;
  }
}

export function formatIngestSummary(stats) {
  const lines = [];
  lines.push(`Sources changed: ${stats.changedSources}`);
  lines.push(`Chunks: ${stats.chunks}, price facts: ${stats.priceFacts}, embedded: ${stats.embeddedChunks}`);
  for (const source of stats.sources) {
    lines.push(
      `- ${source.id}: ${source.status}` +
        (source.chunks ? `, ${source.chunks} chunks` : '') +
        (source.priceFacts ? `, ${source.priceFacts} prices` : '') +
        (source.error ? ` (${source.error})` : '')
    );
  }
  if (stats.missing.length) {
    lines.push(
      `Missing URLs: ${stats.missing.map((source) => source.id).join(', ')}. ` +
        'Set SOURCE_COMPARISON_URL and run ingest again.'
    );
  }
  if (stats.durationMs) lines.push(`Duration: ${(stats.durationMs / 1000).toFixed(1)}s`);
  return lines.join('\n');
}
