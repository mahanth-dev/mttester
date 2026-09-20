import { Histogram } from './histogram.js';

export class MetricsRegistry {
  constructor() {
    /** @type {Histogram} */
    this.httpDuration = new Histogram();
    /** @type {Histogram} */
    this.ttfb = new Histogram();
    /** @type {number} */
    this.requestsTotal = 0;
    /** @type {number} */
    this.requestsFailed = 0;
    /** @type {number} */
    this.checksTotal = 0;
    /** @type {number} */
    this.checksFailed = 0;
    /** @type {Record<string, number>} */
    this.statusCodes = {};
    /** @type {number} */
    this.bytesReceived = 0;
    /** @type {number} */
    this.bytesSent = 0;
    /** @type {number} */
    this.iterations = 0;
    /** @type {boolean} */
    this.workerSaturated = false;
    /** @type {string|null} */
    this.saturatedReason = null;
  }

  /**
   * @param {import('../core/protocol.js').RequestResult} result
   */
  recordRequest(result) {
    this.requestsTotal++;
    if (!result.ok) this.requestsFailed++;
    this.httpDuration.observe(result.durationMs);
    this.ttfb.observe(result.ttfbMs);
    const code = String(result.status || 0);
    this.statusCodes[code] = (this.statusCodes[code] || 0) + 1;
    this.bytesReceived += result.bytesReceived;
    this.bytesSent += result.bytesSent;

    for (const check of result.checks) {
      this.checksTotal++;
      if (!check.pass) this.checksFailed++;
    }
  }

  /**
   * @param {MetricsRegistry|import('../core/protocol.js').MetricsSnapshot} other
   */
  merge(other) {
    this.httpDuration.merge(other.httpDuration);
    this.ttfb.merge(other.ttfb);
    this.requestsTotal += other.requestsTotal;
    this.requestsFailed += other.requestsFailed;
    this.checksTotal += other.checksTotal;
    this.checksFailed += other.checksFailed;
    this.bytesReceived += other.bytesReceived;
    this.bytesSent += other.bytesSent;
    this.iterations += other.iterations;

    for (const [code, count] of Object.entries(other.statusCodes)) {
      this.statusCodes[code] = (this.statusCodes[code] || 0) + count;
    }
  }

  /**
   * @returns {import('../core/protocol.js').MetricsSnapshot}
   */
  snapshot() {
    return {
      httpDuration: this.httpDuration.toJSON(),
      ttfb: this.ttfb.toJSON(),
      requestsTotal: this.requestsTotal,
      requestsFailed: this.requestsFailed,
      checksTotal: this.checksTotal,
      checksFailed: this.checksFailed,
      statusCodes: { ...this.statusCodes },
      bytesReceived: this.bytesReceived,
      bytesSent: this.bytesSent,
      iterations: this.iterations,
    };
  }

  /**
   * @param {import('../core/protocol.js').MetricsSnapshot} data
   * @returns {MetricsRegistry}
   */
  static fromSnapshot(data) {
    const r = new MetricsRegistry();
    r.httpDuration = Histogram.fromJSON(data.httpDuration);
    r.ttfb = Histogram.fromJSON(data.ttfb);
    r.requestsTotal = data.requestsTotal;
    r.requestsFailed = data.requestsFailed;
    r.checksTotal = data.checksTotal;
    r.checksFailed = data.checksFailed;
    r.statusCodes = { ...data.statusCodes };
    r.bytesReceived = data.bytesReceived;
    r.bytesSent = data.bytesSent;
    r.iterations = data.iterations;
    return r;
  }
}
