import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './src/config.mjs';
import { JsonStore } from './src/domain/store.mjs';
import { challenges, getChallengeBySlug, publicChallenge } from './src/domain/challenges.mjs';
import { leaderboard } from './src/services/leaderboard-service.mjs';
import { createSubmissionService } from './src/services/submission-service.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(here, 'public');
const store = new JsonStore(config.dataFile);
store.load();
const submissions = createSubmissionService({ store, config });

const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(type.startsWith('application/json') ? JSON.stringify(body) : body);
}

async function bodyJson(req) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 64_000) throw new Error('Request too large.');
  }
  return raw ? JSON.parse(raw) : {};
}

function errorMessage(error) {
  return error instanceof Error ? error.message : 'Unknown error';
}

async function api(req, res, url) {
  if (req.method === 'GET' && url.pathname === '/api/health') {
    return send(res, 200, { ok: true, generatorMode: config.generatorMode, judgeMode: config.judgeMode });
  }
  if (req.method === 'GET' && url.pathname === '/api/challenges') {
    return send(res, 200, { challenges: challenges.map(publicChallenge) });
  }
  if (req.method === 'GET' && url.pathname.startsWith('/api/challenges/')) {
    const challenge = getChallengeBySlug(decodeURIComponent(url.pathname.split('/').pop()));
    return challenge ? send(res, 200, { challenge: publicChallenge(challenge) }) : send(res, 404, { error: 'Challenge not found.' });
  }
  if (req.method === 'GET' && url.pathname === '/api/leaderboard') {
    return send(res, 200, { leaderboard: leaderboard(store) });
  }
  if (req.method === 'GET' && url.pathname === '/api/me') {
    return send(res, 200, { user: store.getUser('u_demo') });
  }
  if (req.method === 'GET' && url.pathname.startsWith('/api/submissions/')) {
    const submission = store.getSubmission(decodeURIComponent(url.pathname.split('/').pop()));
    return submission ? send(res, 200, { submission }) : send(res, 404, { error: 'Submission not found.' });
  }
  if (req.method === 'POST' && url.pathname === '/api/generate') {
    const input = await bodyJson(req);
    const generation = await submissions.generate(input);
    return send(res, 201, { generation });
  }
  if (req.method === 'POST' && url.pathname === '/api/submissions') {
    const input = await bodyJson(req);
    const result = await submissions.submit(input);
    return send(res, 201, result);
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
    send(res, 400, { error: errorMessage(error) });
  }
});

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  server.listen(config.port, config.host, () => {
    console.log(`Clanker Arena listening on http://${config.host}:${config.port}`);
  });
}
