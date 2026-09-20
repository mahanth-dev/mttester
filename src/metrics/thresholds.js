import { PlanError } from '../core/errors.js';

/**
 * Threshold evaluation for load test results.
 * Request failures and check failures are evaluated separately.
 */

/**
 * @typedef {object} Threshold
 * @property {string} metric
 * @property {string} op
 * @property {number} value
 * @property {boolean} [abortOnFail]
 */

/**
 * @typedef {object} ThresholdResult
 * @property {string} metric
 * @property {string} op
 * @property {number} expected
 * @property {number} actual
 * @property {boolean} pass
 */

/** @type {readonly string[]} */
export const KNOWN_METRICS = [
  'http_req_duration.p50',
  'http_req_duration.p90',
  'http_req_duration.p95',
  'http_req_duration.p99',
  'http_req_duration.avg',
  'http_req_duration.min',
  'http_req_duration.max',
  'http_req_failed',
  'http_req_failed.count',
  'http_reqs',
  'http_reqs.rate',
  'checks.failed',
  'checks.failed_rate',
  'checks.total',
  'iterations',
  'data.received',
  'data.sent',
  'vus.max',
];

/**
 * @param {string} metric
 * @returns {boolean}
 */
export function isKnownMetric(metric) {
  if (KNOWN_METRICS.includes(metric)) return true;
  if (metric.startsWith('http_req_duration.p')) {
    const q = parseFloat(metric.slice('http_req_duration.p'.length));
    return Number.isFinite(q) && q > 0 && q <= 100;
  }
  return false;
}

/**
 * @param {Threshold} threshold
 * @throws {PlanError}
 */
export function validateThresholdMetric(threshold) {
  if (!isKnownMetric(threshold.metric)) {
    throw new PlanError(`Unknown threshold metric: ${threshold.metric}`);
  }
}

/**
 * @param {number} actual
 * @param {string} op
 * @param {number} expected
 * @returns {boolean}
 */
export function compareThreshold(actual, op, expected) {
  switch (op) {
    case '<': return actual < expected;
    case '<=': return actual <= expected;
    case '>': return actual > expected;
    case '>=': return actual >= expected;
    case '==': return actual === expected;
    case '!=': return actual !== expected;
    default: return false;
  }
}

/**
 * @param {import('./registry.js').MetricsRegistry} registry
 * @param {import('../metrics/timeseries.js').TimeSeries|null} timeSeries
 * @param {number} durationSec
 * @param {Threshold[]} thresholds
 * @returns {ThresholdResult[]}
 */
export function evaluateThresholds(registry, timeSeries, durationSec, thresholds) {
  /** @type {ThresholdResult[]} */
  const results = [];

  for (const t of thresholds) {
    const actual = resolveMetric(registry, timeSeries, durationSec, t.metric);
    results.push({
      metric: t.metric,
      op: t.op,
      expected: t.value,
      actual,
      pass: compareThreshold(actual, t.op, t.value),
    });
  }

  return results;
}

/**
 * @param {import('./registry.js').MetricsRegistry} registry
 * @param {import('../metrics/timeseries.js').TimeSeries|null} timeSeries
 * @param {number} durationSec
 * @param {string} metric
 * @returns {number}
 */
function resolveMetric(registry, timeSeries, durationSec, metric) {
  const h = registry.httpDuration;
  const pct = h.percentiles();

  switch (metric) {
    case 'http_req_duration.p50': return pct.p50;
    case 'http_req_duration.p90': return pct.p90;
    case 'http_req_duration.p95': return pct.p95;
    case 'http_req_duration.p99': return pct.p99;
    case 'http_req_duration.avg': return h.mean();
    case 'http_req_duration.min': return h.count > 0 ? h.min : 0;
    case 'http_req_duration.max': return h.count > 0 ? h.max : 0;
    case 'http_req_failed': return registry.requestsTotal > 0
      ? registry.requestsFailed / registry.requestsTotal
      : 0;
    case 'http_req_failed.count': return registry.requestsFailed;
    case 'http_reqs': return registry.requestsTotal;
    case 'http_reqs.rate': return durationSec > 0 ? registry.requestsTotal / durationSec : 0;
    case 'checks.failed': return registry.checksFailed;
    case 'checks.failed_rate': return registry.checksTotal > 0
      ? registry.checksFailed / registry.checksTotal
      : 0;
    case 'checks.total': return registry.checksTotal;
    case 'iterations': return registry.iterations;
    case 'data.received': return registry.bytesReceived;
    case 'data.sent': return registry.bytesSent;
    case 'vus.max': {
      if (!timeSeries || timeSeries.points.length === 0) return 0;
      return Math.max(...timeSeries.points.map((p) => p.activeVus));
    }
    default:
      if (metric.startsWith('http_req_duration.p')) {
        const q = parseFloat(metric.slice('http_req_duration.p'.length)) / 100;
        if (Number.isFinite(q)) return h.quantile(q);
      }
      return 0;
  }
}

/**
 * @param {ThresholdResult[]} results
 * @returns {boolean}
 */
export function allThresholdsPassed(results) {
  return results.every((r) => r.pass);
}

/**
 * @param {string} spec e.g. "http_req_duration.p95<500"
 * @returns {Threshold|null}
 */
export function parseThreshold(spec) {
  const match = spec.match(/^([a-z0-9_.]+)(<=|>=|!=|<|>|==)(-?\d+(?:\.\d+)?)$/i);
  if (!match) return null;
  return {
    metric: match[1],
    op: match[2],
    value: parseFloat(match[3]),
  };
}
