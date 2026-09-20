import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runChecks, parseCheckSpecs } from '../../src/checks/index.js';

describe('checks', () => {
  it('parses check specs', () => {
    const checks = parseCheckSpecs(['status:200', 'status:2xx', 'body:ok']);
    assert.equal(checks.length, 3);
    assert.equal(checks[0].type, 'status');
    assert.equal(checks[1].type, 'status_range');
  });

  it('evaluates status check', () => {
    const checks = runChecks(
      [{ name: 'status 200', type: 'status', expected: 200 }],
      { status: 200, headers: {}, body: '', durationMs: 10 },
    );
    assert.equal(checks[0].pass, true);
  });

  it('evaluates status range', () => {
    const checks = runChecks(
      [{ name: '2xx', type: 'status_range', min: 200, max: 299 }],
      { status: 404, headers: {}, body: '', durationMs: 10 },
    );
    assert.equal(checks[0].pass, false);
  });

  it('evaluates body contains', () => {
    const checks = runChecks(
      [{ name: 'body', type: 'body_contains', expected: 'hello' }],
      { status: 200, headers: {}, body: 'hello world', durationMs: 10 },
    );
    assert.equal(checks[0].pass, true);
  });

  it('distinguishes check failure from request context', () => {
    const checks = runChecks(
      parseCheckSpecs(['status:200']),
      { status: 500, headers: {}, body: 'error', durationMs: 10 },
    );
    assert.equal(checks[0].pass, false);
  });
});
