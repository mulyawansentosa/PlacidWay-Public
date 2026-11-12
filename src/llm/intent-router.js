import { hasLlm } from '../config.js';
import { logger } from '../util/logger.js';
import { chatJson } from './client.js';

const ALLOWED = new Set(['catalog', 'clarify', 'smalltalk', 'not_found']);

const SYSTEM = `You are an intent router for a closed-domain PlacidWay medical-tourism chatbot.
The bot can only answer from seven PlacidWay pages: one ITC clinic profile, three cancer treatment packages (adenocarcinoma, adrenal, anal), clinic videos, an ITC price list, and an alternative-medicine price comparison.

Classify the visitor's message into exactly one label:
- "catalog": the visitor asks what services, treatments, or packages are available, or says they are looking for healthcare/medical services or treatment in general, without naming a specific treatment.
- "clarify": the visitor wants help choosing, asks whether the bot can help, or the request is about medical travel/treatment but too vague to answer directly. The bot should ask which treatment or package they mean.
- "smalltalk": greeting, how-are-you, thanks, or goodbye.
- "not_found": a specific factual question whose answer is outside the seven pages, or a request for a detail not covered by them.

Rules:
- Consider English, Indonesian, Spanish, and Arabic.
- Do not answer the visitor's question. Classify only.
- If the message names a specific treatment and asks for a fact, prefer "not_found" over "catalog".
- Return JSON only: {"intent":"catalog|clarify|smalltalk|not_found"}`;

export async function classifyAmbiguousIntent(message, language = 'en') {
  if (!hasLlm) return null;
  try {
    const result = await chatJson({
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: `Language: ${language}\nMessage: ${message}` },
      ],
      temperature: 0,
      maxTokens: 200,
    });
    const intent = String(result.parsed?.intent || '').trim().toLowerCase();
    if (!ALLOWED.has(intent)) return null;
    return intent;
  } catch (error) {
    logger.warn({ err: error.message }, 'Intent router failed');
    return null;
  }
}
