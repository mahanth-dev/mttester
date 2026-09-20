import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MSG, isInitMessage, isStartMessage } from '../../src/core/protocol.js';

describe('protocol', () => {
  it('defines message types', () => {
    assert.equal(MSG.INIT, 'init');
    assert.equal(MSG.RESULT, 'result');
    assert.equal(MSG.SATURATED, 'saturated');
  });

  it('validates init message', () => {
    assert.equal(isInitMessage({ type: 'init', workerId: 0, plan: {} }), true);
    assert.equal(isInitMessage({ type: 'start' }), false);
  });

  it('validates start message', () => {
    assert.equal(isStartMessage({ type: 'start', startTime: 0, endTime: 1, vuStart: 0, vuCount: 1 }), true);
  });
});
