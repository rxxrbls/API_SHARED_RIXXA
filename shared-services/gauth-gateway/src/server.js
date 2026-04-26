const express = require('express');
const crypto = require('node:crypto');

const app = express();
const port = Number(process.env.PORT || 4013);

const googleAuthBaseUrl = process.env.GOOGLE_AUTH_BASE_URL || 'https://accounts.google.com/o/oauth2/v2/auth';
const googleTokenUrl = process.env.GOOGLE_TOKEN_URL || 'https://oauth2.googleapis.com/token';
const googleRevokeUrl = process.env.GOOGLE_REVOKE_URL || 'https://oauth2.googleapis.com/revoke';

const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
const defaultRedirectUri = process.env.GOOGLE_REDIRECT_URI;

app.use(express.json());

function apiMeta() {
  return { timestamp: new Date().toISOString() };
}

function fail(res, status, code, message, details) {
  return res.status(status).json({
    success: false,
    error: {
      code,
      message,
      details,
    },
    meta: apiMeta(),
  });
}

function ensureConfig(res) {
  if (!googleClientId || !googleClientSecret) {
    fail(
      res,
      500,
      'GOOGLE_CONFIG_ERROR',
      'Google OAuth credentials are not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.',
    );
    return false;
  }

  return true;
}

function normalizeScopes(scopes) {
  if (!Array.isArray(scopes)) {
    return ['openid', 'email', 'profile'];
  }

  const unique = [...new Set(scopes.filter((scope) => typeof scope === 'string' && scope.trim()))];
  return unique.length > 0 ? unique : ['openid', 'email', 'profile'];
}

app.get('/health', (_req, res) => {
  res.status(200).json({
    success: true,
    data: {
      status: 'ok',
      provider: 'google',
      configured: Boolean(googleClientId && googleClientSecret),
      redirectUriConfigured: Boolean(defaultRedirectUri),
    },
    meta: apiMeta(),
  });
});

app.post('/oauth/authorize', (req, res) => {
  if (!ensureConfig(res)) {
    return;
  }

  const payload = req.body || {};
  const redirectUri = payload.redirectUri || defaultRedirectUri;

  if (!redirectUri) {
    return fail(
      res,
      400,
      'MISSING_REDIRECT_URI',
      'redirectUri is required in payload or GOOGLE_REDIRECT_URI must be set in environment.',
    );
  }

  const state = payload.state || crypto.randomUUID().replace(/-/g, '');
  const scopes = normalizeScopes(payload.scopes);

  const params = new URLSearchParams({
    client_id: googleClientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: scopes.join(' '),
    state,
    access_type: payload.accessType === 'offline' ? 'offline' : 'online',
    include_granted_scopes: payload.includeGrantedScopes === false ? 'false' : 'true',
    prompt: typeof payload.prompt === 'string' ? payload.prompt : 'consent',
  });

  if (typeof payload.loginHint === 'string' && payload.loginHint) {
    params.set('login_hint', payload.loginHint);
  }

  if (typeof payload.codeChallenge === 'string' && payload.codeChallenge) {
    params.set('code_challenge', payload.codeChallenge);
    params.set('code_challenge_method', payload.codeChallengeMethod === 'plain' ? 'plain' : 'S256');
  }

  const authorizationUrl = `${googleAuthBaseUrl}?${params.toString()}`;

  return res.status(200).json({
    success: true,
    data: {
      authorizationUrl,
      state,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    },
    meta: apiMeta(),
  });
});

app.post('/oauth/token', async (req, res) => {
  if (!ensureConfig(res)) {
    return;
  }

  const payload = req.body || {};
  const { code, codeVerifier } = payload;
  const redirectUri = payload.redirectUri || defaultRedirectUri;

  if (!code || !redirectUri) {
    return fail(res, 400, 'INVALID_TOKEN_EXCHANGE_REQUEST', 'code and redirectUri are required.');
  }

  const tokenPayload = new URLSearchParams({
    client_id: googleClientId,
    client_secret: googleClientSecret,
    code,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  });

  if (typeof codeVerifier === 'string' && codeVerifier) {
    tokenPayload.set('code_verifier', codeVerifier);
  }

  try {
    const response = await fetch(googleTokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenPayload.toString(),
    });

    const body = await response.json();

    if (!response.ok) {
      return fail(
        res,
        502,
        'GOOGLE_TOKEN_EXCHANGE_FAILED',
        body.error_description || body.error || 'Google token exchange failed.',
        body,
      );
    }

    return res.status(200).json({
      success: true,
      data: {
        accessToken: body.access_token,
        refreshToken: body.refresh_token || null,
        idToken: body.id_token,
        expiresIn: body.expires_in,
        tokenType: body.token_type,
        scope: body.scope,
      },
      meta: apiMeta(),
    });
  } catch (error) {
    return fail(res, 502, 'GOOGLE_TOKEN_EXCHANGE_FAILED', error.message || 'Google token exchange failed.');
  }
});

app.post('/oauth/token/refresh', async (req, res) => {
  if (!ensureConfig(res)) {
    return;
  }

  const payload = req.body || {};
  const { refreshToken } = payload;

  if (!refreshToken) {
    return fail(res, 400, 'INVALID_REFRESH_REQUEST', 'refreshToken is required.');
  }

  const refreshPayload = new URLSearchParams({
    client_id: googleClientId,
    client_secret: googleClientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });

  try {
    const response = await fetch(googleTokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: refreshPayload.toString(),
    });

    const body = await response.json();

    if (!response.ok) {
      return fail(
        res,
        502,
        'GOOGLE_TOKEN_REFRESH_FAILED',
        body.error_description || body.error || 'Google token refresh failed.',
        body,
      );
    }

    return res.status(200).json({
      success: true,
      data: {
        accessToken: body.access_token,
        refreshToken,
        idToken: body.id_token,
        expiresIn: body.expires_in,
        tokenType: body.token_type,
        scope: body.scope,
      },
      meta: apiMeta(),
    });
  } catch (error) {
    return fail(res, 502, 'GOOGLE_TOKEN_REFRESH_FAILED', error.message || 'Google token refresh failed.');
  }
});

app.post('/oauth/logout', async (req, res) => {
  if (!ensureConfig(res)) {
    return;
  }

  const payload = req.body || {};
  const token = payload.token || payload.refreshToken || payload.idTokenHint;

  if (!token) {
    return fail(res, 400, 'INVALID_LOGOUT_REQUEST', 'token, refreshToken, or idTokenHint is required.');
  }

  try {
    const response = await fetch(`${googleRevokeUrl}?token=${encodeURIComponent(token)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    if (!response.ok) {
      return fail(res, 502, 'GOOGLE_LOGOUT_FAILED', 'Google token revocation failed.');
    }

    return res.status(200).json({
      success: true,
      data: {
        revoked: true,
        provider: 'google',
      },
      meta: apiMeta(),
    });
  } catch (error) {
    return fail(res, 502, 'GOOGLE_LOGOUT_FAILED', error.message || 'Google token revocation failed.');
  }
});

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`[gauth-gateway] listening on port ${port}`);
});
