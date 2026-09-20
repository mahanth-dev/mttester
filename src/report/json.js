import { writeFile } from 'node:fs/promises';

export const SCHEMA_VERSION = 1;

/**
 * @typedef {object} JsonReport
 * @property {number} schemaVersion
 * @property {object} meta
 * @property {string} meta.name
 * @property {string} meta.timestamp
 * @property {number} meta.durationSec
 * @property {boolean} meta.interrupted
 * @property {boolean} meta.workerSaturated
 * @property {string} meta.mode
 * @property {number} meta.vus
 * @property {number|null} meta.rate
 * @property {object} metrics
 * @property {{count: number, rate: number}} metrics.http_reqs
 * @property {{count: number, rate: number}} metrics.http_req_failed
 * @property {{total: number, failed: number, failed_rate: number}} metrics.checks
 * @property {{min: number, max: number, avg: number, p50: number, p90: number, p95: number, p99: number, histogram: import('../metrics/histogram.js').HistogramData}} metrics.http_req_duration
 * @property {{min: number, max: number, avg: number, p50: number, p90: number, p95: number, p99: number}} metrics.http_req_waiting
 * @property {number} metrics.data_received
 * @property {number} metrics.data_sent
 * @property {number} metrics.iterations
 * @property {Record<string, number>} metrics.status_codes
 * @property {import('../metrics/thresholds.js').ThresholdResult[]} thresholds
 * @property {Array<{timestamp: number, rps: number, failedRps: number, avgMs: number, activeVus: number}>} timeSeries
 */

/**
 * @param {object} params
 * @param {import('../core/plan.js').TestPlan} params.plan
 * @param {import('../metrics/registry.js').MetricsRegistry} params.metrics
 * @param {import('../metrics/timeseries.js').TimeSeries} [params.timeSeries]
 * @param {number} params.durationSec
 * @param {import('../metrics/thresholds.js').ThresholdResult[]} [params.thresholds]
 * @param {boolean} [params.interrupted]
 * @param {boolean} [params.workerSaturated]
 * @returns {JsonReport}
 */
export function buildJsonReport({
  plan,
  metrics,
  timeSeries,
  durationSec,
  thresholds = [],
  interrupted = false,
  workerSaturated = false,
}) {
  const h = metrics.httpDuration;
  const ttfb = metrics.ttfb;

  return {
    schemaVersion: SCHEMA_VERSION,
    meta: {
      name: plan.name,
      timestamp: new Date().toISOString(),
      durationSec,
      interrupted,
      workerSaturated,
      mode: plan.mode,
      vus: plan.vus,
      rate: plan.rate,
    },
    metrics: {
      http_reqs: {
        count: metrics.requestsTotal,
        rate: durationSec > 0 ? metrics.requestsTotal / durationSec : 0,
      },
      http_req_failed: {
        count: metrics.requestsFailed,
        rate: metrics.requestsTotal > 0 ? metrics.requestsFailed / metrics.requestsTotal : 0,
      },
      checks: {
        total: metrics.checksTotal,
        failed: metrics.checksFailed,
        failed_rate: metrics.checksTotal > 0 ? metrics.checksFailed / metrics.checksTotal : 0,
      },
      http_req_duration: {
        min: h.count > 0 ? h.min : 0,
        max: h.count > 0 ? h.max : 0,
        avg: h.mean(),
        p50: h.quantile(0.5),
        p90: h.quantile(0.9),
        p95: h.quantile(0.95),
        p99: h.quantile(0.99),
        histogram: h.toJSON(),
      },
      http_req_waiting: {
        min: ttfb.count > 0 ? ttfb.min : 0,
        max: ttfb.count > 0 ? ttfb.max : 0,
        avg: ttfb.mean(),
        p50: ttfb.quantile(0.5),
        p90: ttfb.quantile(0.9),
        p95: ttfb.quantile(0.95),
        p99: ttfb.quantile(0.99),
      },
      data_received: metrics.bytesReceived,
      data_sent: metrics.bytesSent,
      iterations: metrics.iterations,
      status_codes: metrics.statusCodes,
    },
    thresholds,
    timeSeries: timeSeries?.points ?? [],
  };
}

/**
 * @param {JsonReport} report
 * @param {string} [path='report.json']
 */
export async function writeJsonReport(report, path = 'report.json') {
  await writeFile(path, JSON.stringify(report, null, 2), 'utf8');
}
