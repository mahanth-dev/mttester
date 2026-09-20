/** @typedef {'PLAN_INVALID'|'HIGH_LOAD_BLOCKED'|'THRESHOLD_FAILED'|'RUNTIME_ERROR'|'INTERRUPTED'|'WORKER_SATURATED'} ErrorCode */

export class MtTesterError extends Error {
  /**
   * @param {string} message
   * @param {ErrorCode} code
   * @param {number} [exitCode=1]
   */
  constructor(message, code, exitCode = 1) {
    super(message);
    this.name = 'MtTesterError';
    /** @type {ErrorCode} */
    this.code = code;
    /** @type {number} */
    this.exitCode = exitCode;
  }
}

export class PlanError extends MtTesterError {
  /**
   * @param {string} message
   */
  constructor(message) {
    super(message, 'PLAN_INVALID', 2);
    this.name = 'PlanError';
  }
}

export class HighLoadError extends MtTesterError {
  /**
   * @param {string} message
   */
  constructor(message) {
    super(message, 'HIGH_LOAD_BLOCKED', 2);
    this.name = 'HighLoadError';
  }
}

export class ThresholdError extends MtTesterError {
  /**
   * @param {string} message
   * @param {number} [exitCode=1]
   */
  constructor(message, exitCode = 1) {
    super(message, 'THRESHOLD_FAILED', exitCode);
    this.name = 'ThresholdError';
  }
}

/**
 * @param {unknown} err
 * @returns {string}
 */
export function formatError(err) {
  if (err instanceof Error) return err.message;
  return String(err);
}
