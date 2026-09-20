import { httpRequest, closeAgent } from '../../core/http-client.js';
import { runChecks, parseCheckSpecs } from '../../checks/index.js';
import { MtTesterError } from '../../core/errors.js';

/**
 * @param {import('../args.js').ParsedArgs} args
 * @returns {Promise<number>}
 */
export async function onceCommand(args) {
  const url = args.url || args._positional?.[0];
  if (!url) {
    process.stderr.write('URL required\n');
    return 2;
  }

  const method = args.method || 'GET';
  const checks = parseCheckSpecs(args.checks || ['status:2xx']);

  try {
    const res = await httpRequest({
      method,
      url,
      headers: args.headers || {},
      body: args.body || null,
      timeoutMs: args.timeout ?? 30_000,
    });

    const checkResults = runChecks(checks, {
      status: res.status,
      headers: res.headers,
      body: res.body,
      durationMs: res.timings.total,
    });

    const output = {
      url,
      method,
      status: res.status,
      durationMs: res.timings.total,
      ttfbMs: res.timings.ttfb,
      bytesReceived: res.bytesReceived,
      bytesSent: res.bytesSent,
      checks: checkResults,
      body: res.body.slice(0, 500),
    };

    process.stdout.write(JSON.stringify(output, null, 2) + '\n');

    const checksFailed = checkResults.some((c) => !c.pass);
    const requestFailed = res.status < 200 || res.status >= 400;

    await closeAgent();
    if (requestFailed) return 1;
    if (checksFailed) return 1;
    return 0;
  } catch (err) {
    process.stderr.write(`Request failed: ${err instanceof Error ? err.message : String(err)}\n`);
    await closeAgent();
    return 1;
  }
}
