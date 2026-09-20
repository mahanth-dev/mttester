import { randomUUID } from 'node:crypto';
import { createPlan } from '../core/plan.js';
import { runTest, assertThresholds } from '../core/coordinator.js';
import { buildJsonReport } from '../report/json.js';
import { parseCheckSpecs } from '../checks/index.js';
import { parseThreshold } from '../metrics/thresholds.js';
import { MtTesterError } from '../core/errors.js';
import { httpRequest } from '../core/http-client.js';
import { runChecks } from '../checks/index.js';

/**
 * @typedef {object} RunRecord
 * @property {string} id
 * @property {'queued'|'running'|'completed'|'failed'|'cancelled'} status
 * @property {object} config
 * @property {object|null} live
 * @property {import('../report/json.js').JsonReport|null} report
 * @property {string|null} error
 * @property {number|null} exitCode
 * @property {number} createdAt
 * @property {AbortController|null} controller
 */

/** @type {Map<string, RunRecord>} */
const runs = new Map();

const MAX_RUNS = 50;

/**
 * @param {object} body
 * @returns {RunRecord}
 */
export function createRun(body) {
  const id = randomUUID();
  /** @type {RunRecord} */
  const record = {
    id,
    status: 'queued',
    config: body,
    live: null,
    report: null,
    error: null,
    exitCode: null,
    createdAt: Date.now(),
    controller: null,
  };
  runs.set(id, record);
  pruneRuns();
  queueMicrotask(() => startRun(id).catch(() => {}));
  return publicRun(record);
}

/**
 * @param {string} id
 * @returns {RunRecord|null}
 */
export function getRun(id) {
  const r = runs.get(id);
  return r ? publicRun(r) : null;
}

/**
 * @returns {ReturnType<typeof publicRun>[]}
 */
export function listRuns() {
  return [...runs.values()]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 20)
    .map(publicRun);
}

/**
 * @param {string} id
 * @returns {boolean}
 */
export function cancelRun(id) {
  const r = runs.get(id);
  if (!r || (r.status !== 'running' && r.status !== 'queued')) return false;
  r.controller?.abort();
  r.status = 'cancelled';
  return true;
}

/**
 * @param {RunRecord} r
 */
function publicRun(r) {
  return {
    id: r.id,
    status: r.status,
    config: r.config,
    live: r.live,
    report: r.report,
    error: r.error,
    exitCode: r.exitCode,
    createdAt: r.createdAt,
  };
}

function pruneRuns() {
  if (runs.size <= MAX_RUNS) return;
  const sorted = [...runs.values()].sort((a, b) => a.createdAt - b.createdAt);
  while (runs.size > MAX_RUNS) {
    const old = sorted.shift();
    if (!old) break;
    if (old.status === 'running') continue;
    runs.delete(old.id);
  }
}

/**
 * @param {string} id
 */
async function startRun(id) {
  const record = runs.get(id);
  if (!record) return;

  const controller = new AbortController();
  record.controller = controller;
  record.status = 'running';

  try {
    const plan = planFromBody(record.config);
    const result = await runTest({
      plan,
      signal: controller.signal,
      onUpdate: (state) => {
        record.live = state;
      },
    });

    const report = buildJsonReport({
      plan,
      metrics: result.metrics,
      timeSeries: result.timeSeries,
      durationSec: result.durationSec,
      thresholds: result.thresholds,
      interrupted: result.interrupted,
      workerSaturated: result.workerSaturated,
    });

    record.report = report;
    record.live = {
      elapsedSec: result.durationSec,
      activeVus: plan.vus,
      currentRate: plan.rate ?? 0,
      requestsTotal: result.metrics.requestsTotal,
      requestsFailed: result.metrics.requestsFailed,
      rps: result.durationSec > 0 ? result.metrics.requestsTotal / result.durationSec : 0,
      avgMs: result.metrics.httpDuration.mean(),
      inWarmup: false,
      workerSaturated: result.workerSaturated,
    };

    if (result.interrupted || record.status === 'cancelled') {
      record.status = 'cancelled';
      record.exitCode = 130;
      return;
    }

    if (result.allUnreachable) {
      record.status = 'failed';
      record.exitCode = 3;
      record.error = 'Target unreachable for 100% of requests';
      return;
    }

    try {
      assertThresholds(result);
      record.status = 'completed';
      record.exitCode = 0;
    } catch (err) {
      record.status = 'completed';
      record.exitCode = err instanceof MtTesterError ? err.exitCode : 1;
      record.error = err instanceof Error ? err.message : String(err);
    }
  } catch (err) {
    record.status = 'failed';
    record.exitCode = err instanceof MtTesterError ? err.exitCode : 4;
    record.error = err instanceof Error ? err.message : String(err);
  } finally {
    record.controller = null;
  }
}

/**
 * @param {object} body
 * @returns {import('../core/plan.js').TestPlan}
 */
function planFromBody(body) {
  const url = String(body.url || '').trim();
  if (!url) throw new MtTesterError('URL is required', 'PLAN_INVALID', 2);

  const method = String(body.method || 'GET').toUpperCase();
  /** @type {Record<string, string>} */
  const headers = {};
  if (body.headers && typeof body.headers === 'object') {
    for (const [k, v] of Object.entries(body.headers)) {
      headers[String(k)] = String(v);
    }
  }

  const checkSpecs = Array.isArray(body.checks)
    ? body.checks.map(String)
    : String(body.checks || 'status:2xx').split(',').map((s) => s.trim()).filter(Boolean);

  const thresholdSpecs = Array.isArray(body.thresholds)
    ? body.thresholds.map(String)
    : String(body.thresholds || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

  /** @type {import('../metrics/thresholds.js').Threshold[]} */
  const thresholds = [];
  for (const spec of thresholdSpecs) {
    const t = parseThreshold(spec);
    if (!t) throw new MtTesterError(`Invalid threshold: ${spec}`, 'PLAN_INVALID', 2);
    thresholds.push(t);
  }

  const rate = body.rate != null && body.rate !== '' ? Number(body.rate) : null;
  const vusExplicit = body.vus != null && body.vus !== '' ? Number(body.vus) : null;
  const mode = rate ? 'open' : 'closed';
  const vus = vusExplicit ?? (mode === 'open' && rate ? Math.max(Math.ceil(rate), 1) : Number(body.vus || 10));

  return createPlan({
    name: String(body.name || 'web-run'),
    mode,
    vus,
    rate,
    durationSec: parseDurationValue(body.duration ?? '10s'),
    iterations: body.iterations != null && body.iterations !== '' ? Number(body.iterations) : null,
    scenarios: [{
      name: 'main',
      method,
      url,
      headers,
      body: body.body ? String(body.body) : null,
      checks: parseCheckSpecs(checkSpecs.length ? checkSpecs : ['status:2xx']),
    }],
    thresholds,
    warmupSec: parseDurationValue(body.warmup || '0') ?? 0,
    thinkTimeMs: Number(body.thinkTime || 0),
    timeoutMs: Number(body.timeout || 30_000),
    workerCount: body.workers != null && body.workers !== '' ? Number(body.workers) : undefined,
    confirmHighLoad: Boolean(body.confirmHighLoad),
    locale: body.locale === 'fa' ? 'fa' : 'en',
  });
}

/**
 * @param {unknown} dur
 * @returns {number|null}
 */
function parseDurationValue(dur) {
  if (dur == null || dur === '') return null;
  if (typeof dur === 'number') return dur;
  const match = String(dur).match(/^(\d+(?:\.\d+)?)(ms|s|m|h)?$/);
  if (!match) throw new MtTesterError(`Invalid duration: ${dur}`, 'PLAN_INVALID', 2);
  const val = parseFloat(match[1]);
  const unit = match[2] || 's';
  switch (unit) {
    case 'ms': return val / 1000;
    case 's': return val;
    case 'm': return val * 60;
    case 'h': return val * 3600;
    default: return val;
  }
}

/**
 * @param {object} body
 */
export async function runOnce(body) {
  const url = String(body.url || '').trim();
  if (!url) throw new MtTesterError('URL is required', 'PLAN_INVALID', 2);

  const method = String(body.method || 'GET').toUpperCase();
  /** @type {Record<string, string>} */
  const headers = {};
  if (body.headers && typeof body.headers === 'object') {
    for (const [k, v] of Object.entries(body.headers)) {
      headers[String(k)] = String(v);
    }
  }

  const checks = parseCheckSpecs(
    Array.isArray(body.checks)
      ? body.checks.map(String)
      : String(body.checks || 'status:2xx').split(',').map((s) => s.trim()).filter(Boolean),
  );

  const res = await httpRequest({
    method,
    url,
    headers,
    body: body.body ? String(body.body) : null,
    timeoutMs: Number(body.timeout || 30_000),
  });

  const checkResults = runChecks(checks, {
    status: res.status,
    headers: res.headers,
    body: res.body,
    durationMs: res.timings.total,
  });

  return {
    url,
    method,
    status: res.status,
    durationMs: res.timings.total,
    ttfbMs: res.timings.ttfb,
    bytesReceived: res.bytesReceived,
    bytesSent: res.bytesSent,
    checks: checkResults,
    body: res.body.slice(0, 4000),
    headers: res.headers,
  };
}
