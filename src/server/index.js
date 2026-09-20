#!/usr/bin/env node
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { createRun, getRun, listRuns, cancelRun, runOnce } from './runs.js';
import { MtTesterError } from '../core/errors.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = join(__dirname, '../../web');
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.ico': 'image/x-icon',
};

/**
 * @param {import('node:http').IncomingMessage} req
 * @returns {Promise<any>}
 */
async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

/**
 * @param {import('node:http').ServerResponse} res
 * @param {number} status
 * @param {unknown} data
 */
function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

/**
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @param {string} path
 */
async function handleApi(req, res, path) {
  const method = req.method || 'GET';

  if (path === '/api/health' && method === 'GET') {
    return sendJson(res, 200, { ok: true, service: 'mttester', version: '1.0.0' });
  }

  if (path === '/api/runs' && method === 'GET') {
    return sendJson(res, 200, { runs: listRuns() });
  }

  if (path === '/api/runs' && method === 'POST') {
    try {
      const body = await readJson(req);
      if (!body.authorized) {
        return sendJson(res, 400, {
          error: 'You must confirm authorization to load-test the target.',
        });
      }
      const run = createRun(body);
      return sendJson(res, 202, run);
    } catch (err) {
      const status = err instanceof MtTesterError ? 400 : 500;
      return sendJson(res, status, {
        error: err instanceof Error ? err.message : String(err),
        exitCode: err instanceof MtTesterError ? err.exitCode : 4,
      });
    }
  }

  const runMatch = path.match(/^\/api\/runs\/([^/]+)(\/cancel)?$/);
  if (runMatch) {
    const id = runMatch[1];
    const isCancel = Boolean(runMatch[2]);
    if (isCancel && method === 'POST') {
      const ok = cancelRun(id);
      return sendJson(res, ok ? 200 : 404, ok ? { ok: true } : { error: 'Run not found or not cancellable' });
    }
    if (method === 'GET') {
      const run = getRun(id);
      if (!run) return sendJson(res, 404, { error: 'Run not found' });
      return sendJson(res, 200, run);
    }
  }

  if (path === '/api/once' && method === 'POST') {
    try {
      const body = await readJson(req);
      const result = await runOnce(body);
      return sendJson(res, 200, result);
    } catch (err) {
      const status = err instanceof MtTesterError ? 400 : 500;
      return sendJson(res, status, {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return sendJson(res, 404, { error: 'Not found' });
}

/**
 * @param {import('node:http').ServerResponse} res
 * @param {string} filePath
 */
async function serveStatic(res, filePath) {
  try {
    const data = await readFile(filePath);
    const type = MIME[extname(filePath)] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type });
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  let path = url.pathname;

  try {
    if (path.startsWith('/api/')) {
      return await handleApi(req, res, path);
    }

    if (path === '/') path = '/index.html';
    const safe = path.replace(/\.\./g, '');
    await serveStatic(res, join(WEB_ROOT, safe));
  } catch (err) {
    sendJson(res, 500, { error: err instanceof Error ? err.message : String(err) });
  }
});

server.listen(PORT, HOST, () => {
  process.stdout.write(`MTTESTER web UI listening on http://${HOST}:${PORT}\n`);
});
