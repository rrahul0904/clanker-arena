function bearerToken(req) {
  const header = String(req.headers.authorization || '');
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || '';
}

function safeHandle(value, fallback) {
  const normalized = String(value || '').toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
  return normalized || fallback;
}

export async function authenticateRequest(req, config) {
  if (config.authMode === 'demo') {
    return { id: config.demoUserId, username: 'you', displayName: 'Demo Engineer', provider: 'demo' };
  }
  if (config.authMode !== 'supabase') throw new Error(`Unsupported auth mode: ${config.authMode}`);

  const token = bearerToken(req);
  if (!token) {
    const error = new Error('Authentication required.');
    error.statusCode = 401;
    throw error;
  }

  const response = await fetch(`${config.supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: config.supabasePublishableKey,
      authorization: `Bearer ${token}`,
      'user-agent': 'clanker-arena-server/1.0'
    }
  });
  if (!response.ok) {
    const error = new Error('Invalid or expired session.');
    error.statusCode = 401;
    throw error;
  }

  const user = await response.json();
  const metadata = user.user_metadata || {};
  const fallbackHandle = `user_${String(user.id || '').replace(/-/g, '').slice(0, 8)}`;
  const username = safeHandle(metadata.user_name || metadata.preferred_username || user.email?.split('@')[0], fallbackHandle);
  const displayName = String(metadata.full_name || metadata.name || username).slice(0, 80);
  return { id: user.id, email: user.email || null, username, displayName, provider: 'supabase' };
}
