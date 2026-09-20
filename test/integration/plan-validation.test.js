import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { planFromArgs } from '../../src/core/plan.js';
import { PlanError, HighLoadError } from '../../src/core/errors.js';

describe('plan validation integration', () => {
  it('missing duration exits via plan error', () => {
    assert.throws(
      () => planFromArgs({ url: 'http://localhost', vus: 1 }),
      PlanError,
    );
  });

  it('high load gate blocks 1000 VUs', () => {
    assert.throws(
      () => planFromArgs({ url: 'http://localhost', vus: 1000, duration: '10s' }),
      HighLoadError,
    );
  });

  it('high load passes with confirm', () => {
    const plan = planFromArgs({
      url: 'http://localhost',
      vus: 1000,
      duration: '10s',
      confirmHighLoad: true,
    });
    assert.equal(plan.vus, 1000);
  });
});
