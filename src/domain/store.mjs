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
  return { users: seedUsers, generations: [], submissions: [], solves: [], rateEvents: [] };
}

function normalizeState(state) {
  return {
    users: Array.isArray(state?.users) ? state.users : seedUsers,
    generations: Array.isArray(state?.generations) ? state.generations : [],
    submissions: Array.isArray(state?.submissions) ? state.submissions : [],
    solves: Array.isArray(state?.solves) ? state.solves : [],
    rateEvents: Array.isArray(state?.rateEvents) ? state.rateEvents : []
  };
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
      this.state = normalizeState(JSON.parse(fs.readFileSync(this.file, 'utf8')));
    } catch {
      this.state = freshState();
      this.persist();
    }
  }

  readiness() {
    return { ok: true, mode: 'json' };
  }

  persist() {
    const temp = `${this.file}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(this.state, null, 2));
    fs.renameSync(temp, this.file);
  }

  ensureUser(identity) {
    const existing = this.getUser(identity.id);
    if (existing) return existing;
    const user = {
      id: identity.id,
      username: identity.username || `user_${String(identity.id).slice(0, 8)}`,
      displayName: identity.displayName || identity.username || 'Engineer',
      rating: 1200,
      tier: tierForRating(1200),
      solvedCount: 0,
      submissionCount: 0
    };
    this.state.users.push(user);
    this.persist();
    return user;
  }

  getUser(id) {
    return this.state.users.find((user) => user.id === id) ?? null;
  }

  listUsers() {
    return [...this.state.users];
  }

  createGeneration(input) {
    if (input.idempotencyKey) {
      const existing = this.getGenerationByIdempotencyKey(input.userId, input.idempotencyKey);
      if (existing) return existing;
    }
    const generation = { id: `gen_${randomUUID()}`, createdAt: new Date().toISOString(), ...input };
    this.state.generations.push(generation);
    this.persist();
    return generation;
  }

  getGeneration(id) {
    return this.state.generations.find((item) => item.id === id) ?? null;
  }

  getGenerationByIdempotencyKey(userId, idempotencyKey) {
    if (!idempotencyKey) return null;
    return this.state.generations.find((item) => item.userId === userId && item.idempotencyKey === idempotencyKey) ?? null;
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

  getSubmissionByIdempotencyKey(userId, idempotencyKey) {
    if (!idempotencyKey) return null;
    return this.state.submissions.find((item) => item.userId === userId && item.idempotencyKey === idempotencyKey) ?? null;
  }

  consumeRateLimit({ userId, scope, limit, windowSeconds }) {
    const now = Date.now();
    const cutoff = now - windowSeconds * 1000;
    this.state.rateEvents = this.state.rateEvents.filter((item) => Date.parse(item.createdAt) > cutoff);
    const count = this.state.rateEvents.filter((item) => item.userId === userId && item.scope === scope).length;
    if (count >= limit) return { allowed: false, remaining: 0, retryAfterSeconds: Math.max(1, Math.ceil((Date.parse(this.state.rateEvents.find((item) => item.userId === userId && item.scope === scope)?.createdAt || new Date().toISOString()) + windowSeconds * 1000 - now) / 1000)) };
    this.state.rateEvents.push({ userId, scope, createdAt: new Date(now).toISOString() });
    this.persist();
    return { allowed: true, remaining: Math.max(0, limit - count - 1), retryAfterSeconds: 0 };
  }

  addSubmission({ userId, challengeSlug, prompt, generatedCode, generationId, verdict, score, ratingDelta, idempotencyKey }) {
    if (idempotencyKey) {
      const existing = this.getSubmissionByIdempotencyKey(userId, idempotencyKey);
      if (existing) return existing;
    }
    const user = this.getUser(userId);
    if (!user) throw new Error('Unknown user');
    if (generationId && this.hasSubmissionForGeneration(generationId)) throw new Error('This generation has already been submitted.');
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
      ratingDelta,
      idempotencyKey: idempotencyKey || null
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
