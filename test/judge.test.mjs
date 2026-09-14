import test from 'node:test';
import assert from 'node:assert/strict';
import { getChallengeBySlug } from '../src/domain/challenges.mjs';
import { judgeCode } from '../src/services/judge.mjs';

const config = { judgeMode: 'local', allowUnsafeRemoteCodeLocally: false };

test('local judge executes safe mock code against hidden tests', async () => {
  const challenge = getChallengeBySlug('stable-unique');
  const code = 'def stable_unique(items):\n    seen = set()\n    out = []\n    for item in items:\n        if item not in seen:\n            seen.add(item)\n            out.append(item)\n    return out\n';
  const verdict = await judgeCode({ challenge, code, generatedBy: 'mock', config });
  assert.equal(verdict.passed, verdict.total);
  assert.equal(verdict.total, 5);
});

test('local judge refuses remotely generated code by default', async () => {
  const challenge = getChallengeBySlug('stable-unique');
  await assert.rejects(() => judgeCode({ challenge, code: 'def stable_unique(items):\n    return []\n', generatedBy: 'anthropic', config }), /Refusing to execute remotely generated code/);
});

test('local judge blocks dynamic execution primitives', async () => {
  const challenge = getChallengeBySlug('stable-unique');
  await assert.rejects(() => judgeCode({ challenge, code: 'def stable_unique(items):\n    return eval("[]")\n', generatedBy: 'mock', config }), /blocked/);
});

test('Judge0 submissions disable network and set explicit resource limits', async () => {
  const original = globalThis.fetch;
  const payloads = [];
  globalThis.fetch = async (url, options = {}) => {
    if (options.method === 'POST') {
      payloads.push(JSON.parse(options.body));
      return new Response(JSON.stringify({ token: 'judge-token' }), { status: 201, headers: { 'content-type': 'application/json' } });
    }
    return new Response(JSON.stringify({ status: { id: 3, description: 'Accepted' }, stdout: JSON.stringify({ passed: 5, total: 5, runtimeMs: 1.5, failures: [] }) }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    const challenge = getChallengeBySlug('stable-unique');
    const verdict = await judgeCode({
      challenge,
      code: 'def stable_unique(items):\n    return list(dict.fromkeys(items))\n',
      generatedBy: 'anthropic',
      config: { judgeMode: 'judge0', judge0Url: 'https://judge.example', judge0LanguageId: 71, judge0MemoryKb: 96000, judge0MaxProcesses: 1, judge0MaxFileSizeKb: 32 }
    });
    assert.equal(verdict.passed, 5);
    assert.equal(payloads[0].enable_network, false);
    assert.equal(payloads[0].max_processes_and_or_threads, 1);
    assert.equal(payloads[0].memory_limit, 96000);
    assert.equal(payloads[0].max_file_size, 32);
    assert.ok(payloads[0].cpu_time_limit > 0);
    assert.ok(payloads[0].wall_time_limit >= payloads[0].cpu_time_limit);
  } finally {
    globalThis.fetch = original;
  }
});
