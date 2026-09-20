import { startMockServer } from '../../src/mock/server.js';

/**
 * @returns {Promise<{server: import('../../src/mock/server.js').MockServer, url: string}>}
 */
export async function withMockServer(options = {}) {
  const server = await startMockServer(options);
  return { server, url: server.baseUrl };
}
