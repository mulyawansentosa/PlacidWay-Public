/**
 * Small, deterministic domain glossary for retrieval queries.
 *
 * The corpus is English. Instead of trusting a small model to translate every
 * visitor question, map the domain terms that matter (treatment, country,
 * intent) to English before BM25 runs. The original question is still sent to
 * the LLM, so the answer is written in the visitor's language.
 */
const REPLACEMENTS = [
  // Arabic phrases first, before individual words.
  [/سرطان\s+الغدة\s+الكذري(ة|ة)?|سرطان\s+الغدة\s+الكظري(ة)?/gi, 'adrenal cancer'],
  [/سرطان\s+الشرج/gi, 'anal cancer'],
  [/سرطان\s+القولون|سرطان\s+الأمعاء/gi, 'colon cancer'],
  [/سرطان\s+الثدي/gi, 'breast cancer'],
  [/سرطان\s+الرئة/gi, 'lung cancer'],
  [/سرطان\s+البنكرياس/gi, 'pancreatic cancer'],
  [/الغدة\s+الكذري(ة)?|الغدة\s+الكظري(ة)?/gi, 'adrenal'],
  [/مدة\s+التعافي|فترة\s+التعافي|التعافي/gi, 'recovery time'],
  [/سرطان\s+الغدة\s+الكذري(ة)?|سرطان\s+الغدة\s+الكظري(ة)?/gi, 'adrenal cancer'],
  [/المكسيك/gi, 'Mexico'],
  [/تركيا/gi, 'Turkey'],
  [/تيخوانا|تيجوانا/gi, 'Tijuana'],
  [/تكلفة|سعر|كم/gi, 'cost'],
  [/علاج/gi, 'treatment'],
  [/سرطان/gi, 'cancer'],
  [/مشمول|يشمل|تشمل/gi, 'included'],
  [/أرخص|مقارنة/gi, 'compare'],
  [/حجز|موعد/gi, 'appointment'],
  [/آمن|أمان/gi, 'safe'],
  [/خطر|مخاطر/gi, 'risk'],
  [/في/gi, 'in'],
  [/هل/gi, 'is'],
  [/ما\s+هو|ما\s+هي/gi, 'what is'],

  // Spanish
  [/tiempo\s+de\s+recuperaci[oó]n|recuperaci[oó]n/gi, 'recovery time'],
  [/cu[aá]nto\s+cuesta|precio|coste|costos?/gi, 'cost'],
  [/tratamiento/gi, 'treatment'],
  [/c[aá]ncer/gi, 'cancer'],
  [/m[eé]xico/gi, 'Mexico'],
  [/turqu[ií]a/gi, 'Turkey'],
  [/incluye|incluido|incluidos/gi, 'included'],
  [/m[aá]s\s+barato|comparar|comparaci[oó]n/gi, 'compare'],
  [/paquete/gi, 'package'],
  [/seguro|riesgo/gi, 'safe risk'],
  [/cl[ií]nica/gi, 'clinic'],

  // Indonesian
  [/waktu\s+pemulihan|masa\s+pemulihan|pemulihan/gi, 'recovery time'],
  [/tumor\s+adrenal|kelenjar\s+adrenal/gi, 'adrenal cancer'],
  [/biaya|harga|berapa|duit|ongkos|budget/gi, 'cost'],
  [/pengobatan|perawatan/gi, 'treatment'],
  [/kanker/gi, 'cancer'],
  [/rawat\s+inap/gi, 'in-patient'],
  [/rawat\s+jalan/gi, 'out-patient'],
  [/berapa\s+lama|lama\s+program|lama\s+perawatan/gi, 'how many weeks program'],
  [/kelenjar\s+adrenal|adrenal/gi, 'adrenal'],
  [/meksiko/gi, 'Mexico'],
  [/turki/gi, 'Turkey'],
  [/termasuk|isi\s+paket|fasilitas|apa\s+saja/gi, 'included'],
  [/lokasi|di\s+mana/gi, 'location'],
  [/dokter/gi, 'doctor'],
  [/lebih\s+murah|bandingkan|perbandingan/gi, 'compare'],
  [/paket/gi, 'package'],
  [/aman|risiko/gi, 'safe risk'],
  [/klinik/gi, 'clinic'],
];

export function translateDomainTerms(text) {
  let value = String(text || '');
  for (const [pattern, replacement] of REPLACEMENTS) {
    value = value.replace(pattern, ` ${replacement} `);
  }
  value = value
    .replace(/[\u0600-\u06FF]+/g, ' ')
    .replace(/[،؟!?.,;:()[\]{}"“”]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return value;
}

export function containsNonLatin(text) {
  return /[^\u0000-\u024F\s\d]/u.test(String(text || ''));
}
