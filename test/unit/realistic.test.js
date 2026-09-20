import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  CookieJar,
  browserHeadersForVu,
  randomThinkMs,
  joinUrl,
} from '../../src/core/browser.js';
import { buildJourneyScenario, createPlan } from '../../src/core/plan.js';

describe('realistic user primitives', () => {
  it('stores and applies cookies', () => {
    const jar = new CookieJar();
    jar.storeFromResponse({ 'set-cookie': 'session=abc123; Path=/; HttpOnly' });
    jar.storeFromResponse({ 'set-cookie': 'theme=dark; Path=/' });
    const headers = jar.applyTo({ Accept: 'text/html' });
    assert.equal(headers.Cookie, 'session=abc123; theme=dark');
    assert.equal(headers.Accept, 'text/html');
  });

  it('gives browser-like headers per VU', () => {
    const h = browserHeadersForVu(2);
    assert.ok(h['User-Agent']);
    assert.ok(h['Accept-Language'].includes('fa'));
  });

  it('random think stays in range', () => {
    for (let i = 0; i < 40; i++) {
      const v = randomThinkMs(1000, 2000);
      assert.ok(v >= 1000 && v <= 2000);
    }
  });

  it('builds multi-step journey', () => {
    const sc = buildJourneyScenario({
      baseUrl: 'https://example.com',
      paths: ['/', '/about', '/contact'],
    });
    assert.ok(sc.steps);
    assert.equal(sc.steps?.length, 3);
    assert.equal(sc.steps?.[1].url, 'https://example.com/about');
  });

  it('joinUrl handles absolute and relative', () => {
    assert.equal(joinUrl('https://a.com', '/x'), 'https://a.com/x');
    assert.equal(joinUrl('https://a.com/', 'https://b.com/y'), 'https://b.com/y');
  });

  it('realistic plan enables cookies and think defaults', () => {
    const plan = createPlan({
      realistic: true,
      vus: 5,
      durationSec: 20,
      scenarios: [{ name: 'j', method: 'GET', url: 'http://127.0.0.1/' }],
    });
    assert.equal(plan.realistic, true);
    assert.equal(plan.cookieJar, true);
    assert.equal(plan.browserHeaders, true);
    assert.ok(plan.thinkTimeMs >= 1000);
    assert.ok(plan.thinkTimeMaxMs >= plan.thinkTimeMs);
    assert.ok(plan.staggerStartMs > 0);
  });

  it('rejects realistic + open-loop', () => {
    assert.throws(() => createPlan({
      realistic: true,
      mode: 'open',
      rate: 50,
      vus: 10,
      durationSec: 10,
      scenarios: [{ name: 'j', method: 'GET', url: 'http://127.0.0.1/' }],
    }));
  });
});
