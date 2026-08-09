# Code Recall Phase 4 Vercel Backend Migration

Last reviewed: 2026-08-09

## Architecture After Migration

Code Recall production now targets this source architecture:

```text
Vercel Frontend
  -> Vercel Functions trusted API
  -> Firebase Auth + Firestore on Spark
```

Firebase Cloud Functions remain in `functions/` as optional Blaze-only reference code. They are not required by the active production frontend.

## Firebase Functions Inventory

| Existing Firebase Function | Purpose | Frontend Caller | Vercel Migration Decision |
| - | - | - | - |
| `recordGamificationEvent` | Trusted XP, progress, results, leaderboard, idempotency transaction | `scripts/gamification-api.js` | MIGRATE TO VERCEL |
| `resetOwnMfaEnrollment` | Privileged self-reset of Firebase Auth MFA enrollment | `scripts/privileged-mfa-reset.js` | MIGRATE TO VERCEL |
| `createQrLoginRequest` | Create QR login request and secret hash | QR login popup | MIGRATE TO VERCEL |
| `approveQrLoginRequest` | Authenticated phone approval for QR login | `scripts/qr-approve.js` | MIGRATE TO VERCEL |
| `exchangeQrLoginRequest` | Exchange approved QR request for Firebase custom token | QR login popup | MIGRATE TO VERCEL |
| Frontend error reporting via Firestore `clientErrorReports` | Sanitized browser error telemetry | `scripts/firebase-config.js` | MIGRATE TO VERCEL |
| Firebase Functions source under `functions/` | Optional future Blaze backend | None mandatory after Phase 4 | KEEP OPTIONAL/BLAZE-ONLY |

## Vercel API Endpoints

| Endpoint | Purpose | Auth |
| - | - | - |
| `POST /api/gamification/event` | Trusted gamification mutation | Firebase ID token |
| `POST /api/errors/report` | Sanitized frontend error log | Rate-limited IP bucket |
| `POST /api/admin/mfa/reset-own` | Privileged MFA self-reset | Firebase ID token + server role authorization |
| `POST /api/auth/qr/create` | Create QR login request | Rate-limited IP bucket |
| `POST /api/auth/qr/approve` | Approve QR login on phone | Firebase ID token |
| `POST /api/auth/qr/exchange` | Poll/exchange QR login | Request secret + rate-limited IP bucket |

## Server Credentials

Vercel Functions initialize Firebase Admin from server-only environment variables:

| Name | Scope |
| - | - |
| `FIREBASE_ADMIN_PROJECT_ID` | Development, Preview, Production |
| `FIREBASE_ADMIN_CLIENT_EMAIL` | Development, Preview, Production |
| `FIREBASE_ADMIN_PRIVATE_KEY` | Development, Preview, Production |

Do not prefix these names with public/frontend prefixes. Do not commit values. Escaped private-key newlines are normalized in server code.

## Auth, Authorization, CSRF

Protected API calls use `Authorization: Bearer <Firebase ID token>`. The API verifies the token with Firebase Admin and derives `uid`, email, and claims from the verified token only.

Privileged operations fetch trusted role state server-side from claims, `accessRoles`, and existing user-role fallbacks. UI visibility is not authorization.

CSRF infrastructure is not required for these protected routes because identity is supplied by an explicit bearer token header rather than ambient cookies. Same-origin calls are still preferred.

## Gamification Trust Boundary

The migrated API preserves Firestore transactions and event idempotency in `users/{uid}/gamificationEvents/{eventId}`. Duplicate event IDs return the stored response with `duplicate: true` and do not award again.

XP is now derived server-side. Arbitrary `xp` and `xpAwarded` client fields are ignored for reward authority. Quiz XP is derived from event type, score, total, and unique rewarded question IDs; guest transfer XP is bounded and derived from whitelisted progress flags only.

## Rate Limiting And Logging

Vercel Functions use Firestore-backed `rateLimits` buckets by verified UID or hashed IP, depending on endpoint. Records include `expiresAtMs`; scheduled cleanup is a manual/maintenance concern because Spark has no Cloud Scheduler/Functions cleanup.

Runtime logs are structured JSON and omit tokens, QR secrets, private keys, passwords, and raw Authorization headers.

## Firestore Rules

Tightened rules remain required. Browser clients must still be denied direct writes to XP, weekly XP, progress, results, roles, and authoritative leaderboard fields. Vercel Admin SDK writes bypass browser rules, so API validation and authorization remain mandatory.

## Preview And Production Data

Best practice is separate Firebase projects for Development, Preview, and Production. If the same Firebase project must temporarily serve Preview and Production, Preview can mutate production data through the Vercel API. Safeguards: restrict preview access, use separate Vercel env values when possible, avoid public preview testing with real user accounts, and run smoke tests with dedicated test users.

## Firebase Authorized Domains

Manually verify Firebase Authentication authorized domains for:

- `coderecall.online`
- the active Vercel production domain
- `localhost` for development
- any preview domain strategy the owner explicitly permits

Do not assume these are configured without checking Firebase Console.

## App Check Reassessment

App Check can still protect direct Firebase client access where applicable. It does not replace Firebase ID token verification in Vercel Functions. Enable enforcement only after telemetry confirms legitimate traffic has valid App Check tokens.

## Service Worker

The service worker cache version was bumped to `code-recall-v20260809-vercel-api` and now includes the shared Vercel API client. Old cached gamification callable clients should be invalidated by normal activation.

## Release Workflow

1. Configure Vercel server environment variables.
2. Run local verification: `npm.cmd run deploy:verify`.
3. Run Firestore Rules tests: `npm.cmd run test:rules`.
4. Run secret audit: `npm.cmd run security:audit-secrets`.
5. Run API contract tests: `npm.cmd run test:api-contract`.
6. Run release safety gate: `npm.cmd run release:safety-gate`.
7. Deploy to Vercel; Vercel deploys frontend and Functions together.
8. Deploy Firestore Rules separately if rules changed.
9. Perform production smoke tests.

## Rollback

Rollback now coordinates Vercel frontend, Vercel Functions, and Firestore Rules.

To rollback frontend/API, restore or promote the previous compatible Vercel deployment. To rollback rules, redeploy the previous tagged `firestore.rules`. Do not execute production rollback unless an actual production incident requires it.

## Manual Actions Required

### Vercel

- Add `FIREBASE_ADMIN_PROJECT_ID`.
- Add `FIREBASE_ADMIN_CLIENT_EMAIL`.
- Add `FIREBASE_ADMIN_PRIVATE_KEY`.
- Scope values deliberately for Development, Preview, and Production.
- Redeploy after environment changes.
- Verify Vercel runtime logs are structured and contain no secrets/tokens.

### Firebase

- Verify Authentication authorized domains.
- Generate/manage service-account credentials outside the repository.
- Deploy Firestore Rules when changed.
- Review App Check telemetry before enabling enforcement.

No Firebase Blaze upgrade is required for this architecture.

## Before / After Matrix

| Area | Before Phase 4 | After Phase 4 |
| - | - | - |
| Backend execution | Firebase Callable Functions, undeployable on Spark | Vercel Functions |
| Gamification authority | Firebase callable contract | Vercel API transaction |
| Rate limiting | Firebase callable rate buckets | Vercel API rate buckets |
| Idempotency | Callable Firestore transaction | Vercel Firestore transaction |
| Structured logging | Firebase Functions logs | Vercel runtime structured logs |
| Error monitoring | Client Firestore writes | Vercel error report endpoint |
| QR login | Disabled in UI on Spark, callable source retained | Vercel QR API source ready |
| MFA/admin reset | Firebase callable | Vercel privileged API |
| Firestore protection | Tight rules | Tight rules retained |
| Secret management | Firebase Functions runtime/admin context | Vercel server env variables |
| Deployment | Firebase Functions-centric blocker | Vercel frontend + API, rules separate |
| Rollback | Hosting/Functions/Rules | Vercel deployment + Rules |
| Firebase Cloud Functions dependency | Mandatory for hardened production | Optional/BLAZE-only reference |

## Production Readiness Matrix

| Area | Status |
| - | - |
| Source architecture | READY |
| Vercel API source | READY |
| Firebase Admin env configured live | MANUAL ACTION REQUIRED |
| Live Firebase token verification | MANUAL ACTION REQUIRED |
| Live trusted Firestore mutation | MANUAL ACTION REQUIRED |
| Firestore Rules regression | READY after local tests pass |
| QR login live | MANUAL ACTION REQUIRED |
| MFA reset live | MANUAL ACTION REQUIRED |
| App Check enforcement | OPTIONAL |
| Production release | MANUAL ACTION REQUIRED |
