const TOKEN_KEY = 'placidway_admin_token';

const els = {
  token: document.getElementById('token'),
  save: document.getElementById('save-token'),
  gaps: document.getElementById('load-gaps'),
  sources: document.getElementById('load-sources'),
  refresh: document.getElementById('refresh'),
  refreshForce: document.getElementById('refresh-force'),
  logout: document.getElementById('logout'),
  status: document.getElementById('status'),
  output: document.getElementById('output'),
};

function token() {
  return els.token.value.trim();
}

function setStatus(message) {
  els.status.textContent = message;
}

function el(tag, text, className) {
  const node = document.createElement(tag);
  if (text != null) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function table(headers, rows) {
  const wrapper = el('div');
  const tableEl = el('table');
  const thead = el('thead');
  const headRow = el('tr');
  for (const header of headers) headRow.appendChild(el('th', header));
  thead.appendChild(headRow);
  tableEl.appendChild(thead);
  const tbody = el('tbody');
  for (const row of rows) {
    const tr = el('tr');
    for (const cell of row) {
      const td = el('td');
      if (cell instanceof Node) td.appendChild(cell);
      else td.textContent = cell == null ? '' : String(cell);
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  tableEl.appendChild(tbody);
  wrapper.appendChild(tableEl);
  return wrapper;
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'x-admin-token': token(),
      ...(options.headers || {}),
    },
  });
  let data = null;
  try {
    data = await response.json();
  } catch (_) {
    data = null;
  }
  if (!response.ok) {
    throw new Error(data?.message || data?.error || `Request failed (${response.status})`);
  }
  return data;
}

async function loadGaps() {
  setStatus('Loading unanswered questions…');
  try {
    const data = await api('/api/admin/unanswered?limit=200');
    els.output.replaceChildren();
    if (!data.rows.length) {
      els.output.appendChild(el('p', 'No unanswered questions logged yet.'));
      setStatus('No gaps logged.');
      return;
    }
    els.output.appendChild(
      table(
        ['When', 'Reason', 'Question', 'Score'],
        data.rows.map((row) => [
          new Date(row.created_at).toLocaleString(),
          row.reason,
          row.question,
          row.top_score == null ? '' : Number(row.top_score).toFixed(3),
        ])
      )
    );
    setStatus(`${data.rows.length} unanswered question(s).`);
  } catch (error) {
    setStatus(error.message);
  }
}

async function loadSources() {
  setStatus('Loading sources…');
  try {
    const data = await api('/api/admin/sources');
    els.output.replaceChildren();
    els.output.appendChild(
      table(
        ['Source', 'Status', 'Chunks', 'Fetched', 'Error'],
        data.sources.map((source) => [
          source.url || source.id,
          el('span', source.status, 'pill'),
          source.chunk_count,
          source.fetched_at ? new Date(source.fetched_at).toLocaleString() : '',
          source.error || '',
        ])
      )
    );
    if (data.lastRun) {
      els.output.appendChild(
        el(
          'p',
          `Last ingest: ${data.lastRun.status} · ${data.lastRun.finished_at || data.lastRun.started_at}`
        )
      );
    }
    setStatus(`${data.sources.length} source(s).`);
  } catch (error) {
    setStatus(error.message);
  }
}

async function refresh(force) {
  setStatus(force ? 'Force refreshing all sources…' : 'Refreshing changed sources…');
  els.refresh.disabled = true;
  els.refreshForce.disabled = true;
  try {
    const data = await api('/api/admin/refresh', {
      method: 'POST',
      body: JSON.stringify({ force }),
    });
    els.output.replaceChildren();
    const pre = el('pre', data.summary || JSON.stringify(data.stats, null, 2));
    els.output.appendChild(pre);
    setStatus('Refresh finished.');
  } catch (error) {
    setStatus(error.message);
  } finally {
    els.refresh.disabled = false;
    els.refreshForce.disabled = false;
  }
}

function setAuthenticated(authenticated) {
  const tokenRow = els.token.closest('.admin-row');
  if (tokenRow) tokenRow.hidden = authenticated;
  if (els.logout) els.logout.hidden = !authenticated;
  for (const action of [els.gaps, els.sources, els.refresh, els.refreshForce]) {
    if (action) {
      action.hidden = !authenticated;
      action.disabled = !authenticated;
    }
  }
}

async function verifyToken() {
  const value = token();
  if (!value) {
    setAuthenticated(false);
    setStatus('Enter the admin token first.');
    els.token.focus();
    return;
  }

  setStatus('Checking token…');
  els.save.disabled = true;
  try {
    const data = await api('/api/admin/sources');
    try {
      sessionStorage.setItem(TOKEN_KEY, value);
    } catch (_) {
      // Token verification still works even when storage is blocked.
    }
    setAuthenticated(true);
    setStatus(`Token valid — ${data.sources.length} source(s).`);
  } catch (error) {
    setAuthenticated(false);
    try {
      sessionStorage.removeItem(TOKEN_KEY);
    } catch (_) {
      // Ignore storage failures.
    }
    setStatus(`Token check failed: ${error.message}`);
  } finally {
    els.save.disabled = false;
  }
}

els.save.addEventListener('click', verifyToken);
if (els.logout) {
  els.logout.addEventListener('click', () => {
    try {
      sessionStorage.removeItem(TOKEN_KEY);
    } catch (_) {
      // Ignore storage failures.
    }
    els.token.value = '';
    setAuthenticated(false);
    els.output.replaceChildren();
    setStatus('Enter the admin token and click Use token.');
    els.token.focus();
  });
}
els.gaps.addEventListener('click', loadGaps);
els.sources.addEventListener('click', loadSources);
els.refresh.addEventListener('click', () => refresh(false));
els.refreshForce.addEventListener('click', () => refresh(true));

let storedToken = '';
try {
  storedToken = sessionStorage.getItem(TOKEN_KEY) || '';
} catch (_) {
  // Ignore storage failures.
}

if (storedToken) {
  els.token.value = storedToken;
  verifyToken();
} else {
  setAuthenticated(false);
  setStatus('Enter the admin token and click Use token.');
}
