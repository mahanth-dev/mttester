/**
 * Stage scheduler and rate limiter for open/closed loop execution.
 */

/**
 * @typedef {object} ScheduleState
 * @property {number} currentVus
 * @property {number} currentRate
 * @property {number} stageIndex
 * @property {number} stageElapsedSec
 * @property {boolean} inWarmup
 * @property {number} elapsedSec
 */

/**
 * @param {Pick<import('./plan.js').TestPlan, 'vus'|'rate'|'stages'|'warmupSec'>} plan
 * @returns {ScheduleState}
 */
export function createScheduleState(plan) {
  const initialVus = plan.stages.length > 0
    ? (plan.stages[0].targetVus ?? plan.vus)
    : plan.vus;
  const initialRate = plan.stages.length > 0
    ? (plan.stages[0].targetRate ?? plan.rate ?? 0)
    : (plan.rate ?? 0);

  return {
    currentVus: initialVus,
    currentRate: initialRate,
    stageIndex: 0,
    stageElapsedSec: 0,
    inWarmup: plan.warmupSec > 0,
    elapsedSec: 0,
  };
}

/**
 * Advance schedule based on elapsed time.
 * @param {Pick<import('./plan.js').TestPlan, 'vus'|'rate'|'stages'|'warmupSec'>} plan
 * @param {ScheduleState} state
 * @param {number} elapsedSec
 * @returns {ScheduleState}
 */
export function advanceSchedule(plan, state, elapsedSec) {
  const next = { ...state, elapsedSec };

  if (plan.warmupSec > 0 && elapsedSec < plan.warmupSec) {
    next.inWarmup = true;
    return next;
  }
  next.inWarmup = false;

  const runElapsed = elapsedSec - plan.warmupSec;

  if (plan.stages.length > 0) {
    let remaining = runElapsed;
    let stageIdx = 0;
    for (let i = 0; i < plan.stages.length; i++) {
      if (remaining < plan.stages[i].durationSec) {
        stageIdx = i;
        next.stageIndex = stageIdx;
        next.stageElapsedSec = remaining;
        const stage = plan.stages[stageIdx];
        if (stage.targetVus !== undefined) next.currentVus = stage.targetVus;
        if (stage.targetRate !== undefined) next.currentRate = stage.targetRate;
        return next;
      }
      remaining -= plan.stages[i].durationSec;
    }
    const last = plan.stages[plan.stages.length - 1];
    next.stageIndex = plan.stages.length - 1;
    next.stageElapsedSec = last.durationSec;
    if (last.targetVus !== undefined) next.currentVus = last.targetVus;
    if (last.targetRate !== undefined) next.currentRate = last.targetRate;
    return next;
  }

  next.currentVus = plan.vus;
  next.currentRate = plan.rate ?? 0;
  return next;
}

/**
 * @param {Pick<import('./plan.js').TestPlan, 'warmupSec'|'durationSec'|'stages'|'iterations'|'vus'>} plan
 * @param {number} elapsedSec
 * @param {number} [completedIterations=0]
 * @returns {boolean}
 */
export function isRunComplete(plan, elapsedSec, completedIterations = 0) {
  const runElapsed = Math.max(0, elapsedSec - plan.warmupSec);

  if (plan.stages.length > 0) {
    const totalStageSec = plan.stages.reduce((s, st) => s + st.durationSec, 0);
    return runElapsed >= totalStageSec;
  }

  if (plan.durationSec !== null) {
    return runElapsed >= plan.durationSec;
  }

  if (plan.iterations !== null && plan.iterations > 0) {
    const targetTotal = plan.iterations * plan.vus;
    return completedIterations >= targetTotal;
  }

  return false;
}

/**
 * Slot-based open-loop rate limiter with reservation on wait.
 */
export class RateLimiter {
  /**
   * @param {number} ratePerSec
   */
  constructor(ratePerSec) {
    /** @type {number} */
    this.rate = ratePerSec;
    /** @type {number} */
    this.intervalMs = ratePerSec > 0 ? 1000 / ratePerSec : Infinity;
    /** @type {number} */
    this.nextSlot = 0;
  }

  /**
   * @param {number} now
   * @returns {number} ms to wait before next request, 0 if ready
   */
  acquire(now) {
    if (this.rate <= 0) return 0;

    if (now >= this.nextSlot) {
      this.nextSlot = now + this.intervalMs;
      return 0;
    }

    const wait = this.nextSlot - now;
    this.nextSlot += this.intervalMs;
    return wait;
  }

  /**
   * @param {number} ratePerSec
   */
  setRate(ratePerSec) {
    this.rate = ratePerSec;
    this.intervalMs = ratePerSec > 0 ? 1000 / ratePerSec : Infinity;
  }
}

/**
 * Compute VU distribution across workers.
 * @param {number} totalVus
 * @param {number} workerCount
 * @param {number} workerId
 * @returns {{start: number, count: number}}
 */
export function vuRangeForWorker(totalVus, workerCount, workerId) {
  const base = Math.floor(totalVus / workerCount);
  const remainder = totalVus % workerCount;
  const count = base + (workerId < remainder ? 1 : 0);
  let start = 0;
  for (let i = 0; i < workerId; i++) {
    start += base + (i < remainder ? 1 : 0);
  }
  return { start, count };
}
