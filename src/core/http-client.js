import { request, Agent } from 'undici';

/** @type {Agent|null} */
let sharedAgent = null;

/**
 * @returns {Agent}
 */
export function getAgent() {
  if (!sharedAgent) {
    sharedAgent = new Agent({
      connections: 256,
      pipelining: 1,
      keepAliveTimeout: 30_000,
      keepAliveMaxTimeout: 60_000,
    });
  }
  return sharedAgent;
}

/**
 * @param {object} options
 * @param {string} options.method
 * @param {string} options.url
 * @param {Record<string, string>} [options.headers]
 * @param {string|Buffer|null} [options.body]
 * @param {number} [options.timeoutMs=30000]
 * @returns {Promise<{status: number, headers: Record<string, string>, body: string, timings: {start: number, dns: number, connect: number, ttfb: number, total: number}, bytesReceived: number, bytesSent: number}>}
 */
export async function httpRequest(options) {
  const start = performance.now();
  const method = options.method.toUpperCase();
  const headers = options.headers || {};
  const body = options.body ?? null;
  const timeoutMs = options.timeoutMs ?? 30_000;

  let bytesSent = 0;
  if (body) {
    bytesSent = typeof body === 'string' ? Buffer.byteLength(body) : body.length;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let connectTime = start;
  let ttfbTime = start;

  try {
    const res = await request(options.url, {
      method,
      headers,
      body: body ?? undefined,
      dispatcher: getAgent(),
      signal: controller.signal,
    });

    connectTime = performance.now();
    ttfbTime = connectTime;

    const chunks = [];
    for await (const chunk of res.body) {
      if (ttfbTime === connectTime) ttfbTime = performance.now();
      chunks.push(chunk);
    }

    const end = performance.now();
    const bodyBuffer = Buffer.concat(chunks);
    /** @type {Record<string, string>} */
    const resHeaders = {};
    for (const [k, v] of Object.entries(res.headers)) {
      resHeaders[k] = Array.isArray(v) ? v.join(', ') : String(v);
    }

    return {
      status: res.statusCode,
      headers: resHeaders,
      body: bodyBuffer.toString('utf8'),
      timings: {
        start,
        dns: connectTime - start,
        connect: connectTime - start,
        ttfb: ttfbTime - start,
        total: end - start,
      },
      bytesReceived: bodyBuffer.length,
      bytesSent,
    };
  } catch (err) {
    const end = performance.now();
    throw Object.assign(err instanceof Error ? err : new Error(String(err)), {
      timings: {
        start,
        dns: connectTime - start,
        connect: connectTime - start,
        ttfb: end - start,
        total: end - start,
      },
      bytesSent,
      bytesReceived: 0,
    });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Close shared agent connections.
 * @returns {Promise<void>}
 */
export async function closeAgent() {
  if (sharedAgent) {
    await sharedAgent.close();
    sharedAgent = null;
  }
}
