import crypto from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { formatIngestSummary, runIngest } from '../ingest/run.js';
import { getLastIngestRun, listSourceRows, listUnanswered } from '../store/db.js';

const router = Router();

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function requireAdmin(req, res, next) {
  if (!config.adminToken) {
    return res.status(503).json({
      ok: false,
      error: 'admin_disabled',
      message: 'ADMIN_TOKEN is not configured.',
    });
  }
  const token = req.get('x-admin-token') || req.query.token || '';
  if (!safeEqual(token, config.adminToken)) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }
  next();
}

router.get('/unanswered', requireAdmin, (req, res) => {
  const limit = Math.min(Math.max(Number.parseInt(req.query.limit || '200', 10) || 200, 1), 1000);
  res.json({ ok: true, rows: listUnanswered(limit) });
});

router.get('/sources', requireAdmin, (req, res) => {
  res.json({
    ok: true,
    sources: listSourceRows(),
    lastRun: getLastIngestRun(),
  });
});

const RefreshSchema = z.object({ force: z.boolean().optional() });

router.post('/refresh', requireAdmin, async (req, res, next) => {
  try {
    const parsed = RefreshSchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ ok: false, error: 'invalid_request' });
    const stats = await runIngest({ force: parsed.data.force === true });
    res.json({
      ok: true,
      stats,
      summary: formatIngestSummary(stats),
    });
  } catch (error) {
    next(error);
  }
});

export default router;
