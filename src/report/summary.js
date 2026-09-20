import { t, format } from '../i18n/index.js';
import { formatBytes, formatMs, formatDuration, formatRate } from './format.js';

/**
 * @param {object} params
 * @param {import('../metrics/registry.js').MetricsRegistry} params.metrics
 * @param {number} params.durationSec
 * @param {number} params.vus
 * @param {import('../metrics/thresholds.js').ThresholdResult[]} [params.thresholds]
 * @param {boolean} [params.workerSaturated]
 * @param {string} [params.locale='en']
 * @returns {string}
 */
export function buildSummary({ metrics, durationSec, vus, thresholds = [], workerSaturated = false, locale = 'en' }) {
  const s = t(locale).summary;
  const h = metrics.httpDuration;
  const pct = h.percentiles();
  const rps = durationSec > 0 ? metrics.requestsTotal / durationSec : 0;
  const failRate = metrics.requestsTotal > 0
    ? (metrics.requestsFailed / metrics.requestsTotal * 100).toFixed(2)
    : '0.00';
  const checkFailRate = metrics.checksTotal > 0
    ? (metrics.checksFailed / metrics.checksTotal * 100).toFixed(2)
    : '0.00';

  const lines = [
    '',
    `  ${s.title}`,
    '  ' + '─'.repeat(40),
    `  ${s.duration}:     ${formatDuration(durationSec)}`,
    `  ${s.vus}:         ${vus}`,
    `  ${s.requests}:     ${metrics.requestsTotal} (${formatRate(rps)})`,
    `  ${s.failed}:  ${metrics.requestsFailed} (${failRate}%)`,
    `  ${s.checks}:       ${metrics.checksTotal}`,
    `  ${s.checksFailed}:  ${metrics.checksFailed} (${checkFailRate}%)`,
    `  ${s.dataReceived}: ${formatBytes(metrics.bytesReceived)}`,
    `  ${s.dataSent}:     ${formatBytes(metrics.bytesSent)}`,
    '',
    `  ${s.latency}`,
    `    ${s.avg}:  ${formatMs(h.mean())}`,
    `    ${s.min}:  ${formatMs(h.count > 0 ? h.min : 0)}`,
    `    ${s.max}:  ${formatMs(h.count > 0 ? h.max : 0)}`,
    `    ${s.p50}:  ${formatMs(pct.p50)}`,
    `    ${s.p90}:  ${formatMs(pct.p90)}`,
    `    ${s.p95}:  ${formatMs(pct.p95)}`,
    `    ${s.p99}:  ${formatMs(pct.p99)}`,
    '',
  ];

  if (metrics.statusCodes && Object.keys(metrics.statusCodes).length > 0) {
    lines.push('  Status codes:');
    for (const [code, count] of Object.entries(metrics.statusCodes).sort()) {
      lines.push(`    ${code}: ${count}`);
    }
    lines.push('');
  }

  if (thresholds.length > 0) {
    lines.push('  Thresholds:');
    for (const th of thresholds) {
      const mark = th.pass ? '✓' : '✗';
      lines.push(`    ${mark} ${th.metric} ${th.op} ${th.expected} (actual ${th.actual.toFixed(2)})`);
    }
    lines.push('');
  }

  if (workerSaturated) {
    lines.push('  ⚠️  WORKER SATURATION was detected during this run');
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * @param {object} params
 * @param {import('../metrics/registry.js').MetricsRegistry} params.metrics
 * @param {number} params.durationSec
 * @param {number} params.vus
 * @param {import('../metrics/thresholds.js').ThresholdResult[]} [params.thresholds]
 * @param {boolean} [params.workerSaturated]
 * @param {string} [params.locale='en']
 */
export function printSummary(params) {
  process.stdout.write(buildSummary(params));
}
