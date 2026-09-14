import test from 'node:test';
import assert from 'node:assert/strict';
import { promptEfficiency, ratingContribution, ratingDelta, scoreSubmission } from '../src/domain/scoring.mjs';
import { tierForRating } from '../src/domain/tiers.mjs';

test('tier thresholds match the public ladder', () => {
  assert.equal(tierForRating(0), 'Newbie');
  assert.equal(tierForRating(1200), 'Apprentice');
  assert.equal(tierForRating(1600), 'Expert');
  assert.equal(tierForRating(2200), 'Grandmaster');
});

test('concise prompts receive maximum efficiency points', () => {
  assert.equal(promptEfficiency('Explain edge cases and return valid Python.'), 5);
  assert.equal(promptEfficiency('x'.repeat(2500)), 1);
});

test('perfect fast solution scores highly', () => {
  const score = scoreSubmission({ passed: 5, total: 5, runtimeMs: 5, budgetMs: 1000, code: 'def solve(x):\n    return x\n', entrypoint: 'solve', prompt: 'Implement solve carefully with edge cases.' });
  assert.equal(score.correctness, 70);
  assert.ok(score.total >= 90);
});

test('rating rewards difficulty but only personal-best improvement', () => {
  assert.ok(ratingContribution({ difficulty: 'hard', score: 100 }) > ratingContribution({ difficulty: 'easy', score: 100 }));
  assert.equal(ratingDelta({ difficulty: 'medium', score: 40 }), 0);
  assert.equal(ratingDelta({ difficulty: 'hard', score: 100, previousBestScore: 100 }), 0);
  assert.ok(ratingDelta({ difficulty: 'hard', score: 100, previousBestScore: 70 }) > 0);
});
