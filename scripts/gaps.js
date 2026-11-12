import { listUnanswered } from '../src/store/db.js';

const rows = listUnanswered(1000);
const csv = process.argv.includes('--csv');

if (csv) {
  const escape = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  console.log(['created_at', 'reason', 'question', 'top_score', 'detail'].map(escape).join(','));
  for (const row of rows) {
    console.log(
      [row.created_at, row.reason, row.question, row.top_score, row.detail].map(escape).join(',')
    );
  }
} else {
  if (!rows.length) {
    console.log('No unanswered questions logged.');
  } else {
    for (const row of rows) {
      console.log(
        `${row.created_at} | ${row.reason} | score=${row.top_score ?? '-'} | ${row.question}`
      );
    }
  }
}
