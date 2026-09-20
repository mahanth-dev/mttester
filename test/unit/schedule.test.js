import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createScheduleState,
  advanceSchedule,
  isRunComplete,
  vuRangeForWorker,
  RateLimiter,
} from '../../src/core/schedule.js';

describe('schedule', () => {
  it('creates initial state from plan', () => {
    const state = createScheduleState({
      vus: 10,
      rate: null,
      stages: [],
      warmupSec: 0,
    });
    assert.equal(state.currentVus, 10);
  });

  it('advances through stages', () => {
    const plan = {
      vus: 1,
      rate: null,
      warmupSec: 0,
      stages: [
        { durationSec: 10, targetVus: 5 },
        { durationSec: 10, targetVus: 20 },
      ],
    };
    let state = createScheduleState(plan);
    state = advanceSchedule(plan, state, 5);
    assert.equal(state.currentVus, 5);
    state = advanceSchedule(plan, state, 15);
    assert.equal(state.currentVus, 20);
  });

  it('detects run completion', () => {
    const plan = { warmupSec: 0, durationSec: 10, stages: [], iterations: null, vus: 1 };
    assert.equal(isRunComplete(plan, 5), false);
    assert.equal(isRunComplete(plan, 10), true);
  });

  it('detects iterations-based completion', () => {
    const plan = { warmupSec: 0, durationSec: null, stages: [], iterations: 2, vus: 1 };
    assert.equal(isRunComplete(plan, 0, 1), false);
    assert.equal(isRunComplete(plan, 0, 2), true);
  });

  it('distributes VUs across workers', () => {
    const ranges = [];
    for (let i = 0; i < 4; i++) {
      ranges.push(vuRangeForWorker(10, 4, i));
    }
    const total = ranges.reduce((s, r) => s + r.count, 0);
    assert.equal(total, 10);
  });

  it('rate limiter enforces spacing', () => {
    const rl = new RateLimiter(10);
    let now = 1000;
    const w1 = rl.acquire(now);
    assert.equal(w1, 0);
    now += 50;
    const w2 = rl.acquire(now);
    assert.ok(w2 > 0);
  });
});
