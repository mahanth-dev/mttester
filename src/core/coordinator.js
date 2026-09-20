import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { MSG } from './protocol.js';
import { MetricsRegistry } from '../metrics/registry.js';
import { TimeSeries } from '../metrics/timeseries.js';
import {
  createScheduleState,
  advanceSchedule,
  isRunComplete,
  vuRangeForWorker,
} from './schedule.js';
import { serializePlan, totalDurationSec } from './plan.js';
import { evaluateThresholds, allThresholdsPassed } from '../metrics/thresholds.js';
import { ThresholdError } from './errors.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const WORKER_PATH = join(__dirname, 'worker.js');

/**
 * @typedef {object} RunOptions
 * @property {import('./plan.js').TestPlan} plan
 * @property {boolean} [liveView=false]
 * @property {(state: LiveState) => void} [onUpdate]
 * @property {AbortSignal} [signal]
 */

/**
 * @typedef {object} LiveState
 * @property {number} elapsedSec
 * @property {number} activeVus
 * @property {number} currentRate
 * @property {number} requestsTotal
 * @property {number} requestsFailed
 * @property {number} rps
 * @property {number} avgMs
 * @property {boolean} inWarmup
 * @property {boolean} workerSaturated
 */

/**
 * @typedef {object} RunResult
 * @property {MetricsRegistry} metrics
 * @property {TimeSeries} timeSeries
 * @property {import('../metrics/thresholds.js').ThresholdResult[]} thresholds
 * @property {number} durationSec
 * @property {boolean} interrupted
 * @property {boolean} workerSaturated
 * @property {string|null} saturatedReason
 * @property {boolean} allUnreachable
 */

/**
 * Coordinator orchestrates workers — NEVER makes HTTP requests.
 * @param {RunOptions} options
 * @returns {Promise<RunResult>}
 */
export async function runTest(options) {
  const { plan } = options;
  const serialized = serializePlan(plan);
  const workerCount = plan.workerCount;
  const totalDuration = totalDurationSec(plan);
  const startTime = Date.now();
  const endTime = Number.isFinite(totalDuration)
    ? startTime + totalDuration * 1000
    : Infinity;

  const metrics = new MetricsRegistry();
  const timeSeries = new TimeSeries(1000);
  let schedule = createScheduleState(plan);
  let interrupted = false;
  let workerSaturated = false;
  /** @type {string|null} */
  let saturatedReason = null;
  /** @type {Set<number>} */
  const workersDone = new Set();

  /** @type {Worker[]} */
  const workers = [];
  /** @type {Promise<void>[]} */
  const donePromises = [];

  for (let i = 0; i < workerCount; i++) {
    const worker = new Worker(WORKER_PATH, {
      workerData: { init: { plan: serialized, workerId: i } },
    });
    workers.push(worker);

    worker.on('message', (msg) => {
      switch (msg.type) {
        case MSG.RESULT:
          if (!schedule.inWarmup || !plan.discardWarmup) {
            metrics.recordRequest(msg.result);
            timeSeries.recordRequest(msg.result);
          }
          break;
        case MSG.METRICS:
          break;
        case MSG.DONE:
          workersDone.add(msg.workerId);
          if (msg.finalMetrics) {
            metrics.iterations += msg.finalMetrics.iterations;
          }
          break;
        case MSG.SATURATED:
          workerSaturated = true;
          saturatedReason = msg.reason;
          metrics.workerSaturated = true;
          metrics.saturatedReason = msg.reason;
          break;
        case MSG.ERROR:
          break;
        default:
          break;
      }
    });

    donePromises.push(new Promise((resolve, reject) => {
      worker.on('error', reject);
      worker.on('exit', (code) => {
        if (code !== 0) reject(new Error(`Worker ${i} exited with code ${code}`));
        else resolve();
      });
    }));
  }

  const abortHandler = () => {
    interrupted = true;
    for (const w of workers) {
      w.postMessage({ type: MSG.STOP });
    }
  };
  options.signal?.addEventListener('abort', abortHandler);

  // Split global rate by VU share so idle workers (vuCount=0) do not steal budget.
  const rateForWorker = (/** @type {number} */ globalRate, /** @type {number} */ vuCount) => {
    if (globalRate <= 0 || plan.vus <= 0) return 0;
    return (globalRate * vuCount) / plan.vus;
  };

  const tickInterval = setInterval(() => {
    const now = Date.now();
    const elapsedSec = (now - startTime) / 1000;
    schedule = advanceSchedule(plan, schedule, elapsedSec);

    for (let i = 0; i < workers.length; i++) {
      const range = vuRangeForWorker(schedule.currentVus, workerCount, i);
      workers[i].postMessage({
        type: MSG.TICK,
        now,
        targetRate: rateForWorker(schedule.currentRate, range.count),
        activeVus: schedule.currentVus,
      });
    }

    timeSeries.tick(now, schedule.currentVus);

    if (options.onUpdate) {
      const elapsed = Math.max(elapsedSec - plan.warmupSec, 0.001);
      options.onUpdate({
        elapsedSec,
        activeVus: schedule.currentVus,
        currentRate: schedule.currentRate,
        requestsTotal: metrics.requestsTotal,
        requestsFailed: metrics.requestsFailed,
        rps: metrics.requestsTotal / elapsed,
        avgMs: metrics.httpDuration.mean(),
        inWarmup: schedule.inWarmup,
        workerSaturated,
      });
    }

    if (isRunComplete(plan, elapsedSec, metrics.iterations)) {
      for (const w of workers) {
        w.postMessage({ type: MSG.STOP });
      }
    }
  }, 100);

  for (let i = 0; i < workerCount; i++) {
    const range = vuRangeForWorker(schedule.currentVus, workerCount, i);
    workers[i].postMessage({
      type: MSG.START,
      startTime,
      endTime,
      vuStart: range.start,
      vuCount: range.count,
      totalVus: plan.vus,
      workerCount,
      targetRate: rateForWorker(plan.rate ?? schedule.currentRate, range.count),
    });
  }

  await Promise.race([
    Promise.all(donePromises),
    new Promise((resolve) => {
      const check = setInterval(() => {
        const elapsedSec = (Date.now() - startTime) / 1000;
        if (
          workersDone.size === workerCount
          || isRunComplete(plan, elapsedSec, metrics.iterations)
          || interrupted
        ) {
          clearInterval(check);
          resolve(undefined);
        }
      }, 200);
    }),
  ]);

  // Capture load-window end before drain/terminate so reports are not inflated.
  const loadEndTime = Date.now();

  clearInterval(tickInterval);
  options.signal?.removeEventListener('abort', abortHandler);

  for (const w of workers) {
    w.postMessage({ type: MSG.STOP });
  }

  await Promise.race([
    Promise.all(donePromises),
    new Promise((resolve) => setTimeout(resolve, 10_000)),
  ]);

  for (const w of workers) {
    await w.terminate();
  }

  let durationSec = (loadEndTime - startTime) / 1000 - plan.warmupSec;
  if (
    !interrupted
    && plan.durationSec !== null
    && Number.isFinite(plan.durationSec)
    && durationSec > plan.durationSec
  ) {
    durationSec = plan.durationSec;
  }
  timeSeries.flush(Date.now());

  const allUnreachable = metrics.requestsTotal > 0
    && metrics.requestsFailed === metrics.requestsTotal;

  const thresholdResults = evaluateThresholds(
    metrics,
    timeSeries,
    Math.max(durationSec, 0.001),
    plan.thresholds,
  );

  return {
    metrics,
    timeSeries,
    thresholds: thresholdResults,
    durationSec: Math.max(durationSec, 0.001),
    interrupted,
    workerSaturated,
    saturatedReason,
    allUnreachable,
  };
}

/**
 * @param {RunResult} result
 * @throws {ThresholdError}
 */
export function assertThresholds(result) {
  if (result.thresholds.length > 0 && !allThresholdsPassed(result.thresholds)) {
    const failed = result.thresholds.filter((t) => !t.pass);
    const msg = failed.map((t) => `${t.metric} ${t.op} ${t.expected} (actual ${t.actual.toFixed(2)})`).join('; ');
    throw new ThresholdError(`Threshold(s) failed: ${msg}`);
  }
}
