import { resolveJsonPointer } from './json-pointer.js';

/**
 * @typedef {object} CheckDefinition
 * @property {string} name
 * @property {string} type
 * @property {unknown} [expected]
 * @property {string} [pointer]
 * @property {string} [pattern]
 * @property {number} [min]
 * @property {number} [max]
 */

/**
 * @typedef {object} CheckResult
 * @property {string} name
 * @property {boolean} pass
 * @property {string} [message]
 */

/**
 * @param {CheckDefinition[]} definitions
 * @param {{status: number, headers: Record<string, string>, body: string, durationMs: number}} context
 * @returns {CheckResult[]}
 */
export function runChecks(definitions, context) {
  if (!definitions || definitions.length === 0) return [];
  return definitions.map((def) => evaluateCheck(def, context));
}

/**
 * @param {CheckDefinition} def
 * @param {{status: number, headers: Record<string, string>, body: string, durationMs: number}} context
 * @returns {CheckResult}
 */
function evaluateCheck(def, context) {
  try {
    switch (def.type) {
      case 'status':
        return checkStatus(def, context.status);
      case 'status_range':
        return checkStatusRange(def, context.status);
      case 'header':
        return checkHeader(def, context.headers);
      case 'body_contains':
        return checkBodyContains(def, context.body);
      case 'body_json':
        return checkBodyJson(def, context.body);
      case 'json_pointer':
        return checkJsonPointer(def, context.body);
      case 'duration':
        return checkDuration(def, context.durationMs);
      case 'regex':
        return checkRegex(def, context.body);
      default:
        return { name: def.name, pass: false, message: `Unknown check type: ${def.type}` };
    }
  } catch (err) {
    return {
      name: def.name,
      pass: false,
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * @param {CheckDefinition} def
 * @param {number} status
 * @returns {CheckResult}
 */
function checkStatus(def, status) {
  const expected = /** @type {number} */ (def.expected);
  const pass = status === expected;
  return {
    name: def.name,
    pass,
    message: pass ? undefined : `expected status ${expected}, got ${status}`,
  };
}

/**
 * @param {CheckDefinition} def
 * @param {number} status
 * @returns {CheckResult}
 */
function checkStatusRange(def, status) {
  const min = def.min ?? 200;
  const max = def.max ?? 299;
  const pass = status >= min && status <= max;
  return {
    name: def.name,
    pass,
    message: pass ? undefined : `expected status ${min}-${max}, got ${status}`,
  };
}

/**
 * @param {CheckDefinition} def
 * @param {Record<string, string>} headers
 * @returns {CheckResult}
 */
function checkHeader(def, headers) {
  const name = def.name.split(':')[0] || def.name;
  const key = Object.keys(headers).find((k) => k.toLowerCase() === name.toLowerCase());
  const value = key ? headers[key] : undefined;
  const expected = String(def.expected ?? '');
  const pass = value !== undefined && (expected === '' || value.includes(expected));
  return {
    name: def.name,
    pass,
    message: pass ? undefined : `header ${name} expected "${expected}", got "${value ?? ''}"`,
  };
}

/**
 * @param {CheckDefinition} def
 * @param {string} body
 * @returns {CheckResult}
 */
function checkBodyContains(def, body) {
  const expected = String(def.expected ?? '');
  const pass = body.includes(expected);
  return {
    name: def.name,
    pass,
    message: pass ? undefined : `body does not contain "${expected}"`,
  };
}

/**
 * @param {CheckDefinition} def
 * @param {string} body
 * @returns {CheckResult}
 */
function checkBodyJson(def, body) {
  try {
    JSON.parse(body);
    return { name: def.name, pass: true };
  } catch {
    return { name: def.name, pass: false, message: 'body is not valid JSON' };
  }
}

/**
 * @param {CheckDefinition} def
 * @param {string} body
 * @returns {CheckResult}
 */
function checkJsonPointer(def, body) {
  const doc = JSON.parse(body);
  const value = resolveJsonPointer(doc, def.pointer || '/');
  const expected = def.expected;
  const pass = JSON.stringify(value) === JSON.stringify(expected);
  return {
    name: def.name,
    pass,
    message: pass ? undefined : `pointer ${def.pointer} expected ${JSON.stringify(expected)}, got ${JSON.stringify(value)}`,
  };
}

/**
 * @param {CheckDefinition} def
 * @param {number} durationMs
 * @returns {CheckResult}
 */
function checkDuration(def, durationMs) {
  const max = def.max ?? Infinity;
  const pass = durationMs <= max;
  return {
    name: def.name,
    pass,
    message: pass ? undefined : `duration ${durationMs.toFixed(2)}ms exceeds max ${max}ms`,
  };
}

/**
 * @param {CheckDefinition} def
 * @param {string} body
 * @returns {CheckResult}
 */
function checkRegex(def, body) {
  const pattern = def.pattern || String(def.expected ?? '');
  const re = new RegExp(pattern);
  const pass = re.test(body);
  return {
    name: def.name,
    pass,
    message: pass ? undefined : `body does not match /${pattern}/`,
  };
}

/**
 * Parse check specs from CLI: "status:200", "status:2xx", "body:ok"
 * @param {string[]} specs
 * @returns {CheckDefinition[]}
 */
export function parseCheckSpecs(specs) {
  /** @type {CheckDefinition[]} */
  const checks = [];
  for (const spec of specs) {
    const [type, ...rest] = spec.split(':');
    const value = rest.join(':');
    switch (type) {
      case 'status':
        if (value.endsWith('xx')) {
          const prefix = parseInt(value[0], 10);
          checks.push({
            name: `status is ${value}`,
            type: 'status_range',
            min: prefix * 100,
            max: prefix * 100 + 99,
          });
        } else {
          checks.push({
            name: `status is ${value}`,
            type: 'status',
            expected: parseInt(value, 10),
          });
        }
        break;
      case 'body':
        checks.push({ name: `body contains "${value}"`, type: 'body_contains', expected: value });
        break;
      case 'json':
        checks.push({ name: 'valid JSON', type: 'body_json' });
        break;
      case 'duration':
        checks.push({ name: `duration <= ${value}ms`, type: 'duration', max: parseFloat(value) });
        break;
      default:
        checks.push({ name: spec, type: 'body_contains', expected: spec });
    }
  }
  return checks;
}
