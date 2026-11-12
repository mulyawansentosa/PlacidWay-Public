import crypto from 'node:crypto';
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import * as cheerio from 'cheerio';
import { extractCountries } from '../guard/intent.js';

const REMOVE_SELECTORS = [
  'script',
  'style',
  'noscript',
  'iframe',
  'svg',
  'canvas',
  'form',
  'nav',
  'header',
  'footer',
  'aside',
  '.cookie',
  '.cookies',
  '.cookie-banner',
  '.breadcrumb',
  '.breadcrumbs',
  '.related',
  '.sidebar',
  '.advertisement',
  '.ad',
  '.ads',
  '.social',
  '.newsletter',
  '.modal',
  '.popup',
  '.sticky',
];

const HAS_CURRENCY_RE = /(?:\$|USD|EUR|GBP|MXN|CAD|AUD)/i;

export function cleanText(value) {
  return String(value || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function parseAmount(raw) {
  if (raw == null) return null;
  const cleaned = String(raw).replace(/[^\d.,]/g, '');
  if (!cleaned) return null;
  // "18,995" and "18.995" are thousands separators in this content.
  const normalized = cleaned.replace(/[.,](?=\d{3}(\D|$))/g, '').replace(',', '.');
  const value = Number.parseFloat(normalized);
  return Number.isFinite(value) ? value : null;
}

function detectCurrency(text) {
  const upper = String(text || '').toUpperCase();
  if (upper.includes('USD') || upper.includes('$')) return 'USD';
  if (upper.includes('EUR') || upper.includes('€')) return 'EUR';
  if (upper.includes('GBP') || upper.includes('£')) return 'GBP';
  if (upper.includes('MXN')) return 'MXN';
  if (upper.includes('CAD')) return 'CAD';
  if (upper.includes('AUD')) return 'AUD';
  return '';
}

function tableToMarkdown($, table) {
  const rows = [];
  $(table)
    .find('tr')
    .each((_, tr) => {
      const cells = [];
      $(tr)
        .find('th,td')
        .each((__, cell) => {
          cells.push(cleanText($(cell).text()));
        });
      if (cells.some(Boolean)) rows.push(cells);
    });
  if (!rows.length) return '';
  if (rows.length === 1) return rows[0].join(' | ');
  const header = rows[0];
  const separator = header.map(() => '---');
  const body = rows.slice(1);
  return [header, separator, ...body].map((row) => `| ${row.join(' | ')} |`).join('\n');
}

function tableRows($, table) {
  const rows = [];
  $(table)
    .find('tr')
    .each((_, tr) => {
      const cells = [];
      $(tr)
        .find('th,td')
        .each((__, cell) => cells.push(cleanText($(cell).text())));
      if (cells.some(Boolean)) rows.push(cells);
    });
  return rows;
}

function extractJsonLd($) {
  const objects = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).contents().text();
    if (!raw || !raw.trim()) return;
    try {
      const parsed = JSON.parse(raw);
      const visit = (value) => {
        if (!value) return;
        if (Array.isArray(value)) {
          value.forEach(visit);
          return;
        }
        if (typeof value !== 'object') return;
        objects.push(value);
        if (value['@graph']) visit(value['@graph']);
      };
      visit(parsed);
    } catch (_) {
      // Ignore malformed JSON-LD blocks; visible content is still extracted.
    }
  });
  return objects;
}

function findOfferObjects(objects) {
  const products = [];
  for (const object of objects) {
    const type = object['@type'];
    const typeList = Array.isArray(type) ? type : [type];
    if (typeList.includes('Product')) products.push(object);
  }
  const offers = [];
  for (const product of products) {
    const productOffers = Array.isArray(product.offers) ? product.offers : [product.offers];
    for (const offer of productOffers) {
      if (!offer || typeof offer !== 'object') continue;
      offers.push({
        name: product.name || '',
        brand: product.brand?.name || '',
        url: product.url || offer.url || '',
        price: offer.price ?? offer.lowPrice ?? offer.highPrice ?? null,
        highPrice: offer.highPrice ?? null,
        currency: offer.priceCurrency || '',
        validUntil: offer.priceValidUntil || '',
        availability: offer.availability || '',
      });
    }
  }
  return offers;
}

function priceFactsFromJsonLd(objects, meta) {
  const facts = [];
  for (const offer of findOfferObjects(objects)) {
    const amount = parseAmount(offer.price);
    if (amount == null) continue;
    facts.push({
      id: `${meta.id}-jsonld-${facts.length}`,
      treatment: meta.treatment || offer.name || '',
      country: meta.country || '',
      city: meta.city || '',
      clinic: meta.clinic || offer.brand || '',
      amount,
      amountMax: parseAmount(offer.highPrice),
      currency: offer.currency || 'USD',
      qualifier: 'listed price',
      rawText: `${offer.name || ''} ${offer.currency || ''} ${offer.price || ''}`.trim(),
      validUntil: offer.validUntil || null,
    });
  }
  return facts;
}

const PRIMARY_QUALIFIERS = /starting from|in-?patient|out-?patient|program|package price/i;
const PROCEDURE_RE =
  /(LAK|Lymphocytes Activated Killer|Specific Killer Cell Antibody|Ethanol Tumor Ablation|Mononuclear Cell Activation|MCA|Intratumoral Immunotherapy|Blood Transfusion|Specialist Consultation)/i;

function contextWindow(text, matchIndex) {
  return String(text || '').slice(Math.max(0, matchIndex - 180), matchIndex + 100);
}

function inferQualifier(text, matchIndex) {
  const before = String(text || '').slice(Math.max(0, matchIndex - 220), matchIndex).toLowerCase();
  const candidates = [];
  const addCandidate = (qualifier, regex) => {
    const re = new RegExp(regex, 'gi');
    let match;
    let last = -1;
    while ((match = re.exec(before))) last = match.index;
    if (last >= 0) candidates.push({ qualifier, index: last });
  };

  addCandidate('optional/add-on', 'exclusion|optional|additional|add-?on');
  addCandidate('starting from', 'starting\\s+from|prices?\\s+from');
  addCandidate('out-patient program', 'out-?patient');
  addCandidate('in-patient program', 'in-?patient');
  addCandidate('package price', 'package');

  if (!candidates.length) return 'listed price';
  candidates.sort((a, b) => b.index - a.index);
  return candidates[0].qualifier;
}

function inferTreatmentFromWindow(text, matchIndex) {
  const match = contextWindow(text, matchIndex).match(PROCEDURE_RE);
  return match ? match[1] : '';
}

function priceFactsFromVisibleText(text, meta) {
  const facts = [];
  const seen = new Set();
  const add = (amount, amountMax, currency, qualifier, raw, treatmentOverride = '') => {
    if (amount == null || amount <= 0) return;
    const key = `${amount}|${amountMax || ''}|${currency}|${qualifier}`;
    if (seen.has(key)) return;
    seen.add(key);
    const isPrimary = PRIMARY_QUALIFIERS.test(qualifier) && qualifier !== 'optional/add-on';
    const treatment =
      treatmentOverride ||
      (isPrimary ? meta.treatment : '') ||
      (qualifier === 'optional/add-on' ? 'optional or add-on procedure' : meta.treatment) ||
      '';
    facts.push({
      id: `${meta.id}-text-${facts.length}`,
      treatment,
      country: meta.country || '',
      city: meta.city || '',
      clinic: meta.clinic || '',
      amount,
      amountMax: amountMax ?? null,
      currency: currency || 'USD',
      qualifier,
      rawText: raw,
      validUntil: null,
    });
  };

  const rangeRe = /(?:US)?\$\s*([\d,]+(?:\.\d+)?)\s*(?:-|–|to)\s*(?:US)?\$\s*([\d,]+(?:\.\d+)?)/gi;
  let match;
  while ((match = rangeRe.exec(text))) {
    add(
      parseAmount(match[1]),
      parseAmount(match[2]),
      'USD',
      inferQualifier(text, match.index),
      match[0],
      inferTreatmentFromWindow(text, match.index)
    );
  }

  const fromRe = /(?:starting\s+from|prices?\s+from|from)\s*(?:US)?\$\s*([\d,]+(?:\.\d+)?)/gi;
  while ((match = fromRe.exec(text))) {
    add(parseAmount(match[1]), null, 'USD', 'starting from', match[0]);
  }

  const currencyRe = /([\d,]+(?:\.\d+)?)\s*(USD|EUR|GBP|MXN|CAD|AUD)/gi;
  while ((match = currencyRe.exec(text))) {
    add(
      parseAmount(match[1]),
      null,
      match[2].toUpperCase(),
      inferQualifier(text, match.index),
      match[0],
      inferTreatmentFromWindow(text, match.index)
    );
  }

  return facts;
}

function firstAmountFromCell(cell) {
  const text = String(cell || '');
  const match =
    text.match(/(?:US)?\$\s*([\d,]+(?:\.\d+)?)/i) ||
    text.match(/([\d,]+(?:\.\d+)?)\s*(?:USD|EUR|GBP|MXN|CAD|AUD)/i);
  return match ? parseAmount(match[1]) : null;
}

function priceFactsFromTables(tables, meta) {
  const facts = [];
  if (!['price_list', 'comparison', 'package'].includes(meta.pageType)) return facts;

  for (const table of tables) {
    const rows = table.rows;
    if (!rows.length) continue;
    const header = rows[0].map((cell) => cell.toLowerCase());
    const priceIndex = header.findIndex((cell) => /price|cost|amount|usd|standard/.test(cell));
    if (priceIndex < 0) continue;
    const countryIndex = header.findIndex((cell) => /country|destination/.test(cell));
    const treatmentIndex = header.findIndex((cell) => /treatment|procedure|service/.test(cell));
    const clinicIndex = header.findIndex((cell) => /clinic|surgeon|center/.test(cell));

    for (const row of rows.slice(1)) {
      const priceCell = row[priceIndex] || '';
      if (!HAS_CURRENCY_RE.test(priceCell)) continue;
      const amount = firstAmountFromCell(priceCell);
      if (amount == null) continue;
      const clinicCell = clinicIndex >= 0 ? row[clinicIndex] || '' : '';
      const treatment = (treatmentIndex >= 0 ? row[treatmentIndex] : row[0]) || meta.treatment || '';
      const country =
        (countryIndex >= 0 ? row[countryIndex] : '') ||
        extractCountries(clinicCell)[0] ||
        meta.country ||
        '';
      facts.push({
        id: `${meta.id}-table-${facts.length}`,
        treatment,
        country,
        city: meta.city || '',
        clinic: meta.clinic || clinicCell,
        amount,
        amountMax: null,
        currency: detectCurrency(priceCell) || 'USD',
        qualifier: clinicIndex >= 0 ? 'clinic price (standard)' : 'price list table',
        rawText: row.join(' | '),
        validUntil: null,
      });
    }
  }
  return facts;
}

function dedupeFacts(facts) {
  const seen = new Set();
  return facts.filter((fact) => {
    const key = `${Math.round(fact.amount)}|${fact.currency}|${(fact.treatment || '').toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function sectionsFromHtml(html) {
  const $ = cheerio.load(`<div id="article-root">${html}</div>`);
  const root = $('#article-root');
  const sections = [];
  let current = { heading: '', parts: [] };

  const flush = () => {
    const heading = cleanText(current.heading);
    let text = cleanText(current.parts.join('\n\n'));
    if (heading && text.toLowerCase().startsWith(heading.toLowerCase())) {
      text = cleanText(text.slice(heading.length));
    }
    if (text) sections.push({ heading, text });
    current = { heading: '', parts: [] };
  };

  root.find('h1,h2,h3,h4,p,ul,ol,table,blockquote').each((_, element) => {
    const tag = element.tagName.toLowerCase();
    if (tag === 'h1' || tag === 'h2' || tag === 'h3' || tag === 'h4') {
      flush();
      current.heading = $(element).text();
      return;
    }
    if (tag === 'ul' || tag === 'ol') {
      const items = [];
      $(element)
        .children('li')
        .each((__, li) => {
          const text = cleanText($(li).text());
          if (text) items.push(`- ${text}`);
        });
      if (items.length) current.parts.push(items.join('\n'));
      return;
    }
    if (tag === 'table') {
      const markdown = tableToMarkdown($, element);
      if (markdown) current.parts.push(markdown);
      return;
    }
    if ($(element).parents('ul,ol,table').length) return;
    const text = cleanText($(element).text());
    if (text) current.parts.push(text);
  });
  flush();

  if (!sections.length) {
    const fallback = cleanText(root.text());
    if (fallback) sections.push({ heading: '', text: fallback });
  }
  return sections;
}

function extractVideoTitles($) {
  const titles = [];
  const seen = new Set();
  $('h3.title').each((_, element) => {
    const text = cleanText($(element).text());
    const key = text.toLowerCase();
    if (text && !seen.has(key)) {
      seen.add(key);
      titles.push(text);
    }
  });
  return titles;
}

function extractTables($) {
  const tables = [];
  $('table').each((_, table) => {
    const rows = tableRows($, table);
    if (rows.length >= 2) tables.push({ rows, markdown: tableToMarkdown($, table) });
  });
  return tables;
}

/**
 * Extract the readable main content, visible tables, JSON-LD offers, and
 * deterministic price facts from one HTML page.
 */
export function extractPage(html, source) {
  const $ = cheerio.load(html);
  const title =
    cleanText($('meta[property="og:title"]').attr('content')) ||
    cleanText($('h1').first().text()) ||
    cleanText($('title').first().text()) ||
    source.title;

  const jsonLd = extractJsonLd($);
  const tables = extractTables($);
  const videoTitles = source.pageType === 'videos' ? extractVideoTitles($) : [];

  const dom = new JSDOM(html, { url: source.url });
  const document = dom.window.document;
  for (const selector of REMOVE_SELECTORS) {
    document.querySelectorAll(selector).forEach((element) => element.remove());
  }

  let articleHtml = '';
  let articleText = '';
  try {
    const reader = new Readability(document.cloneNode(true)).parse();
    if (reader) {
      articleHtml = reader.content || '';
      articleText = reader.textContent || '';
    }
  } catch (_) {
    // Fall back to body text below.
  }

  if (!articleHtml) {
    articleHtml = document.body ? document.body.innerHTML : html;
    articleText = document.body ? document.body.textContent || '' : $.text();
  }

  let sections = sectionsFromHtml(articleHtml);
  if (!sections.some((section) => section.text.length > 40)) {
    sections = [{ heading: '', text: cleanText(articleText) }];
  }

  // Tables are often removed by Readability. Append any table that is not
  // already represented in the article text, preserving price rows.
  const sectionText = sections.map((section) => section.text).join('\n\n');
  for (const table of tables) {
    const firstRow = table.rows[0].join(' ');
    if (firstRow && !sectionText.includes(firstRow)) {
      sections.push({ heading: 'Table data', text: table.markdown });
    }
  }

  if (videoTitles.length) {
    sections.push({
      heading: 'Video library',
      text: videoTitles.map((title) => `- ${title}`).join('\n'),
    });
  }

  const fullText = cleanText(sections.map((section) => `${section.heading}\n${section.text}`).join('\n\n'));
  const visibleFacts = priceFactsFromVisibleText(fullText, source);
  const jsonLdFacts = priceFactsFromJsonLd(jsonLd, source);
  const tableFacts = priceFactsFromTables(tables, source);
  const includesByProgram = packageIncludesFromSections(sections);
  const priceFacts = dedupeFacts([...visibleFacts, ...jsonLdFacts, ...tableFacts]).map((fact) => {
    const packageIncludes = includesByProgram[fact.qualifier] || [];
    return {
      ...fact,
      priceType: normalizePriceType(fact.qualifier),
      packageIncludes,
    };
  });

  const contentHash = crypto
    .createHash('sha256')
    .update(`${title}\n${fullText}`)
    .digest('hex');

  return {
    title,
    sections,
    tables,
    text: fullText,
    priceFacts,
    jsonLd,
    contentHash,
  };
}

/**
 * Normalises the free-text qualifier into a price type so the answer layer can
 * tell "starting from" apart from a full program price or an add-on. Mixing
 * these up is the main price risk (see claude.txt, section 4.14).
 */
export function normalizePriceType(qualifier = '') {
  const q = String(qualifier).toLowerCase();
  if (/starting\s+from|prices?\s+from/.test(q)) return 'starting_from';
  if (/optional|add-?on|additional|exclusion/.test(q)) return 'add_on';
  if (/(in|out)-?patient program/.test(q)) return 'program_price';
  if (/clinic price/.test(q)) return 'clinic_listed';
  if (/package price/.test(q)) return 'package_total';
  return 'listed';
}

/**
 * Reads the bullet items under "Included in the Out-Patient/In-Patient
 * Program (...)" headings. Returns { 'out-patient program': [...], ... } so a
 * fact can carry the inclusions of the program its price belongs to.
 */
export function packageIncludesFromSections(sections = []) {
  const byProgram = {};
  for (const section of sections) {
    const match = String(section.heading || '').match(/included\s+in\s+the\s+(in|out)-?patient/i);
    if (!match) continue;
    const key = `${match[1].toLowerCase()}-patient program`;
    const items = String(section.text || '')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith('- '))
      .map((line) => line.slice(2).trim())
      .filter(Boolean);
    if (items.length && !byProgram[key]) byProgram[key] = items;
  }
  return byProgram;
}

export { parseAmount, detectCurrency };
