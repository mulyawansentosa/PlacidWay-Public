import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { config, hasEmbeddings, hasLlm } from '../config.js';
import { handleChat } from '../chat/pipeline.js';
import { maybeRefreshInBackground } from '../ingest/scheduler.js';
import { knowledgeIndex } from '../rag/index.js';
import {
  getLastIngestRun,
  listSourceRows,
  saveLead,
} from '../store/db.js';

const router = Router();

const chatLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    ok: false,
    error: 'rate_limited',
    message: 'Too many messages. Please wait a minute and try again.',
  },
});

const leadLimiter = rateLimit({
  windowMs: 60_000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'rate_limited' },
});

const ChatSchema = z.object({
  sessionId: z.string().min(1).max(80).optional(),
  message: z.string().trim().min(1).max(1000),
});

const LeadSchema = z.object({
  sessionId: z.string().max(80).optional(),
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(200),
  message: z.string().trim().max(1000).optional(),
  consent: z.literal(true),
  website: z.string().max(200).optional(),
});

router.get('/meta', async (req, res, next) => {
  try {
    await knowledgeIndex.ensureFresh();
    // Stale-while-revalidate: this never blocks the response. If the last
    // ingest is older than STALE_REFRESH_MINUTES, a crawl starts in the
    // background and the current index keeps serving this request.
    maybeRefreshInBackground();
    const run = getLastIngestRun();
    const sources = listSourceRows().map((source) => ({
      id: source.id,
      title: source.title,
      url: source.url,
      pageType: source.page_type,
      status: source.status,
      chunks: source.chunk_count,
      fetchedAt: source.fetched_at,
    }));
    res.json({
      ok: true,
      siteName: config.siteName,
      contactUrl: config.contactUrl,
      lastUpdated: run?.finished_at || run?.started_at || null,
      sources,
      index: knowledgeIndex.stats(),
      llmConfigured: hasLlm,
      embeddingsConfigured: hasEmbeddings,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/chat', chatLimiter, async (req, res, next) => {
  try {
    const parsed = ChatSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: 'invalid_request',
        message: 'Please send a message between 1 and 1000 characters.',
      });
    }
    const result = await handleChat({
      sessionId: parsed.data.sessionId,
      message: parsed.data.message,
      clientIp: req.ip,
    });
    res.json(result);
    // Trigger after responding so the visitor never waits for a crawl.
    maybeRefreshInBackground();
  } catch (error) {
    next(error);
  }
});

router.post('/leads', leadLimiter, async (req, res, next) => {
  try {
    const parsed = LeadSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: 'invalid_lead',
        message: 'Please provide your name, a valid email, and consent.',
      });
    }
    const { sessionId, name, email, message, consent, website } = parsed.data;
    if (website) return res.json({ ok: true });
    saveLead({ conversationId: sessionId, name, email, message, consent });
    res.json({ ok: true, message: 'Thanks. The PlacidWay team will contact you.' });
  } catch (error) {
    next(error);
  }
});

export default router;
