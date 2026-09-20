import { startMockServer } from '../../mock/server.js';
import { createPlan } from '../../core/plan.js';
import { runTest, assertThresholds } from '../../core/coordinator.js';
import { Histogram } from '../../metrics/histogram.js';
import { evaluateThresholds } from '../../metrics/thresholds.js';
import { MetricsRegistry } from '../../metrics/registry.js';
import { parseCheckSpecs } from '../../checks/index.js';
import { httpRequest, closeAgent } from '../../core/http-client.js';
import { t } from '../../i18n/index.js';

/**
 * @param {import('../args.js').ParsedArgs} args
 * @returns {Promise<number>}
 */
export async function selftestCommand(args) {
  const locale = args.locale ?? 'en';
  const strings = t(locale);
  process.stderr.write(`${strings.selftest.running}\n`);

  /** @type {string[]} */
  const failures = [];

  // 1. Histogram tests inline
  try {
    testHistogram();
  } catch (err) {
    failures.push(`histogram: ${err instanceof Error ? err.message : String(err)}`);
  }

  // 2. Threshold evaluation
  try {
    testThresholds();
  } catch (err) {
    failures.push(`thresholds: ${err instanceof Error ? err.message : String(err)}`);
  }

  // 3. Mock server + load test
  let server;
  try {
    server = await startMockServer({ latencyMs: 1 });
    const plan = createPlan({
      name: 'selftest',
      mode: 'closed',
      vus: 5,
      durationSec: 2,
      confirmHighLoad: false,
      scenarios: [{
        name: 'health',
        method: 'GET',
        url: `${server.baseUrl}/health`,
        checks: parseCheckSpecs(['status:200', 'json']),
      }],
      thresholds: [{ metric: 'http_req_failed', op: '<', value: 0.1 }],
    });

    const result = await runTest({ plan, liveView: false });
    assertThresholds(result);

    if (result.metrics.requestsTotal < 1) {
      failures.push('load test: no requests recorded');
    }
  } catch (err) {
    failures.push(`integration: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    if (server) await server.stop();
    await closeAgent();
  }

  // 4. Single request
  try {
    server = await startMockServer();
    const res = await httpRequest({ method: 'GET', url: `${server.baseUrl}/json` });
    if (res.status !== 200) failures.push(`once: status ${res.status}`);
    await server.stop();
    await closeAgent();
  } catch (err) {
    failures.push(`once: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (failures.length > 0) {
    process.stderr.write(`${strings.selftest.failed}\n`);
    for (const f of failures) process.stderr.write(`  ✗ ${f}\n`);
    return 1;
  }

  process.stderr.write(`${strings.selftest.passed}\n`);
  return 0;
}

function testHistogram() {
  const h = new Histogram();
  const values = [1, 2, 3, 4, 5, 10, 20, 50, 100, 200, 500, 1000];
  for (const v of values) h.observe(v);

  const p50 = h.quantile(0.5);
  if (p50 <= 0) throw new Error('p50 should be > 0');

  const h2 = new Histogram();
  for (const v of [100, 200, 300]) h2.observe(v);
  const merged = Histogram.fromJSON(h.toJSON());
  merged.merge(h2);
  if (merged.count !== h.count + h2.count) throw new Error('merge count mismatch');
}

function testThresholds() {
  const registry = new MetricsRegistry();
  registry.requestsTotal = 100;
  registry.requestsFailed = 5;
  for (let i = 0; i < 100; i++) registry.httpDuration.observe(50 + i);

  const results = evaluateThresholds(registry, null, 10, [
    { metric: 'http_req_failed', op: '<', value: 0.1 },
    { metric: 'http_req_duration.p95', op: '<', value: 500 },
  ]);

  const failedReq = results.find((r) => r.metric === 'http_req_failed');
  if (!failedReq?.pass) throw new Error('http_req_failed threshold should pass');

  registry.checksTotal = 10;
  registry.checksFailed = 3;
  const checkResults = evaluateThresholds(registry, null, 10, [
    { metric: 'checks.failed', op: '==', value: 3 },
  ]);
  if (!checkResults[0]?.pass) throw new Error('checks.failed should be 3');
}
