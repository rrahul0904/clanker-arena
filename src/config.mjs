import path from 'node:path';

const appEnv = process.env.APP_ENV || 'development';

export const config = {
  appEnv,
  host: process.env.HOST || '0.0.0.0',
  port: Number(process.env.PORT || 3000),
  generatorMode: process.env.GENERATOR_MODE || 'mock',
  judgeMode: process.env.JUDGE_MODE || 'local',
  storageMode: process.env.STORAGE_MODE || 'json',
  authMode: process.env.AUTH_MODE || 'demo',
  demoUserId: process.env.DEMO_USER_ID || 'u_demo',
  dataFile: path.resolve(process.cwd(), process.env.DATA_FILE || '.data/state.json'),
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
  anthropicModel: process.env.ANTHROPIC_MODEL || '',
  judge0Url: (process.env.JUDGE0_URL || '').replace(/\/$/, ''),
  judge0Token: process.env.JUDGE0_TOKEN || '',
  judge0LanguageId: Number(process.env.JUDGE0_LANGUAGE_ID || 71),
  judge0MemoryKb: Number(process.env.JUDGE0_MEMORY_KB || 128000),
  judge0MaxProcesses: Number(process.env.JUDGE0_MAX_PROCESSES || 1),
  judge0MaxFileSizeKb: Number(process.env.JUDGE0_MAX_FILE_SIZE_KB || 64),
  allowUnsafeRemoteCodeLocally: process.env.ALLOW_UNSAFE_REMOTE_CODE_LOCALLY === '1',
  supabaseUrl: (process.env.SUPABASE_URL || '').replace(/\/$/, ''),
  supabasePublishableKey: process.env.SUPABASE_PUBLISHABLE_KEY || '',
  supabaseSecretKey: process.env.SUPABASE_SECRET_KEY || '',
  requireIdempotencyKey: process.env.REQUIRE_IDEMPOTENCY_KEY === '1' || appEnv === 'production',
  generationLimitPerHour: Number(process.env.GENERATION_LIMIT_PER_HOUR || 30),
  submissionLimitPerHour: Number(process.env.SUBMISSION_LIMIT_PER_HOUR || 60),
};

export function validateRuntimeConfig(value = config) {
  const errors = [];
  if (!Number.isInteger(value.port) || value.port <= 0 || value.port > 65535) errors.push('PORT must be a valid TCP port.');
  if (!['mock', 'anthropic'].includes(value.generatorMode)) errors.push('GENERATOR_MODE must be mock or anthropic.');
  if (!['local', 'judge0'].includes(value.judgeMode)) errors.push('JUDGE_MODE must be local or judge0.');
  if (!['json', 'supabase'].includes(value.storageMode)) errors.push('STORAGE_MODE must be json or supabase.');
  if (!['demo', 'supabase'].includes(value.authMode)) errors.push('AUTH_MODE must be demo or supabase.');
  if (value.generatorMode === 'anthropic' && (!value.anthropicApiKey || !value.anthropicModel)) errors.push('Anthropic mode requires ANTHROPIC_API_KEY and ANTHROPIC_MODEL.');
  if (value.judgeMode === 'judge0' && !value.judge0Url) errors.push('Judge0 mode requires JUDGE0_URL.');
  if ((value.storageMode === 'supabase' || value.authMode === 'supabase') && !value.supabaseUrl) errors.push('Supabase mode requires SUPABASE_URL.');
  if (value.storageMode === 'supabase' && !value.supabaseSecretKey) errors.push('Supabase storage requires SUPABASE_SECRET_KEY.');
  if (value.authMode === 'supabase' && !value.supabasePublishableKey) errors.push('Supabase auth requires SUPABASE_PUBLISHABLE_KEY.');
  if (value.appEnv === 'production') {
    if (value.storageMode !== 'supabase') errors.push('Production requires STORAGE_MODE=supabase.');
    if (value.authMode !== 'supabase') errors.push('Production requires AUTH_MODE=supabase.');
    if (value.generatorMode !== 'anthropic') errors.push('Production requires GENERATOR_MODE=anthropic.');
    if (value.judgeMode !== 'judge0') errors.push('Production requires JUDGE_MODE=judge0.');
    if (value.allowUnsafeRemoteCodeLocally) errors.push('ALLOW_UNSAFE_REMOTE_CODE_LOCALLY cannot be enabled in production.');
  }
  return errors;
}
