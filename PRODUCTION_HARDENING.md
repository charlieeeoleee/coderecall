# Code Recall Production Hardening

Last reviewed: 2026-08-09
Rules verification: `npm run test:rules` passed 14/14 tests on 2026-08-09.

## Phase 4 Vercel Backend Migration

Phase 4 changes the production backend target from Firebase Callable Functions to Vercel Functions so Code Recall can remain on Firebase Spark for Auth and Firestore. The active browser clients now call same-origin `/api/...` routes, attach Firebase ID tokens for protected operations, and no longer require deployable Firebase Cloud Functions for mandatory production features.

See `VERCEL_BACKEND_MIGRATION.md` for the function inventory, Vercel endpoint list, server environment variable names, manual owner actions, release workflow, rollback strategy, and production readiness matrix.

## Google Popup Auth COOP Compatibility

Desktop Google sign-in intentionally continues to use Firebase `signInWithPopup()`, while mobile/touch-small-screen browsers keep the existing redirect fallback. The auth popup pages explicitly emit:

`Cross-Origin-Opener-Policy: same-origin-allow-popups`

Affected routes are `auth.html`, clean-url `/auth` on Vercel, `qr-approve.html`, and clean-url `/qr-approve` on Vercel. This preserves popup opener compatibility for Firebase/Google OAuth without weakening API routes or removing CSP, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, or `Permissions-Policy`.

## Phase 2 Completion Matrix

| Requirement | Before | After | Result |
| - | - | - | - |
| Structured Logging | PARTIALLY IMPLEMENTED | IMPLEMENTED | Server-side callable operations now log structured JSON for QR login, MFA reset, rate-limited gamification mutations, success, duplicates, denials, and failures. |
| Error Monitoring | PARTIALLY IMPLEMENTED | IMPLEMENTED | Firebase/Google Cloud server logs remain primary; frontend uncaught errors and unhandled promise rejections now create sanitized `clientErrorReports` documents with Firestore rule validation. |
| Public Endpoint Rate Limiting | PARTIALLY IMPLEMENTED | IMPLEMENTED | All current callable functions are covered by endpoint-specific Firestore-backed limits, including gamification mutation bursts. |
| Rollback Plan | PARTIALLY IMPLEMENTED | IMPLEMENTED | Rollback is documented and `npm run release:predeploy-check` captures Git/deploy context and checklist steps before release. |
| Secret Rotation | PARTIALLY IMPLEMENTED | IMPLEMENTED | Rotation remains a provider-console action, but repository controls are in place: ignored secret files, `.env.example`, documented schedule, and `npm run security:audit-secrets`. |
| User Anti-Spam Rate Limiting | PARTIALLY IMPLEMENTED | IMPLEMENTED | XP-bearing and reset/import gamification events are idempotent server-side events; contact writes and callable activity have rate/shape controls. |
| Database / Query Security | PARTIALLY IMPLEMENTED | IMPLEMENTED | Normal clients can no longer directly update `xp`, `xpWeekly`, `xpChange`, `lastWeeklyReset`, `progress`, or `results`; protected mutations now go through `recordGamificationEvent`. |

## Phase 3 Deployment Readiness

Phase 3 finding: the hardened architecture is internally consistent, but production release is blocked until Firebase Functions deployment is enabled and verified for project `gamifiedlearningsystem`.

### Critical Callable Functions

| Function | Used By | Auth Required | App Check | Rate Limit | Production Critical |
| - | - | - | - | - | - |
| `recordGamificationEvent` | `scripts/gamification-api.js`; quiz/module/auth/settings gamification flows | Yes | Integrated client-side, not enforced | Per-UID, 180/min | Yes |
| `resetOwnMfaEnrollment` | `scripts/privileged-mfa-reset.js` | Yes, privileged role | Not enforced | Per-UID, 5/10 min | Yes for privileged recovery |
| `createQrLoginRequest` | QR login companion flow | No | Not enforced | Per-IP, 12/min | Yes if QR login is enabled |
| `approveQrLoginRequest` | QR approval flow | Yes | Not enforced | Per-UID, 20/min | Yes if QR login is enabled |
| `exchangeQrLoginRequest` | QR login exchange flow | No, validates request secret | Not enforced | Per-IP, 30/min | Yes if QR login is enabled |

All required callable exports are in `functions/index.js` and use region `us-central1`. Frontend callable clients also use `us-central1`.

### Release Safety Gate

`npm run release:safety-gate` validates:

- frontend references to critical callables match backend exports;
- callable regions match `us-central1`;
- required Functions dependencies exist;
- `recordGamificationEvent` is exported before server-authoritative rules/client code release;
- the root Functions deployment path is available.

The deploy scripts for Hosting, Rules, and combined app deploy now run this safety gate before deployment. This intentionally prevents deploying restrictive rules or the updated frontend while `firebase:deploy:functions` is still disabled.

Current safety-gate result: BLOCKED because `firebase:deploy:functions` is still intentionally disabled with the Spark-mode placeholder.

### authDomain Finding

Runtime Firebase config is generated by `scripts/write-runtime-config.mjs` into ignored file `scripts/firebase-config.runtime.js`. The verifier now accepts either the Firebase default Auth domain `gamifiedlearningsystem.firebaseapp.com` or a verified custom Auth domain such as `coderecall.online`.

`npm run deploy:verify` currently passes with no warnings. Firebase Console must still list `coderecall.online` in Authentication authorized domains before production Google sign-in on the custom domain.

### App Check Rollout Plan

1. Integration: keep SDK initialization and site-key runtime config in place.
2. Telemetry: deploy without enforcement and review Firebase App Check request metrics.
3. Evaluate invalid traffic: identify scripts, emulators, old browsers, and legitimate clients.
4. Enforcement: enable per product/function only after legitimate traffic is clean.
5. Monitoring: watch callable error rates, sign-in failures, and support tickets after enforcement.

### Safe Deployment Order

1. Enable project billing/plan support for Firebase Functions if required.
2. Replace the placeholder `firebase:deploy:functions` script with a real Functions deployment command.
3. Deploy Functions only.
4. Verify callable availability in `us-central1`, especially `recordGamificationEvent`.
5. Run `npm run release:safety-gate`, `npm run test:function-contract`, and `npm run test:rules`.
6. Deploy Hosting with frontend compatibility layer.
7. Smoke-test login, module completion, quiz completion, guest transfer, and leaderboard.
8. Deploy tightened Firestore Rules.
9. Re-run smoke tests and monitor Functions logs, Firestore denials, and client error reports.

This order is safe because the server-authoritative callable exists before clients and rules depend on it.

### Rollback Compatibility

- If new Functions fail before rules deploy: rollback Functions to the prior version; do not deploy tightened rules.
- If new frontend fails after Functions deploy: rollback Hosting to the previous release; Functions can remain temporarily because old clients do not depend on `recordGamificationEvent`.
- If tightened Rules cause denials: redeploy the previous tagged Firestore Rules immediately, then inspect denied paths in emulator and logs.
- If deployment is partially completed: keep Functions deployed and rollback Hosting/Rules first; never leave new Rules active without compatible Functions.

Compatible release units are now: Functions + frontend compatibility layer + Firestore Rules. Tag and deploy them as one release train, but deploy Functions first.

### Release Readiness Matrix

| Area | Status |
| - | - |
| Functions deployable | BLOCKED |
| Critical functions available | MANUAL ACTION REQUIRED |
| Firestore Rules compatible | READY |
| Gamification E2E verified | MANUAL ACTION REQUIRED |
| Duplicate XP prevented | READY |
| Guest transfer verified | MANUAL ACTION REQUIRED |
| Rate limiting verified | READY |
| Error handling verified | READY |
| authDomain resolved | READY |
| App Check ready | MANUAL ACTION REQUIRED |
| Rollback verified | READY |
| Production release ready | BLOCKED |

Production release is blocked until Functions can be deployed and verified in the active Firebase project.

## Architecture Discovered

Code Recall is a static HTML/CSS/JavaScript application deployed through Firebase Hosting and optionally Vercel. It uses Firebase Web SDK modules in browser code, Firebase Authentication, Firestore, Firestore Security Rules, a service worker, and a small set of Firebase Callable Functions for privileged MFA and QR login flows. The root `firebase:deploy:functions` script is disabled for Spark mode, so Functions changes require an explicit plan before production deployment.

Firestore is the primary live database. A `supabase/` folder and PostgreSQL backup scripts exist, but the app path remains Firebase-first. There is no persistent Express/API server in the current repository.

## Requirement Status Matrix

| # | Requirement | Initial Status | Priority | Current Implementation | Recommended Action |
| - | - | - | - | - | - |
| 1 | Structured Logging | PARTIALLY IMPLEMENTED | P1 | Browser code used mostly `console.*`; Functions had no structured log helper. | Added JSON structured logging in Functions; continue migrating high-value client logs through sanitized helpers. |
| 2 | Error Monitoring | PARTIALLY IMPLEMENTED | P2 | Firebase/platform logs exist; no third-party frontend monitor. | Use Firebase/Google Cloud logs first; add a frontend error collector only if production needs it. |
| 3 | Public Endpoint Rate Limiting | PARTIALLY IMPLEMENTED | P1 | Callable QR/MFA functions had auth checks but no per-operation throttles. | Added Firestore-backed callable rate buckets; keep App Check rollout as a manual production step. |
| 4 | Health Checks | NOT APPLICABLE | P3 | No persistent backend server; static hosting and Firebase managed services. | Use Firebase Hosting availability checks and deployment verification instead of adding a server. |
| 5 | Rollback Plan | PARTIALLY IMPLEMENTED | P2 | Firebase scripts and deploy checklist existed. | Use release tags, Firebase Hosting rollback, rules redeploy, and post-rollback smoke checks below. |
| 6 | Secret Rotation | PARTIALLY IMPLEMENTED | P1 | Runtime config is ignored; deploy verification blocks private keys in runtime config. | Rotate real secrets manually; keep client Firebase config treated as public config, not a server secret. |
| 7 | User Anti-Spam Rate Limiting | PARTIALLY IMPLEMENTED | P1 | Client-side duplicate checks existed for XP; contact writes were permissive. | Added stricter contact write validation; server-authoritative XP remains next-phase work. |
| 8 | Database / Query Security | PARTIALLY IMPLEMENTED | P0 | Firestore Rules restrict roles but client owns XP/progression fields. | Tightened contact and leaderboard mirror writes; move XP/progression awards server-side next. |
| 9 | Caching | IMPLEMENTED | P2 | Firebase/Vercel headers and service worker cache static assets. | Keep HTML/scripts fresh; cache immutable assets only. |
| 10 | Sitemap / Search Discoverability | NOT IMPLEMENTED | P3 | No sitemap/robots file found. | Added public-route-only `sitemap.xml` and `robots.txt`. |

## Security Findings

| Finding | Component | Severity | Impact | Recommended Fix |
| - | - | - | - | - |
| Client-controlled XP/progression writes | Firestore `users` documents | P0 | A signed-in user can manipulate gamification-critical values through direct SDK writes. | Move XP, score, progression, unlock, and leaderboard mutations into callable Functions or server-side transactions. |
| Public leaderboard accepted owner-supplied scores | Firestore `leaderboard_public` | P1 | Users could publish inflated leaderboard values. | Implemented rules requiring leaderboard values to mirror the owner user document. |
| Contact ticket create shape was broad | Firestore `contactMessages` | P1 | Spam or malformed writes could inflate data or spoof fields. | Implemented size, category, ownership, status, timestamp, and conversation-shape validation. |
| Callable Functions did not throttle abuse-prone flows | Firebase Functions | P1 | QR login and MFA reset endpoints could be spammed. | Added per-operation Firestore-backed rate limiting. |
| App Check not enforced on callable functions | Firebase Functions/Firebase App Check | P2 | Non-app clients may call callable endpoints if they have config. | Enable `enforceAppCheck` after production App Check tokens are verified for all legitimate clients. |
| Static health endpoints absent | Hosting | P3 | Traditional `/health` checks are not available. | Use Firebase Hosting checks for `/`, `/robots.txt`, and `/sitemap.xml`; do not add a server only for health. |

## Rollback Procedure

1. Tag each production release, for example `v1.2.0`, before deploying hosting or rules.
2. For hosting rollback, use Firebase Hosting release history in the Firebase Console or Firebase CLI rollback tooling for site `gamifiedlearningsystem`.
3. For Firestore Rules rollback, redeploy the previous tagged `firestore.rules` with `npm run firebase:deploy:rules`.
4. For Functions rollback, redeploy the previous tagged `functions/` source after confirming the project plan supports Functions deployment.
5. For configuration rollback, restore the previous private `scripts/firebase-config.runtime.js` values from the deployment secret store or operator vault.
6. For data issues, restore from Firestore export or PostgreSQL backup only after preserving the affected production state for investigation.
7. After rollback, verify landing page, auth, dashboard, Firestore reads/writes, role access, contact tickets, leaderboard, `robots.txt`, and `sitemap.xml`.

## Secret Rotation Schedule

| Secret Category | Purpose | Rotation Interval | Rotation Procedure |
| - | - | - | - |
| Firebase service account JSON | Admin scripts, backups, privileged maintenance | 90 days, immediately on exposure | Create a replacement key in Google Cloud IAM, update operator environment, verify scripts, delete old key. |
| Firebase App Check debug tokens | Local/debug App Check bypass | 30 days or after shared debugging | Revoke old debug token in Firebase Console, generate a new token for approved developers only. |
| PostgreSQL backup credentials | Optional Firestore backup destination | 90 days | Rotate DB user password, update `.postgres-backup.env`, run dry-run backup. |
| Vercel/Firebase deploy tokens | CI/CD deployment | 90 days or team change | Rotate in provider console and CI secret store, then run deployment verification. |
| Webhook/API keys, if added later | Third-party integrations | 90 days | Rotate in provider console, update secret store, redeploy affected integration. |

Never commit runtime config, service-account files, `.env*`, or `.postgres-backup.env`. Firebase Web `apiKey` and project config identify the public client app and are not equivalent to Admin SDK credentials.

## Logging And Monitoring

Functions emit JSON logs with timestamp, level, event, request/function context, result, hashed user identifiers, and latency where available. Do not log passwords, tokens, QR secrets, private keys, service-account JSON, or full sensitive personal data.

Production monitoring should start with Firebase/Google Cloud logs, Cloud Functions errors, Firebase Auth metrics, Firestore usage/quota dashboards, Hosting release history, and browser-reported support tickets. Add a third-party frontend monitor only after deciding the privacy, retention, and cost policy.

## Rate Limiting And Anti-Spam

Callable Functions now apply per-operation Firestore rate buckets. Contact ticket creation is validated by Security Rules, including ownership, category, timestamp, status, size limits, and safe initial conversation shape.

Client-side timers and localStorage remain usability features only. They are not security controls. XP/progression anti-abuse requires the next phase: server-authoritative award functions with idempotency keys and transaction-protected score updates.

## Database And Query Security

No live SQL query path was found in the app runtime. Firestore query security is enforced through Security Rules. Current high-risk fields are `xp`, `xpWeekly`, `xpChange`, `progress`, `results`, achievements derived from progress, and leaderboard mirrors. Public leaderboard writes are now constrained to mirror user profile scores, but the underlying user score fields remain client-writable for compatibility.

## Caching

Firebase/Vercel headers keep HTML, scripts, styles, `robots.txt`, and `sitemap.xml` fresh. Static assets under `assets/**` are immutable for one year. The service worker uses a versioned app shell, network-first pages/scripts/styles, network-only auth-sensitive navigation/runtime config, and stale-while-revalidate for other same-origin GETs.

Do not cache private profile/admin/progression data in shared caches. localStorage and IndexedDB data should be treated as user-device state only.

## Sitemap And Robots

`sitemap.xml` lists only intentionally public routes for `https://coderecall.online`: `/`, `/about`, `/faq`, `/subjects-preview`, `/contact`, `/researchers`, and `/privacy`.

`robots.txt` references the sitemap and discourages crawling admin, dashboard, auth, quiz, module, certificate, settings, and other authenticated/internal routes. This is discoverability guidance, not a security boundary.

## Manual Production Actions

1. Confirm `coderecall.online` is the canonical production domain before deploy.
2. Run `npm run deploy:verify` before hosting deployment.
3. Run Firestore Rules tests before rules deployment.
4. Review Firebase App Check telemetry, then plan `enforceAppCheck: true` for callable functions.
5. Rotate any real credentials that were ever shared outside the operator vault.
6. Decide whether the next phase will move gamification writes into callable Functions.
