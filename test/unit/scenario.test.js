import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { orderedSteps, applyExtractRules } from '../../src/core/scenario.js';

describe('scenario', () => {
  it('orders setup, steps, and teardown', () => {
    const steps = orderedSteps({
      name: 'flow',
      method: 'GET',
      url: 'http://x',
      setup: { method: 'POST', url: 'http://x/setup' },
      steps: [{ method: 'GET', url: 'http://x/main' }],
      teardown: { method: 'DELETE', url: 'http://x/teardown' },
    });
    assert.equal(steps.length, 3);
    assert.equal(steps[0].name, 'setup');
    assert.equal(steps[2].name, 'teardown');
  });

  it('extracts json pointer values into vars', () => {
    /** @type {Record<string, unknown>} */
    const vars = {};
    applyExtractRules(
      { token: 'json:/access_token' },
      { status: 200, headers: {}, body: JSON.stringify({ access_token: 'abc123' }) },
      vars,
    );
    assert.equal(vars.token, 'abc123');
  });

  it('extracts header values into vars', () => {
    /** @type {Record<string, unknown>} */
    const vars = {};
    applyExtractRules(
      { session: 'header:X-Session' },
      { status: 200, headers: { 'X-Session': 'sess-1' }, body: '' },
      vars,
    );
    assert.equal(vars.session, 'sess-1');
  });
});
