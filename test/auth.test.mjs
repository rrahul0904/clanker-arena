import test from 'node:test';
import assert from 'node:assert/strict';
import { authenticateRequest } from '../src/services/auth.mjs';

function req(headers = {}) { return { headers }; }

test('demo auth derives identity on the server and ignores client identity', async () => {
  const identity = await authenticateRequest(req({ authorization: 'Bearer attacker' }), { authMode: 'demo', demoUserId: 'u_demo' });
  assert.equal(identity.id, 'u_demo');
  assert.equal(identity.provider, 'demo');
});

test('supabase auth requires a bearer session token', async () => {
  await assert.rejects(
    () => authenticateRequest(req(), { authMode: 'supabase', supabaseUrl: 'https://project.supabase.co', supabasePublishableKey: 'sb_publishable_test' }),
    (error) => error.statusCode === 401
  );
});

test('supabase auth sends publishable key as apikey and session JWT as bearer token', async () => {
  const original = globalThis.fetch;
  let observed;
  globalThis.fetch = async (url, options) => {
    observed = { url, options };
    return new Response(JSON.stringify({
      id: '11111111-1111-1111-1111-111111111111',
      email: 'Rahul@example.com',
      user_metadata: { user_name: 'Rahul.Singh', full_name: 'Rahul Singh' }
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    const identity = await authenticateRequest(req({ authorization: 'Bearer user.jwt.token' }), {
      authMode: 'supabase', supabaseUrl: 'https://project.supabase.co', supabasePublishableKey: 'sb_publishable_test'
    });
    assert.equal(identity.id, '11111111-1111-1111-1111-111111111111');
    assert.equal(identity.username, 'rahul_singh');
    assert.equal(observed.options.headers.apikey, 'sb_publishable_test');
    assert.equal(observed.options.headers.authorization, 'Bearer user.jwt.token');
  } finally {
    globalThis.fetch = original;
  }
});
