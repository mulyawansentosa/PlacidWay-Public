import { config } from '../config.js';

const ALLOWED_HOSTS = new Set(['placidway.com', 'www.placidway.com']);
let lastRequestAt = 0;
const robotsCache = new Map();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeHost(hostname) {
  return hostname.toLowerCase().replace(/^www\./, '');
}

function originOf(rawUrl) {
  return new URL(rawUrl).origin;
}

/**
 * Only the configured pages may be fetched. This is the application-level
 * allowlist, independent of the prompt and UI.
 */
export function assertAllowedSourceUrl(rawUrl, allowedUrls) {
  const url = new URL(rawUrl);
  if (url.protocol !== 'https:') throw new Error(`Only https URLs are allowed: ${rawUrl}`);
  if (!ALLOWED_HOSTS.has(url.hostname.toLowerCase())) {
    throw new Error(`Host is not in the PlacidWay allowlist: ${url.hostname}`);
  }
  const allowed = allowedUrls.some((candidate) => {
    if (candidate === rawUrl) return true;
    const c = new URL(candidate);
    return c.origin === url.origin && c.pathname === url.pathname;
  });
  if (!allowed) throw new Error(`URL is not in the configured source list: ${rawUrl}`);
  return url.toString();
}

function isAllowedFinalUrl(finalUrl, sourceUrl, allowedUrls) {
  if (allowedUrls.includes(finalUrl)) return true;
  try {
    const final = new URL(finalUrl);
    const source = new URL(sourceUrl);
    if (!ALLOWED_HOSTS.has(final.hostname.toLowerCase())) return false;
    if (normalizeHost(final.hostname) !== normalizeHost(source.hostname)) return false;

    // Accept same resource with an added slug, e.g. /profile/5 ->
    // /profile/5/Alternative-Cancer-Treatment-by-ITC-Immunity-Therapy-Center
    const prefix = (pathname) => {
      const parts = pathname.split('/').filter(Boolean);
      return parts.slice(0, 2).join('/');
    };
    return prefix(final.pathname) === prefix(source.pathname);
  } catch (_) {
    return false;
  }
}

async function fetchRobots(origin) {
  if (robotsCache.has(origin)) return robotsCache.get(origin);
  const promise = (async () => {
    try {
      const response = await fetch(`${origin}/robots.txt`, {
        headers: { 'User-Agent': config.ingest.userAgent, Accept: 'text/plain' },
        signal: AbortSignal.timeout(config.ingest.timeoutMs),
        redirect: 'follow',
      });
      if (!response.ok) return null;
      return await response.text();
    } catch (_) {
      return null;
    }
  })();
  robotsCache.set(origin, promise);
  return promise;
}

function parseRobots(text) {
  if (!text) return null;
  const groups = [];
  let current = null;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;
    const [rawKey, ...rest] = line.split(':');
    if (!rawKey || !rest.length) continue;
    const key = rawKey.trim().toLowerCase();
    const value = rest.join(':').trim();
    if (key === 'user-agent') {
      current = { agents: [value.toLowerCase()], rules: [] };
      groups.push(current);
    } else if (current && (key === 'allow' || key === 'disallow')) {
      current.rules.push({ type: key, path: value });
    }
  }
  return groups;
}

function matchesRule(pathname, rulePath) {
  if (!rulePath) return false;
  if (rulePath === '/') return true;
  const normalized = rulePath.replace(/\*.*$/, '');
  return pathname.startsWith(normalized);
}

/**
 * Minimal robots.txt support. PlacidWay currently allows general crawlers on
 * the assessment pages, but the bot still checks before each ingestion run.
 */
export async function isAllowedByRobots(rawUrl) {
  const url = new URL(rawUrl);
  const text = await fetchRobots(url.origin);
  if (!text) return true; // no robots.txt / unreachable: proceed politely
  const groups = parseRobots(text);
  if (!groups) return true;

  const botName = config.ingest.userAgent.toLowerCase().split(/[\s/]/)[0];
  const matching = groups.filter((group) =>
    group.agents.some((agent) => agent === '*' || botName.includes(agent))
  );
  if (!matching.length) return true;

  const rules = matching.flatMap((group) => group.rules);
  const applicable = rules
    .filter((rule) => matchesRule(url.pathname, rule.path))
    .sort((a, b) => b.path.length - a.path.length);
  if (!applicable.length) return true;
  return applicable[0].type === 'allow';
}

/**
 * Sequential, rate-limited fetch. One request per CRAWL_DELAY_MS across the
 * whole process, with a clear User-Agent and conditional GET support.
 */
export async function politeFetch(rawUrl, { etag, lastModified } = {}) {
  const elapsed = Date.now() - lastRequestAt;
  if (elapsed < config.ingest.delayMs) {
    await sleep(config.ingest.delayMs - elapsed);
  }
  lastRequestAt = Date.now();

  const headers = {
    'User-Agent': config.ingest.userAgent,
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
  };
  if (etag) headers['If-None-Match'] = etag;
  if (lastModified) headers['If-Modified-Since'] = lastModified;

  const response = await fetch(rawUrl, {
    headers,
    redirect: 'follow',
    signal: AbortSignal.timeout(config.ingest.timeoutMs),
  });

  const finalUrl = response.url || rawUrl;
  const body = response.status === 304 ? '' : await response.text();
  return {
    status: response.status,
    ok: response.ok,
    etag: response.headers.get('etag') || null,
    lastModified: response.headers.get('last-modified') || null,
    finalUrl,
    body,
  };
}

export function assertFinalUrl(finalUrl, sourceUrl, allowedUrls) {
  if (!isAllowedFinalUrl(finalUrl, sourceUrl, allowedUrls)) {
    throw new Error(`Redirected outside the allowlist: ${finalUrl}`);
  }
  return finalUrl;
}
