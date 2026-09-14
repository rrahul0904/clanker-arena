import test from 'node:test';
import assert from 'node:assert/strict';
import { SupabaseStore } from '../src/services/supabase-store.mjs';

test('SupabaseStore sends modern secret key only through apikey header', async () => {
  const original = globalThis.fetch;
  let headers;
  globalThis.fetch = async (_url, options) => {
    headers = options.headers;
    return new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    const store = new SupabaseStore({ supabaseUrl: 'https://project.supabase.co', supabaseSecretKey: 'sb_secret_test' });
    const ready = await store.readiness();
    assert.equal(ready.ok, true);
    assert.equal(headers.apikey, 'sb_secret_test');
    assert.equal(headers.authorization, undefined);
  } finally {
    globalThis.fetch = original;
  }
});
