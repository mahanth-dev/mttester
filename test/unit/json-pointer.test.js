import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveJsonPointer } from '../../src/checks/json-pointer.js';

describe('json-pointer', () => {
  it('resolves root', () => {
    const doc = { a: 1 };
    assert.deepEqual(resolveJsonPointer(doc, '/'), doc);
  });

  it('resolves nested path', () => {
    const doc = { user: { name: 'alice', tags: ['a', 'b'] } };
    assert.equal(resolveJsonPointer(doc, '/user/name'), 'alice');
    assert.equal(resolveJsonPointer(doc, '/user/tags/1'), 'b');
  });

  it('returns undefined for missing path', () => {
    assert.equal(resolveJsonPointer({ a: 1 }, '/b/c'), undefined);
  });

  it('decodes escaped tokens', () => {
    const doc = { 'a/b': 1 };
    assert.equal(resolveJsonPointer(doc, '/a~1b'), 1);
  });
});
