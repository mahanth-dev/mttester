const form = document.getElementById('run-form');
const modeEl = document.getElementById('mode');
const vusField = document.getElementById('vus-field');
const rateField = document.getElementById('rate-field');
const highLoadWrap = document.getElementById('high-load-wrap');
const startBtn = document.getElementById('start-btn');
const onceBtn = document.getElementById('once-btn');
const cancelBtn = document.getElementById('cancel-btn');
const statusLine = document.getElementById('status-line');
const meters = document.getElementById('meters');
const summary = document.getElementById('summary');
const onceOut = document.getElementById('once-out');
const errorBox = document.getElementById('error-box');

let activeRunId = null;
/** @type {ReturnType<typeof setInterval>|null} */
let pollTimer = null;

function parseHeaders(text) {
  /** @type {Record<string, string>} */
  const headers = {};
  for (const line of String(text || '').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const idx = trimmed.indexOf(':');
    if (idx === -1) continue;
    headers[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
  }
  return headers;
}

function formPayload() {
  const mode = modeEl.value;
  const vus = Number(document.getElementById('vus').value || 1);
  const rate = Number(document.getElementById('rate').value || 0);
  return {
    url: document.getElementById('url').value.trim(),
    method: document.getElementById('method').value,
    duration: document.getElementById('duration').value.trim() || '10s',
    vus: mode === 'closed' ? vus : undefined,
    rate: mode === 'open' ? rate : undefined,
    checks: document.getElementById('checks').value.trim(),
    thresholds: document.getElementById('thresholds').value.trim(),
    headers: parseHeaders(document.getElementById('headers').value),
    body: document.getElementById('body').value,
    authorized: document.getElementById('authorized').checked,
    confirmHighLoad: document.getElementById('confirmHighLoad').checked,
  };
}

function updateModeUi() {
  const open = modeEl.value === 'open';
  rateField.hidden = !open;
  vusField.hidden = open;
  updateHighLoadUi();
}

function updateHighLoadUi() {
  const mode = modeEl.value;
  const vus = Number(document.getElementById('vus').value || 0);
  const rate = Number(document.getElementById('rate').value || 0);
  const needs = (mode === 'closed' && vus > 500) || (mode === 'open' && rate > 2000);
  highLoadWrap.hidden = !needs;
}

function setError(msg) {
  if (!msg) {
    errorBox.hidden = true;
    errorBox.textContent = '';
    return;
  }
  errorBox.hidden = false;
  errorBox.textContent = msg;
}

function formatMs(ms) {
  if (ms == null || Number.isNaN(ms)) return '—';
  if (ms < 1) return `${(ms * 1000).toFixed(0)} µs`;
  if (ms < 1000) return `${ms.toFixed(2)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

function renderLive(live) {
  meters.hidden = false;
  document.getElementById('m-elapsed').textContent = `${(live.elapsedSec || 0).toFixed(1)}s`;
  document.getElementById('m-vus').textContent = String(live.activeVus ?? 0);
  document.getElementById('m-reqs').textContent = String(live.requestsTotal ?? 0);
  document.getElementById('m-rps').textContent = (live.rps ?? 0).toFixed(1);
  document.getElementById('m-fail').textContent = String(live.requestsFailed ?? 0);
  document.getElementById('m-avg').textContent = formatMs(live.avgMs);
}

function renderReport(run) {
  const r = run.report;
  if (!r) return;
  const m = r.metrics;
  const lines = [
    `Status: ${run.status} (exit ${run.exitCode ?? '—'})`,
    `Duration: ${r.meta.durationSec.toFixed(2)}s · mode ${r.meta.mode} · VUs ${r.meta.vus}`,
    `Requests: ${m.http_reqs.count} (${m.http_reqs.rate.toFixed(2)}/s)`,
    `Failed requests: ${m.http_req_failed.count} (${(m.http_req_failed.rate * 100).toFixed(2)}%)`,
    `Checks: ${m.checks.total} · failed ${m.checks.failed}`,
    `Latency p50 ${formatMs(m.http_req_duration.p50)} · p95 ${formatMs(m.http_req_duration.p95)} · p99 ${formatMs(m.http_req_duration.p99)}`,
    `Status codes: ${Object.entries(m.status_codes || {}).map(([k, v]) => `${k}:${v}`).join(' ') || '—'}`,
  ];
  if (r.thresholds?.length) {
    lines.push('Thresholds:');
    for (const t of r.thresholds) {
      lines.push(`  ${t.pass ? '✓' : '✗'} ${t.metric} ${t.op} ${t.expected} (actual ${Number(t.actual).toFixed(2)})`);
    }
  }
  if (run.error) lines.push(`Note: ${run.error}`);
  summary.hidden = false;
  summary.textContent = lines.join('\n');
}

function stopPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
  cancelBtn.hidden = true;
  startBtn.disabled = false;
  onceBtn.disabled = false;
}

async function pollRun(id) {
  const res = await fetch(`/api/runs/${id}`);
  const run = await res.json();
  if (!res.ok) throw new Error(run.error || 'Failed to load run');

  statusLine.textContent = `Run ${run.status}${run.live ? ` · ${run.live.requestsTotal} reqs` : ''}`;
  if (run.live) renderLive(run.live);

  if (run.status === 'running' || run.status === 'queued') return false;

  stopPolling();
  if (run.report) renderReport(run);
  if (run.error && run.status === 'failed') setError(run.error);
  return true;
}

function startPolling(id) {
  activeRunId = id;
  cancelBtn.hidden = false;
  startBtn.disabled = true;
  onceBtn.disabled = true;
  stopPolling();
  pollTimer = setInterval(async () => {
    try {
      const done = await pollRun(id);
      if (done) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      stopPolling();
    }
  }, 500);
  pollRun(id).catch((err) => setError(err.message));
}

modeEl.addEventListener('change', updateModeUi);
document.getElementById('vus').addEventListener('input', updateHighLoadUi);
document.getElementById('rate').addEventListener('input', updateHighLoadUi);
updateModeUi();

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  setError('');
  onceOut.hidden = true;
  summary.hidden = true;
  const payload = formPayload();
  statusLine.textContent = 'Starting run…';
  try {
    const res = await fetch('/api/runs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to start run');
    meters.hidden = false;
    startPolling(data.id);
  } catch (err) {
    setError(err instanceof Error ? err.message : String(err));
    statusLine.textContent = 'Failed to start';
  }
});

onceBtn.addEventListener('click', async () => {
  setError('');
  summary.hidden = true;
  const payload = formPayload();
  statusLine.textContent = 'Sending single request…';
  try {
    const res = await fetch('/api/once', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed');
    onceOut.hidden = false;
    onceOut.textContent = JSON.stringify(data, null, 2);
    statusLine.textContent = `Once → HTTP ${data.status} in ${formatMs(data.durationMs)}`;
  } catch (err) {
    setError(err instanceof Error ? err.message : String(err));
    statusLine.textContent = 'Once failed';
  }
});

cancelBtn.addEventListener('click', async () => {
  if (!activeRunId) return;
  await fetch(`/api/runs/${activeRunId}/cancel`, { method: 'POST' });
  statusLine.textContent = 'Cancellation requested…';
});
