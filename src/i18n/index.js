import { en } from './en.js';
import { fa } from './fa.js';

/** @type {Record<string, typeof en>} */
const catalogs = { en, fa };

/**
 * @param {string} [locale='en']
 * @returns {typeof en}
 */
export function t(locale = 'en') {
  return catalogs[locale] ?? catalogs.en;
}

/**
 * @param {string} template
 * @param {Record<string, string|number>} vars
 * @returns {string}
 */
export function format(template, vars = {}) {
  return template.replace(/\{(\w+)\}/g, (_, key) => String(vars[key] ?? ''));
}
