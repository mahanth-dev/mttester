import { writeFile } from 'node:fs/promises';

/**
 * @param {import('./json.js').JsonReport} report
 * @returns {string}
 */
export function buildHtmlReport(report) {
  const m = report.metrics;
  const meta = report.meta;

  const statusRows = Object.entries(m.status_codes || {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([code, count]) => `<tr><td>${code}</td><td>${count}</td></tr>`)
    .join('');

  const thresholdRows = (report.thresholds || [])
    .map((/** @type {import('../metrics/thresholds.js').ThresholdResult} */ th) => `<tr class="${th.pass ? 'pass' : 'fail'}"><td>${th.metric}</td><td>${th.op} ${th.expected}</td><td>${th.actual.toFixed(2)}</td><td>${th.pass ? 'PASS' : 'FAIL'}</td></tr>`)
    .join('');

  const tsData = JSON.stringify(report.timeSeries || []);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>mttester report — ${escapeHtml(meta.name)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: system-ui, -apple-system, sans-serif; background: #0f172a; color: #e2e8f0; padding: 2rem; }
  h1 { font-size: 1.5rem; margin-bottom: 0.5rem; }
  .meta { color: #94a3b8; margin-bottom: 2rem; font-size: 0.875rem; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-bottom: 2rem; }
  .card { background: #1e293b; border-radius: 8px; padding: 1rem; }
  .card h3 { font-size: 0.75rem; text-transform: uppercase; color: #94a3b8; margin-bottom: 0.5rem; }
  .card .value { font-size: 1.5rem; font-weight: 600; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 2rem; }
  th, td { text-align: left; padding: 0.5rem 1rem; border-bottom: 1px solid #334155; }
  th { color: #94a3b8; font-size: 0.75rem; text-transform: uppercase; }
  .pass { color: #4ade80; }
  .fail { color: #f87171; }
  .warn { background: #451a03; color: #fbbf24; padding: 1rem; border-radius: 8px; margin-bottom: 1rem; }
  canvas { width: 100%; height: 200px; background: #1e293b; border-radius: 8px; }
  section { margin-bottom: 2rem; }
  section h2 { font-size: 1rem; margin-bottom: 1rem; color: #cbd5e1; }
</style>
</head>
<body>
<h1>mttester report</h1>
<div class="meta">${escapeHtml(meta.name)} · ${meta.timestamp} · ${meta.durationSec.toFixed(1)}s · ${meta.mode} · ${meta.vus} VUs</div>
${meta.workerSaturated ? '<div class="warn">⚠️ Worker saturation was detected during this run</div>' : ''}
<div class="grid">
  <div class="card"><h3>Requests</h3><div class="value">${m.http_reqs.count}</div></div>
  <div class="card"><h3>Req/s</h3><div class="value">${m.http_reqs.rate.toFixed(1)}</div></div>
  <div class="card"><h3>Failed</h3><div class="value fail">${m.http_req_failed.count}</div></div>
  <div class="card"><h3>Checks Failed</h3><div class="value fail">${m.checks.failed}</div></div>
  <div class="card"><h3>p50</h3><div class="value">${m.http_req_duration.p50.toFixed(1)} ms</div></div>
  <div class="card"><h3>p95</h3><div class="value">${m.http_req_duration.p95.toFixed(1)} ms</div></div>
  <div class="card"><h3>p99</h3><div class="value">${m.http_req_duration.p99.toFixed(1)} ms</div></div>
  <div class="card"><h3>Data</h3><div class="value">${formatBytes(m.data_received)}</div></div>
</div>
<section>
  <h2>Latency Percentiles</h2>
  <table>
    <tr><th>Metric</th><th>Value (ms)</th></tr>
    <tr><td>min</td><td>${m.http_req_duration.min.toFixed(2)}</td></tr>
    <tr><td>avg</td><td>${m.http_req_duration.avg.toFixed(2)}</td></tr>
    <tr><td>max</td><td>${m.http_req_duration.max.toFixed(2)}</td></tr>
    <tr><td>p50</td><td>${m.http_req_duration.p50.toFixed(2)}</td></tr>
    <tr><td>p90</td><td>${m.http_req_duration.p90.toFixed(2)}</td></tr>
    <tr><td>p95</td><td>${m.http_req_duration.p95.toFixed(2)}</td></tr>
    <tr><td>p99</td><td>${m.http_req_duration.p99.toFixed(2)}</td></tr>
  </table>
</section>
<section>
  <h2>Status Codes</h2>
  <table><tr><th>Code</th><th>Count</th></tr>${statusRows || '<tr><td colspan="2">—</td></tr>'}</table>
</section>
${thresholdRows ? `<section><h2>Thresholds</h2><table><tr><th>Metric</th><th>Expected</th><th>Actual</th><th>Result</th></tr>${thresholdRows}</table></section>` : ''}
<section>
  <h2>Throughput Over Time</h2>
  <canvas id="chart" width="800" height="200"></canvas>
</section>
<script>
const ts = ${tsData};
const canvas = document.getElementById('chart');
const ctx = canvas.getContext('2d');
function drawChart() {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth, h = canvas.clientHeight;
  canvas.width = w * dpr; canvas.height = h * dpr;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);
  if (!ts.length) { ctx.fillStyle='#64748b'; ctx.fillText('No time series data', 20, h/2); return; }
  const maxRps = Math.max(...ts.map(p => p.rps), 1);
  const pad = 30;
  ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 2; ctx.beginPath();
  ts.forEach((p, i) => {
    const x = pad + (i / (ts.length - 1 || 1)) * (w - pad * 2);
    const y = h - pad - (p.rps / maxRps) * (h - pad * 2);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.stroke();
  ctx.fillStyle = '#64748b'; ctx.font = '11px system-ui';
  ctx.fillText('0', 5, h - pad);
  ctx.fillText(maxRps.toFixed(0) + '/s', 5, pad);
}
drawChart();
window.addEventListener('resize', drawChart);
</script>
</body>
</html>`;
}

/**
 * @param {number} bytes
 * @returns {string}
 */
function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

/**
 * @param {string} s
 * @returns {string}
 */
function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * @param {import('./json.js').JsonReport} report
 * @param {string} [path='report.html']
 */
export async function writeHtmlReport(report, path = 'report.html') {
  await writeFile(path, buildHtmlReport(report), 'utf8');
}
