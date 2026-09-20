import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MetricsRegistry } from '../../src/metrics/registry.js';

describe('registry request vs check separation', () => {
  it('HTTP 200 with failing check does not inflate requestsFailed', () => {
    const registry = new MetricsRegistry();
    registry.recordRequest({
      scenario: 'test',
      method: 'GET',
      url: 'http://x',
      status: 200,
      durationMs: 10,
      ttfbMs: 5,
      ok: true,
      checksPassed: false,
      error: null,
      bytesReceived: 100,
      bytesSent: 0,
      checks: [{ name: 'status is 500', pass: false, message: 'expected 500' }],
      timestamp: Date.now(),
    });

    assert.equal(registry.requestsFailed, 0);
    assert.equal(registry.checksFailed, 1);
    assert.equal(registry.requestsTotal, 1);
  });

  it('transport failure increments requestsFailed', () => {
    const registry = new MetricsRegistry();
    registry.recordRequest({
      scenario: 'test',
      method: 'GET',
      url: 'http://x',
      status: 0,
      durationMs: 10,
      ttfbMs: 0,
      ok: false,
      checksPassed: false,
      error: 'ECONNREFUSED',
      bytesReceived: 0,
      bytesSent: 0,
      checks: [],
      timestamp: Date.now(),
    });

    assert.equal(registry.requestsFailed, 1);
    assert.equal(registry.checksFailed, 0);
  });
});
