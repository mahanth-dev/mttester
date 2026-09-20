import { httpRequest } from './http-client.js';
import { runChecks } from '../checks/index.js';
import { pickScenario, resolveStep, orderedSteps, applyExtractRules } from './scenario.js';
import { Feeder } from '../data/feeder.js';
import {
  CookieJar,
  browserHeadersForVu,
  mergeHeaders,
  randomThinkMs,
} from './browser.js';

/**
 * Execute a single virtual-user iteration (one user session pass).
 * @param {object} params
 * @param {import('./plan.js').SerializedPlan} params.plan
 * @param {number} params.vuId
 * @param {number} params.totalVus
 * @param {Feeder|null} params.feeder
 * @param {number} params.iteration
 * @param {CookieJar} [params.jar]
 * @returns {Promise<import('./protocol.js').RequestResult>}
 */
export async function executeIteration({ plan, vuId, totalVus, feeder, iteration = 0, jar = undefined }) {
  const cookieJar = jar ?? (plan.cookieJar ? new CookieJar() : null);
  const scenarioDef = pickScenario(plan.scenarios);
  const vars = {
    ...(feeder?.nextForVu(vuId) ?? {}),
    vu: vuId,
    iteration,
  };
  const steps = orderedSteps(scenarioDef);
  const startTs = Date.now();
  const browser = plan.browserHeaders ? browserHeadersForVu(vuId) : {};

  /** @type {import('./protocol.js').RequestResult|null} */
  let lastResult = null;
  /** @type {import('../checks/index.js').CheckResult[]} */
  let allChecks = [];
  let anyRequestFailed = false;
  let totalBytesIn = 0;
  let totalBytesOut = 0;
  let totalDuration = 0;

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const resolved = resolveStep(step, vars);
    let headers = mergeHeaders(browser, resolved.headers);
    if (cookieJar) headers = cookieJar.applyTo(headers);

    const stepResult = await executeStep(
      { ...resolved, headers },
      plan.timeoutMs,
      step.name ?? scenarioDef.name,
    );

    if (cookieJar && stepResult.headers) {
      cookieJar.storeFromResponse(stepResult.headers);
    }

    allChecks = allChecks.concat(stepResult.checks);
    if (!stepResult.ok) anyRequestFailed = true;
    lastResult = stepResult;
    totalBytesIn += stepResult.bytesReceived;
    totalBytesOut += stepResult.bytesSent;
    totalDuration += stepResult.durationMs;

    if (step.extract) {
      applyExtractRules(step.extract, {
        status: stepResult.status,
        headers: stepResult.headers ?? {},
        body: stepResult.body ?? '',
      }, vars);
    }

    if (!stepResult.ok && i < steps.length - 1) {
      break;
    }

    // Pause between pages like a real user reading / clicking
    if (i < steps.length - 1 && (plan.stepThinkMaxMs > 0 || plan.stepThinkMinMs > 0)) {
      await thinkTime(randomThinkMs(plan.stepThinkMinMs, plan.stepThinkMaxMs));
    }
  }

  if (!lastResult) {
    return {
      scenario: scenarioDef.name,
      method: 'GET',
      url: '',
      status: 0,
      durationMs: 0,
      ttfbMs: 0,
      ok: false,
      checksPassed: false,
      error: 'No steps executed',
      bytesReceived: 0,
      bytesSent: 0,
      checks: [],
      timestamp: startTs,
    };
  }

  const checksPassed = !allChecks.some((c) => !c.pass);
  return {
    ...lastResult,
    scenario: scenarioDef.name,
    checks: allChecks,
    checksPassed,
    ok: !anyRequestFailed,
    durationMs: totalDuration || lastResult.durationMs,
    bytesReceived: totalBytesIn,
    bytesSent: totalBytesOut,
    timestamp: startTs,
  };
}

/**
 * @param {{method: string, url: string, headers: Record<string, string>, body: string|null, checks: import('../checks/index.js').CheckDefinition[]}} step
 * @param {number} timeoutMs
 * @param {string} stepName
 * @returns {Promise<import('./protocol.js').RequestResult & {headers?: Record<string, string>, body?: string}>}
 */
async function executeStep(step, timeoutMs, stepName) {
  const startTs = Date.now();
  try {
    const res = await httpRequest({
      method: step.method,
      url: step.url,
      headers: step.headers,
      body: step.body,
      timeoutMs,
    });

    const checks = runChecks(step.checks, {
      status: res.status,
      headers: res.headers,
      body: res.body,
      durationMs: res.timings.total,
    });

    return {
      scenario: stepName,
      method: step.method,
      url: step.url,
      status: res.status,
      durationMs: res.timings.total,
      ttfbMs: res.timings.ttfb,
      ok: res.status >= 200 && res.status < 400,
      checksPassed: !checks.some((c) => !c.pass),
      error: null,
      bytesReceived: res.bytesReceived,
      bytesSent: res.bytesSent,
      checks,
      headers: res.headers,
      body: res.body,
      timestamp: startTs,
    };
  } catch (err) {
    const e = /** @type {Error & {timings?: {total: number, ttfb: number}, bytesSent?: number}} */ (err);
    return {
      scenario: stepName,
      method: step.method,
      url: step.url,
      status: 0,
      durationMs: e.timings?.total ?? 0,
      ttfbMs: e.timings?.ttfb ?? 0,
      ok: false,
      checksPassed: false,
      error: e.message,
      bytesReceived: 0,
      bytesSent: e.bytesSent ?? 0,
      checks: runChecks(step.checks, {
        status: 0,
        headers: {},
        body: '',
        durationMs: e.timings?.total ?? 0,
      }),
      timestamp: startTs,
    };
  }
}

/**
 * @param {number} ms
 * @returns {Promise<void>}
 */
export function thinkTime(ms) {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}
