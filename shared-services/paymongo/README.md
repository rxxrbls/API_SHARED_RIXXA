# Payment Gateway Draft Service

This draft shared service is a contract-first wrapper for payment flows.

Purpose:

- Give tribes a stable AP Center-facing payment contract.
- Decouple tribe applications from provider-specific APIs.
- Provide a mock implementation while PayMongo integration details are pending.

## Current Status

- Provider mode: mock
- Intended provider: PayMongo
- Use this service only for local/staging integration and contract validation.

## Draft Routes

- GET /health
- POST /checkout/sessions
- GET /checkout/sessions/:checkoutId
- POST /payments/:paymentId/refunds
- POST /webhooks/paymongo

## Run Locally

```bash
npm install
npm run dev
```

Default base URL:

- http://localhost:4010

## Registration

Use the shared manifest in:

- ../../manifests/payment-manifest.json

Register through AP Center registry and route through:

- /api/v1/shared/payment/*

## Migration to Real PayMongo

1. Keep request and response shapes stable.
2. Replace mock response generation with real PayMongo API calls.
3. Preserve idempotency semantics for checkout creation and refunds.
4. Keep webhook signature validation in this service, not in tribe apps.
