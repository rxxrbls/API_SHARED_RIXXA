# Google Auth Gateway

Shared service that brokers Google OAuth 2.0 flows for AP Center.

## Endpoints

- `GET /health`
- `POST /oauth/authorize`
- `POST /oauth/token`
- `POST /oauth/token/refresh`
- `POST /oauth/logout`

## Required Environment Variables

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI` (fallback redirect URI when one is not passed per request)

## Optional Environment Variables

- `PORT` (default: `4013`)
- `GOOGLE_AUTH_BASE_URL` (default: `https://accounts.google.com/o/oauth2/v2/auth`)
- `GOOGLE_TOKEN_URL` (default: `https://oauth2.googleapis.com/token`)
- `GOOGLE_REVOKE_URL` (default: `https://oauth2.googleapis.com/revoke`)

## Local Run

```bash
npm install
npm run dev
```

## Smoke Test Flow

1. `POST /oauth/authorize` to get the consent URL.
2. Open the URL, sign in, and copy the returned `code` from your callback URL.
3. `POST /oauth/token` with `code` and `redirectUri`.
4. `POST /oauth/token/refresh` with the issued `refreshToken`.
5. `POST /oauth/logout` with `token` or `refreshToken` to revoke.
