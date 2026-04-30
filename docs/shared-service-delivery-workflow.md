# Shared Service Delivery Workflow

This runbook defines collaboration between AP Center team, shared SDK team,
and shared service runtime teams.

## Team Responsibilities

- AP Center team:
  - Publish and govern gateway contracts.
  - Enforce auth, scopes, and routing policies.
- Shared SDK team:
  - Implement tribe-facing typed wrappers from AP Center contracts.
  - Release SDK versions with migration notes.
- Shared runtime team:
  - Implement provider-specific logic (for example PayMongo).
  - Maintain webhook handling and provider-side idempotency controls.

## Contract-first Path

1. Propose contract shape in AP Center (routes, scopes, errors).
2. Build SDK wrappers in `api-shared-services` against that contract.
3. Ship draft runtime with mock behavior that matches contract.
4. Replace mock internals with real provider integration when API access is ready.
5. Run `npm run check:contracts` before every SDK release to enforce wrapper/manifest contract parity.

## Versioning Rules

- Additive changes: minor SDK bump.
- Breaking field or route changes: major SDK bump.
- During migrations, AP Center keeps compatibility path where practical.

## Payment Draft Contract Baseline

- POST `/api/v1/shared/payment/checkout/sessions`
- GET `/api/v1/shared/payment/checkout/sessions/:checkoutId`
- POST `/api/v1/shared/payment/payments/:paymentId/refunds`

The initial runtime draft is under:

- `shared-services/paymongo/` (Official PayMongo shared gateway)
