/**
 * Minimal JSON Pointer (RFC 6901) resolver.
 * @param {unknown} doc
 * @param {string} pointer
 * @returns {unknown}
 */
export function resolveJsonPointer(doc, pointer) {
  if (!pointer || pointer === '/') return doc;
  if (!pointer.startsWith('/')) {
    throw new Error(`Invalid JSON pointer: ${pointer}`);
  }

  const tokens = pointer.slice(1).split('/').map(decodeToken);
  let current = doc;

  for (const token of tokens) {
    if (current === null || current === undefined) return undefined;
    if (Array.isArray(current)) {
      const idx = token === '-' ? current.length : parseInt(token, 10);
      current = current[idx];
    } else if (typeof current === 'object') {
      current = /** @type {Record<string, unknown>} */ (current)[token];
    } else {
      return undefined;
    }
  }

  return current;
}

/**
 * @param {string} token
 * @returns {string}
 */
function decodeToken(token) {
  return token.replace(/~1/g, '/').replace(/~0/g, '~');
}
