const difficultyGain = { easy: 18, medium: 28, hard: 42 };

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function promptEfficiency(prompt) {
  const length = prompt.trim().length;
  if (length === 0) return 0;
  if (length <= 900) return 5;
  if (length <= 1600) return 4;
  if (length <= 2400) return 2;
  return 1;
}

export function qualityScore({ code, entrypoint }) {
  let score = 0;
  if (new RegExp(`def\\s+${entrypoint}\\s*\\(`).test(code)) score += 5;
  if (!/\bprint\s*\(/.test(code)) score += 2;
  if (code.length <= 1800) score += 2;
  if (!/\b(global|nonlocal)\b/.test(code)) score += 1;
  return score;
}

export function performanceScore(runtimeMs, budgetMs) {
  if (!Number.isFinite(runtimeMs) || runtimeMs < 0) return 0;
  const ratio = runtimeMs / Math.max(1, budgetMs);
  if (ratio <= 0.25) return 15;
  if (ratio <= 0.5) return 13;
  if (ratio <= 1) return 10;
  if (ratio <= 1.5) return 5;
  return 0;
}

export function scoreSubmission({ passed, total, runtimeMs, budgetMs, code, entrypoint, prompt }) {
  const correctness = total > 0 ? Math.round((passed / total) * 70) : 0;
  const quality = qualityScore({ code, entrypoint });
  const performance = performanceScore(runtimeMs, budgetMs);
  const efficiency = promptEfficiency(prompt);
  const totalScore = clamp(correctness + quality + performance + efficiency, 0, 100);
  return { correctness, quality, performance, efficiency, total: totalScore };
}

export function ratingContribution({ difficulty, score }) {
  const maxGain = difficultyGain[difficulty] ?? 20;
  if (score < 50) return 0;
  return Math.round(((clamp(score, 50, 100) - 50) / 50) * maxGain);
}

export function ratingDelta({ difficulty, score, previousBestScore = null, firstSolve = false }) {
  const current = ratingContribution({ difficulty, score });
  const previous = previousBestScore == null ? 0 : ratingContribution({ difficulty, score: previousBestScore });
  const improvement = Math.max(0, current - previous);
  const firstSolveBonus = firstSolve && score >= 70 ? 5 : 0;
  return improvement + firstSolveBonus;
}
