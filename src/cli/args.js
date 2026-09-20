/**
 * CLI argument parser (machine surface, English only).
 */

/**
 * @typedef {object} ParsedArgs
 * @property {string} [command]
 * @property {string} [url]
 * @property {string} [method]
 * @property {Record<string, string>} [headers]
 * @property {string} [body]
 * @property {number} [vus]
 * @property {number} [rate]
 * @property {string} [duration]
 * @property {number} [iterations]
 * @property {string[]} [stage]
 * @property {string[]} [checks]
 * @property {string[]} [thresholds]
 * @property {string} [warmup]
 * @property {number} [thinkTime]
 * @property {number} [timeout]
 * @property {number} [workers]
 * @property {boolean} [confirmHighLoad]
 * @property {string} [locale]
 * @property {string} [feeder]
 * @property {boolean} [discardWarmup]
 * @property {string} [name]
 * @property {string} [scenarioFile]
 * @property {number} [port]
 * @property {string} [reportFile]
 * @property {string[]} [output]
 * @property {boolean} [help]
 * @property {boolean} [version]
 * @property {boolean} [quiet]
 * @property {boolean} [noColor]
 * @property {string[]} [_positional]
 * @property {string[]} [unknownOptions]
 */

/**
 * @param {string[]} argv
 * @returns {ParsedArgs}
 */
export function parseArgs(argv) {
  /** @type {ParsedArgs} */
  const args = { _positional: [], unknownOptions: [] };
  /** @type {string[]} */
  const rest = [...argv];

  if (rest.length > 0 && !rest[0].startsWith('-')) {
    args.command = rest.shift();
  }

  while (rest.length > 0) {
    const arg = rest.shift();
    if (!arg) break;

    if (arg === '--help' || arg === '-h') {
      args.help = true;
      continue;
    }
    if (arg === '--version' || arg === '-v') {
      args.version = true;
      continue;
    }
    if (arg === '--confirm-high-load') {
      args.confirmHighLoad = true;
      continue;
    }
    if (arg === '--quiet' || arg === '-q') {
      args.quiet = true;
      continue;
    }
    if (arg === '--no-color') {
      args.noColor = true;
      continue;
    }
    if (arg === '--no-discard-warmup') {
      args.discardWarmup = false;
      continue;
    }

    const eqIdx = arg.indexOf('=');
    if (eqIdx > 0 && arg.startsWith('--')) {
      const key = arg.slice(2, eqIdx);
      const val = arg.slice(eqIdx + 1);
      applyOption(args, key, val);
      continue;
    }

    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      if (isFlag(key)) {
        applyOption(args, key, 'true');
      } else if (rest.length > 0 && !rest[0].startsWith('-')) {
        applyOption(args, key, rest.shift() ?? '');
      } else {
        applyOption(args, key, 'true');
      }
      continue;
    }

    if (arg.startsWith('-') && arg.length === 2) {
      const short = arg[1];
      const map = SHORT_OPTS[short];
      if (map) {
        if (needsValue(map) && rest.length > 0 && !rest[0].startsWith('-')) {
          applyOption(args, map, rest.shift() ?? '');
        } else {
          applyOption(args, map, 'true');
        }
      } else {
        args.unknownOptions?.push(arg);
      }
      continue;
    }

    args._positional?.push(arg);
  }

  if (!args.command && args._positional && args._positional.length > 0) {
    args.url = args._positional[0];
  }

  if (args.command === 'url' && args._positional && args._positional.length > 0) {
    args.url = args._positional[0];
  }

  return args;
}

/** @type {Record<string, string>} */
const SHORT_OPTS = {
  u: 'vus',
  d: 'duration',
  r: 'rate',
  n: 'iterations',
  H: 'header',
  c: 'checks',
  t: 'thresholds',
  w: 'warmup',
  o: 'output',
  p: 'port',
};

/**
 * @param {string} key
 * @returns {boolean}
 */
function isFlag(key) {
  return ['confirm-high-load', 'quiet', 'no-color', 'help', 'version'].includes(key);
}

/**
 * @param {string} key
 * @returns {boolean}
 */
function needsValue(key) {
  return !isFlag(key);
}

/**
 * @param {ParsedArgs} args
 * @param {string} key
 * @param {string} val
 */
function applyOption(args, key, val) {
  switch (key) {
    case 'vus':
    case 'u':
      args.vus = parseInt(val, 10);
      break;
    case 'rate':
    case 'r':
      args.rate = parseFloat(val);
      break;
    case 'duration':
    case 'd':
      args.duration = val;
      break;
    case 'iterations':
    case 'n':
      args.iterations = parseInt(val, 10);
      break;
    case 'stage':
      args.stage = args.stage || [];
      args.stage.push(val);
      break;
    case 'checks':
    case 'c':
      args.checks = args.checks || [];
      args.checks.push(val);
      break;
    case 'threshold':
    case 'thresholds':
    case 't':
      args.thresholds = args.thresholds || [];
      args.thresholds.push(val);
      break;
    case 'warmup':
    case 'w':
      args.warmup = val;
      break;
    case 'think':
      args.thinkTime = parseInt(val, 10);
      break;
    case 'timeout':
      args.timeout = parseInt(val, 10);
      break;
    case 'workers':
      args.workers = parseInt(val, 10);
      break;
    case 'locale':
    case 'lang':
      args.locale = val;
      break;
    case 'feeder':
      args.feeder = val;
      break;
    case 'name':
      args.name = val;
      break;
    case 'method':
    case 'X':
      args.method = val.toUpperCase();
      break;
    case 'header':
    case 'H': {
      args.headers = args.headers || {};
      const sep = val.indexOf(':');
      if (sep > 0) {
        args.headers[val.slice(0, sep).trim()] = val.slice(sep + 1).trim();
      }
      break;
    }
    case 'body':
      args.body = val;
      break;
    case 'url':
      args.url = val;
      break;
    case 'port':
    case 'p':
      args.port = parseInt(val, 10);
      break;
    case 'output':
    case 'o':
      args.output = args.output || [];
      args.output.push(val);
      break;
    case 'report':
      args.reportFile = val;
      break;
    case 'scenario':
    case 'f':
      args.scenarioFile = val;
      break;
    default:
      args.unknownOptions = args.unknownOptions || [];
      args.unknownOptions.push(`--${key}`);
      break;
  }
}
