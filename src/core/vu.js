import { httpRequest } from './http-client.js';
import { runChecks } from '../checks/index.js';
import { pickScenario, resolveStep, orderedSteps, applyExtractRules } from './scenario.js';
import { Feeder } from '../data/feeder.js';

/**
 * Execute a single virtual-user iteration.
 * @param {object} params
 * @param {import('./plan.js').SerializedPlan} params.plan
 * @param {number} params.vuId
 * @param {number} params.totalVus
 * @param {Feeder|null} params.feeder
 * @param {number} params.iteration
 * @returns {Promise<import('./protocol.js').RequestResult>}
 */
export async function executeIteration({ plan, vuId, totalVus, feeder, iteration = 0 }) {
  const scenarioDef = pickScenario(plan.scenarios);
  const vars = {
    ...(feeder?.nextForVu(vuId) ?? {}),
    vu: vuId,
    iteration,
  };
  const steps = orderedSteps(scenarioDef);
  const startTs = Date.now();

  /** @type {import('./protocol.js').RequestResult|null} */
  let lastResult = null;
  /** @type {import('../checks/index.js').CheckResult[]} */
  let allChecks = [];
  let anyRequestFailed = false;

  for (const step of steps) {
    const resolved = resolveStep(step, vars);
    const stepResult = await executeStep(resolved, plan.timeoutMs, step.name ?? scenarioDef.name);
    allChecks = allChecks.concat(stepResult.checks);
    if (!stepResult.ok) anyRequestFailed = true;
    lastResult = stepResult;

    if (step.extract) {
      applyExtractRules(step.extract, {
        status: stepResult.status,
        headers: stepResult.headers ?? {},
        body: stepResult.body ?? '',
      }, vars);
    }

    if (!stepResult.ok && step !== steps[steps.length - 1]) {
      break;
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
