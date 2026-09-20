import { writeFile } from 'node:fs/promises';

/**
 * @param {import('./json.js').JsonReport} report
 * @returns {string}
 */
export function buildCsvReport(report) {
  const m = report.metrics;
  const rows = [
    ['metric', 'value'],
    ['schemaVersion', report.schemaVersion],
    ['duration_sec', report.meta.durationSec],
    ['vus', report.meta.vus],
    ['http_reqs', m.http_reqs.count],
    ['http_reqs_rate', m.http_reqs.rate.toFixed(4)],
    ['http_req_failed_count', m.http_req_failed.count],
    ['http_req_failed_rate', m.http_req_failed.rate.toFixed(6)],
    ['checks_total', m.checks.total],
    ['checks_failed', m.checks.failed],
    ['checks_failed_rate', m.checks.failed_rate.toFixed(6)],
    ['http_req_duration_min', m.http_req_duration.min.toFixed(4)],
    ['http_req_duration_max', m.http_req_duration.max.toFixed(4)],
    ['http_req_duration_avg', m.http_req_duration.avg.toFixed(4)],
    ['http_req_duration_p50', m.http_req_duration.p50.toFixed(4)],
    ['http_req_duration_p90', m.http_req_duration.p90.toFixed(4)],
    ['http_req_duration_p95', m.http_req_duration.p95.toFixed(4)],
    ['http_req_duration_p99', m.http_req_duration.p99.toFixed(4)],
    ['data_received', m.data_received],
    ['data_sent', m.data_sent],
    ['iterations', m.iterations],
    ['worker_saturated', report.meta.workerSaturated ? 'true' : 'false'],
  ];

  for (const [code, count] of Object.entries(m.status_codes || {})) {
    rows.push([`status_${code}`, count]);
  }

  for (const th of report.thresholds || []) {
    rows.push([`threshold_${th.metric}`, th.pass ? 'pass' : 'fail']);
  }

  return rows.map((r) => r.map(escapeCsv).join(',')).join('\n') + '\n';
}

/**
 * @param {string|number} val
 * @returns {string}
 */
function escapeCsv(val) {
  const s = String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * @param {import('./json.js').JsonReport} report
 * @param {string} [path='report.csv']
 */
export async function writeCsvReport(report, path = 'report.csv') {
  await writeFile(path, buildCsvReport(report), 'utf8');
}
