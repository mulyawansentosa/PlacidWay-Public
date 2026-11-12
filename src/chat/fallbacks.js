import { sourceListFromIds } from '../llm/validate.js';
import { knowledgeIndex } from '../rag/index.js';
import { trimAtSentence } from './text.js';

export function definitionAnswer(language, treatment) {
  const display = treatment === 'adenocarcinoma cancer' ? 'adenocarcinoma' : treatment;
  const glandular = treatment === 'adenocarcinoma cancer';
  if (language === 'id') {
    return `Halaman PlacidWay menggunakan istilah "${display}" dalam konteks paket treatment di ITC Tijuana${glandular ? ' dan menyebutnya sebagai glandular cancer' : ''}. Halaman tidak memberikan definisi medis rinci. Untuk penjelasan penyakitnya, silakan konsultasikan dengan dokter berlisensi. [S1]`;
  }
  if (language === 'es') {
    return `Las páginas de PlacidWay usan el término "${display}" en el contexto del paquete de tratamiento de ITC en Tijuana${glandular ? ' y lo describen como glandular cancer' : ''}. Las páginas no ofrecen una definición médica detallada. Para una explicación de la enfermedad, consulte a un médico autorizado. [S1]`;
  }
  if (language === 'ar') {
    return `تستخدم صفحات PlacidWay مصطلح "${display}" في سياق باقة العلاج في ITC في تيخوانا${glandular ? ' وتصفه بأنه glandular cancer' : ''}. لا تقدم الصفحات تعريفًا طبيًا مفصلاً. لشرح المرض، يرجى استشارة طبيب مرخص. [S1]`;
  }
  return `The PlacidWay pages use the term "${display}" in the context of the ITC treatment package in Tijuana${glandular ? ' and describe it as glandular cancer' : ''}. The pages do not give a detailed medical definition. For an explanation of the condition, please consult a licensed doctor. [S1]`;
}

export function followUpPartialAnswer(message, results, effectiveIntent, language) {
  if (!/\b(recovery|recover|follow[- ]?up|duration|how long|after treatment|pemulihan|berapa lama|durasi|waktu pemulihan)\b/i.test(message)) {
    return null;
  }
  const treatment =
    effectiveIntent.treatment === 'adenocarcinoma cancer'
      ? 'adenocarcinoma'
      : effectiveIntent.treatment || 'the treatment';
  const sourceIds = new Set(results.map((result) => result.sourceId).filter(Boolean));
  const pool = [];
  const seen = new Set();
  for (const chunk of [
    ...results,
    ...knowledgeIndex.chunks.filter((item) => sourceIds.has(item.sourceId)),
  ]) {
    if (seen.has(chunk.id)) continue;
    seen.add(chunk.id);
    pool.push(chunk);
  }

  const detailRe =
    /\b(3-week|three-week|3 week|three week|3 months?|three months?|post-discharge|follow[- ]?up care|after discharge|recovery time)\b/i;
  const candidates = [];
  for (const chunk of pool) {
    const text = String(chunk.content || '').replace(/\s+/g, ' ');
    for (const raw of text.split(/(?<=[.!?])\s+/)) {
      const value = raw.replace(/^[-•]\s*/, '').trim();
      if (value.length < 30 || value.length > 320) continue;
      if (/^[a-z]/.test(value)) continue;
      if (!detailRe.test(value)) continue;
      if (candidates.some((item) => item.text.toLowerCase() === value.toLowerCase())) continue;
      const score = /post-discharge|3 months|three months|follow[- ]?up care/i.test(value) ? 2 : 1;
      candidates.push({ text: value, chunk, score });
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  const selected = candidates.slice(0, 2);
  if (!selected.length) return null;

  const chunks = [];
  for (const item of selected) {
    if (!chunks.some((chunk) => chunk.id === item.chunk.id)) chunks.push(item.chunk);
  }
  const ids = selected.map(
    (item) => `S${chunks.findIndex((chunk) => chunk.id === item.chunk.id) + 1}`
  );
  const detail = selected
    .map((item, index) => `${item.text} [${ids[index]}]`)
    .join(' ');
  const answer =
    language === 'id'
      ? `Halaman tidak mencantumkan waktu pemulihan spesifik untuk ${treatment}, tetapi menyebutkan: ${detail}`
      : `The pages do not give a specific recovery time for ${treatment}, but they do mention: ${detail}`;
  return { answer, sources: sourceListFromIds(ids, chunks) };
}

export function followUpNotFound(message, effectiveIntent, templates) {
  const rawTopic = effectiveIntent.treatment || effectiveIntent.countries.join(', ');
  if (!rawTopic) return templates.notFound;
  const topic = rawTopic === 'adenocarcinoma cancer' ? 'adenocarcinoma' : rawTopic;
  return (templates.followUpNotFound || templates.notFound).replace('{topic}', topic);
}

export function extractiveFallback(results, templates, focusTerms = []) {
  if (!results.length) return null;
  const top = results[0];
  let raw = String(top.content || '').trim();

  if (focusTerms.length) {
    const lower = raw.toLowerCase();
    const positions = focusTerms
      .map((term) => lower.indexOf(term.toLowerCase()))
      .filter((index) => index >= 0)
      .sort((a, b) => a - b);
    if (!positions.length) return null;
    raw = raw.slice(Math.max(0, positions[0] - 260)).trim();
  }

  const boundaries = [raw.indexOf('. '), raw.indexOf('? '), raw.indexOf('! ')]
    .filter((index) => index >= 0)
    .sort((a, b) => a - b);
  if (boundaries.length && boundaries[0] < 220) {
    raw = raw.slice(boundaries[0] + 2).trim();
  }
  const excerpt = trimAtSentence(raw, 700);
  return [
    'Here is what the PlacidWay page says:',
    '',
    `${excerpt} [S1]`,
    '',
    'I can only answer from the PlacidWay pages I have. For an exact answer about your case, please request a free quote from the PlacidWay team.',
  ].join('\n');
}
