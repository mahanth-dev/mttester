import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs } from '../../src/cli/args.js';

describe('args', () => {
  it('parses url command', () => {
    const args = parseArgs(['url', 'http://localhost:8080', '-u', '50', '-d', '10s']);
    assert.equal(args.command, 'url');
    assert.equal(args.url, 'http://localhost:8080');
    assert.equal(args.vus, 50);
    assert.equal(args.duration, '10s');
  });

  it('parses confirm-high-load flag', () => {
    const args = parseArgs(['url', 'http://x', '-u', '1000', '--confirm-high-load', '-d', '5s']);
    assert.equal(args.confirmHighLoad, true);
    assert.equal(args.vus, 1000);
  });

  it('parses thresholds and checks', () => {
    const args = parseArgs(['url', 'http://x', '-d', '10s', '-c', 'status:2xx', '-t', 'http_req_duration.p95<500']);
    assert.deepEqual(args.checks, ['status:2xx']);
    assert.deepEqual(args.thresholds, ['http_req_duration.p95<500']);
  });

  it('parses headers', () => {
    const args = parseArgs(['once', 'http://x', '-H', 'Authorization: Bearer token']);
    assert.equal(args.headers?.Authorization, 'Bearer token');
  });

  it('accepts --lang as alias for --locale', () => {
    const args = parseArgs(['url', 'http://x', '-d', '10s', '--lang', 'fa']);
    assert.equal(args.locale, 'fa');
  });

  it('collects unknown options', () => {
    const args = parseArgs(['url', 'http://x', '-d', '10s', '--bogus-flag']);
    assert.deepEqual(args.unknownOptions, ['--bogus-flag']);
  });
});
