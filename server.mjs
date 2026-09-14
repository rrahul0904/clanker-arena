import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config, validateRuntimeConfig } from './src/config.mjs';
import { createStore } from './src/services/store-factory.mjs';
import { authenticateRequest } from './src/services/auth.mjs';
import { challenges, getChallengeBySlug, publicChallenge } from './src/domain/challenges.mjs';
import { leaderboard } from './src/services/leaderboard-service.mjs';
import { createSubmissionService } from './src/services/submission-service.mjs';

const startupErrors = validateRuntimeConfig(config);
if (startupErrors.length) throw new Error(`Invalid runtime configuration:\n- ${startupErrors.join('\n- ')}`);

const here = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(here, 'public');
const store = createStore(config);
await store.load();
const submissions = createSubmissionService({ store, config });

const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };

function send(res, status, body, type = 'application/json; charset=utf-8', headers = {}) {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store', ...headers });
  res.end(type.startsWith('application/json') ? JSON.stringify(body) : body);
}

async function bodyJson(req) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 64_000) {
      const error = new Error('Request too large.');
      error.statusCode = 413;
      throw error;
    }
  }
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    const error = new Error('Request body must be valid JSON.');
    error.statusCode = 400;
    throw error;
  }
}

function idempotencyKey(req) {
  const key = String(req.headers['idempotency-key'] || '').trim();
  if (config.requireIdempotencyKey && !key) {
    const error = new Error('Idempotency-Key header is required.');
    error.statusCode = 400;
    throw error;
  }
  if (key.length > 120) {
    const error = new Error('Idempotency-Key is too long.');
    error.statusCode = 400;
    throw error;
  }
  return key || null;
}

async function identity(req) {
  const auth = await authenticateRequest(req, config);
  await store.ensureUser(auth);
  return auth;
}

function errorMessage(error) {
  return error instanceof Error ? error.message : 'Unknown error';
}

async function api(req, res, url) {
  if (req.method === 'GET' && url.pathname === '/api/health') {
    return send(res, 200, { ok: true, appEnv: config.appEnv, generatorMode: config.generatorMode, judgeMode: config.judgeMode, storageMode: config.storageMode, authMode: config.authMode });
  }
  if (req.method === 'GET' && url.pathname === '/api/ready') {
    const readiness = await store.readiness();
    return send(res, readiness.ok ? 200 : 503, { ok: readiness.ok, storage: readiness });
  }
  if (req.method === 'GET' && url.pathname === '/api/challenges') {
    return send(res, 200, { challenges: challenges.map(publicChallenge) });
  }
  if (req.method === 'GET' && url.pathname.startsWith('/api/challenges/')) {
    const challenge = getChallengeBySlug(decodeURIComponent(url.pathname.split('/').pop()));
    return challenge ? send(res, 200, { challenge: publicChallenge(challenge) }) : send(res, 404, { error: 'Challenge not found.' });
  }
  if (req.method === 'GET' && url.pathname === '/api/leaderboard') {
    return send(res, 200, { leaderboard: await leaderboard(store) });
  }
  if (req.method === 'GET' && url.pathname === '/api/me') {
    const auth = await identity(req);
    return send(res, 200, { user: await store.getUser(auth.id), authProvider: auth.provider });
  }
  if (req.method === 'GET' && url.pathname.startsWith('/api/submissions/')) {
    const auth = await identity(req);
    const submission = await store.getSubmission(decodeURIComponent(url.pathname.split('/').pop()));
    if (!submission) return send(res, 404, { error: 'Submission not found.' });
    if (submission.userId !== auth.id) return send(res, 403, { error: 'You cannot access this submission.' });
    return send(res, 200, { submission });
  }
  if (req.method === 'POST' && url.pathname === '/api/generate') {
    const auth = await identity(req);
    const input = await bodyJson(req);
    const generation = await submissions.generate({ ...input, userId: auth.id, idempotencyKey: idempotencyKey(req) });
    return send(res, 201, { generation });
  }
  if (req.method === 'POST' && url.pathname === '/api/submissions') {
    const auth = await identity(req);
    const input = await bodyJson(req);
    const result = await submissions.submit({ ...input, userId: auth.id, idempotencyKey: idempotencyKey(req) });
    return send(res, result.replayed ? 200 : 201, result);
  }
  return false;
}

async function staticFile(req, res, url) {
  if (req.method !== 'GET') return false;
  let requested = url.pathname === '/' ? '/index.html' : url.pathname;
  if (!['/index.html', '/app.js', '/styles.css'].includes(requested)) requested = '/index.html';
  const file = path.join(publicDir, requested);
  try {
    const content = await fs.readFile(file);
    send(res, 200, content, mime[path.extname(file)] || 'application/octet-stream');
  } catch {
    send(res, 404, 'Not found', 'text/plain; charset=utf-8');
  }
  return true;
}

export const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  try {
    if (url.pathname.startsWith('/api/')) {
      const handled = await api(req, res, url);
      if (handled === false) send(res, 404, { error: 'API route not found.' });
      return;
    }
    await staticFile(req, res, url);
  } catch (error) {
    const status = Number(error?.statusCode) || 400;
    const headers = status === 429 && error?.retryAfterSeconds ? { 'retry-after': String(error.retryAfterSeconds) } : {};
    send(res, status, { error: errorMessage(error) }, 'application/json; charset=utf-8', headers);
  }
});

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  server.listen(config.port, config.host, () => {
    console.log(`Clanker Arena listening on http://${config.host}:${config.port}`);
  });
}
