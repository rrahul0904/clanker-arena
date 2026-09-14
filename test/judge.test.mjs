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
