import { config } from '../config.js';
import { cleanText } from './extract.js';

function splitLongText(text, maxChars) {
  const pieces = [];
  let rest = text;
  while (rest.length > maxChars) {
    const slice = rest.slice(0, maxChars);
    const candidates = [
      slice.lastIndexOf('. '),
      slice.lastIndexOf('? '),
      slice.lastIndexOf('! '),
      slice.lastIndexOf('\n'),
      slice.lastIndexOf('; '),
      slice.lastIndexOf(', '),
      slice.lastIndexOf(' '),
    ];
    const best = Math.max(...candidates);
    const cut = best > maxChars * 0.55 ? best + 1 : maxChars;
    pieces.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) pieces.push(rest);
  return pieces;
}

function overlapTail(text, maxChars) {
  if (!text || maxChars <= 0) return '';
  const tail = text.slice(-maxChars * 2);
  const boundary = Math.max(
    tail.lastIndexOf('. '),
    tail.lastIndexOf('? '),
    tail.lastIndexOf('! '),
    tail.lastIndexOf('\n')
  );
  if (boundary >= 0 && boundary < tail.length - 1) {
    return tail.slice(boundary + 1).trim().slice(-maxChars);
  }
  return tail.trim().slice(-maxChars);
}

/**
 * Heading-aware chunking. Each chunk keeps the section heading in its content
 * so the retrieved passage remains understandable on its own.
 */
export function chunkSections(sections, source, options = {}) {
  const maxChars = options.maxChars ?? config.ingest.maxChunkChars;
  const minChars = options.minChars ?? config.ingest.minChunkChars;
  const overlapChars = options.overlapChars ?? config.ingest.overlapChars;

  const chunks = [];
  let previousTail = '';

  const push = (heading, body) => {
    let content = cleanText(body);
    if (!content) return;
    if (heading) content = `${heading}\n\n${content}`;
    if (content.length < minChars && chunks.length) {
      const last = chunks[chunks.length - 1];
      if (last.content.length + content.length + 2 <= maxChars * 1.15) {
        last.content = `${last.content}\n\n${content}`;
        return;
      }
    }
    if (content.length < 5) return;

    const withOverlap =
      overlapChars > 0 && previousTail && !content.startsWith(previousTail)
        ? `${previousTail}\n\n${content}`
        : content;
    previousTail = overlapTail(content, overlapChars);

    chunks.push({
      index: chunks.length,
      heading: heading || '',
      content: withOverlap,
      metadata: {
        sourceId: source.id,
        title: source.title,
        pageType: source.pageType || 'page',
        treatment: source.treatment || '',
        country: source.country || '',
        city: source.city || '',
        clinic: source.clinic || '',
        url: source.url,
      },
    });
  };

  for (const section of sections) {
    const heading = cleanText(section.heading);
    const paragraphText = cleanText(section.text);
    if (!paragraphText && !heading) continue;
    if (!paragraphText) continue;

    const paragraphs = paragraphText.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
    let buffer = '';

    const flush = () => {
      if (!buffer.trim()) return;
      push(heading, buffer);
      buffer = '';
    };

    for (const paragraph of paragraphs) {
      if (paragraph.length > maxChars) {
        flush();
        for (const piece of splitLongText(paragraph, maxChars)) {
          push(heading, piece);
        }
        continue;
      }
      if ((buffer + '\n\n' + paragraph).length > maxChars && buffer) {
        flush();
      }
      buffer = buffer ? `${buffer}\n\n${paragraph}` : paragraph;
    }
    flush();
  }

  return chunks.map((chunk, index) => ({
    ...chunk,
    index,
    id: `${source.id}-${String(index).padStart(4, '0')}`,
  }));
}
