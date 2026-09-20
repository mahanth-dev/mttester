import { applyTemplate } from '../data/feeder.js';
import { resolveJsonPointer } from '../checks/json-pointer.js';

/**
 * @typedef {import('./plan.js').ScenarioDef} ScenarioDef
 * @typedef {import('./plan.js').StepDef} StepDef
 */

/**
 * Pick scenario by weight.
 * @param {ScenarioDef[]} scenarios
 * @returns {ScenarioDef}
 */
export function pickScenario(scenarios) {
  if (scenarios.length === 1) return scenarios[0];
  const totalWeight = scenarios.reduce((s, sc) => s + (sc.weight ?? 1), 0);
  let r = Math.random() * totalWeight;
  for (const sc of scenarios) {
    r -= sc.weight ?? 1;
    if (r <= 0) return sc;
  }
  return scenarios[scenarios.length - 1];
}

/**
 * Resolve a single step URL/headers/body with feeder vars.
 * @param {StepDef} step
 * @param {Record<string, unknown>} vars
 * @returns {{method: string, url: string, headers: Record<string, string>, body: string|null, checks: import('../checks/index.js').CheckDefinition[]}}
 */
export function resolveStep(step, vars = {}) {
  return {
    method: step.method,
    url: applyTemplate(step.url, vars),
    headers: Object.fromEntries(
      Object.entries(step.headers || {}).map(([k, v]) => [k, applyTemplate(v, vars)]),
    ),
    body: step.body ? applyTemplate(step.body, vars) : null,
    checks: step.checks || [],
  };
}

/**
 * Resolve scenario URL/headers/body with feeder vars (single-step fallback).
 * @param {ScenarioDef} scenario
 * @param {Record<string, unknown>} vars
 * @returns {{method: string, url: string, headers: Record<string, string>, body: string|null, checks: import('../checks/index.js').CheckDefinition[]}}
 */
export function resolveScenario(scenario, vars = {}) {
  if (scenario.steps && scenario.steps.length > 0) {
    return resolveStep(scenario.steps[0], vars);
  }
  return resolveStep({
    method: scenario.method ?? 'GET',
    url: scenario.url ?? '',
    headers: scenario.headers,
    body: scenario.body,
    checks: scenario.checks,
  }, vars);
}

/**
 * Ordered steps for a scenario: setup → steps (or single-step) → teardown.
 * @param {ScenarioDef} scenario
 * @returns {StepDef[]}
 */
export function orderedSteps(scenario) {
  /** @type {StepDef[]} */
  const steps = [];
  if (scenario.setup) steps.push({ ...scenario.setup, name: scenario.setup.name ?? 'setup' });
  if (scenario.steps && scenario.steps.length > 0) {
    steps.push(...scenario.steps);
  } else {
    steps.push({
      name: scenario.name,
      method: scenario.method ?? 'GET',
      url: scenario.url ?? '',
      headers: scenario.headers,
      body: scenario.body,
      checks: scenario.checks,
      extract: scenario.extract,
    });
  }
  if (scenario.teardown) steps.push({ ...scenario.teardown, name: scenario.teardown.name ?? 'teardown' });
  return steps;
}

/**
 * Apply extract rules from an HTTP response into vars.
 * @param {Record<string, string>} extractRules
 * @param {{status: number, headers: Record<string, string>, body: string}} response
 * @param {Record<string, unknown>} vars
 */
export function applyExtractRules(extractRules, response, vars) {
  for (const [varName, rule] of Object.entries(extractRules)) {
    if (rule.startsWith('json:')) {
      const pointer = rule.slice(5);
      try {
        const doc = JSON.parse(response.body);
        vars[varName] = resolveJsonPointer(doc, pointer.startsWith('/') ? pointer : `/${pointer}`);
      } catch {
        vars[varName] = undefined;
      }
    } else if (rule.startsWith('header:')) {
      const headerName = rule.slice(7);
      const key = Object.keys(response.headers).find(
        (k) => k.toLowerCase() === headerName.toLowerCase(),
      );
      vars[varName] = key ? response.headers[key] : undefined;
    } else if (rule === 'status') {
      vars[varName] = response.status;
    } else if (rule.startsWith('body:')) {
      vars[varName] = response.body;
    }
  }
}
