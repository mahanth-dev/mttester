/** Worker ↔ coordinator message types (machine surface, English only). */

export const MSG = {
  INIT: 'init',
  START: 'start',
  STOP: 'stop',
  TICK: 'tick',
  RESULT: 'result',
  METRICS: 'metrics',
  DONE: 'done',
  ERROR: 'error',
  SATURATED: 'saturated',
  CHECKPOINT: 'checkpoint',
};

/**
 * @typedef {object} InitMessage
 * @property {'init'} type
 * @property {number} workerId
 * @property {import('./plan.js').SerializedPlan} plan
 */

/**
 * @typedef {object} StartMessage
 * @property {'start'} type
 * @property {number} startTime
 * @property {number} endTime
 * @property {number} vuStart
 * @property {number} vuCount
 * @property {number} totalVus
 * @property {number} workerCount
 * @property {number} [targetRate]
 */

/**
 * @typedef {object} StopMessage
 * @property {'stop'} type
 */

/**
 * @typedef {object} TickMessage
 * @property {'tick'} type
 * @property {number} now
 * @property {number} targetRate
 * @property {number} activeVus
 */

/**
 * @typedef {object} RequestResult
 * @property {string} scenario
 * @property {string} method
 * @property {string} url
 * @property {number} status
 * @property {number} durationMs
 * @property {number} ttfbMs
 * @property {boolean} ok
 * @property {boolean} checksPassed
 * @property {string|null} error
 * @property {number} bytesReceived
 * @property {number} bytesSent
 * @property {Array<{name: string, pass: boolean, message?: string}>} checks
 * @property {number} timestamp
 */

/**
 * @typedef {object} ResultMessage
 * @property {'result'} type
 * @property {RequestResult} result
 */

/**
 * @typedef {object} MetricsSnapshot
 * @property {import('../metrics/histogram.js').HistogramData} httpDuration
 * @property {import('../metrics/histogram.js').HistogramData} ttfb
 * @property {number} requestsTotal
 * @property {number} requestsFailed
 * @property {number} checksTotal
 * @property {number} checksFailed
 * @property {Record<string, number>} statusCodes
 * @property {number} bytesReceived
 * @property {number} bytesSent
 * @property {number} iterations
 */

/**
 * @typedef {object} MetricsMessage
 * @property {'metrics'} type
 * @property {MetricsSnapshot} snapshot
 */

/**
 * @typedef {object} DoneMessage
 * @property {'done'} type
 * @property {number} workerId
 * @property {MetricsSnapshot} finalMetrics
 */

/**
 * @typedef {object} ErrorMessage
 * @property {'error'} type
 * @property {string} message
 * @property {string} [stack]
 */

/**
 * @typedef {object} SaturatedMessage
 * @property {'saturated'} type
 * @property {string} reason
 * @property {number} pendingCount
 */

/**
 * @param {unknown} msg
 * @returns {msg is InitMessage}
 */
export function isInitMessage(msg) {
  return typeof msg === 'object' && msg !== null && /** @type {{type?: string}} */ (msg).type === MSG.INIT;
}

/**
 * @param {unknown} msg
 * @returns {msg is StartMessage}
 */
export function isStartMessage(msg) {
  return typeof msg === 'object' && msg !== null && /** @type {{type?: string}} */ (msg).type === MSG.START;
}
