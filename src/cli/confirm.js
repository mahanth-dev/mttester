import { t, format } from '../i18n/index.js';

/**
 * Print authorization banner (human surface).
 * @param {string} [locale='en']
 */
export function printAuthBanner(locale = 'en') {
  const strings = t(locale);
  process.stderr.write(`\n${strings.authBanner}\n\n`);
}

/**
 * @param {string} reason
 * @param {number} count
 * @param {string} [locale='en']
 */
export function printWorkerSaturation(reason, count, locale = 'en') {
  const strings = t(locale);
  const msg = format(strings.workerSaturated, { reason, count });
  process.stderr.write(`\n${msg}\n\n`);
}
