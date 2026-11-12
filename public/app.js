const SESSION_KEY = 'placidway_session_id';

const state = {
  sessionId: null,
  sending: false,
  meta: null,
};

const els = {
  messages: document.getElementById('messages'),
  composer: document.getElementById('composer'),
  input: document.getElementById('message'),
  send: document.getElementById('send'),
  reset: document.getElementById('reset'),
  status: document.getElementById('chat-status'),
  badge: document.getElementById('index-badge'),
  updated: document.getElementById('updated'),
  contact: document.getElementById('contact-link'),
  dialog: document.getElementById('lead-dialog'),
  leadForm: document.getElementById('lead-form'),
  leadCopy: document.getElementById('lead-copy'),
  leadError: document.getElementById('lead-error'),
  leadClose: document.getElementById('lead-close'),
  leadCancel: document.getElementById('lead-cancel'),
  leadSubmit: document.getElementById('lead-submit'),
  leadWebsite: document.getElementById('lead-website'),
  leadSuccess: document.getElementById('lead-success'),
  leadSuccessClose: document.getElementById('lead-success-close'),
};

function newId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `s_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function getSessionId() {
  if (state.sessionId) return state.sessionId;
  try {
    const existing = window.localStorage.getItem(SESSION_KEY);
    if (existing) {
      state.sessionId = existing;
      return existing;
    }
  } catch (_) {
    // localStorage can be unavailable in private mode.
  }
  state.sessionId = newId();
  try {
    window.localStorage.setItem(SESSION_KEY, state.sessionId);
  } catch (_) {
    // Keep the in-memory session id.
  }
  return state.sessionId;
}

function resetSession() {
  state.sessionId = newId();
  try {
    window.localStorage.setItem(SESSION_KEY, state.sessionId);
  } catch (_) {
    // Ignore storage failures.
  }
}

function scrollToBottom() {
  els.messages.scrollTop = els.messages.scrollHeight;
}

function typingBubble() {
  const wrap = document.createElement('div');
  wrap.className = 'message assistant typing';
  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.setAttribute('aria-label', 'Assistant is typing');
  for (let index = 0; index < 3; index += 1) {
    const dot = document.createElement('span');
    dot.className = 'dot';
    bubble.appendChild(dot);
  }
  wrap.appendChild(bubble);
  return wrap;
}

function appendSources(container, sources) {
  if (!Array.isArray(sources) || !sources.length) return;
  const box = document.createElement('div');
  box.className = 'sources';
  const label = document.createElement('span');
  label.className = 'sources-label';
  label.textContent = 'Sources';
  box.appendChild(label);

  const links = document.createElement('div');
  links.className = 'source-links';
  for (const source of sources) {
    if (!source?.url) continue;
    const link = document.createElement('a');
    link.className = 'source-link';
    link.href = source.url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.title = source.title || source.url;
    const text = document.createElement('span');
    text.textContent = `${source.id ? `${source.id} ` : ''}${source.title || source.url}`;
    link.appendChild(text);
    links.appendChild(link);
  }
  if (!links.children.length) return;
  box.appendChild(links);
  container.appendChild(box);
}

function appendTextWithLinks(container, text) {
  const parts = String(text || '').split(/(https?:\/\/[^\s)]+)/g);
  for (const part of parts) {
    if (!part) continue;
    if (/^https?:\/\//.test(part)) {
      const link = document.createElement('a');
      link.href = part;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = part;
      container.appendChild(link);
    } else {
      container.appendChild(document.createTextNode(part));
    }
  }
}

function appendAssistant(content, options = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'message assistant';
  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  appendTextWithLinks(bubble, content);
  appendSources(bubble, options.sources);
  if (options.disclaimer) {
    const note = document.createElement('div');
    note.className = 'disclaimer';
    note.textContent = options.disclaimer;
    bubble.appendChild(note);
  }
  if (options.leadPrompt) {
    const cta = document.createElement('div');
    cta.className = 'lead-cta';
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Request a free quote';
    button.addEventListener('click', () => openLeadDialog(options.leadText || ''));
    cta.appendChild(button);
    bubble.appendChild(cta);
  }
  wrap.appendChild(bubble);
  els.messages.appendChild(wrap);
  scrollToBottom();
  return wrap;
}

function appendUser(content) {
  const wrap = document.createElement('div');
  wrap.className = 'message user';
  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.textContent = content;
  wrap.appendChild(bubble);
  els.messages.appendChild(wrap);
  scrollToBottom();
}

async function fetchJson(url, options = {}) {
  const { timeoutMs = 120_000, ...fetchOptions } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetch(url, {
      ...fetchOptions,
      headers: { 'Content-Type': 'application/json', ...(fetchOptions.headers || {}) },
      signal: controller.signal,
    });
  } catch (error) {
    if (error.name === 'AbortError') {
      const timeout = new Error('Server took too long to respond. Please try again.');
      timeout.code = 'timeout';
      throw timeout;
    }
    if (error instanceof TypeError || /networkerror|failed to fetch/i.test(error.message)) {
      const network = new Error('Could not reach the server. Check your connection and try again.');
      network.code = 'network';
      throw network;
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
  let data = null;
  try {
    data = await response.json();
  } catch (_) {
    data = null;
  }
  if (!response.ok) {
    const message = data?.message || `Request failed (${response.status})`;
    const error = new Error(message);
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}

async function loadMeta() {
  try {
    const meta = await fetchJson('/api/meta');
    state.meta = meta;
    const chunks = meta.index?.chunks || 0;
    const sources = meta.index?.sources || 0;
    if (chunks > 0) {
      els.status.textContent = `${sources} source${sources === 1 ? '' : 's'} · ${chunks} passages indexed`;
      els.badge.hidden = false;
      els.badge.textContent = 'Grounded';
    } else {
      els.status.textContent = 'Knowledge base is empty. Run npm run ingest.';
      els.badge.hidden = true;
    }
    if (!meta.llmConfigured) {
      els.status.textContent = `${els.status.textContent} · LLM not configured`;
    }
    els.updated.textContent = meta.lastUpdated
      ? `Content updated ${new Date(meta.lastUpdated).toLocaleString()}`
      : 'Content has not been ingested yet';
    if (meta.contactUrl) {
      els.contact.href = meta.contactUrl;
      els.contact.hidden = false;
    } else {
      els.contact.hidden = true;
    }
  } catch (error) {
    els.status.textContent = 'Could not load the knowledge base status.';
    els.badge.hidden = true;
  }
}

async function sendMessage(rawMessage) {
  const message = String(rawMessage || '').trim();
  if (!message || state.sending) return;

  state.sending = true;
  els.send.disabled = true;
  els.input.disabled = true;
  els.input.value = '';
  els.input.style.height = 'auto';
  appendUser(message);
  const typing = typingBubble();
  els.messages.appendChild(typing);
  scrollToBottom();

  try {
    const data = await fetchJson('/api/chat', {
      method: 'POST',
      body: JSON.stringify({ sessionId: getSessionId(), message }),
    });
    typing.remove();
    if (!data || !data.answer) {
      appendAssistant(data?.message || 'Sorry, I could not prepare an answer. Please try again.');
      return;
    }
    appendAssistant(data.answer, {
      sources: data.sources,
      disclaimer: data.disclaimer,
      leadPrompt: data.leadPrompt,
      leadText: data.leadText,
    });
  } catch (error) {
    typing.remove();
    const text =
      error.status === 429
        ? 'Too many messages in a short time. Please wait a minute and try again.'
        : error.code === 'network'
          ? 'Could not reach the server. Check your connection, then try again.'
          : error.code === 'timeout'
            ? 'The server took too long to answer. Please try again in a moment.'
            : error.message || 'Something went wrong. Please try again.';
    appendAssistant(text);
  } finally {
    state.sending = false;
    els.send.disabled = false;
    els.input.disabled = false;
    els.input.focus();
  }
}

function openLeadDialog(copy) {
  if (!els.dialog) return;
  els.leadError.hidden = true;
  els.leadError.textContent = '';
  if (copy) els.leadCopy.textContent = copy;
  els.leadForm.hidden = false;
  els.leadSuccess.hidden = true;
  els.leadForm.reset();
  els.leadSubmit.disabled = false;
  if (els.leadWebsite) els.leadWebsite.value = '';
  els.dialog.showModal();
  document.getElementById('lead-name')?.focus();
}

function closeLeadDialog() {
  if (els.dialog?.open) els.dialog.close();
}

function showLeadSuccess() {
  if (!els.dialog) return;
  els.leadForm.hidden = true;
  els.leadSuccess.hidden = false;
  els.leadSuccessClose?.focus();
}

function resetConversation() {
  els.messages.replaceChildren();
  resetSession();
  appendAssistant(
    'Hello. Ask me about the ITC clinic, the cancer treatment packages, what is included, or the listed prices. I will only answer from the PlacidWay pages I have.'
  );
  els.input.focus();
}

function autoResize() {
  els.input.style.height = 'auto';
  els.input.style.height = `${Math.min(els.input.scrollHeight, 130)}px`;
}

els.composer.addEventListener('submit', (event) => {
  event.preventDefault();
  sendMessage(els.input.value);
});

els.input.addEventListener('input', autoResize);
els.input.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    sendMessage(els.input.value);
  }
});

els.reset.addEventListener('click', resetConversation);
els.leadClose?.addEventListener('click', closeLeadDialog);
els.leadCancel?.addEventListener('click', closeLeadDialog);
els.leadSuccessClose?.addEventListener('click', closeLeadDialog);
els.dialog?.addEventListener('click', (event) => {
  if (event.target === els.dialog) closeLeadDialog();
});

els.leadForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  els.leadError.hidden = true;
  const formData = new FormData(els.leadForm);
  const payload = {
    sessionId: getSessionId(),
    name: String(formData.get('name') || '').trim(),
    email: String(formData.get('email') || '').trim(),
    message: String(formData.get('message') || '').trim(),
    consent: formData.get('consent') === 'on',
    website: String(formData.get('website') || ''),
  };
  if (!payload.name || !payload.email || !payload.consent) {
    els.leadError.textContent = 'Please provide your name, email, and consent.';
    els.leadError.hidden = false;
    return;
  }
  els.leadSubmit.disabled = true;
  try {
    await fetchJson('/api/leads', { method: 'POST', body: JSON.stringify(payload) });
    showLeadSuccess();
  } catch (error) {
    els.leadError.textContent = error.message || 'Could not send the request. Please try again.';
    els.leadError.hidden = false;
  } finally {
    els.leadSubmit.disabled = false;
  }
});

for (const button of document.querySelectorAll('[data-question]')) {
  button.addEventListener('click', () => {
    sendMessage(button.dataset.question || '');
  });
}

getSessionId();
loadMeta();
autoResize();
