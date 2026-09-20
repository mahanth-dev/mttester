/**
 * Live terminal view during load test (human surface).
 */

/**
 * @param {object} options
 * @param {boolean} [options.enabled=true]
 * @param {boolean} [options.noColor=false]
 */
export function createLiveView(options = {}) {
  const enabled = options.enabled !== false;
  const noColor = options.noColor ?? false;
  let lastLine = '';
  let lastWrite = 0;

  /**
   * @param {import('../core/coordinator.js').LiveState} state
   */
  function update(state) {
    if (!enabled) return;
    const now = Date.now();
    if (now - lastWrite < 200) return;
    lastWrite = now;

    const line = formatLine(state, noColor);
    if (line === lastLine) return;
    lastLine = line;

    if (process.stdout.isTTY) {
      process.stdout.write(`\r\x1b[2K${line}`);
    } else if (now - lastWrite >= 1000) {
      process.stdout.write(`${line}\n`);
    }
  }

  function finish() {
    if (enabled && process.stdout.isTTY) {
      process.stdout.write('\n');
    }
  }

  return { update, finish };
}

/**
 * @param {import('../core/coordinator.js').LiveState} state
 * @param {boolean} noColor
 * @returns {string}
 */
function formatLine(state, noColor) {
  /** @type {(s: string, color?: string) => string} */
  const c = noColor ? (s) => s : colorize;
  const warmup = state.inWarmup ? c(' [warmup]', 'yellow') : '';
  const sat = state.workerSaturated ? c(' [SATURATED]', 'red') : '';
  return [
    c(`${state.elapsedSec.toFixed(1)}s`, 'cyan'),
    `VUs:${state.activeVus}`,
    `RPS:${state.rps.toFixed(1)}`,
    `Reqs:${state.requestsTotal}`,
    `Fail:${state.requestsFailed}`,
    `Avg:${state.avgMs.toFixed(1)}ms`,
  ].join(' ') + warmup + sat;
}

/**
 * @param {string} text
 * @param {string} [color='reset']
 * @returns {string}
 */
function colorize(text, color = 'reset') {
  /** @type {Record<string, string>} */
  const codes = {
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    cyan: '\x1b[36m',
    reset: '\x1b[0m',
  };
  return `${codes[color] || ''}${text}${codes.reset}`;
}
