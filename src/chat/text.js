export function formatAmount(value) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value);
}

export function trimAtSentence(text, maxChars = 600) {
  const value = String(text || '').trim();
  if (value.length <= maxChars) return value;
  const slice = value.slice(0, maxChars);
  const boundary = Math.max(slice.lastIndexOf('. '), slice.lastIndexOf('? '), slice.lastIndexOf('! '));
  return `${(boundary > maxChars * 0.5 ? slice.slice(0, boundary + 1) : slice).trim()}…`;
}
