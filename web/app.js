const form = document.getElementById('run-form');
const modeEl = document.getElementById('mode');
const vusField = document.getElementById('vus-field');
const rateField = document.getElementById('rate-field');
const highLoadWrap = document.getElementById('high-load-wrap');
const startBtn = document.getElementById('start-btn');
const onceBtn = document.getElementById('once-btn');
const cancelBtn = document.getElementById('cancel-btn');
const statusLine = document.getElementById('status-line');
const statusPill = document.getElementById('status-pill');
const meters = document.getElementById('meters');
const summary = document.getElementById('summary');
const onceOut = document.getElementById('once-out');
const errorBox = document.getElementById('error-box');

const STATUS_FA = {
  idle: 'آماده',
  queued: 'در صف',
  running: 'در حال اجرا',
  completed: 'تمام شد',
  failed: 'ناموفق',
  cancelled: 'لغو شد',
};

function setStatusPill(state) {
  if (!statusPill) return;
  const key = state || 'idle';
  statusPill.dataset.state = key;
  statusPill.textContent = STATUS_FA[key] || key;
}

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
    locale: 'fa',
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

function escapeHtml(s) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function overallVerdict(run) {
  if (run.status === 'cancelled') return { ok: false, label: 'اجرا لغو شد', tone: 'warn' };
  if (run.status === 'failed' || run.exitCode === 3 || run.exitCode === 4) {
    return { ok: false, label: 'اجرا ناموفق بود', tone: 'bad' };
  }
  if (run.exitCode === 1) return { ok: false, label: 'اجرا تمام شد ولی آستانه‌ها رد شدند', tone: 'warn' };
  if (run.exitCode === 0) return { ok: true, label: 'اجرا موفق بود', tone: 'good' };
  return { ok: run.status === 'completed', label: STATUS_FA[run.status] || run.status, tone: 'warn' };
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
  const okReqs = Math.max(0, m.http_reqs.count - m.http_req_failed.count);
  const okChecks = Math.max(0, m.checks.total - m.checks.failed);
  const failPct = (m.http_req_failed.rate * 100).toFixed(2);
  const checkFailPct = (m.checks.failed_rate * 100).toFixed(2);
  const verdict = overallVerdict(run);
  const modeFa = r.meta.mode === 'open' ? 'نرخ ثابت' : 'کاربر همزمان';

  /** @type {string[]} */
  const happened = [];
  /** @type {string[]} */
  const failed = [];

  if (okReqs > 0) {
    happened.push(`${okReqs.toLocaleString('fa-IR')} درخواست با موفقیت انجام شد`);
  }
  if (okChecks > 0) {
    happened.push(`${okChecks.toLocaleString('fa-IR')} چک با موفقیت پاس شد`);
  }
  if (r.thresholds?.length) {
    const passedTh = r.thresholds.filter((t) => t.pass);
    for (const t of passedTh) {
      happened.push(`آستانه پاس شد: ${t.metric} ${t.op} ${t.expected} (واقعی ${Number(t.actual).toFixed(2)})`);
    }
  }
  if (m.http_reqs.count > 0 && m.http_req_failed.count === 0 && m.checks.failed === 0 && (!r.thresholds?.length || r.thresholds.every((t) => t.pass))) {
    happened.push('هیچ خطای درخواست، چک یا آستانه‌ای ثبت نشد');
  }

  if (m.http_req_failed.count > 0) {
    failed.push(`${m.http_req_failed.count.toLocaleString('fa-IR')} درخواست ناموفق (${failPct}٪)`);
  }
  if (m.checks.failed > 0) {
    failed.push(`${m.checks.failed.toLocaleString('fa-IR')} چک رد شد (${checkFailPct}٪) — این جدا از خطای درخواست است`);
  }
  if (r.thresholds?.length) {
    for (const t of r.thresholds.filter((x) => !x.pass)) {
      failed.push(`آستانه رد شد: ${t.metric} ${t.op} ${t.expected} (واقعی ${Number(t.actual).toFixed(2)})`);
    }
  }
  if (r.meta.workerSaturated) {
    failed.push('اشباع worker تشخیص داده شد — اعداد تأخیر ممکن است قابل‌اعتماد نباشند');
  }
  if (r.meta.interrupted) {
    failed.push('اجرا وسط کار قطع شد');
  }
  if (run.error) {
    failed.push(run.error);
  }
  if (m.http_reqs.count === 0) {
    failed.push('هیچ درخواستی ثبت نشد');
  }

  const codes = Object.entries(m.status_codes || {})
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([code, count]) => `<li><span class="mono" dir="ltr">${escapeHtml(code)}</span> — ${Number(count).toLocaleString('fa-IR')} درخواست</li>`)
    .join('');

  summary.hidden = false;
  summary.innerHTML = `
    <div class="verdict ${verdict.tone}">
      <strong>${escapeHtml(verdict.label)}</strong>
      <span dir="ltr">exit ${escapeHtml(String(run.exitCode ?? '—'))}</span>
    </div>

    <div class="report-grid">
      <section class="report-block good">
        <h3>چی شد</h3>
        ${happened.length
          ? `<ul>${happened.map((x) => `<li>${escapeHtml(x)}</li>`).join('')}</ul>`
          : '<p class="empty">مورد موفقی ثبت نشد.</p>'}
      </section>
      <section class="report-block bad">
        <h3>چی نشد</h3>
        ${failed.length
          ? `<ul>${failed.map((x) => `<li>${escapeHtml(x)}</li>`).join('')}</ul>`
          : '<p class="empty">شکستی ثبت نشد.</p>'}
      </section>
    </div>

    <div class="report-meta">
      <div><span>مدت</span><strong dir="ltr">${r.meta.durationSec.toFixed(2)}s</strong></div>
      <div><span>حالت</span><strong>${escapeHtml(modeFa)}</strong></div>
      <div><span>کاربر مجازی</span><strong dir="ltr">${r.meta.vus}</strong></div>
      <div><span>کل درخواست</span><strong dir="ltr">${m.http_reqs.count.toLocaleString('en-US')}</strong></div>
      <div><span>نرخ</span><strong dir="ltr">${m.http_reqs.rate.toFixed(2)}/s</strong></div>
      <div><span>تأخیر p50</span><strong dir="ltr">${formatMs(m.http_req_duration.p50)}</strong></div>
      <div><span>تأخیر p95</span><strong dir="ltr">${formatMs(m.http_req_duration.p95)}</strong></div>
      <div><span>تأخیر p99</span><strong dir="ltr">${formatMs(m.http_req_duration.p99)}</strong></div>
    </div>

    ${codes ? `<div class="code-box"><h3>کدهای وضعیت</h3><ul>${codes}</ul></div>` : ''}
  `;
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
  if (!res.ok) throw new Error(run.error || 'خواندن وضعیت اجرا ناموفق بود');

  const liveReqs = run.live ? ` · ${run.live.requestsTotal} درخواست` : '';
  statusLine.textContent = `${STATUS_FA[run.status] || run.status}${liveReqs}`;
  setStatusPill(run.status);
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
  summary.innerHTML = '';
  const payload = formPayload();
  statusLine.textContent = 'در حال شروع اجرا…';
  setStatusPill('queued');
  try {
    const res = await fetch('/api/runs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'شروع اجرا ناموفق بود');
    meters.hidden = false;
    startPolling(data.id);
  } catch (err) {
    setError(err instanceof Error ? err.message : String(err));
    statusLine.textContent = 'شروع ناموفق';
    setStatusPill('failed');
  }
});

onceBtn.addEventListener('click', async () => {
  setError('');
  summary.hidden = true;
  const payload = formPayload();
  statusLine.textContent = 'ارسال یک درخواست…';
  setStatusPill('running');
  try {
    const res = await fetch('/api/once', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'درخواست ناموفق بود');
    onceOut.hidden = false;
    onceOut.textContent = JSON.stringify(data, null, 2);

    const checkFails = (data.checks || []).filter((c) => !c.pass);
    const reqOk = data.status >= 200 && data.status < 400;
    summary.hidden = false;
    summary.innerHTML = `
      <div class="verdict ${reqOk && checkFails.length === 0 ? 'good' : 'bad'}">
        <strong>${reqOk ? 'درخواست رسید' : 'درخواست ناموفق'}</strong>
        <span dir="ltr">HTTP ${data.status} · ${formatMs(data.durationMs)}</span>
      </div>
      <div class="report-grid">
        <section class="report-block good">
          <h3>چی شد</h3>
          <ul>
            <li>پاسخ با وضعیت <span class="mono" dir="ltr">${data.status}</span> دریافت شد</li>
            <li>زمان کل: <span class="mono" dir="ltr">${formatMs(data.durationMs)}</span></li>
            ${(data.checks || []).filter((c) => c.pass).map((c) => `<li>چک پاس شد: <span class="mono" dir="ltr">${escapeHtml(c.name || c.type)}</span></li>`).join('') || ''}
          </ul>
        </section>
        <section class="report-block bad">
          <h3>چی نشد</h3>
          ${!reqOk || checkFails.length
            ? `<ul>
                ${!reqOk ? `<li>وضعیت HTTP خارج از محدوده موفق بود</li>` : ''}
                ${checkFails.map((c) => `<li>چک رد شد: <span class="mono" dir="ltr">${escapeHtml(c.name || c.type)}</span></li>`).join('')}
              </ul>`
            : '<p class="empty">شکستی ثبت نشد.</p>'}
        </section>
      </div>
    `;
    statusLine.textContent = `یک‌بار → HTTP ${data.status} در ${formatMs(data.durationMs)}`;
    setStatusPill('completed');
  } catch (err) {
    setError(err instanceof Error ? err.message : String(err));
    statusLine.textContent = 'ارسال یک‌بار ناموفق';
    setStatusPill('failed');
  }
});

cancelBtn.addEventListener('click', async () => {
  if (!activeRunId) return;
  await fetch(`/api/runs/${activeRunId}/cancel`, { method: 'POST' });
  statusLine.textContent = 'درخواست لغو ارسال شد…';
});
