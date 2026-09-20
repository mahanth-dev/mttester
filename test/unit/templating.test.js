import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { applyTemplate } from '../../src/data/feeder.js';
import { resolveScenario } from '../../src/core/scenario.js';

describe('templating', () => {
  it('substitutes multiple variables', () => {
    const url = applyTemplate('{{proto}}://{{host}}/{{path}}', {
      proto: 'https',
      host: 'example.com',
      path: 'api',
    });
    assert.equal(url, 'https://example.com/api');
  });

  it('resolves scenario with vars', () => {
    const resolved = resolveScenario({
      name: 'test',
      method: 'GET',
      url: 'http://host/{{id}}',
      headers: { 'X-User': '{{name}}' },
    }, { id: '1', name: 'alice' });

    assert.equal(resolved.url, 'http://host/1');
    assert.equal(resolved.headers['X-User'], 'alice');
  });

  it('handles missing vars as empty', () => {
    assert.equal(applyTemplate('{{missing}}', {}), '');
  });
});
