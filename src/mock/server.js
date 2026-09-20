import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';

/**
 * @typedef {object} MockServerOptions
 * @property {number} [port=0]
 * @property {number} [latencyMs=0]
 * @property {number} [errorRate=0]
 * @property {number} [statusCode=200]
 * @property {string} [body='ok']
 */

export class MockServer {
  /**
   * @param {MockServerOptions} [options]
   */
  constructor(options = {}) {
    this.port = options.port ?? 0;
    this.latencyMs = options.latencyMs ?? 0;
    this.errorRate = options.errorRate ?? 0;
    this.statusCode = options.statusCode ?? 200;
    this.body = options.body ?? 'ok';
    /** @type {import('node:http').Server|null} */
    this.server = null;
    /** @type {number} */
    this.requestCount = 0;
    /** @type {Record<string, (req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => void>} */
    this.routes = {
      '/': this.handleRoot.bind(this),
      '/health': this.handleHealth.bind(this),
      '/delay': this.handleDelay.bind(this),
      '/json': this.handleJson.bind(this),
      '/status': this.handleStatus.bind(this),
      '/bytes': this.handleBytes.bind(this),
    };
  }

  /**
   * @param {import('node:http').IncomingMessage} req
   * @param {import('node:http').ServerResponse} res
   */
  handleRoot(req, res) {
    this.sendResponse(req, res, this.statusCode, this.body);
  }

  /**
   * @param {import('node:http').IncomingMessage} req
   * @param {import('node:http').ServerResponse} res
   */
  handleHealth(req, res) {
    this.sendResponse(req, res, 200, JSON.stringify({ status: 'ok' }), 'application/json');
  }

  /**
   * @param {import('node:http').IncomingMessage} req
   * @param {import('node:http').ServerResponse} res
   */
  handleDelay(req, res) {
    const url = new URL(req.url || '/', `http://localhost:${this.port}`);
    const ms = parseInt(url.searchParams.get('ms') || '100', 10);
    setTimeout(() => {
      this.sendResponse(req, res, 200, `delayed ${ms}ms`);
    }, Math.max(0, ms));
  }

  /**
   * @param {import('node:http').IncomingMessage} req
   * @param {import('node:http').ServerResponse} res
   */
  handleJson(req, res) {
    const payload = { id: this.requestCount, method: req.method, path: req.url };
    this.sendResponse(req, res, 200, JSON.stringify(payload), 'application/json');
  }

  /**
   * @param {import('node:http').IncomingMessage} req
   * @param {import('node:http').ServerResponse} res
   */
  handleStatus(req, res) {
    const url = new URL(req.url || '/', `http://localhost:${this.port}`);
    const code = parseInt(url.searchParams.get('code') || '200', 10);
    this.sendResponse(req, res, code, `status ${code}`);
  }

  /**
   * @param {import('node:http').IncomingMessage} req
   * @param {import('node:http').ServerResponse} res
   */
  handleBytes(req, res) {
    const url = new URL(req.url || '/', `http://localhost:${this.port}`);
    const size = Math.min(parseInt(url.searchParams.get('n') || '1024', 10), 1024 * 1024);
    const body = randomBytes(size);
    this.sendResponse(req, res, 200, body, 'application/octet-stream');
  }

  /**
   * @param {import('node:http').IncomingMessage} req
   * @param {import('node:http').ServerResponse} res
   * @param {number} status
   * @param {string|Buffer} body
   * @param {string} [contentType]
   */
  sendResponse(req, res, status, body, contentType = 'text/plain') {
    const delay = this.latencyMs;
    const send = () => {
      if (this.errorRate > 0 && Math.random() < this.errorRate) {
        res.writeHead(500, { 'Content-Type': 'text/plain', 'X-Mock-Server': 'mttester' });
        res.end('mock error');
        return;
      }
      res.writeHead(status, {
        'Content-Type': contentType,
        'X-Mock-Server': 'mttester',
        'X-Request-Count': String(this.requestCount),
      });
      res.end(body);
    };
    if (delay > 0) setTimeout(send, delay);
    else send();
  }

  /**
   * @returns {Promise<number>}
   */
  start() {
    return new Promise((resolve, reject) => {
      this.server = createServer((req, res) => {
        this.requestCount++;
        const path = (req.url || '/').split('?')[0];
        const handler = this.routes[path];
        if (handler) handler(req, res);
        else this.sendResponse(req, res, 404, 'not found');
      });

      this.server.on('error', reject);
      this.server.listen(this.port, '127.0.0.1', () => {
        const addr = this.server?.address();
        if (addr && typeof addr === 'object') {
          this.port = addr.port;
        }
        resolve(this.port);
      });
    });
  }

  /**
   * @returns {string}
   */
  get baseUrl() {
    return `http://127.0.0.1:${this.port}`;
  }

  /**
   * @returns {Promise<void>}
   */
  stop() {
    return new Promise((resolve, reject) => {
      if (!this.server) {
        resolve();
        return;
      }
      this.server.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
}

/**
 * @param {MockServerOptions} [options]
 * @returns {Promise<MockServer>}
 */
export async function startMockServer(options = {}) {
  const server = new MockServer(options);
  await server.start();
  return server;
}
