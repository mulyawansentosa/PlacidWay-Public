import { config, hasLlm } from '../config.js';
import { logger } from '../util/logger.js';
import { extractJson } from './json.js';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function contentToText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part === 'string' ? part : part?.text || ''))
      .join('');
  }
  return '';
}

async function callChat({ messages, model, temperature, maxTokens, jsonMode }) {
  if (!hasLlm) throw new Error('LLM_API_KEY is not configured');
  const url = `${config.llm.baseUrl}/chat/completions`;
  const body = {
    model: model || config.llm.model,
    messages,
    temperature: temperature ?? config.llm.temperature,
    max_tokens: maxTokens ?? config.llm.maxTokens,
    stream: false,
  };
  if (jsonMode) body.response_format = { type: 'json_object' };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.llm.apiKey}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(config.llm.timeoutMs),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    const error = new Error(`LLM API ${response.status}: ${text.slice(0, 500)}`);
    error.status = response.status;
    throw error;
  }

  const raw = await response.text();
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch (_) {
    const match = raw.match(/data:\s*(\{[\s\S]+?\})\s*(?:\n\n|$)/);
    if (!match) throw new Error('LLM response was neither JSON nor SSE');
    payload = JSON.parse(match[1]);
  }

  const choice = payload.choices?.[0];
  const text = contentToText(choice?.message?.content ?? choice?.text);
  return {
    text,
    usage: payload.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    model: payload.model || body.model,
  };
}

export async function chat({ messages, model, temperature, maxTokens, jsonMode = false }) {
  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await callChat({ messages, model, temperature, maxTokens, jsonMode });
    } catch (error) {
      lastError = error;
      const retryable = error.status === 429 || error.status >= 500;
      if (!retryable || attempt === 2) break;
      logger.warn({ status: error.status, attempt }, 'LLM request failed; retrying');
      await sleep(500 * (attempt + 1));
    }
  }
  throw lastError || new Error('LLM request failed');
}

export async function chatJson({ messages, model, temperature = 0, maxTokens = 700 }) {
  let result;
  try {
    result = await chat({ messages, model, temperature, maxTokens, jsonMode: true });
  } catch (error) {
    // Some OpenAI-compatible routers reject response_format. Retry once
    // without it rather than failing the whole request.
    if (error.status === 400 || /response_format/i.test(error.message)) {
      result = await chat({ messages, model, temperature, maxTokens, jsonMode: false });
    } else {
      throw error;
    }
  }
  const parsed = extractJson(result.text);
  return { ...result, parsed };
}

export async function rewriteQuery({ question, history = [] }) {
  const recent = history
    .slice(-4)
    .map((message) => `${message.role}: ${message.content}`)
    .join('\n');
  const messages = [
    {
      role: 'system',
      content:
        'Rewrite the visitor question into a standalone English search query for a medical-tourism website. Preserve treatment names, countries, clinic names, and numbers. Do not answer the question. Return JSON: {"standalone_query":"...","language":"en|es|id|ar|other"}',
    },
    {
      role: 'user',
      content: `${recent ? `Recent conversation:\n${recent}\n\n` : ''}Latest question: ${question}`,
    },
  ];
  const result = await chatJson({ messages, temperature: 0, maxTokens: 160 });
  const parsed = result.parsed || {};
  return {
    standaloneQuery:
      typeof parsed.standalone_query === 'string' && parsed.standalone_query.trim()
        ? parsed.standalone_query.trim()
        : question,
    language: typeof parsed.language === 'string' ? parsed.language : 'other',
  };
}
