import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Feeder, applyTemplate, loadFeederFromFile } from '../../src/data/feeder.js';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('feeder', () => {
  it('cycles through data', () => {
    const feeder = new Feeder({ data: [{ id: '1' }, { id: '2' }], circular: true });
    assert.equal(feeder.next()?.id, '1');
    assert.equal(feeder.next()?.id, '2');
    assert.equal(feeder.next()?.id, '1');
  });

  it('partitions rows by global VU id', () => {
    const feeder = new Feeder({
      data: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }],
      totalVus: 2,
    });
    assert.equal(feeder.nextForVu(0)?.id, 'a');
    assert.equal(feeder.nextForVu(1)?.id, 'b');
    assert.equal(feeder.nextForVu(0)?.id, 'c');
    assert.equal(feeder.nextForVu(1)?.id, 'd');
  });

  it('applies templates', () => {
    const result = applyTemplate('http://host/users/{{id}}', { id: '42' });
    assert.equal(result, 'http://host/users/42');
  });

  it('loads json feeder file', async () => {
    const feeder = await loadFeederFromFile(join(__dirname, '../fixtures/feeder.json'));
    assert.equal(feeder.length, 3);
    assert.equal(feeder.next()?.name, 'alice');
  });
});
