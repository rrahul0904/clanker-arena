import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { tierForRating } from './tiers.mjs';

const seedUsers = [
  { id: 'u_demo', username: 'you', displayName: 'Demo Engineer', rating: 1375 },
  { id: 'u_ada', username: 'ada_prompt', displayName: 'Ada Prompt', rating: 1824 },
  { id: 'u_grace', username: 'graceful_failover', displayName: 'Grace F.', rating: 1710 },
  { id: 'u_lin', username: 'lin_codes', displayName: 'Lin Codes', rating: 1592 },
  { id: 'u_turing', username: 'turing_tested', displayName: 'Turing Tested', rating: 1488 }
].map((user) => ({ ...user, tier: tierForRating(user.rating), solvedCount: 0, submissionCount: 0 }));

function freshState() {
  return { users: seedUsers, generations: [], submissions: [], solves: [] };
}

export class JsonStore {
  constructor(file) {
    this.file = file;
    this.state = freshState();
  }

  load() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    if (!fs.existsSync(this.file)) {
      this.persist();
      return;
    }
    try {
      this.state = JSON.parse(fs.readFileSync(this.file, 'utf8'));
    } catch {
      this.state = freshState();
      this.persist();
    }
  }

  persist() {
    const temp = `${this.file}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(this.state, null, 2));
    fs.renameSync(temp, this.file);
  }

  getUser(id) {
    return this.state.users.find((user) => user.id === id) ?? null;
  }

  listUsers() {
    return [...this.state.users];
  }

  createGeneration(input) {
    const generation = { id: `gen_${randomUUID()}`, createdAt: new Date().toISOString(), ...input };
    this.state.generations.push(generation);
    this.persist();
    return generation;
  }

  getGeneration(id) {
    return this.state.generations.find((item) => item.id === id) ?? null;
  }

  hasSolve(userId, challengeSlug) {
    return this.state.solves.some((solve) => solve.userId === userId && solve.challengeSlug === challengeSlug);
  }

  hasSubmissionForGeneration(generationId) {
    return this.state.submissions.some((submission) => submission.generationId === generationId);
  }

  getBestScore(userId, challengeSlug) {
    const scores = this.state.submissions
      .filter((submission) => submission.userId === userId && submission.challengeSlug === challengeSlug)
      .map((submission) => submission.score?.total)
      .filter(Number.isFinite);
    return scores.length ? Math.max(...scores) : null;
  }

  addSubmission({ userId, challengeSlug, prompt, generatedCode, generationId, verdict, score, ratingDelta }) {
    const user = this.getUser(userId);
    if (!user) throw new Error('Unknown user');
    const submission = {
      id: `sub_${randomUUID()}`,
      createdAt: new Date().toISOString(),
      userId,
      challengeSlug,
      prompt,
      generatedCode,
      generationId,
      verdict,
      score,
      ratingDelta
    };
    this.state.submissions.push(submission);
    user.submissionCount += 1;
    user.rating = Math.max(0, user.rating + ratingDelta);
    user.tier = tierForRating(user.rating);

    const passedAll = verdict.passed === verdict.total && verdict.total > 0;
    if (passedAll && !this.hasSolve(userId, challengeSlug)) {
      this.state.solves.push({ userId, challengeSlug, submissionId: submission.id, solvedAt: submission.createdAt });
      user.solvedCount += 1;
    }
    this.persist();
    return submission;
  }

  getSubmission(id) {
    return this.state.submissions.find((item) => item.id === id) ?? null;
  }
}
