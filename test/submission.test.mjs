import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { JsonStore } from '../src/domain/store.mjs';
import { createSubmissionService } from '../src/services/submission-service.mjs';

function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'clanker-store-'));
  const store = new JsonStore(path.join(dir, 'state.json')); store.load();
  const service = createSubmissionService({ store, config: { generatorMode: 'mock', judgeMode: 'local', allowUnsafeRemoteCodeLocally: false } });
  return { dir, store, service };
}

test('generate -> judge -> score -> rating is end-to-end functional', async () => {
  const { dir, store, service } = fixture();
  const prompt = 'Implement a stable unique function preserving order and handling an empty list.';
  const generation = await service.generate({ userId: 'u_demo', challengeSlug: 'stable-unique', prompt });
  const before = store.getUser('u_demo').rating;
  const { submission, user } = await service.submit({ userId: 'u_demo', challengeSlug: 'stable-unique', prompt, generatedCode: generation.code, generationId: generation.id });
  assert.equal(submission.verdict.passed, submission.verdict.total);
  assert.ok(submission.score.total >= 90);
  assert.ok(user.rating > before);
  assert.equal(user.solvedCount, 1);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('submission is bound to the exact generation prompt and is single-use', async () => {
  const { dir, service } = fixture();
  const prompt = 'Sort the intervals and merge overlap, including touching endpoints.';
  const generation = await service.generate({ userId: 'u_demo', challengeSlug: 'merge-intervals', prompt });
  await assert.rejects(() => service.submit({ userId: 'u_demo', challengeSlug: 'merge-intervals', prompt: 'short cheat prompt', generatedCode: generation.code, generationId: generation.id }), /does not match/);
  await service.submit({ userId: 'u_demo', challengeSlug: 'merge-intervals', prompt, generatedCode: generation.code, generationId: generation.id });
  await assert.rejects(() => service.submit({ userId: 'u_demo', challengeSlug: 'merge-intervals', prompt, generatedCode: generation.code, generationId: generation.id }), /already been submitted/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('repeating the same perfect score with a fresh generation cannot farm rating', async () => {
  const { dir, store, service } = fixture();
  const prompt = 'Implement stable unique preserving order with a set and result list.';
  const first = await service.generate({ userId: 'u_demo', challengeSlug: 'stable-unique', prompt });
  await service.submit({ userId: 'u_demo', challengeSlug: 'stable-unique', prompt, generatedCode: first.code, generationId: first.id });
  const afterFirst = store.getUser('u_demo').rating;
  const second = await service.generate({ userId: 'u_demo', challengeSlug: 'stable-unique', prompt });
  const { submission } = await service.submit({ userId: 'u_demo', challengeSlug: 'stable-unique', prompt, generatedCode: second.code, generationId: second.id });
  assert.equal(submission.ratingDelta, 0);
  assert.equal(store.getUser('u_demo').rating, afterFirst);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('generation and submission idempotency replay the original result without extra rating', async () => {
  const { dir, store, service } = fixture();
  const prompt = 'Implement stable unique preserving order and edge cases.';
  const first = await service.generate({ userId: 'u_demo', challengeSlug: 'stable-unique', prompt, idempotencyKey: 'generate-1' });
  const again = await service.generate({ userId: 'u_demo', challengeSlug: 'stable-unique', prompt: 'ignored retry payload', idempotencyKey: 'generate-1' });
  assert.equal(again.id, first.id);

  const result = await service.submit({ userId: 'u_demo', challengeSlug: 'stable-unique', prompt, generatedCode: first.code, generationId: first.id, idempotencyKey: 'submit-1' });
  const rating = store.getUser('u_demo').rating;
  const replay = await service.submit({ userId: 'u_demo', challengeSlug: 'stable-unique', prompt, generatedCode: first.code, generationId: first.id, idempotencyKey: 'submit-1' });
  assert.equal(replay.replayed, true);
  assert.equal(replay.submission.id, result.submission.id);
  assert.equal(store.getUser('u_demo').rating, rating);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('generation rate limits are enforced before provider execution', async () => {
  const { dir, store } = fixture();
  const service = createSubmissionService({ store, config: { generatorMode: 'mock', judgeMode: 'local', allowUnsafeRemoteCodeLocally: false, generationLimitPerHour: 1 } });
  await service.generate({ userId: 'u_demo', challengeSlug: 'stable-unique', prompt: 'Implement stable unique correctly.' });
  await assert.rejects(
    () => service.generate({ userId: 'u_demo', challengeSlug: 'merge-intervals', prompt: 'Implement interval merging correctly.' }),
    (error) => error.statusCode === 429
  );
  fs.rmSync(dir, { recursive: true, force: true });
});
