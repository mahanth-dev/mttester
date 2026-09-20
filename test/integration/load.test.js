import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { startMockServer } from '../../src/mock/server.js';
import { createPlan } from '../../src/core/plan.js';
import { runTest } from '../../src/core/coordinator.js';
import { parseCheckSpecs } from '../../src/checks/index.js';
import { closeAgent } from '../../src/core/http-client.js';
import { writeJsonReport, buildJsonReport } from '../../src/report/json.js';
import { writeCsvReport } from '../../src/report/csv.js';
import { writeHtmlReport } from '../../src/report/html.js';
import { unlink } from 'node:fs/promises';

/** @type {import('../../src/mock/server.js').MockServer|null} */
let server = null;

describe('integration load test', () => {
  it('runs url load test against mock with 50 VUs', async () => {
    server = await startMockServer({ latencyMs: 1 });
    const plan = createPlan({
      name: 'integration',
      mode: 'closed',
      vus: 50,
      durationSec: 3,
      scenarios: [{
        name: 'root',
        method: 'GET',
        url: `${server.baseUrl}/health`,
        checks: parseCheckSpecs(['status:200']),
      }],
    });

    const result = await runTest({ plan });
    assert.ok(result.metrics.requestsTotal > 0, 'should have requests');
    assert.ok(result.metrics.requestsFailed < result.metrics.requestsTotal, 'most should succeed');
    assert.equal(result.metrics.checksFailed, 0);
  });

  it('writes report artifacts', async () => {
    server = server || await startMockServer();
    const plan = createPlan({
      vus: 5,
      durationSec: 2,
      scenarios: [{ name: 'x', method: 'GET', url: `${server.baseUrl}/json`, checks: parseCheckSpecs(['json']) }],
    });
    const result = await runTest({ plan });
    const report = buildJsonReport({ plan, metrics: result.metrics, timeSeries: result.timeSeries, durationSec: result.durationSec });
    assert.equal(report.schemaVersion, 1);

    await writeJsonReport(report, 'report.json');
    await writeCsvReport(report, 'report.csv');
    await writeHtmlReport(report, 'report.html');

    const { readFile } = await import('node:fs/promises');
    const json = JSON.parse(await readFile('report.json', 'utf8'));
    assert.ok(json.metrics.http_reqs.count > 0);
    const html = await readFile('report.html', 'utf8');
    assert.ok(html.includes('mttester report'));
  });

  after(async () => {
    if (server) await server.stop();
    await closeAgent();
    for (const f of ['report.json', 'report.csv', 'report.html']) {
      try { await unlink(f); } catch { /* ignore */ }
    }
  });
});
