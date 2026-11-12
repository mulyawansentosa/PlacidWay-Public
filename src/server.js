import express from 'express';
import helmet from 'helmet';
import compression from 'compression';
import pinoHttp from 'pino-http';
import { config, hasEmbeddings, hasLlm } from './config.js';
import { logger } from './util/logger.js';
import chatRoutes from './routes/chat.js';
import adminRoutes from './routes/admin.js';
import { knowledgeIndex } from './rag/index.js';
import { closeDb, getLastIngestRun, listSourceRows } from './store/db.js';
import { startAutoRefresh } from './ingest/scheduler.js';

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', config.trustProxy);

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
  })
);
app.use(compression());
app.use(express.json({ limit: '32kb' }));
app.use(
  pinoHttp({
    logger,
    autoLogging: {
      ignore: (req) => req.url === '/healthz',
    },
    customLogLevel: (req, res, error) => {
      if (error || res.statusCode >= 500) return 'error';
      if (res.statusCode >= 400) return 'warn';
      return 'info';
    },
  })
);

app.get('/healthz', async (req, res) => {
  try {
    await knowledgeIndex.ensureFresh();
    const run = getLastIngestRun();
    const sources = listSourceRows();
    const ready = knowledgeIndex.chunks.length > 0;
    res.status(ready ? 200 : 503).json({
      status: ready ? 'ok' : 'empty_index',
      uptimeSec: Math.floor(process.uptime()),
      index: knowledgeIndex.stats(),
      sources: sources.map((source) => ({
        id: source.id,
        status: source.status,
        chunks: source.chunk_count,
        fetchedAt: source.fetched_at,
      })),
      lastIngest: run
        ? { status: run.status, startedAt: run.started_at, finishedAt: run.finished_at }
        : null,
      llmConfigured: hasLlm,
      embeddingsConfigured: hasEmbeddings,
      autoRefreshMinutes: config.ingest.autoRefreshMinutes,
      staleRefreshMinutes: config.ingest.staleRefreshMinutes,
    });
  } catch (error) {
    res.status(503).json({ status: 'error', error: error.message });
  }
});

app.use('/api', chatRoutes);
app.use('/api/admin', adminRoutes);

// `/admin` is an operator tool, not part of the visitor flow. Hide it entirely
// when ADMIN_TOKEN is empty so a reviewer never lands on a token prompt. The
// JSON admin API already returns 503 in that case.
if (config.adminToken) {
  app.get(['/admin', '/admin.html'], (req, res) => {
    res.sendFile('admin.html', { root: config.publicDir });
  });
} else {
  app.get(['/admin', '/admin.html', '/admin.js'], (req, res) => {
    res.status(404).send('Not found');
  });
}

app.use(express.static(config.publicDir, { extensions: ['html'], maxAge: '1h' }));

app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ ok: false, error: 'not_found' });
  }
  res.status(404).send('Not found');
});

app.use((error, req, res, next) => {
  logger.error({ err: error, path: req.path }, 'Unhandled request error');
  if (res.headersSent) return next(error);
  res.status(500).json({
    ok: false,
    error: 'internal_error',
    message: 'Something went wrong. Please try again.',
  });
});

async function start() {
  await knowledgeIndex.ensureFresh();
  const stats = knowledgeIndex.stats();
  if (!stats.chunks) {
    logger.warn('Knowledge index is empty. Run `npm run ingest` before using the chat.');
  }
  if (!hasLlm) {
    logger.warn('LLM_API_KEY is not configured. The app will serve extractive answers only.');
  }
  if (!hasEmbeddings) {
    logger.warn('Embedding credentials are not configured. Retrieval will use BM25 only.');
  }

  let refreshScheduler = null;
  const server = app.listen(config.port, () => {
    logger.info(
      {
        port: config.port,
        chunks: stats.chunks,
        sources: stats.sources,
        model: config.llm.model,
        autoRefreshMinutes: config.ingest.autoRefreshMinutes,
        staleRefreshMinutes: config.ingest.staleRefreshMinutes,
      },
      'PlacidWay chatbot listening'
    );
    refreshScheduler = startAutoRefresh();
  });

  const shutdown = (signal) => {
    logger.info({ signal }, 'Shutting down');
    refreshScheduler?.stop();
    server.close(() => {
      closeDb();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

start().catch((error) => {
  logger.error({ err: error }, 'Failed to start');
  process.exit(1);
});
