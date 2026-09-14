import test from 'node:test';
import assert from 'node:assert/strict';
import { validateRuntimeConfig } from '../src/config.mjs';

function base(overrides = {}) {
  return {
    appEnv: 'development', port: 3000,
    generatorMode: 'mock', judgeMode: 'local', storageMode: 'json', authMode: 'demo',
    anthropicApiKey: '', anthropicModel: '', judge0Url: '',
    supabaseUrl: '', supabasePublishableKey: '', supabaseSecretKey: '',
    allowUnsafeRemoteCodeLocally: false,
    ...overrides
  };
}

test('production configuration fails closed when development adapters are selected', () => {
  const errors = validateRuntimeConfig(base({ appEnv: 'production' }));
  assert.ok(errors.some((item) => item.includes('STORAGE_MODE=supabase')));
  assert.ok(errors.some((item) => item.includes('AUTH_MODE=supabase')));
  assert.ok(errors.some((item) => item.includes('GENERATOR_MODE=anthropic')));
  assert.ok(errors.some((item) => item.includes('JUDGE_MODE=judge0')));
});

test('fully configured production boundaries pass validation', () => {
  const errors = validateRuntimeConfig(base({
    appEnv: 'production',
    generatorMode: 'anthropic', anthropicApiKey: 'secret', anthropicModel: 'model',
    judgeMode: 'judge0', judge0Url: 'https://judge.example',
    storageMode: 'supabase', authMode: 'supabase',
    supabaseUrl: 'https://project.supabase.co', supabasePublishableKey: 'sb_publishable_test', supabaseSecretKey: 'sb_secret_test'
  }));
  assert.deepEqual(errors, []);
});
