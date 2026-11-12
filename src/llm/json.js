/**
 * Models sometimes wrap JSON in code fences or add a sentence before it.
 * Extract the first complete object and tolerate trailing commas.
 */
export function extractJson(text) {
  if (!text || typeof text !== 'string') return null;
  let source = text.trim();
  source = source.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

  const start = source.indexOf('{');
  const end = source.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  let candidate = source.slice(start, end + 1);

  try {
    return JSON.parse(candidate);
  } catch (_) {
    candidate = candidate
      .replace(/,\s*([}\]])/g, '$1')
      .replace(/[\u201c\u201d]/g, '"')
      .replace(/[\u2018\u2019]/g, "'");
    try {
      return JSON.parse(candidate);
    } catch (_) {
      return null;
    }
  }
}
