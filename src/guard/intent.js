const TREATMENTS = [
  {
    key: 'adenocarcinoma cancer',
    priority: 3,
    aliases: ['adenocarcinoma', 'adeno carcinoma', 'glandular cancer'],
  },
  {
    key: 'adrenal cancer',
    priority: 3,
    aliases: ['adrenal cancer', 'adrenal gland cancer', 'adrenal gland', 'adrenal tumor', 'tumor adrenal', 'kelenjar adrenal', 'adrenal'],
  },
  {
    key: 'anal cancer',
    priority: 3,
    aliases: ['anal cancer', 'anal carcinoma', 'anal'],
  },
  {
    key: 'breast cancer',
    priority: 3,
    aliases: ['breast cancer', 'breast'],
  },
  {
    key: 'prostate cancer',
    priority: 3,
    aliases: ['prostate cancer', 'prostate'],
  },
  {
    key: 'lung cancer',
    priority: 3,
    aliases: ['lung cancer', 'lung'],
  },
  {
    key: 'pancreatic cancer',
    priority: 3,
    aliases: ['pancreatic cancer', 'pancreatic', 'pancreas'],
  },
  {
    key: 'colorectal cancer',
    priority: 3,
    aliases: ['colorectal cancer', 'colorectal', 'bowel cancer'],
  },
  {
    key: 'colon cancer',
    priority: 3,
    aliases: ['colon cancer', 'colon'],
  },
  {
    key: 'alternative medicine',
    priority: 2,
    aliases: ['alternative medicine', 'holistic medicine', 'integrative medicine'],
  },
  {
    key: 'ozone therapy',
    priority: 2,
    aliases: ['ozone therapy', 'ozone treatment'],
  },
  {
    key: 'live cell therapy',
    priority: 2,
    aliases: ['live cell therapy'],
  },
  {
    key: 'alternative cancer treatment',
    priority: 1,
    aliases: [
      'alternative cancer treatment',
      'alternative cancer',
      'integrative cancer',
      'holistic cancer',
      'immunotherapy',
      'cancer treatment',
    ],
  },
];

const COUNTRIES = [
  { key: 'Mexico', aliases: ['mexico', 'méxico', 'tijuana', 'mexican'] },
  { key: 'Turkey', aliases: ['turkey', 'türkiye', 'turkiye', 'istanbul'] },
  { key: 'Thailand', aliases: ['thailand', 'bangkok'] },
  { key: 'India', aliases: ['india', 'delhi', 'mumbai'] },
  { key: 'Costa Rica', aliases: ['costa rica', 'san jose'] },
  { key: 'Colombia', aliases: ['colombia', 'bogota'] },
  { key: 'Panama', aliases: ['panama'] },
  { key: 'Spain', aliases: ['spain', 'madrid'] },
  { key: 'United States', aliases: ['united states', 'usa', 'u.s.'] },
  { key: 'Canada', aliases: ['canada'] },
  { key: 'United Arab Emirates', aliases: ['uae', 'dubai'] },
  { key: 'Germany', aliases: ['germany'] },
  { key: 'United Kingdom', aliases: ['united kingdom', 'uk '] },
];

const PRICE_RE =
  /\b(price|prices|pricing|cost|costs|how much|harga|biaya|tarif|duit|ongkos|budget|ballpark|price range|cuanto|cuesta|precio)\b|تكلفة|سعر|(?:^|\s)كم(?=\s|$|[؟?])/i;
const COMPARISON_RE =
  /\b(cheaper|compare|comparison|compare prices|vs\.?|versus|lebih murah|bandingkan|más barato|comparar)\b|أرخص|مقارنة/i;
const BOOKING_RE =
  /\b(book|booking|appointment|schedule|reserve|availability|tomorrow|besok|jadwal|turno|cita)\b|حجز|موعد/i;
const MEDICAL_RE =
  /\b(safe|safety|risky|risk|danger|diabetes|diabetic|pregnan|side effect|side effects|diagnos|diagnosis|should i|can i take|is it okay|am i eligible|guarantee|guaranteed|cure|cures|sembuh|menyembuhkan|jaminan|pasti sembuh|efektif|berhasil|aman|efek samping|efeknya|seguro|embarazada|riesgo)\b|آمن|حامل|خطر/i;
const CURRENCY_RE =
  /\b(rupiah|idr|dollars?|dolar|euros?|eur|pounds?|gbp|convert|conversion|konversi|kurs|exchange rate)\b/i;
const DEFINITION_RE =
  /^(apa itu|apa yang dimaksud|apa yg dimaksud|what is|what's|define|jelaskan|pengertian)\b|\bitu apa\??$/i;
// Objects that are not medical-tourism services. A price question about one of
// these is out of scope, not a request to pick a treatment.
const OUT_OF_DOMAIN_OBJECT_RE =
  /\b(hotel|hotels|hostel|apartment|airbnb|flights?|airfare|airline|tickets?|car rental|rent a car|visas?|tours?|tiket|penerbangan|kamar hotel)\b/i;
const OUT_OF_SCOPE_RE =
  /\b(weather|forecast|news|politics|president|stock|sports|football|soccer|movie|music|joke|code|javascript|python|math|capital of|time in|cuaca|berita|presiden|berobat mata|perawatan mata|kesehatan mata|eye care|eye treatment|ophthalmology)\b|كود|الطقس|السياسة/i;
const CATALOG_RE =
  /\b(perawatan|layanan|paket|treatment|service|package)s?\s+apa\s+saja\b|\bapa\s+saja\s+(perawatan|layanan|paket|treatment|service|package)\b|\bdaftar\s+(perawatan|layanan|paket)\b|\bjenis\s+(perawatan|layanan|paket)\b|\bwhat\s+(treatments|services|packages)\b|\bwhat\s+do\s+you\s+offer\b|\bwhat\s+is\s+available\b|\bavailable\s+(treatments|services|packages)\b|\bqu[eé]\s+(tratamientos|servicios|paquetes)\b|\bما\s+(العلاجات|الخدمات|الباقات)\b/i;
const SERVICE_SEEKING_RE =
  /\b(?:looking\s+for|searching\s+for|i\s+need|i\s+want)\b[^.!?]{0,60}\b(?:healthcare|health\s+care|medical|treatment|service|doctor)\b|\b(?:mencari|butuh|ingin|mau)\b[^.!?]{0,60}\b(?:layanan|pengobatan|perawatan|dokter|klinik)\b|\b(?:busco|necesito)\b[^.!?]{0,60}\b(?:servicios?|atenci[oó]n|tratamiento|m[eé]dico)\b|(?:أبحث|ابحث|أريد|اريد|أحتاج|احتاج)\s*(?:عن\s*)?(?:خدمات|خدمة|الرعاية|رعاية)|(?:خدمات|خدمة)\s+الرعاية\s+الصحية/i;
const WHO_ARE_YOU_RE =
  /^[¿¡]*(kamu siapa|siapa kamu|who are you|what are you|qui[eé]n\s+(?:eres|es\s+usted)|من\s+أنت|من\s+انت)(?=\s|$|[?؟])/i;
const FOLLOW_UP_RE = /^(and|what about|how about|dan|kalau|y|¿y)\b/i;
const GREETING_RE =
  /^(hi|hello|hey|halo|hallo|helo|hai|hola|مرحبا|salam|assalamualaikum|selamat|pagi|siang|sore|malam|permisi|good (morning|afternoon|evening))\b/i;
const GREETING_WORDS = new Set([
  'hi', 'hello', 'hey', 'halo', 'hallo', 'helo', 'hai', 'hola', 'salam',
  'assalamualaikum', 'selamat', 'pagi', 'siang', 'sore', 'malam', 'permisi',
  'buenos', 'buenas', 'saludos',
]);
const HOW_ARE_YOU_RE =
  /^(apa kabar|kabar|bagaimana kabar|how are you|how's it going|how is it going|what's up|whats up|sup)(?=\s|$|[!?])/i;
// Language-specific patterns avoid relying on \b after non-Latin letters and
// cover the Spanish and Arabic forms requested in the brief.
const ES_HOW_ARE_YOU_RE =
  /^[¿¡]*(?:c[oó]mo\s+(?:est[aá]s|est[aá]|te\s+va|va)|qu[eé]\s+tal)(?=\s|$|[!?¿])/i;
const ARABIC_HOW_ARE_YOU_RE =
  /^(?:كيف\s+(?:حال(?:ك|كم|كِ)?|الحال|الأمور)|ما\s+الأخبار|شلونك|عامل\s+إيه)/i;
const ES_GREETING_RE =
  /^[¿¡]*(?:hola|buenos\s+d[ií]as|buenas\s+(?:tardes|noches)|saludos)(?=\s|$|[!?,])/i;
const ARABIC_GREETING_RE =
  /^(?:مرحبا|مرحباً|أهلا|أهلاً|هلا|السلام\s+عليكم|صباح\s+الخير|مساء\s+الخير|تحية\s+طيبة)/i;
const THANKS_RE = /^(terima kasih|makasih|thanks|thank you|thx)(?=\s|$|[!?])/i;
const ES_THANKS_RE = /^[¿¡]*(?:gracias|muchas\s+gracias)(?=\s|$|[!?])/i;
const ARABIC_THANKS_RE = /^(?:شكرا|شكراً|مشكور|بارك\s+الله\s+فيك)(?=\s|$|[!?؟])/i;
const BYE_RE = /^(bye|goodbye|sampai jumpa|dadah|see you)(?=\s|$|[!?])/i;
const ES_BYE_RE = /^[¿¡]*(?:adi[oó]s|hasta\s+luego|nos\s+vemos|chao)(?=\s|$|[!?])/i;
const ARABIC_BYE_RE = /^(?:مع\s+السلامة|وداعا|إلى\s+اللقاء)(?=\s|$|[!?؟])/i;
const PRONOUN_RE = /\b(it|that|those|this|nya|itu|tersebut|el|eso|este|هذا|ذلك)\b/i;

function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function matchAlias(normalized, alias) {
  if (!alias) return false;
  const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}([^\\p{L}\\p{N}]|$)`, 'iu').test(normalized);
}

function levenshtein(a, b) {
  const rows = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i += 1) rows[i][0] = i;
  for (let j = 0; j <= b.length; j += 1) rows[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      rows[i][j] =
        a[i - 1] === b[j - 1]
          ? rows[i - 1][j - 1]
          : 1 + Math.min(rows[i - 1][j], rows[i][j - 1], rows[i - 1][j - 1]);
    }
  }
  return rows[a.length][b.length];
}

const TYPO_TARGETS = [
  { key: 'adrenal cancer', words: ['adrenal'] },
  { key: 'adenocarcinoma cancer', words: ['adenocarcinoma'] },
  { key: 'pancreatic cancer', words: ['pancreatic'] },
  { key: 'colorectal cancer', words: ['colorectal'] },
];

function fuzzyTreatment(normalized) {
  const tokens = normalized
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length >= 5);
  for (const token of tokens) {
    for (const target of TYPO_TARGETS) {
      for (const word of target.words) {
        const maxDistance = word.length >= 8 ? 2 : 1;
        if (
          Math.abs(token.length - word.length) <= maxDistance &&
          levenshtein(token, word) <= maxDistance
        ) {
          return target.key;
        }
      }
    }
  }
  return '';
}

export function extractTreatment(text) {
  const normalized = normalize(text);
  let best = null;
  for (const treatment of TREATMENTS) {
    for (const alias of treatment.aliases) {
      if (matchAlias(normalized, alias)) {
        if (
          !best ||
          (treatment.priority || 0) > best.priority ||
          ((treatment.priority || 0) === best.priority && alias.length > best.alias.length)
        ) {
          best = { key: treatment.key, alias, priority: treatment.priority || 0 };
        }
      }
    }
  }
  return best?.key || fuzzyTreatment(normalized);
}

export function extractCountries(text) {
  const normalized = normalize(text);
  const found = [];
  for (const country of COUNTRIES) {
    if (country.aliases.some((alias) => matchAlias(normalized, alias))) {
      found.push(country.key);
    }
  }
  return [...new Set(found)];
}

const LANGUAGE_SIGNALS = [
  ['ar', /[\u0600-\u06FF]/],
  [
    'es',
    /\b(cuanto|cuánto|cuesta|precio|tratamiento|seguro|incluye|paquete|clínica|cirugía|enfermedad|cáncer|hola|buenos|buenas|gracias|adios|adiós|cómo|como estas|estás|qué tal|quien|quién|eres|hasta luego|chao|busco|servicios|servicio|salud|atención|necesito)\b/,
  ],
  [
    'id',
    /\b(berapa|biaya|harga|pengobatan|perawatan|klinik|paket|apakah|adakah|dokter|rumah sakit|kanker|aman|sembuh|halo|hallo|helo|hai|selamat|pagi|siang|sore|malam|permisi|makasih|terima kasih|apa kabar|kabar|bagaimana|dadah|sampai jumpa|kamu|siapa|saya|aku|ada|apa|layanan|mata|gigi|mau|ingin|minta|tolong|mohon|boleh|bisa|tidak|tanpa|besok|hari|jam|periksa|dimana|di mana|sembuhkan|obat)\b/,
  ],
  [
    'en',
    /\b(the|what|how|much|does|do|is|are|can|you|where|price|cost|include|included|package|clinic|hello|hi|thanks|please|about|looking|searching|need|want|healthcare|health\s+care|medical|services?|doctor)\b/,
  ],
];

/**
 * Returns the language a message clearly signals, or null when it gives no
 * usable signal (for example a short Indonesian question with unfamiliar words).
 */
export function languageSignal(text) {
  const raw = String(text || '');
  const normalized = normalize(raw);
  for (const [language, pattern] of LANGUAGE_SIGNALS) {
    if (language === 'ar' ? pattern.test(raw) : pattern.test(normalized)) return language;
  }
  return null;
}

export function detectLanguage(text) {
  return languageSignal(text) || 'en';
}

/**
 * Chooses the reply language for a message. A clear signal in the message
 * wins; otherwise the conversation's previous language is kept, so a question
 * with unfamiliar words does not switch the whole reply to English.
 */
export function resolveLanguage(text, previousLanguage = null) {
  return languageSignal(text) || previousLanguage || 'en';
}

export function detectIntent(message) {
  const normalized = normalize(message);
  const treatment = extractTreatment(normalized);
  const countries = extractCountries(normalized);
  const language = detectLanguage(message);

  const isBooking = BOOKING_RE.test(normalized);
  const isMedical = MEDICAL_RE.test(normalized);
  const isComparison = COMPARISON_RE.test(normalized);
  const isPrice = PRICE_RE.test(normalized);
  const isCurrency = CURRENCY_RE.test(normalized) && !isMedical && !isBooking;
  const isDefinition =
    DEFINITION_RE.test(normalized) &&
    Boolean(treatment) &&
    !/\b(includ|price|cost|program|package|duration|recovery|side effect|success|rate|outcome|survival|efficacy|effective|safe|risk|insurance|finance|location|phone|contact|book|appointment|how long)\b/i.test(normalized);
  const hasDomainEntity = Boolean(treatment) || countries.length > 0;
  const isOutOfScope =
    (OUT_OF_SCOPE_RE.test(normalized) || OUT_OF_DOMAIN_OBJECT_RE.test(normalized)) && !hasDomainEntity;
  const isCatalog =
    (CATALOG_RE.test(normalized) || SERVICE_SEEKING_RE.test(normalized)) &&
    !treatment &&
    !countries.length &&
    !isPrice &&
    !isComparison &&
    !isMedical &&
    !isBooking;
  const isFollowUp =
    FOLLOW_UP_RE.test(normalized) ||
    (normalized.length < 70 && PRONOUN_RE.test(normalized) && !treatment && !countries.length);
  const firstWord = normalized.replace(/^[^\p{L}]+/u, '').split(/[^\p{L}]+/u)[0] || '';
  const isGreeting =
    normalized.length < 60 &&
    (GREETING_WORDS.has(firstWord) ||
      GREETING_RE.test(normalized) ||
      ES_GREETING_RE.test(normalized) ||
      ARABIC_GREETING_RE.test(normalized));
  const smalltalk =
    normalized.length < 50 && WHO_ARE_YOU_RE.test(normalized)
      ? 'who_are_you'
      : normalized.length < 60 &&
          (HOW_ARE_YOU_RE.test(normalized) ||
            ES_HOW_ARE_YOU_RE.test(normalized) ||
            ARABIC_HOW_ARE_YOU_RE.test(normalized))
        ? 'how_are_you'
        : normalized.length < 60 &&
            (THANKS_RE.test(normalized) ||
              ES_THANKS_RE.test(normalized) ||
              ARABIC_THANKS_RE.test(normalized))
          ? 'thanks'
          : normalized.length < 60 &&
              (BYE_RE.test(normalized) ||
                ES_BYE_RE.test(normalized) ||
                ARABIC_BYE_RE.test(normalized))
            ? 'goodbye'
            : null;

  let type = 'question';
  if (isBooking) type = 'booking';
  else if (isMedical) type = 'medical';
  else if (isOutOfScope) type = 'out_of_scope';
  else if (isCurrency) type = 'currency';
  else if (isDefinition) type = 'definition';
  else if (isCatalog) type = 'catalog';
  else if (isComparison) type = 'comparison';
  else if (isPrice) type = 'cost';
  else if (isFollowUp) type = 'followup';
  else if (smalltalk) type = 'smalltalk';
  else if (isGreeting) type = 'greeting';

  return {
    type,
    treatment,
    countries,
    language,
    isBooking,
    isMedical,
    isComparison,
    isPrice,
    isCurrency,
    isDefinition,
    isOutOfScope,
    isCatalog,
    isFollowUp,
    isGreeting,
    smalltalk,
    hasDomainEntity,
  };
}

export { PRICE_RE, COMPARISON_RE, BOOKING_RE, MEDICAL_RE, OUT_OF_SCOPE_RE, CATALOG_RE, GREETING_RE };
