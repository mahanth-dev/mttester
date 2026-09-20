import { parentPort, workerData } from 'node:worker_threads';
import { MSG } from './protocol.js';
import { executeIteration, thinkTime } from './vu.js';
import { MetricsRegistry } from '../metrics/registry.js';
import { RateLimiter } from './schedule.js';
import { closeAgent } from './http-client.js';
import { Feeder, loadFeederFromFile } from '../data/feeder.js';
import { CookieJar, randomThinkMs } from './browser.js';

/** @type {import('./plan.js').SerializedPlan} */
let plan;
/** @type {number} */
let workerId;
/** @type {boolean} */
let running = false;
/** @type {boolean} */
let stopRequested = false;
/** @type {number} */
let startTime = 0;
/** @type {number} */
let endTime = Infinity;
/** @type {number} */
let vuStart = 0;
/** @type {number} */
let vuCount = 0;
/** @type {number} */
let totalVus = 1;
/** @type {MetricsRegistry} */
const metrics = new MetricsRegistry();
/** @type {Feeder|null} */
let feeder = null;
/** @type {RateLimiter|null} */
let rateLimiter = null;
/** @type {number} */
let pendingRequests = 0;
/** @type {number} */
const MAX_PENDING = 1000;
/** @type {boolean} */
let saturatedReported = false;
/** @type {boolean} */
let inWarmup = false;
/** @type {ReturnType<typeof setInterval>|null} */
let metricsInterval = null;

/**
 * @param {import('./protocol.js').StartMessage} msg
 */
async function handleStart(msg) {
  startTime = msg.startTime;
  endTime = msg.endTime;
  vuStart = msg.vuStart;
  vuCount = msg.vuCount;
  totalVus = msg.totalVus;
  running = true;
  stopRequested = false;
  saturatedReported = false;

  if (plan.feederPath) {
    feeder = await loadFeederFromFile(plan.feederPath, { totalVus });
  }

  if (plan.mode === 'open') {
    const initialRate = msg.targetRate ?? ((plan.rate ?? 0) / (msg.workerCount || 1));
    rateLimiter = new RateLimiter(initialRate);
  }

  metricsInterval = setInterval(() => {
    parentPort?.postMessage({ type: MSG.METRICS, snapshot: metrics.snapshot() });
  }, 1000);

  /** @type {Promise<void>[]} */
  const vuTasks = [];
  for (let i = 0; i < vuCount; i++) {
    vuTasks.push(runVu(vuStart + i));
  }

  await Promise.all(vuTasks);

  if (metricsInterval) clearInterval(metricsInterval);
  await closeAgent();

  parentPort?.postMessage({
    type: MSG.DONE,
    workerId,
    finalMetrics: metrics.snapshot(),
  });
}

/**
 * @param {number} vuId
 */
async function runVu(vuId) {
  let vuIterations = 0;
  const jar = plan.cookieJar ? new CookieJar() : null;

  if (plan.staggerStartMs > 0) {
    const delay = (vuId / Math.max(totalVus, 1)) * plan.staggerStartMs;
    await thinkTime(delay);
  }

  while (running && !stopRequested && Date.now() < endTime) {
    if (plan.iterations !== null && vuIterations >= plan.iterations) break;

    if (plan.mode === 'open' && rateLimiter) {
      const now = performance.now();
      const wait = rateLimiter.acquire(now);
      if (wait > 0) {
        await new Promise((r) => setTimeout(r, wait));
      }
    }

    if (pendingRequests >= MAX_PENDING) {
      if (!saturatedReported) {
        saturatedReported = true;
        parentPort?.postMessage({
          type: MSG.SATURATED,
          reason: 'Worker pending request queue full',
          pendingCount: pendingRequests,
        });
      }
      await new Promise((r) => setTimeout(r, 10));
      continue;
    }

    pendingRequests++;
    try {
      const result = await executeIteration({
        plan,
        vuId,
        totalVus,
        feeder,
        iteration: vuIterations,
        jar: jar || undefined,
      });
      if (!inWarmup) {
        metrics.recordRequest(result);
        vuIterations++;
        metrics.iterations++;
      }
      parentPort?.postMessage({ type: MSG.RESULT, result });
    } catch (err) {
      parentPort?.postMessage({
        type: MSG.ERROR,
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      pendingRequests--;
    }

    const thinkMs = randomThinkMs(plan.thinkTimeMs, plan.thinkTimeMaxMs ?? plan.thinkTimeMs);
    if (thinkMs > 0) await thinkTime(thinkMs);
  }
}

/**
 * @param {import('./protocol.js').TickMessage} msg
 */
function handleTick(msg) {
  inWarmup = msg.now < startTime + (plan.warmupSec * 1000);
  if (rateLimiter && msg.targetRate >= 0) {
    rateLimiter.setRate(msg.targetRate);
  }
}

parentPort?.on('message', async (msg) => {
  try {
    switch (msg.type) {
      case MSG.INIT:
        plan = msg.plan;
        workerId = msg.workerId;
        break;
      case MSG.START:
        await handleStart(msg);
        break;
      case MSG.STOP:
        stopRequested = true;
        running = false;
        break;
      case MSG.TICK:
        handleTick(msg);
        break;
      default:
        break;
    }
  } catch (err) {
    parentPort?.postMessage({
      type: MSG.ERROR,
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
  }
});

if (workerData?.init) {
  plan = workerData.init.plan;
  workerId = workerData.init.workerId;
}
