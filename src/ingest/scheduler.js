import { config } from '../config.js';
import { getLastIngestRun } from '../store/db.js';
import { logger } from '../util/logger.js';
import { runIngest } from './run.js';

const FIRST_RUN_DELAY_MS = 15_000;
// After a failed or aborted refresh, wait before retrying from a request so a
// stream of visitors cannot turn into a stream of crawls.
const MIN_RETRY_COOLDOWN_MS = 60_000;

let timer = null;
let firstRun = null;
let running = false;
let stopped = false;
let lastAttemptAt = 0;

async function refreshOnce(reason = 'scheduled') {
  if (running || stopped) return false;
  running = true;
  lastAttemptAt = Date.now();
  const started = lastAttemptAt;
  try {
    const stats = await runIngest({ log: logger });
    logger.info(
      {
        reason,
        changedSources: stats.changedSources,
        chunks: stats.chunks,
        priceFacts: stats.priceFacts,
        embeddedChunks: stats.embeddedChunks,
        durationMs: Date.now() - started,
      },
      'Content refresh finished'
    );
    return true;
  } catch (error) {
    logger.error({ err: error, reason }, 'Content refresh failed');
    return false;
  } finally {
    running = false;
  }
}

/**
 * True when the last ingest finished before the allowed age. A missing run or
 * an unparseable timestamp counts as stale, so a fresh deployment refreshes.
 */
export function isStale(lastRun, now = Date.now(), maxAgeMs = 0) {
  if (!Number.isFinite(maxAgeMs) || maxAgeMs <= 0) return false;
  if (!lastRun) return true;
  const stamp = lastRun.finished_at || lastRun.started_at;
  const at = Date.parse(stamp);
  if (!Number.isFinite(at)) return true;
  return now - at >= maxAgeMs;
}

/**
 * Start a refresh in the background when the index is older than
 * STALE_REFRESH_MINUTES. The caller is never blocked: the current index keeps
 * serving requests while the crawl runs.
 */
export function maybeRefreshInBackground() {
  if (running || stopped) return false;
  const maxAgeMs = Number(config.ingest.staleRefreshMinutes) * 60_000;
  if (!Number.isFinite(maxAgeMs) || maxAgeMs <= 0) return false;

  const now = Date.now();
  if (lastAttemptAt && now - lastAttemptAt < MIN_RETRY_COOLDOWN_MS) return false;
  if (!isStale(getLastIngestRun(), now, maxAgeMs)) return false;

  return refreshInBackground('stale_request');
}

export function refreshInBackground(reason = 'manual') {
  if (running || stopped) return false;
  refreshOnce(reason).catch((error) => {
    logger.error({ err: error, reason }, 'Background content refresh failed');
  });
  return true;
}

/**
 * Poll the configured sources on an interval. The ingest uses conditional GET
 * and content hashes, so unchanged pages are not re-chunked or re-embedded.
 * This is intentionally disabled when AUTO_REFRESH_MINUTES=0.
 */
export function startAutoRefresh() {
  stopped = false;
  const minutes = Number(config.ingest.autoRefreshMinutes);
  if (!Number.isFinite(minutes) || minutes <= 0) {
    logger.info('Automatic content refresh disabled');
    return { stop() {} };
  }

  logger.info(
    {
      everyMinutes: minutes,
      staleRefreshMinutes: Number(config.ingest.staleRefreshMinutes),
    },
    'Automatic content refresh enabled'
  );
  firstRun = setTimeout(refreshOnce, FIRST_RUN_DELAY_MS);
  firstRun.unref?.();
  timer = setInterval(refreshOnce, minutes * 60_000);
  timer.unref?.();

  return {
    stop() {
      stopped = true;
      if (firstRun) clearTimeout(firstRun);
      if (timer) clearInterval(timer);
      firstRun = null;
      timer = null;
    },
  };
}
