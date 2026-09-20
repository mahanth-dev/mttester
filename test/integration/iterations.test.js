import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { startMockServer } from '../../src/mock/server.js';
import { createPlan } from '../../src/core/plan.js';
import { runTest } from '../../src/core/coordinator.js';
import { parseCheckSpecs } from '../../src/checks/index.js';
import { closeAgent } from '../../src/core/http-client.js';

/** @type {import('../../src/mock/server.js').MockServer|null} */
let server = null;

describe('iterations-only integration', () => {
  it('-n 2 -u 1 completes with 2 iterations', async () => {
    server = await startMockServer({ latencyMs: 1 });
    const plan = createPlan({
      name: 'iterations',
      mode: 'closed',
      vus: 1,
      iterations: 2,
      workerCount: 1,
      scenarios: [{
        name: 'health',
        method: 'GET',
        url: `${server.baseUrl}/health`,
        checks: parseCheckSpecs(['status:200']),
      }],
    });

    const result = await runTest({ plan });
    assert.equal(result.metrics.iterations, 2);
    assert.equal(result.metrics.requestsTotal, 2);
  });

  after(async () => {
    if (server) await server.stop();
    await closeAgent();
  });
});
