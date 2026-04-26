# APICenter Shared SDK

This repository contains the shared SDK package used by tribe services and partner consumers to call APICenter through the supported gateway contracts.

## Package

- Package: `@apicenter/sdk`
- Runtime: Node.js 18+
- Build output: `dist/`
- Registry target: private npm registry
- Publish access: restricted

## Tribe Consumption (Private SDK)

Tribe services must install the SDK from your private registry, not from the public npm registry.

Example `.npmrc` (consumer repo):

```ini
@apicenter:registry=${NPM_REGISTRY_URL}
//${NPM_REGISTRY_HOST}/:_authToken=${NPM_TOKEN}
always-auth=true
```

Then install normally:

```bash
npm install @apicenter/sdk
```

See `.npmrc.example` in this repository for the canonical template.

## Getting Started

Install dependencies:

```bash
npm install
```

Build the SDK:

```bash
npm run build
```

Validate CI-equivalent checks locally:

```bash
npm run ci
```

## Usage

```ts
import { TribeClient } from '@apicenter/sdk';

const client = new TribeClient({
  gatewayUrl: process.env.APICENTER_URL || 'http://localhost:3000',
  tribeId: 'orders-service',
  secret: process.env.ORDERS_SERVICE_SECRET || ''
});

await client.authenticate();
const user = await client.callService('user-service', '/users/123');
```

### Service discovery helpers

```ts
const tribeServices = await client.listTribeServices();
const sharedServices = await client.listSharedServices();
const allServices = await client.listAllServices();
const billingService = await client.getService('billing-service');
```

Scope catalog discovery is exposed for platform-operator style clients:

```ts
const scopes = await client.getServiceScopes();
```

`getServiceScopes()` calls `/api/v1/registry/scopes`. If the caller is not allowed to read that admin endpoint, the SDK falls back to deriving dynamic service scopes from accessible tribe/shared service discovery results.

### Draft payment wrapper helpers

The SDK now includes draft payment wrapper methods routed through AP Center shared services:

```ts
const checkout = await client.paymentCreateCheckoutSession({
  referenceId: 'order-123',
  successUrl: 'https://app.example.com/payment/success',
  cancelUrl: 'https://app.example.com/payment/cancel',
  lineItems: [
    {
      name: 'Starter Plan',
      quantity: 1,
      amount: { value: 99900, currency: 'PHP' },
    },
  ],
});

await client.paymentGetCheckoutSession(checkout.checkoutId);

await client.paymentCreateRefund('pay_123', {
  amount: { value: 5000, currency: 'PHP' },
  reason: 'customer_request',
});
```

These wrappers intentionally abstract provider-specific details so tribes stay
decoupled from PayMongo API surface changes.

### Google OAuth wrapper helpers

Google login can be routed through AP Center shared services using `gauth` wrappers:

```ts
const authUrl = await client.gauthGetAuthorizationUrl({
  redirectUri: 'https://app.example.com/auth/google/callback',
  scopes: ['openid', 'email', 'profile'],
  accessType: 'offline',
});

const tokens = await client.gauthExchangeCode({
  code: '<authorization_code>',
  redirectUri: 'https://app.example.com/auth/google/callback',
});

await client.gauthRefreshToken({
  refreshToken: tokens.refreshToken || '',
});

await client.gauthLogout({
  refreshToken: tokens.refreshToken || undefined,
});
```

This keeps Google provider handling centralized in platform-owned shared service logic.

## SDK Boundary

This package is the only SDK source of truth for tribe consumers.

SDK responsibilities:

- Token lifecycle wrappers: `authenticate`, `refresh`, `revoke`
- Gateway routing wrappers: `callService`, `callSharedService`, `callExternal`
- Tribe convenience wrappers: geolocation, geofencing, geotagging, Kafka helpers
- Typed error mapping and retry behavior

Gateway runtime-only responsibilities (not part of this SDK):

- Auth provider internals (Descope, Keycloak, Google)
- Secret and credential management
- Policy guards and authorization enforcement
- Circuit breaker state and distributed runtime controls
- Registry admin operations and revocation storage

For non-Node consumers, use APICenter OpenAPI-generated clients.

## Shared Service Ownership

This repository is also the source of truth for platform-owned shared service artifacts.

Location:

- `shared-services/manifests/`

Add or update shared-service registration manifests here and consume them from APICenter
registration workflows (for example, local bootstrap or onboarding scripts). APICenter
should stay runtime-only and must not store shared-service manifests or implementation code.

For payment runtime scaffolding before provider API finalization, use:

- `shared-services/payment-gateway-draft/`

For Google OAuth runtime integration, use:

- `shared-services/gauth-gateway/`

Contract snapshot used by CI:

- `contracts/shared-service-contract.json`

Run contract compatibility checks locally:

```bash
npm run check:contracts
```

Run Google OAuth flow smoke tests (against `gauth-gateway`):

```bash
npm run test:gauth
```

To run the full code exchange/refresh/logout sequence, provide:

- `GOOGLE_AUTHORIZATION_CODE` (copied from callback URL after consent)
- optional `GOOGLE_REFRESH_TOKEN` (if your app does not receive a new refresh token)

## Required Runtime Variables for Consumers

- `APICENTER_URL` (gateway base URL)
- `APICENTER_TRIBE_ID` (registered service ID)
- `APICENTER_TRIBE_SECRET` (service secret)

## Publishing

Release automation is configured in `.github/workflows/release.yml`.

Required GitHub configuration:

- Repository variable: `NPM_REGISTRY_URL`
- Repository secret: `NPM_TOKEN`

The workflow publishes on semver tag pushes (`v*.*.*`) or manual dispatch.

Release safeguards:

- Publishing to `registry.npmjs.org` is blocked.
- Package policy check enforces `@apicenter/*` scope and restricted publish access.

Collaboration runbook:

- `docs/shared-service-delivery-workflow.md`

## Status

SDK extraction is active and this repository owns tribe-facing SDK evolution independently from gateway runtime versioning.
