# Security Plan A: Firebase Native MFA

Plan A uses Firebase Authentication native multi-factor enrollment for privileged accounts. This is the strongest route because the second factor becomes part of Firebase sign-in, so the app receives an Auth token that proves MFA happened.

## When To Use

- The project is upgraded to Blaze / Identity Platform features that expose TOTP multi-factor authentication.
- You want the database rules to require `request.auth.token.firebase.sign_in_second_factor`.
- You want 2FA enforced before the user fully signs in, not only before admin pages load.

## Implementation Path

1. Upgrade the Firebase project to Blaze and enable Identity Platform / TOTP MFA in Firebase Authentication.
2. Run `npm run auth:enable-totp` with Admin SDK credentials available.
3. Use `scripts/firebase-native-mfa.js` as the shared native MFA helper.
4. Route admins and super admins to the Firebase native setup pages when they do not have a TOTP factor.
5. Require `sign_in_second_factor` in Firestore rules for privileged reads and writes.
6. Remove or archive the app-level `securityProfiles.totpSecret` storage after every privileged account has migrated.

## Enabling TOTP From This Repo

The repo includes `scripts/enable-firebase-totp-mfa.mjs`.

Use one of these credential options:

- `GOOGLE_APPLICATION_CREDENTIALS=C:\path\to\service-account.json`
- `FIREBASE_SERVICE_ACCOUNT={...full service account json...}`
- Application Default Credentials already configured for the project

Then run:

```powershell
npm.cmd run auth:enable-totp
```

## Rollback

If native TOTP is unavailable or produces `auth/operation-not-allowed`, switch back to Plan B. Keep app-level `securityProfiles` rules and session checks active until Plan A is fully verified in production.

## Tradeoffs

- Stronger enforcement at Firebase token level.
- Requires the paid/Identity Platform-capable Firebase setup.
- Recovery and factor reset are handled through Firebase Console or Admin SDK.
