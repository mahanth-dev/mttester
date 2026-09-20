/**
 * Log-linear bucketed histogram for latency metrics.
 * Buckets span 0.1ms .. 60s on a log scale.
 */

const MIN_VALUE_MS = 0.1;
const MAX_VALUE_MS = 60_000;
const BUCKET_COUNT = 256;

/** @type {number[]|null} */
let _boundaries = null;

/**
 * @returns {number[]}
 */
function getBoundaries() {
  if (_boundaries) return _boundaries;
  const minLog = Math.log(MIN_VALUE_MS);
  const maxLog = Math.log(MAX_VALUE_MS);
  const step = (maxLog - minLog) / (BUCKET_COUNT - 1);
  _boundaries = Array.from({ length: BUCKET_COUNT }, (_, i) => Math.exp(minLog + step * i));
  return _boundaries;
}

/**
 * @param {number} valueMs
 * @returns {number}
 */
export function bucketIndex(valueMs) {
  const boundaries = getBoundaries();
  if (valueMs <= boundaries[0]) return 0;
  if (valueMs >= boundaries[boundaries.length - 1]) return boundaries.length - 1;
  let lo = 0;
  let hi = boundaries.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (boundaries[mid] < valueMs) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * @typedef {object} HistogramData
 * @property {number[]} counts
 * @property {number} count
 * @property {number} sum
 * @property {number} min
 * @property {number} max
 */

export class Histogram {
  constructor() {
    /** @type {number[]} */
    this.counts = new Array(BUCKET_COUNT).fill(0);
    /** @type {number} */
    this.count = 0;
    /** @type {number} */
    this.sum = 0;
    /** @type {number} */
    this.min = Infinity;
    /** @type {number} */
    this.max = -Infinity;
  }

  /**
   * @param {number} valueMs
   */
  observe(valueMs) {
    if (!Number.isFinite(valueMs) || valueMs < 0) return;
    const idx = bucketIndex(valueMs);
    this.counts[idx]++;
    this.count++;
    this.sum += valueMs;
    if (valueMs < this.min) this.min = valueMs;
    if (valueMs > this.max) this.max = valueMs;
  }

  /**
   * @param {Histogram|HistogramData} other
   */
  merge(other) {
    const counts = other instanceof Histogram ? other.counts : other.counts;
    const count = other instanceof Histogram ? other.count : other.count;
    const sum = other instanceof Histogram ? other.sum : other.sum;
    const min = other instanceof Histogram ? other.min : other.min;
    const max = other instanceof Histogram ? other.max : other.max;

    for (let i = 0; i < BUCKET_COUNT; i++) {
      this.counts[i] += counts[i];
    }
    this.count += count;
    this.sum += sum;
    if (count > 0) {
      if (min < this.min) this.min = min;
      if (max > this.max) this.max = max;
    }
  }

  /**
   * @returns {HistogramData}
   */
  toJSON() {
    return {
      counts: [...this.counts],
      count: this.count,
      sum: this.sum,
      min: this.count === 0 ? 0 : this.min,
      max: this.count === 0 ? 0 : this.max,
    };
  }

  /**
   * @param {HistogramData} data
   * @returns {Histogram}
   */
  static fromJSON(data) {
    const h = new Histogram();
    h.counts = [...data.counts];
    h.count = data.count;
    h.sum = data.sum;
    h.min = data.min;
    h.max = data.max;
    return h;
  }

  /**
   * @returns {number}
   */
  mean() {
    return this.count === 0 ? 0 : this.sum / this.count;
  }

  /**
   * Estimate quantile from bucket cumulative distribution.
   * @param {number} q 0..1
   * @returns {number}
   */
  quantile(q) {
    if (this.count === 0) return 0;
    if (q <= 0) return this.min;
    if (q >= 1) return this.max;

    const target = Math.ceil(q * this.count);
    const boundaries = getBoundaries();
    let cumulative = 0;

    for (let i = 0; i < BUCKET_COUNT; i++) {
      cumulative += this.counts[i];
      if (cumulative >= target) {
        const lower = i === 0 ? 0 : boundaries[i - 1];
        const upper = boundaries[i];
        const prevCumulative = cumulative - this.counts[i];
        const bucketCount = this.counts[i];
        if (bucketCount === 0) return upper;
        const fraction = (target - prevCumulative) / bucketCount;
        return lower + (upper - lower) * fraction;
      }
    }
    return this.max;
  }

  /** @returns {{p50: number, p90: number, p95: number, p99: number}} */
  percentiles() {
    return {
      p50: this.quantile(0.5),
      p90: this.quantile(0.9),
      p95: this.quantile(0.95),
      p99: this.quantile(0.99),
    };
  }
}

export { BUCKET_COUNT, MIN_VALUE_MS, MAX_VALUE_MS, getBoundaries };
