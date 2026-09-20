import { startMockServer } from '../../mock/server.js';
import { t, format } from '../../i18n/index.js';

/**
 * @param {import('../args.js').ParsedArgs} args
 * @returns {Promise<number>}
 */
export async function mockCommand(args) {
  const locale = args.locale ?? 'en';
  const strings = t(locale);
  const port = args.port ?? 0;

  const server = await startMockServer({ port });
  process.stderr.write(format(strings.mock.starting, { url: server.baseUrl }) + '\n');
  process.stdout.write(`${server.baseUrl}\n`);

  const shutdown = async () => {
    await server.stop();
    process.stderr.write(`${strings.mock.stopped}\n`);
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  await new Promise(() => {});
  return 0;
}
