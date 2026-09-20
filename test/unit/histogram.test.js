import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Histogram, bucketIndex, getBoundaries } from '../../src/metrics/histogram.js';

describe('histogram', () => {
  it('assigns values to buckets', () => {
    assert.ok(bucketIndex(1) >= 0);
    assert.ok(bucketIndex(1000) < getBoundaries().length);
  });

  it('computes mean correctly', () => {
    const h = new Histogram();
    h.observe(10);
    h.observe(20);
    h.observe(30);
    assert.equal(h.mean(), 20);
  });

  it('estimates quantiles with reasonable accuracy', () => {
    const h = new Histogram();
    const n = 10000;
    for (let i = 1; i <= n; i++) {
      h.observe(i);
    }
    const p50 = h.quantile(0.5);
    const p90 = h.quantile(0.9);
    const p99 = h.quantile(0.99);

    assert.ok(Math.abs(p50 - 5000) / 5000 < 0.15, `p50=${p50}`);
    assert.ok(Math.abs(p90 - 9000) / 9000 < 0.15, `p90=${p90}`);
    assert.ok(Math.abs(p99 - 9900) / 9900 < 0.15, `p99=${p99}`);
  });

  it('merge is associative', () => {
    const values = [1, 5, 10, 50, 100, 500, 1000, 5000];
    const a = new Histogram();
    const b = new Histogram();
    const c = new Histogram();

    for (let i = 0; i < values.length; i++) {
      if (i % 3 === 0) a.observe(values[i]);
      else if (i % 3 === 1) b.observe(values[i]);
      else c.observe(values[i]);
    }

    const ab = new Histogram();
    ab.merge(a);
    ab.merge(b);

    const bc = new Histogram();
    bc.merge(b);
    bc.merge(c);

    const abThenC = new Histogram();
    abThenC.merge(ab);
    abThenC.merge(c);

    const aThenBC = new Histogram();
    aThenBC.merge(a);
    aThenBC.merge(bc);

    assert.equal(abThenC.count, aThenBC.count);
    assert.equal(abThenC.sum, aThenBC.sum);
    assert.equal(abThenC.quantile(0.5).toFixed(2), aThenBC.quantile(0.5).toFixed(2));

    for (let i = 0; i < abThenC.counts.length; i++) {
      assert.equal(abThenC.counts[i], aThenBC.counts[i], `bucket ${i}`);
    }
  });

  it('serializes and deserializes', () => {
    const h = new Histogram();
    h.observe(42);
    h.observe(100);
    const restored = Histogram.fromJSON(h.toJSON());
    assert.equal(restored.count, h.count);
    assert.equal(restored.sum, h.sum);
  });
});
