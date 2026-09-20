import { parseArgs } from './args.js';
import { printHelp } from './help.js';
import { urlCommand } from './commands/url.js';
import { runCommand } from './commands/run.js';
import { onceCommand } from './commands/once.js';
import { mockCommand } from './commands/mock.js';
import { selftestCommand } from './commands/selftest.js';
import { reportCommand } from './commands/report.js';
import { MtTesterError } from '../core/errors.js';

/**
 * @param {string[]} argv
 * @returns {Promise<number>}
 */
export async function main(argv) {
  const args = parseArgs(argv);

  if (args.unknownOptions && args.unknownOptions.length > 0) {
    process.stderr.write(`Unknown option(s): ${args.unknownOptions.join(', ')}\n`);
    return 2;
  }

  if (args.version) {
    const pkg = await import('../../package.json', { with: { type: 'json' } });
    process.stdout.write(`${pkg.default.version}\n`);
    return 0;
  }

  if (args.help || (!args.command && !args.url)) {
    printHelp();
    return 0;
  }

  try {
    switch (args.command) {
      case 'url':
        return await urlCommand(args);
      case 'run':
        return await runCommand(args);
      case 'once':
        return await onceCommand(args);
      case 'mock':
        return await mockCommand(args);
      case 'selftest':
        return await selftestCommand(args);
      case 'report':
        return await reportCommand(args);
      default:
        if (args.url) return await urlCommand(args);
        printHelp();
        return 0;
    }
  } catch (err) {
    if (err instanceof MtTesterError) {
      process.stderr.write(`${err.message}\n`);
      return err.exitCode;
    }
    process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
    if (err instanceof Error && err.stack && process.env.DEBUG) {
      process.stderr.write(`${err.stack}\n`);
    }
    return 4;
  }
}
