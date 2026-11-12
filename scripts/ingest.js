import { formatIngestSummary, runIngest } from '../src/ingest/run.js';

const force = process.argv.includes('--force');

try {
  const stats = await runIngest({ force, log: console });
  console.log('');
  console.log(formatIngestSummary(stats));
  if (stats.sources.some((source) => source.status === 'failed')) {
    process.exitCode = 1;
  }
} catch (error) {
  console.error('Ingest failed:', error.message);
  process.exitCode = 1;
}
