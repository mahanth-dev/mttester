import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { startMockServer } from '../../src/mock/server.js';
import { loadConfigFile, planFromConfig } from '../../src/core/plan.js';
import { runTest } from '../../src/core/coordinator.js';
import { closeAgent } from '../../src/core/http-client.js';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { writeFile, unlink } from 'node:fs/promises';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** @type {import('../../src/mock/server.js').MockServer|null} */
let server = null;
/** @type {string|null} */
let tempConfig = null;

describe('config run integration', () => {
  it('loads config.json and runs scenarios', async () => {
    server = await startMockServer({ latencyMs: 1 });
    tempConfig = join(__dirname, '../fixtures/runtime-config.json');
    await writeFile(tempConfig, JSON.stringify({
      name: 'config-run',
      vus: 2,
      duration: '2s',
      scenarios: [{
        name: 'health',
        method: 'GET',
        url: `${server.baseUrl}/health`,
        checks: ['status:200'],
      }],
    }));

    const config = await loadConfigFile(tempConfig);
    const plan = planFromConfig(config);
    const result = await runTest({ plan });
    assert.ok(result.metrics.requestsTotal > 0);
  });

  after(async () => {
    if (server) await server.stop();
    await closeAgent();
    if (tempConfig) {
      try { await unlink(tempConfig); } catch { /* ignore */ }
    }
  });
});
