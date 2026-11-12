import test from 'node:test';
import assert from 'node:assert/strict';
import { detectIntent, detectLanguage, extractCountries, extractTreatment } from '../src/guard/intent.js';

test('detects a cost question and the specific treatment', () => {
  const intent = detectIntent('How much does adrenal cancer treatment cost in Mexico?');
  assert.equal(intent.type, 'cost');
  assert.equal(intent.treatment, 'adrenal cancer');
  assert.deepEqual(intent.countries, ['Mexico']);
  assert.equal(intent.language, 'en');
});

test('specific treatment wins over the generic cancer treatment alias', () => {
  assert.equal(extractTreatment('adenocarcinoma cancer treatment price'), 'adenocarcinoma cancer');
  assert.equal(extractTreatment('anal cancer package'), 'anal cancer');
  assert.equal(extractTreatment('adrenal cancer treatment cost'), 'adrenal cancer');
  assert.equal(extractTreatment('adrenl cancer cost'), 'adrenal cancer');
  assert.equal(extractTreatment('adenocarsinoma treatment'), 'adenocarcinoma cancer');
});

test('detects comparison and both countries', () => {
  const intent = detectIntent('Is adrenal cancer treatment cheaper in Mexico or Turkey?');
  assert.equal(intent.type, 'comparison');
  assert.deepEqual(intent.countries, ['Mexico', 'Turkey']);
});

test('detects booking, medical, out-of-scope, follow-up, and greeting', () => {
  assert.equal(detectIntent('Can you book me an appointment for tomorrow?').type, 'booking');
  assert.equal(detectIntent('Is this surgery safe for my diabetes?').type, 'medical');
  assert.equal(detectIntent('What is the weather in Cancun?').type, 'out_of_scope');
  assert.equal(detectIntent('And what about recovery time?').type, 'followup');
  assert.equal(detectIntent('Hello').type, 'greeting');
  assert.equal(detectIntent('halo').type, 'greeting');
  assert.equal(detectIntent('hallo').type, 'greeting');
  assert.equal(detectIntent('helo').type, 'greeting');
  assert.equal(detectIntent('selamat pagi').type, 'greeting');
  assert.equal(detectIntent('permisi').type, 'greeting');
  assert.equal(detectIntent('apa kabar?').type, 'smalltalk');
  assert.equal(detectIntent('apa kabar?').smalltalk, 'how_are_you');
  assert.equal(detectIntent('how are you?').smalltalk, 'how_are_you');
  assert.equal(detectIntent('terima kasih').smalltalk, 'thanks');
  assert.equal(detectIntent('bye').smalltalk, 'goodbye');
  assert.equal(detectIntent('kamu siapa?').smalltalk, 'who_are_you');
  assert.equal(detectIntent('perawatan apa saja yang tersedia?').type, 'catalog');
  assert.equal(detectIntent('what treatments are available?').type, 'catalog');
  assert.equal(detectIntent('saya ingin berobat mata, apakah bisa?').type, 'out_of_scope');
  assert.equal(detectIntent('Is the treatment guaranteed to cure cancer?').type, 'medical');
  assert.equal(detectIntent('What is the price in Indonesian Rupiah?').type, 'currency');
  assert.equal(detectIntent('Compare the price with Turkey.').type, 'comparison');
});

test('detects Spanish and Arabic questions', () => {
  const spanish = detectIntent('¿Cuánto cuesta el tratamiento de cáncer adrenal en México?');
  assert.equal(spanish.language, 'es');
  assert.equal(spanish.type, 'cost');
  assert.equal(spanish.treatment, 'adrenal cancer');

  const arabic = detectIntent('كم تكلفة علاج سرطان الغدة الكذرية في المكسيك؟');
  assert.equal(arabic.language, 'ar');
  assert.equal(arabic.type, 'cost');
});

test('extracts country aliases without treating pronouns as countries', () => {
  assert.deepEqual(extractCountries('treatment in Tijuana'), ['Mexico']);
  assert.deepEqual(extractCountries('is it safe?'), []);
});

test('language detector defaults to English', () => {
  assert.equal(detectLanguage('What is included in the package?'), 'en');
  assert.equal(detectLanguage('Berapa biaya perawatan di klinik?'), 'id');
  assert.equal(detectLanguage('halo'), 'id');
  assert.equal(detectLanguage('hallo'), 'id');
  assert.equal(detectLanguage('apa kabar?'), 'id');
});

import { languageSignal, resolveLanguage } from '../src/guard/intent.js';

test('short Indonesian questions with unfamiliar words are detected as Indonesian', () => {
  assert.equal(languageSignal('adakah layanan mata?'), 'id');
  assert.equal(languageSignal('saya ingin periksa mata'), 'id');
  assert.equal(languageSignal('apakah ada dokter gigi?'), 'id');
});

test('messages without a clear signal return null from languageSignal', () => {
  assert.equal(languageSignal('ok'), null);
  assert.equal(languageSignal('dental?'), null);
});

test('resolveLanguage keeps the conversation language when the new message has no signal', () => {
  assert.equal(resolveLanguage('adakah layanan mata?', 'id'), 'id');
  assert.equal(resolveLanguage('dental?', 'id'), 'id');
});

test('resolveLanguage switches when the new message clearly uses another language', () => {
  assert.equal(resolveLanguage('What is the price of the package?', 'id'), 'en');
  assert.equal(resolveLanguage('¿Cuánto cuesta el tratamiento?', 'en'), 'es');
});

test('resolveLanguage defaults to English for a first message with no signal', () => {
  assert.equal(resolveLanguage('dental?', null), 'en');
});

test('detects smalltalk in Spanish and Arabic, not just English/Indonesian', () => {
  const cases = [
    ['¿Cómo estás?', 'how_are_you'],
    ['Hola', null],
    ['Gracias', 'thanks'],
    ['Adiós', 'goodbye'],
    ['¿Quién eres?', 'who_are_you'],
    ['كيف حالك؟', 'how_are_you'],
    ['مرحبا', null],
    ['شكرا', 'thanks'],
    ['مع السلامة', 'goodbye'],
  ];
  for (const [message, expectedSmalltalk] of cases) {
    const intent = detectIntent(message);
    if (expectedSmalltalk === null) {
      assert.equal(intent.type, 'greeting', message);
    } else {
      assert.equal(intent.type, 'smalltalk', message);
      assert.equal(intent.smalltalk, expectedSmalltalk, message);
    }
  }
  assert.equal(detectIntent('كيف حالك؟').language, 'ar');
  assert.equal(detectIntent('¿Cómo estás?').language, 'es');
});

test('broad service-seeking requests are routed to the catalog in all supported languages', () => {
  const cases = [
    ['أبحث عن خدمات الرعاية الصحية.', 'ar'],
    ['I am looking for healthcare services', 'en'],
    ['Busco servicios de salud', 'es'],
    ['saya mencari layanan kesehatan', 'id'],
  ];
  for (const [message, language] of cases) {
    const intent = detectIntent(message);
    assert.equal(intent.type, 'catalog', message);
    assert.equal(intent.language, language, message);
  }
  // A specific treatment request must not be swallowed by the broad-service path.
  assert.notEqual(detectIntent('أبحث عن علاج سرطان الشرج').type, 'catalog');
});

test('English service-seeking switches the conversation language back to English', () => {
  assert.equal(languageSignal('I am looking for healthcare services'), 'en');
  assert.equal(resolveLanguage('I am looking for healthcare services', 'id'), 'en');
});
