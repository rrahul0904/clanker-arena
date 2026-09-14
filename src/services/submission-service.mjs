import { getChallengeBySlug } from '../domain/challenges.mjs';
import { scoreSubmission, ratingDelta } from '../domain/scoring.mjs';
import { generateCode } from './generator.mjs';
import { judgeCode } from './judge.mjs';

export function createSubmissionService({ store, config }) {
  return {
    async generate({ userId, challengeSlug, prompt }) {
      if (!store.getUser(userId)) throw new Error('Unknown user.');
      const challenge = getChallengeBySlug(challengeSlug);
      if (!challenge) throw new Error('Unknown challenge.');
      const result = await generateCode({ mode: config.generatorMode, challenge, prompt, config });
      return store.createGeneration({ userId, challengeSlug, prompt, ...result });
    },

    async submit({ userId, challengeSlug, prompt, generatedCode, generationId }) {
      const user = store.getUser(userId);
      if (!user) throw new Error('Unknown user.');
      const challenge = getChallengeBySlug(challengeSlug);
      if (!challenge) throw new Error('Unknown challenge.');
      const generation = generationId ? store.getGeneration(generationId) : null;
      const generatedBy = generation?.provider ?? 'unknown';
      if (generation && (generation.userId !== userId || generation.challengeSlug !== challengeSlug || generation.code !== generatedCode || generation.prompt !== prompt)) {
        throw new Error('Generation does not match this submission.');
      }
      if (generationId && store.hasSubmissionForGeneration(generationId)) {
        throw new Error('This generation has already been submitted.');
      }
      const firstSolve = !store.hasSolve(userId, challengeSlug);
      const previousBestScore = store.getBestScore(userId, challengeSlug);
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
      const submission = store.addSubmission({ userId, challengeSlug, prompt, generatedCode, generationId, verdict, score, ratingDelta: delta });
      return { submission, user: store.getUser(userId) };
    }
  };
}
