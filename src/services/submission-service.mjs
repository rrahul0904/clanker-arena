import { getChallengeBySlug } from '../domain/challenges.mjs';
import { scoreSubmission, ratingDelta } from '../domain/scoring.mjs';
import { generateCode } from './generator.mjs';
import { judgeCode } from './judge.mjs';

function rateLimitError(scope, result) {
  const error = new Error(`${scope} rate limit exceeded. Try again in ${result.retryAfterSeconds || 1} seconds.`);
  error.statusCode = 429;
  error.retryAfterSeconds = result.retryAfterSeconds || 1;
  return error;
}

async function consume(store, input) {
  if (typeof store.consumeRateLimit !== 'function') return;
  const result = await store.consumeRateLimit(input);
  if (!result.allowed) throw rateLimitError(input.scope, result);
}

export function createSubmissionService({ store, config }) {
  return {
    async generate({ userId, challengeSlug, prompt, idempotencyKey }) {
      if (!await store.getUser(userId)) throw new Error('Unknown user.');
      const challenge = getChallengeBySlug(challengeSlug);
      if (!challenge) throw new Error('Unknown challenge.');
      if (idempotencyKey && typeof store.getGenerationByIdempotencyKey === 'function') {
        const existing = await store.getGenerationByIdempotencyKey(userId, idempotencyKey);
        if (existing) return existing;
      }
      await consume(store, { userId, scope: 'generation', limit: config.generationLimitPerHour || 30, windowSeconds: 3600 });
      const result = await generateCode({ mode: config.generatorMode, challenge, prompt, config });
      return store.createGeneration({ userId, challengeSlug, prompt, idempotencyKey: idempotencyKey || null, ...result });
    },

    async submit({ userId, challengeSlug, prompt, generatedCode, generationId, idempotencyKey }) {
      const user = await store.getUser(userId);
      if (!user) throw new Error('Unknown user.');
      const challenge = getChallengeBySlug(challengeSlug);
      if (!challenge) throw new Error('Unknown challenge.');
      if (idempotencyKey && typeof store.getSubmissionByIdempotencyKey === 'function') {
        const existing = await store.getSubmissionByIdempotencyKey(userId, idempotencyKey);
        if (existing) return { submission: existing, user: await store.getUser(userId), replayed: true };
      }
      await consume(store, { userId, scope: 'submission', limit: config.submissionLimitPerHour || 60, windowSeconds: 3600 });
      const generation = generationId ? await store.getGeneration(generationId) : null;
      const generatedBy = generation?.provider ?? 'unknown';
      if (!generation && config.appEnv === 'production') throw new Error('Production submissions require a generationId.');
      if (generation && (generation.userId !== userId || generation.challengeSlug !== challengeSlug || generation.code !== generatedCode || generation.prompt !== prompt)) {
        throw new Error('Generation does not match this submission.');
      }
      if (generationId && await store.hasSubmissionForGeneration(generationId)) {
        throw new Error('This generation has already been submitted.');
      }
      const firstSolve = !await store.hasSolve(userId, challengeSlug);
      const previousBestScore = await store.getBestScore(userId, challengeSlug);
      const verdict = await judgeCode({ challenge, code: generatedCode, generatedBy, config });
      const score = scoreSubmission({
        passed: verdict.passed,
        total: verdict.total,
        runtimeMs: verdict.runtimeMs,
        budgetMs: challenge.runtimeMs,
        code: generatedCode,
        entrypoint: challenge.entrypoint,
        prompt
      });
      const delta = ratingDelta({ difficulty: challenge.difficulty, score: score.total, previousBestScore, firstSolve });
      const submission = await store.addSubmission({ userId, challengeSlug, prompt, generatedCode, generationId, verdict, score, ratingDelta: delta, idempotencyKey: idempotencyKey || null });
      return { submission, user: await store.getUser(userId), replayed: false };
    }
  };
}
