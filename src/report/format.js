/**
 * Formatting helpers for reports (machine surface uses fixed English units).
 */

/**
 * @param {number} bytes
 * @returns {string}
 */
export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * @param {number} ms
 * @returns {string}
 */
export function formatMs(ms) {
  if (ms < 1) return `${(ms * 1000).toFixed(0)} µs`;
  if (ms < 1000) return `${ms.toFixed(2)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

/**
 * @param {number} sec
 * @returns {string}
 */
export function formatDuration(sec) {
  if (sec < 60) return `${sec.toFixed(1)}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ${(sec % 60).toFixed(0)}s`;
  return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`;
}

/**
 * @param {number} rate
 * @returns {string}
 */
export function formatRate(rate) {
  return `${rate.toFixed(2)}/s`;
}
