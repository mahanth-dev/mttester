import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PlanError, HighLoadError, ThresholdError } from '../../src/core/errors.js';
import { createPlan } from '../../src/core/plan.js';

describe('errors', () => {
  it('plan error exits with code 2', () => {
    const err = new PlanError('invalid');
    assert.equal(err.exitCode, 2);
  });

  it('high load error exits with code 2', () => {
    const err = new HighLoadError('blocked');
    assert.equal(err.exitCode, 2);
  });

  it('threshold error exits with code 1', () => {
    const err = new ThresholdError('failed');
    assert.equal(err.exitCode, 1);
  });

  it('requires bounded run', () => {
    assert.throws(
      () => createPlan({
        vus: 1,
        scenarios: [{ name: 'x', method: 'GET', url: 'http://x' }],
      }),
      PlanError,
    );
  });

  it('blocks high load without confirm', () => {
    assert.throws(
      () => createPlan({
        vus: 1000,
        durationSec: 10,
        confirmHighLoad: false,
        scenarios: [{ name: 'x', method: 'GET', url: 'http://x' }],
      }),
      HighLoadError,
    );
  });

  it('allows high load with confirm', () => {
    const plan = createPlan({
      vus: 1000,
      durationSec: 10,
      confirmHighLoad: true,
      scenarios: [{ name: 'x', method: 'GET', url: 'http://x' }],
    });
    assert.equal(plan.vus, 1000);
  });
});
