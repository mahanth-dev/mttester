/**
 * Browser-like identity and per-VU cookie jar for realistic user simulation.
 */

export const BROWSER_USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_3) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36',
];

/**
 * Stable browser headers for a VU (deterministic from vuId).
 * @param {number} vuId
 * @param {string} [acceptLanguage='fa-IR,fa;q=0.9,en-US;q=0.8,en;q=0.7']
 * @returns {Record<string, string>}
 */
export function browserHeadersForVu(vuId, acceptLanguage = 'fa-IR,fa;q=0.9,en-US;q=0.8,en;q=0.7') {
  const ua = BROWSER_USER_AGENTS[Math.abs(vuId) % BROWSER_USER_AGENTS.length];
  const mobile = /Mobile|Android|iPhone/.test(ua);
  return {
    'User-Agent': ua,
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': acceptLanguage,
    'Accept-Encoding': 'gzip, deflate, br',
    'Cache-Control': 'no-cache',
    Pragma: 'no-cache',
    'Upgrade-Insecure-Requests': '1',
    ...(mobile
      ? {}
      : {
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
      }),
  };
}

/**
 * Merge headers: browser defaults < scenario < step < explicit overrides.
 * Cookie header from jar wins unless caller already set Cookie.
 * @param {Record<string, string>[]} layers
 * @returns {Record<string, string>}
 */
export function mergeHeaders(...layers) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const layer of layers) {
    if (!layer) continue;
    for (const [k, v] of Object.entries(layer)) {
      if (v == null || v === '') continue;
      out[k] = v;
    }
  }
  return out;
}

export class CookieJar {
  constructor() {
    /** @type {Map<string, string>} */
    this.cookies = new Map();
  }

  /**
   * @param {Record<string, string>} headers
   */
  storeFromResponse(headers) {
    const raw = headers['set-cookie'] || headers['Set-Cookie'];
    if (!raw) return;
    const parts = Array.isArray(raw) ? raw : String(raw).split(/,(?=[^;]+?=)/);
    for (const part of parts) {
      const pair = String(part).split(';')[0]?.trim();
      if (!pair) continue;
      const eq = pair.indexOf('=');
      if (eq <= 0) continue;
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      if (name) this.cookies.set(name, value);
    }
  }

  /**
   * @returns {string|null}
   */
  headerValue() {
    if (this.cookies.size === 0) return null;
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
  }

  /**
   * @param {Record<string, string>} headers
   * @returns {Record<string, string>}
   */
  applyTo(headers) {
    const cookie = this.headerValue();
    if (!cookie) return headers;
    if (headers.Cookie || headers.cookie) return headers;
    return { ...headers, Cookie: cookie };
  }
}

/**
 * Random think time in [minMs, maxMs].
 * @param {number} minMs
 * @param {number} [maxMs]
 * @returns {number}
 */
export function randomThinkMs(minMs, maxMs) {
  const lo = Math.max(0, Number(minMs) || 0);
  const hi = Math.max(lo, Number(maxMs ?? minMs) || 0);
  if (hi <= 0) return 0;
  if (hi === lo) return lo;
  return Math.floor(lo + Math.random() * (hi - lo + 1));
}

/**
 * Build absolute URL from base + path.
 * @param {string} baseUrl
 * @param {string} path
 * @returns {string}
 */
export function joinUrl(baseUrl, path) {
  const base = baseUrl.replace(/\/+$/, '');
  if (!path || path === '/') return `${base}/`;
  if (/^https?:\/\//i.test(path)) return path;
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${base}${p}`;
}

/**
 * Default soft ramp for realistic closed-loop runs when no stages given.
 * @param {number} vus
 * @param {number} durationSec
 * @returns {{durationSec: number, targetVus: number}[]}
 */
export function realisticRampStages(vus, durationSec) {
  const d = Math.max(durationSec, 15);
  const rampUp = Math.max(5, Math.round(d * 0.2));
  const rampDown = Math.max(5, Math.round(d * 0.15));
  const hold = Math.max(5, d - rampUp - rampDown);
  return [
    { durationSec: rampUp, targetVus: vus },
    { durationSec: hold, targetVus: vus },
    { durationSec: rampDown, targetVus: 0 },
  ];
}
