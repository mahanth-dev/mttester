/**
 * Data feeder for scenario iteration variables.
 */

/**
 * @typedef {object} FeederOptions
 * @property {string} [type='sequence']
 * @property {Array<Record<string, unknown>>} [data]
 * @property {boolean} [circular=true]
 * @property {number} [totalVus=1]
 */

export class Feeder {
  /**
   * @param {FeederOptions} options
   */
  constructor(options = {}) {
    /** @type {Array<Record<string, unknown>>} */
    this.data = options.data ?? [];
    /** @type {boolean} */
    this.circular = options.circular ?? true;
    /** @type {number} */
    this.totalVus = options.totalVus ?? 1;
    /** @type {Map<number, number>} */
    this.vuCursors = new Map();
  }

  /**
   * @returns {Record<string, unknown>|null}
   */
  next() {
    return this.nextForVu(0);
  }

  /**
   * Return the next row for a global VU id, partitioned across the worker pool.
   * @param {number} vuId global virtual user id
   * @returns {Record<string, unknown>|null}
   */
  nextForVu(vuId) {
    if (this.data.length === 0) return {};

    const cursor = this.vuCursors.get(vuId) ?? 0;
    const index = (vuId + cursor * this.totalVus) % this.data.length;

    if (!this.circular && cursor * this.totalVus + vuId >= this.data.length) {
      return null;
    }

    this.vuCursors.set(vuId, cursor + 1);
    return this.data[index];
  }

  /**
   * @returns {number}
   */
  get length() {
    return this.data.length;
  }
}

/**
 * Simple template substitution: {{key}} in strings.
 * @param {string} template
 * @param {Record<string, unknown>} vars
 * @returns {string}
 */
export function applyTemplate(template, vars) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const val = vars[key];
    return val === undefined || val === null ? '' : String(val);
  });
}

/**
 * @param {string} path
 * @param {{totalVus?: number}} [options]
 * @returns {Promise<Feeder>}
 */
export async function loadFeederFromFile(path, options = {}) {
  const { readFile } = await import('node:fs/promises');
  const content = await readFile(path, 'utf8');
  const ext = path.split('.').pop()?.toLowerCase();

  if (ext === 'json') {
    const parsed = JSON.parse(content);
    const data = Array.isArray(parsed) ? parsed : [parsed];
    return new Feeder({ data, totalVus: options.totalVus ?? 1 });
  }

  if (ext === 'csv') {
    const lines = content.trim().split('\n');
    const headers = lines[0].split(',').map((h) => h.trim());
    const data = lines.slice(1).map((line) => {
      const values = line.split(',');
      /** @type {Record<string, unknown>} */
      const row = {};
      headers.forEach((h, i) => { row[h] = values[i]?.trim() ?? ''; });
      return row;
    });
    return new Feeder({ data, totalVus: options.totalVus ?? 1 });
  }

  throw new Error(`Unsupported feeder file format: ${ext}`);
}
