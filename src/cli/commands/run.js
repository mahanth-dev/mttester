import { loadConfigFile, planFromConfig } from '../../core/plan.js';
import { MtTesterError } from '../../core/errors.js';
import { executeLoadTest } from './url.js';

/**
 * Run command — load config from positional path and execute.
 * @param {import('../args.js').ParsedArgs} args
 * @returns {Promise<number>}
 */
export async function runCommand(args) {
  const configPath = args._positional?.[0];
  if (!configPath) {
    process.stderr.write('Config file required: mttester run <config.js|config.json>\n');
    return 2;
  }

  let plan;
  try {
    const config = await loadConfigFile(configPath);
    plan = planFromConfig(config, args);
  } catch (err) {
    if (err instanceof MtTesterError) {
      process.stderr.write(`${err.message}\n`);
      return err.exitCode;
    }
    throw err;
  }

  return executeLoadTest(args, plan);
}
