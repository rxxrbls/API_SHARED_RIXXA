#!/usr/bin/env node

const gauthBaseUrl = (process.env.GAUTH_BASE_URL || 'http://localhost:4013').replace(/\/$/, '');
const redirectUri = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:5173/auth/google/callback';
const providedCode = process.env.GOOGLE_AUTHORIZATION_CODE;
const providedRefreshToken = process.env.GOOGLE_REFRESH_TOKEN;

async function post(path, payload) {
  const response = await fetch(`${gauthBaseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const body = await response.json();
  return { ok: response.ok, status: response.status, body };
}

function printStep(title, result) {
  const status = result.ok ? 'OK' : 'FAIL';
  // eslint-disable-next-line no-console
  console.log(`\n[${status}] ${title} (HTTP ${result.status})`);
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(result.body, null, 2));
}

async function main() {
  // eslint-disable-next-line no-console
  console.log(`Testing Google OAuth flow against ${gauthBaseUrl}`);

  const authorize = await post('/oauth/authorize', {
    redirectUri,
    scopes: ['openid', 'email', 'profile'],
    accessType: 'offline',
    includeGrantedScopes: true,
  });

  printStep('Authorize URL generation', authorize);
  if (!authorize.ok) {
    process.exit(1);
  }

  const code = providedCode;
  if (!code) {
    // eslint-disable-next-line no-console
    console.log('\nSet GOOGLE_AUTHORIZATION_CODE to continue token exchange/refresh/logout checks.');
    process.exit(0);
  }

  const tokenExchange = await post('/oauth/token', {
    code,
    redirectUri,
  });

  printStep('Authorization code exchange', tokenExchange);
  if (!tokenExchange.ok) {
    process.exit(1);
  }

  const refreshToken =
    tokenExchange.body?.data?.refreshToken ||
    providedRefreshToken;

  if (!refreshToken) {
    // eslint-disable-next-line no-console
    console.log('\nNo refresh token returned. Set GOOGLE_REFRESH_TOKEN to test refresh/logout steps.');
    process.exit(0);
  }

  const refresh = await post('/oauth/token/refresh', {
    refreshToken,
  });

  printStep('Token refresh', refresh);
  if (!refresh.ok) {
    process.exit(1);
  }

  const logout = await post('/oauth/logout', {
    refreshToken,
  });

  printStep('Logout/revoke', logout);
  if (!logout.ok) {
    process.exit(1);
  }

  // eslint-disable-next-line no-console
  console.log('\nGoogle OAuth flow checks completed successfully.');
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('GAuth flow test failed:', error);
  process.exit(1);
});
