export class TimeSeries {
  /**
   * @param {number} intervalMs
   */
  constructor(intervalMs = 1000) {
    /** @type {number} */
    this.intervalMs = intervalMs;
    /** @type {Array<{timestamp: number, rps: number, failedRps: number, avgMs: number, activeVus: number}>} */
    this.points = [];
    /** @type {number} */
    this._windowRequests = 0;
    /** @type {number} */
    this._windowFailed = 0;
    /** @type {number} */
    this._windowDurationSum = 0;
    /** @type {number} */
    this._windowStart = 0;
    /** @type {number} */
    this._activeVus = 0;
  }

  /**
   * @param {number} now
   * @param {number} activeVus
   */
  tick(now, activeVus) {
    this._activeVus = activeVus;
    if (this._windowStart === 0) {
      this._windowStart = now;
      return;
    }
    if (now - this._windowStart >= this.intervalMs) {
      const elapsed = (now - this._windowStart) / 1000;
      this.points.push({
        timestamp: this._windowStart,
        rps: this._windowRequests / elapsed,
        failedRps: this._windowFailed / elapsed,
        avgMs: this._windowRequests > 0 ? this._windowDurationSum / this._windowRequests : 0,
        activeVus: this._activeVus,
      });
      this._windowRequests = 0;
      this._windowFailed = 0;
      this._windowDurationSum = 0;
      this._windowStart = now;
    }
  }

  /**
   * @param {import('../core/protocol.js').RequestResult} result
   */
  recordRequest(result) {
    this._windowRequests++;
    if (!result.ok) this._windowFailed++;
    this._windowDurationSum += result.durationMs;
  }

  /**
   * @param {number} now
   */
  flush(now) {
    if (this._windowStart > 0 && this._windowRequests > 0) {
      const elapsed = Math.max((now - this._windowStart) / 1000, 0.001);
      this.points.push({
        timestamp: this._windowStart,
        rps: this._windowRequests / elapsed,
        failedRps: this._windowFailed / elapsed,
        avgMs: this._windowDurationSum / this._windowRequests,
        activeVus: this._activeVus,
      });
    }
    this._windowRequests = 0;
    this._windowFailed = 0;
    this._windowDurationSum = 0;
  }
}
