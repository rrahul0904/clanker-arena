import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const port = 32177;
const dataFile = path.join(os.tmpdir(), `clanker-smoke-${process.pid}.json`);
const child = spawn(process.execPath, ['server.mjs'], { cwd: process.cwd(), env: { ...process.env, PORT: String(port), DATA_FILE: dataFile }, stdio: ['ignore', 'pipe', 'pipe'] });
let stderr = ''; child.stderr.on('data', (d) => { stderr += d; });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
try {
  let ok = false;
  for (let i = 0; i < 30; i += 1) {
    try { const r = await fetch(`http://127.0.0.1:${port}/api/health`); if (r.ok) { ok = true; break; } } catch {}
    await sleep(100);
  }
  if (!ok) throw new Error(`server did not start: ${stderr}`);
  const health = await (await fetch(`http://127.0.0.1:${port}/api/health`)).json();
  if (!health.ok) throw new Error('health endpoint not healthy');
  const homepage = await (await fetch(`http://127.0.0.1:${port}/`)).text();
  if (!homepage.includes('Clanker Arena') || !homepage.includes('challenge-grid')) throw new Error('frontend shell failed');
  const challengePayload = await (await fetch(`http://127.0.0.1:${port}/api/challenges`)).json();
  if (JSON.stringify(challengePayload).includes('hiddenTests')) throw new Error('hidden tests leaked through public API');
  const generated = await (await fetch(`http://127.0.0.1:${port}/api/generate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ userId: 'u_demo', challengeSlug: 'merge-intervals', prompt: 'Sort by start, merge overlaps and touching intervals, return a new list.' }) })).json();
  if (!generated.generation?.id) throw new Error('generation endpoint failed');
  const submitResponse = await fetch(`http://127.0.0.1:${port}/api/submissions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ userId: 'u_demo', challengeSlug: 'merge-intervals', prompt: generated.generation.prompt, generatedCode: generated.generation.code, generationId: generated.generation.id }) });
  const submitted = await submitResponse.json();
  if (!submitResponse.ok || submitted.submission?.verdict?.passed !== submitted.submission?.verdict?.total) throw new Error(`submission failed: ${JSON.stringify(submitted)}`);
  console.log('smoke: healthy generate -> judge -> score -> leaderboard flow');
} finally {
  child.kill('SIGTERM');
  try { fs.unlinkSync(dataFile); } catch {}
}
