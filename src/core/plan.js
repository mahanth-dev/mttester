import { availableParallelism, cpus } from 'node:os';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PlanError, HighLoadError } from './errors.js';
import { parseThreshold, validateThresholdMetric } from '../metrics/thresholds.js';
import { parseCheckSpecs } from '../checks/index.js';
import { joinUrl } from './browser.js';

/** @typedef {'closed'|'open'} LoopMode */

/**
 * @typedef {object} StepDef
 * @property {string} [name]
 * @property {string} method
 * @property {string} url
 * @property {Record<string, string>} [headers]
 * @property {string|null} [body]
 * @property {import('../checks/index.js').CheckDefinition[]} [checks]
 * @property {Record<string, string>} [extract]
 */

/**
 * @typedef {object} Stage
 * @property {number} durationSec
 * @property {number} [targetVus]
 * @property {number} [targetRate]
 */

/**
 * @typedef {object} ScenarioDef
 * @property {string} name
 * @property {string} [method]
 * @property {string} [url]
 * @property {Record<string, string>} [headers]
 * @property {string|null} [body]
 * @property {number} [weight]
 * @property {import('../checks/index.js').CheckDefinition[]} [checks]
 * @property {number} [thinkTimeMs]
 * @property {StepDef|null} [setup]
 * @property {StepDef[]} [steps]
 * @property {StepDef|null} [teardown]
 * @property {Record<string, string>} [extract]
 */

/**
 * @typedef {object} TestPlan
 * @property {string} name
 * @property {LoopMode} mode
 * @property {number} vus
 * @property {number|null} rate
 * @property {number|null} durationSec
 * @property {number|null} iterations
 * @property {Stage[]} stages
 * @property {ScenarioDef[]} scenarios
 * @property {import('../metrics/thresholds.js').Threshold[]} thresholds
 * @property {number} warmupSec
 * @property {number} thinkTimeMs
 * @property {number} thinkTimeMaxMs
 * @property {number} stepThinkMinMs
 * @property {number} stepThinkMaxMs
 * @property {boolean} realistic
 * @property {boolean} browserHeaders
 * @property {boolean} cookieJar
 * @property {number} staggerStartMs
 * @property {number} timeoutMs
 * @property {number} workerCount
 * @property {boolean} confirmHighLoad
 * @property {string} locale
 * @property {string|null} feederPath
 * @property {boolean} discardWarmup
 */

/**
 * @typedef {Omit<TestPlan, 'confirmHighLoad'|'locale'>} SerializedPlan
 */

export const HIGH_LOAD_VU_LIMIT = 500;
export const HIGH_LOAD_RATE_LIMIT = 2000;

/**
 * @param {Partial<TestPlan>} input
 * @returns {TestPlan}
 */
export function createPlan(input) {
  const realistic = Boolean(input.realistic);
  /** @type {TestPlan} */
  const plan = {
    name: input.name ?? 'load-test',
    mode: input.mode ?? 'closed',
    vus: input.vus ?? 1,
    rate: input.rate ?? null,
    durationSec: input.durationSec ?? null,
    iterations: input.iterations ?? null,
    stages: input.stages ?? [],
    scenarios: normalizeScenarios(input.scenarios ?? []),
    thresholds: input.thresholds ?? [],
    warmupSec: input.warmupSec ?? 0,
    thinkTimeMs: input.thinkTimeMs ?? (realistic ? 1500 : 0),
    thinkTimeMaxMs: input.thinkTimeMaxMs ?? (realistic ? 5000 : (input.thinkTimeMs ?? 0)),
    stepThinkMinMs: input.stepThinkMinMs ?? (realistic ? 400 : 0),
    stepThinkMaxMs: input.stepThinkMaxMs ?? (realistic ? 1800 : 0),
    realistic,
    browserHeaders: input.browserHeaders ?? realistic,
    cookieJar: input.cookieJar ?? realistic,
    staggerStartMs: input.staggerStartMs ?? (realistic ? 8_000 : 0),
    timeoutMs: input.timeoutMs ?? 30_000,
    workerCount: input.workerCount ?? Math.min(Math.max(1, (input.vus ?? 1)), navigatorHardware()),
    confirmHighLoad: input.confirmHighLoad ?? false,
    locale: input.locale ?? 'en',
    feederPath: input.feederPath ?? null,
    discardWarmup: input.discardWarmup ?? true,
  };

  if (realistic && plan.mode === 'open') {
    throw new PlanError('Realistic user profile requires closed-loop mode (VUs), not open-loop rate');
  }

  validatePlan(plan);
  validateThresholds(plan.thresholds);
  checkHighLoadGate(plan);
  return plan;
}

/**
 * @param {ScenarioDef[]} scenarios
 * @returns {ScenarioDef[]}
 */
function normalizeScenarios(scenarios) {
  return scenarios.map((sc) => {
    if (sc.steps && sc.steps.length > 0) return sc;
    if (!sc.method || !sc.url) {
      throw new PlanError(`Scenario "${sc.name}" requires method and url, or a steps array`);
    }
    return sc;
  });
}

/**
 * @param {import('../metrics/thresholds.js').Threshold[]} thresholds
 */
export function validateThresholds(thresholds) {
  for (const t of thresholds) {
    validateThresholdMetric(t);
  }
}

/**
 * @returns {number}
 */
function navigatorHardware() {
  if (typeof availableParallelism === 'function') return availableParallelism();
  return cpus().length;
}

/**
 * @param {TestPlan} plan
 */
export function validatePlan(plan) {
  const hasDuration = plan.durationSec !== null && plan.durationSec > 0;
  const hasIterations = plan.iterations !== null && plan.iterations > 0;
  const hasStages = plan.stages.length > 0;

  if (!hasDuration && !hasIterations && !hasStages) {
    throw new PlanError(
      'A bounded run is required: specify --duration, --iterations, or --stage',
    );
  }

  if (plan.vus < 1) {
    throw new PlanError('Virtual users (--vus) must be at least 1');
  }

  if (plan.mode === 'open' && !plan.rate && plan.stages.every((s) => !s.targetRate)) {
    throw new PlanError('Open-loop mode requires --rate or stage targetRate');
  }

  if (plan.scenarios.length === 0) {
    throw new PlanError('At least one scenario or URL is required');
  }
}

/**
 * @param {TestPlan} plan
 */
export function checkHighLoadGate(plan) {
  const peakVus = plan.stages.length > 0
    ? Math.max(plan.vus, ...plan.stages.map((s) => s.targetVus ?? plan.vus))
    : plan.vus;

  const peakRate = plan.rate ?? (plan.stages.length > 0
    ? Math.max(0, ...plan.stages.map((s) => s.targetRate ?? 0))
    : 0);

  const highVus = peakVus > HIGH_LOAD_VU_LIMIT;
  const highRate = peakRate > HIGH_LOAD_RATE_LIMIT;

  if ((highVus || highRate) && !plan.confirmHighLoad) {
    const parts = [];
    if (highVus) parts.push(`${peakVus} VUs (limit ${HIGH_LOAD_VU_LIMIT})`);
    if (highRate) parts.push(`${peakRate} req/s (limit ${HIGH_LOAD_RATE_LIMIT})`);
    throw new HighLoadError(
      `High-load gate: ${parts.join(', ')}. Re-run with --confirm-high-load to proceed.`,
    );
  }
}

/**
 * Build a multi-page journey scenario from a base URL and path list.
 * @param {object} opts
 * @param {string} opts.baseUrl
 * @param {string[]} opts.paths
 * @param {string} [opts.method='GET']
 * @param {Record<string, string>} [opts.headers]
 * @param {string|null} [opts.body]
 * @param {import('../checks/index.js').CheckDefinition[]} [opts.checks]
 * @returns {ScenarioDef}
 */
export function buildJourneyScenario({
  baseUrl,
  paths,
  method = 'GET',
  headers = {},
  body = null,
  checks = parseCheckSpecs(['status:2xx']),
}) {
  const cleaned = paths.map((p) => String(p).trim()).filter(Boolean);
  const list = cleaned.length > 0 ? cleaned : ['/'];
  return {
    name: 'user-journey',
    weight: 1,
    steps: list.map((path, i) => ({
      name: `step-${i + 1}`,
      method: i === 0 ? method : 'GET',
      url: joinUrl(baseUrl, path),
      headers,
      body: i === 0 ? body : null,
      checks,
    })),
  };
}

/**
 * @param {TestPlan} plan
 * @returns {SerializedPlan}
 */
export function serializePlan(plan) {
  const { confirmHighLoad, locale, ...rest } = plan;
  return rest;
}

/**
 * @param {string[]} specs
 * @returns {import('../metrics/thresholds.js').Threshold[]}
 */
export function parseThresholdSpecs(specs) {
  /** @type {import('../metrics/thresholds.js').Threshold[]} */
  const thresholds = [];
  for (const spec of specs) {
    const parsed = parseThreshold(spec);
    if (!parsed) {
      throw new PlanError(`Invalid threshold spec: ${spec}`);
    }
    thresholds.push(parsed);
  }
  return thresholds;
}

/**
 * @param {import('../cli/args.js').ParsedArgs} args parsed CLI args
 * @returns {TestPlan}
 */
export function planFromArgs(args) {
  /** @type {ScenarioDef[]} */
  const scenarios = [];

  if (args.url) {
    scenarios.push({
      name: 'default',
      method: args.method || 'GET',
      url: args.url,
      headers: args.headers || {},
      body: args.body || null,
      weight: 1,
      checks: parseCheckSpecs(args.checks || ['status:2xx']),
    });
  }

  if (args.scenarioFile) {
    throw new PlanError('Scenario files not yet loaded in this path — use --url');
  }

  const thresholds = parseThresholdSpecs(args.thresholds || []);
  const mode = args.rate ? 'open' : 'closed';
  const rate = args.rate ?? null;
  const workerHint = args.workers ?? 1;
  const vus = args.vus ?? (mode === 'open' && rate
    ? Math.max(Math.ceil(rate), workerHint)
    : 1);
  const realistic = Boolean(args.realistic);

  if (realistic && args.url && args.journey?.length) {
    scenarios.length = 0;
    scenarios.push(buildJourneyScenario({
      baseUrl: args.url,
      paths: args.journey,
      method: args.method || 'GET',
      headers: args.headers || {},
      body: args.body || null,
      checks: parseCheckSpecs(args.checks || ['status:2xx']),
    }));
  }

  return createPlan({
    name: args.name || (realistic ? 'realistic-users' : 'load-test'),
    mode: realistic ? 'closed' : mode,
    vus,
    rate: realistic ? null : rate,
    durationSec: parseDuration(args.duration),
    iterations: args.iterations ?? null,
    stages: parseStages(args.stage || []),
    scenarios,
    thresholds,
    warmupSec: parseDuration(args.warmup) ?? 0,
    thinkTimeMs: args.thinkTime ?? undefined,
    thinkTimeMaxMs: args.thinkTimeMax ?? undefined,
    realistic,
    browserHeaders: realistic || undefined,
    cookieJar: realistic || undefined,
    timeoutMs: args.timeout ?? 30_000,
    workerCount: args.workers ?? undefined,
    confirmHighLoad: args.confirmHighLoad ?? false,
    locale: args.locale ?? 'en',
    feederPath: args.feeder ?? null,
    discardWarmup: args.discardWarmup !== false,
  });
}

/**
 * @param {string} configPath
 * @returns {Promise<Record<string, unknown>>}
 */
export async function loadConfigFile(configPath) {
  const absPath = resolve(configPath);
  if (absPath.endsWith('.json')) {
    const content = await readFile(absPath, 'utf8');
    return /** @type {Record<string, unknown>} */ (JSON.parse(content));
  }
  if (absPath.endsWith('.js') || absPath.endsWith('.mjs')) {
    const mod = await import(pathToFileURL(absPath).href);
    return /** @type {Record<string, unknown>} */ (mod.default ?? mod);
  }
  throw new PlanError(`Unsupported config format: ${configPath} (use .json or .js)`);
}

/**
 * @param {Record<string, unknown>} config
 * @param {import('../cli/args.js').ParsedArgs} [cliArgs]
 * @returns {TestPlan}
 */
export function planFromConfig(config, cliArgs = {}) {
  /** @type {ScenarioDef[]} */
  const scenarios = [];

  if (Array.isArray(config.scenarios)) {
    for (const sc of config.scenarios) {
      /** @type {ScenarioDef} */
      const scenario = /** @type {ScenarioDef} */ (/** @type {unknown} */ (sc));
      if (scenario.checks && typeof scenario.checks[0] === 'string') {
        scenario.checks = parseCheckSpecs(/** @type {string[]} */ (/** @type {unknown} */ (scenario.checks)));
      }
      scenarios.push(scenario);
    }
  }

  const thresholdSpecs = /** @type {string[]|undefined} */ (
    cliArgs.thresholds ?? /** @type {string[]|undefined} */ (config.thresholds)
  );
  const thresholds = parseThresholdSpecs(thresholdSpecs || []);

  const mode = cliArgs.rate || config.rate ? 'open' : (config.mode ?? 'closed');
  const rate = cliArgs.rate ?? /** @type {number|null|undefined} */ (config.rate) ?? null;
  const workerHint = cliArgs.workers ?? /** @type {number|undefined} */ (config.workers) ?? 1;
  const explicitVus = cliArgs.vus ?? /** @type {number|undefined} */ (config.vus);
  const vus = explicitVus ?? (mode === 'open' && rate
    ? Math.max(Math.ceil(rate), workerHint)
    : 1);

  return createPlan({
    name: /** @type {string} */ (cliArgs.name ?? config.name ?? 'load-test'),
    mode: /** @type {LoopMode} */ (mode),
    vus,
    rate,
    durationSec: cliArgs.duration
      ? parseDuration(cliArgs.duration)
      : (config.duration
        ? parseDuration(String(config.duration))
        : /** @type {number|null|undefined} */ (config.durationSec) ?? null),
    iterations: cliArgs.iterations ?? /** @type {number|null|undefined} */ (config.iterations) ?? null,
    stages: cliArgs.stage?.length
      ? parseStages(cliArgs.stage)
      : parseConfigStages(/** @type {unknown[]} */ (config.stages ?? [])),
    scenarios,
    thresholds,
    warmupSec: cliArgs.warmup
      ? (parseDuration(cliArgs.warmup) ?? 0)
      : (config.warmup
        ? (parseDuration(String(config.warmup)) ?? 0)
        : /** @type {number|undefined} */ (config.warmupSec) ?? 0),
    thinkTimeMs: cliArgs.thinkTime ?? /** @type {number|undefined} */ (config.thinkTimeMs) ?? 0,
    timeoutMs: cliArgs.timeout ?? /** @type {number|undefined} */ (config.timeoutMs) ?? 30_000,
    workerCount: cliArgs.workers ?? /** @type {number|undefined} */ (config.workers) ?? undefined,
    confirmHighLoad: cliArgs.confirmHighLoad ?? /** @type {boolean|undefined} */ (config.confirmHighLoad) ?? false,
    locale: cliArgs.locale ?? /** @type {string|undefined} */ (config.locale) ?? 'en',
    feederPath: cliArgs.feeder ?? /** @type {string|null|undefined} */ (config.feeder) ?? null,
    discardWarmup: cliArgs.discardWarmup !== false,
  });
}

/**
 * @param {unknown[]} stageSpecs
 * @returns {Stage[]}
 */
function parseConfigStages(stageSpecs) {
  return stageSpecs.map((spec) => {
    if (typeof spec === 'string') return parseStages([spec])[0];
    /** @type {Stage} */
    const stage = /** @type {Stage} */ (spec);
    if (stage.durationSec === undefined && /** @type {{duration?: string}} */ (spec).duration) {
      stage.durationSec = parseDuration(String(/** @type {{duration: string}} */ (spec).duration)) ?? 0;
    }
    return stage;
  });
}

/**
 * @param {string|undefined} dur
 * @returns {number|null}
 */
export function parseDuration(dur) {
  if (!dur) return null;
  const match = String(dur).match(/^(\d+(?:\.\d+)?)(ms|s|m|h)?$/);
  if (!match) throw new PlanError(`Invalid duration: ${dur}`);
  const val = parseFloat(match[1]);
  const unit = match[2] || 's';
  switch (unit) {
    case 'ms': return val / 1000;
    case 's': return val;
    case 'm': return val * 60;
    case 'h': return val * 3600;
    default: return val;
  }
}

/**
 * @param {string[]} stageSpecs e.g. "30s:10vus", "1m:50vus", "30s:100rps"
 * @returns {Stage[]}
 */
export function parseStages(stageSpecs) {
  return stageSpecs.map((spec) => {
    const [durPart, targetPart] = spec.split(':');
    if (!durPart || !targetPart) {
      throw new PlanError(`Invalid stage spec: ${spec}`);
    }
    /** @type {Stage} */
    const stage = { durationSec: parseDuration(durPart) ?? 0 };
    const vusMatch = targetPart.match(/^(\d+)vus$/i);
    const rateMatch = targetPart.match(/^(\d+)rps$/i);
    if (vusMatch) stage.targetVus = parseInt(vusMatch[1], 10);
    else if (rateMatch) stage.targetRate = parseInt(rateMatch[1], 10);
    else throw new PlanError(`Invalid stage target: ${targetPart}`);
    return stage;
  });
}

/**
 * @param {TestPlan} plan
 * @returns {number} total planned duration in seconds; Infinity when iterations-only
 */
export function totalDurationSec(plan) {
  if (plan.stages.length > 0) {
    return plan.stages.reduce((sum, s) => sum + s.durationSec, 0) + plan.warmupSec;
  }
  if (plan.durationSec !== null && plan.durationSec > 0) {
    return plan.durationSec + plan.warmupSec;
  }
  if (plan.iterations !== null && plan.iterations > 0) {
    return Infinity;
  }
  return plan.warmupSec;
}
