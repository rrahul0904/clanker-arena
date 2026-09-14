function dbUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    rating: row.rating,
    tier: row.tier,
    solvedCount: row.solved_count,
    submissionCount: row.submission_count
  };
}

function dbGeneration(row) {
  if (!row) return null;
  return {
    id: row.id,
    createdAt: row.created_at,
    userId: row.user_id,
    challengeSlug: row.challenge_slug,
    prompt: row.prompt,
    code: row.code,
    provider: row.provider,
    model: row.model,
    inputChars: row.input_chars,
    idempotencyKey: row.idempotency_key
  };
}

function dbSubmission(row) {
  if (!row) return null;
  return {
    id: row.id,
    createdAt: row.created_at,
    userId: row.user_id,
    challengeSlug: row.challenge_slug,
    prompt: row.prompt,
    generatedCode: row.generated_code,
    generationId: row.generation_id,
    verdict: row.verdict,
    score: row.score,
    ratingDelta: row.rating_delta,
    idempotencyKey: row.idempotency_key
  };
}

function filter(value) {
  return `eq.${encodeURIComponent(String(value))}`;
}

export class SupabaseStore {
  constructor(config) {
    this.url = config.supabaseUrl;
    this.secretKey = config.supabaseSecretKey;
  }

  headers(extra = {}) {
    return {
      apikey: this.secretKey,
      'content-type': 'application/json',
      'user-agent': 'clanker-arena-server/1.0',
      ...extra
    };
  }

  async request(path, options = {}) {
    const response = await fetch(`${this.url}/rest/v1${path}`, {
      ...options,
      headers: this.headers(options.headers || {})
    });
    const text = await response.text();
    let data = null;
    if (text) {
      try { data = JSON.parse(text); } catch { data = { message: text.slice(0, 500) }; }
    }
    if (!response.ok) {
      const message = data?.message || data?.hint || `Supabase request failed (${response.status}).`;
      const error = new Error(message);
      error.statusCode = response.status;
      throw error;
    }
    return data;
  }

  async load() {
    const status = await this.readiness();
    if (!status.ok) throw new Error(`Supabase storage is not ready: ${status.error || 'unknown error'}`);
  }

  async readiness() {
    try {
      await this.request('/users?select=id&limit=1');
      return { ok: true, mode: 'supabase' };
    } catch (error) {
      return { ok: false, mode: 'supabase', error: error instanceof Error ? error.message : 'Supabase unavailable.' };
    }
  }

  async ensureUser(identity) {
    const existing = await this.getUser(identity.id);
    if (existing) return existing;
    const suffix = String(identity.id).replace(/-/g, '').slice(0, 6);
    const base = String(identity.username || 'engineer').slice(0, 32);
    const rows = await this.request('/users?on_conflict=id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify({
        id: identity.id,
        username: `${base}_${suffix}`.slice(0, 40),
        display_name: String(identity.displayName || base).slice(0, 80)
      })
    });
    return dbUser(rows?.[0]);
  }

  async getUser(id) {
    const rows = await this.request(`/users?id=${filter(id)}&select=id,username,display_name,rating,tier,solved_count,submission_count&limit=1`);
    return dbUser(rows?.[0]);
  }

  async listUsers() {
    const rows = await this.request('/users?select=id,username,display_name,rating,tier,solved_count,submission_count&order=rating.desc,username.asc&limit=200');
    return rows.map(dbUser);
  }

  async createGeneration(input) {
    if (input.idempotencyKey) {
      const existing = await this.getGenerationByIdempotencyKey(input.userId, input.idempotencyKey);
      if (existing) return existing;
    }
    try {
      const rows = await this.request('/generations', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({
          user_id: input.userId,
          challenge_slug: input.challengeSlug,
          prompt: input.prompt,
          code: input.code,
          provider: input.provider,
          model: input.model,
          input_chars: input.inputChars,
          idempotency_key: input.idempotencyKey || null
        })
      });
      return dbGeneration(rows?.[0]);
    } catch (error) {
      if (error?.statusCode === 409 && input.idempotencyKey) {
        const existing = await this.getGenerationByIdempotencyKey(input.userId, input.idempotencyKey);
        if (existing) return existing;
      }
      throw error;
    }
  }

  async getGeneration(id) {
    const rows = await this.request(`/generations?id=${filter(id)}&select=*&limit=1`);
    return dbGeneration(rows?.[0]);
  }

  async getGenerationByIdempotencyKey(userId, idempotencyKey) {
    if (!idempotencyKey) return null;
    const rows = await this.request(`/generations?user_id=${filter(userId)}&idempotency_key=${filter(idempotencyKey)}&select=*&limit=1`);
    return dbGeneration(rows?.[0]);
  }

  async hasSolve(userId, challengeSlug) {
    const rows = await this.request(`/solves?user_id=${filter(userId)}&challenge_slug=${filter(challengeSlug)}&select=user_id&limit=1`);
    return rows.length > 0;
  }

  async hasSubmissionForGeneration(generationId) {
    const rows = await this.request(`/submissions?generation_id=${filter(generationId)}&select=id&limit=1`);
    return rows.length > 0;
  }

  async getBestScore(userId, challengeSlug) {
    const rows = await this.request(`/submissions?user_id=${filter(userId)}&challenge_slug=${filter(challengeSlug)}&select=score&limit=200`);
    const scores = rows.map((row) => row.score?.total).filter(Number.isFinite);
    return scores.length ? Math.max(...scores) : null;
  }

  async getSubmissionByIdempotencyKey(userId, idempotencyKey) {
    if (!idempotencyKey) return null;
    const rows = await this.request(`/submissions?user_id=${filter(userId)}&idempotency_key=${filter(idempotencyKey)}&select=*&limit=1`);
    return dbSubmission(rows?.[0]);
  }

  async consumeRateLimit({ userId, scope, limit, windowSeconds }) {
    const rows = await this.request('/rpc/consume_rate_limit', {
      method: 'POST',
      body: JSON.stringify({ p_user_id: userId, p_scope: scope, p_limit: limit, p_window_seconds: windowSeconds })
    });
    const row = rows?.[0] || {};
    return { allowed: Boolean(row.allowed), remaining: Number(row.remaining || 0), retryAfterSeconds: Number(row.retry_after_seconds || 0) };
  }

  async addSubmission(input) {
    const result = await this.request('/rpc/apply_submission_result', {
      method: 'POST',
      body: JSON.stringify({
        p_user_id: input.userId,
        p_challenge_slug: input.challengeSlug,
        p_prompt: input.prompt,
        p_generated_code: input.generatedCode,
        p_generation_id: input.generationId || null,
        p_verdict: input.verdict,
        p_score: input.score,
        p_rating_delta: input.ratingDelta,
        p_idempotency_key: input.idempotencyKey || null
      })
    });
    return dbSubmission(result?.submission || result?.[0]?.submission || null);
  }

  async getSubmission(id) {
    const rows = await this.request(`/submissions?id=${filter(id)}&select=*&limit=1`);
    return dbSubmission(rows?.[0]);
  }
}
