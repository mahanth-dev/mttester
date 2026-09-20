import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { startMockServer } from '../../src/mock/server.js';
import { createPlan } from '../../src/core/plan.js';
import { runTest } from '../../src/core/coordinator.js';
import { parseCheckSpecs } from '../../src/checks/index.js';
import { closeAgent } from '../../src/core/http-client.js';

/** @type {import('../../src/mock/server.js').MockServer|null} */
let server = null;

describe('open-loop integration', () => {
  it('-r 20 -d 4s --workers 4 lands within ±20% of 80 total requests', async () => {
    server = await startMockServer({ latencyMs: 1 });
    const plan = createPlan({
      name: 'open-loop',
      mode: 'open',
      vus: 4,
      rate: 20,
      durationSec: 4,
      workerCount: 4,
      scenarios: [{
        name: 'health',
        method: 'GET',
        url: `${server.baseUrl}/health`,
        checks: parseCheckSpecs(['status:200']),
      }],
    });

    const result = await runTest({ plan });
    const total = result.metrics.requestsTotal;
    assert.ok(total >= 64 && total <= 96, `expected ~80 requests, got ${total}`);
  });

  after(async () => {
    if (server) await server.stop();
    await closeAgent();
  });
});
