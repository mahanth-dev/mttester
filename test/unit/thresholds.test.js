import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  compareThreshold,
  evaluateThresholds,
  parseThreshold,
  allThresholdsPassed,
  isKnownMetric,
} from '../../src/metrics/thresholds.js';
import { MetricsRegistry } from '../../src/metrics/registry.js';
import { createPlan, parseThresholdSpecs } from '../../src/core/plan.js';
import { PlanError } from '../../src/core/errors.js';

describe('thresholds', () => {
  it('compares operators', () => {
    assert.equal(compareThreshold(5, '<', 10), true);
    assert.equal(compareThreshold(10, '<', 10), false);
    assert.equal(compareThreshold(10, '<=', 10), true);
  });

  it('parses threshold specs', () => {
    const t = parseThreshold('http_req_duration.p95<500');
    assert.ok(t);
    assert.equal(t.metric, 'http_req_duration.p95');
    assert.equal(t.op, '<');
    assert.equal(t.value, 500);
  });

  it('evaluates request vs check failures separately', () => {
    const registry = new MetricsRegistry();
    registry.requestsTotal = 100;
    registry.requestsFailed = 10;
    registry.checksTotal = 50;
    registry.checksFailed = 5;
    for (let i = 0; i < 100; i++) registry.httpDuration.observe(100);

    const results = evaluateThresholds(registry, null, 10, [
      { metric: 'http_req_failed', op: '<', value: 0.15 },
      { metric: 'checks.failed', op: '<=', value: 5 },
      { metric: 'checks.failed_rate', op: '<', value: 0.2 },
    ]);

    assert.equal(results[0].pass, true);
    assert.equal(results[1].pass, true);
    assert.equal(results[1].actual, 5);
    assert.equal(results[0].actual, 0.1);
    assert.ok(allThresholdsPassed(results));
  });

  it('fails threshold when exceeded', () => {
    const registry = new MetricsRegistry();
    registry.requestsTotal = 10;
    registry.requestsFailed = 8;
    for (let i = 0; i < 10; i++) registry.httpDuration.observe(1000);

    const results = evaluateThresholds(registry, null, 10, [
      { metric: 'http_req_failed', op: '<', value: 0.5 },
    ]);
    assert.equal(results[0].pass, false);
  });

  it('recognizes dynamic pN metrics', () => {
    assert.equal(isKnownMetric('http_req_duration.p75'), true);
    assert.equal(isKnownMetric('http_req_duraton.p95'), false);
  });

  it('rejects unknown threshold metric at plan time', () => {
    assert.throws(
      () => createPlan({
        vus: 1,
        durationSec: 10,
        scenarios: [{ name: 'x', method: 'GET', url: 'http://x' }],
        thresholds: [{ metric: 'http_req_duraton.p95', op: '<', value: 500 }],
      }),
      PlanError,
    );
  });

  it('rejects malformed threshold spec', () => {
    assert.throws(
      () => parseThresholdSpecs(['garbage']),
      PlanError,
    );
  });
});
