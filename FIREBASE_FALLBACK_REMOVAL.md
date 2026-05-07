# Firebase Role Fallback Removal

The active `firestore.rules` file still includes temporary migration fallbacks:

- configured admin/super-admin emails
- privileged roles stored in `users/{uid}.role` or `users/{uid}.progress.role`

Those fallbacks prevent lockout while custom claims and Firebase Auth MFA are being rolled out. They should be removed before public release.

## Removal Gate

Run both audits from a trusted machine with a Firebase service account:

```powershell
$env:GOOGLE_APPLICATION_CREDENTIALS="C:\path\to\service-account.json"
npm run roles:audit-fallbacks
npm run roles:audit-mfa
```

Continue only when:

- `roles:audit-fallbacks` reports `safeToRemoveFallbacks: true`
- `roles:audit-mfa` reports `missingMfaCount: 0`

## Build Claims-Only Rules

Generate the strict rules file:

```powershell
npm run rules:build-claims-only
```

This writes `firestore.claims-only.rules`, which removes temporary role fallbacks and requires Firebase Auth custom claims plus native MFA for privileged Firestore access.

## Dry Run

After Firebase CLI login:

```powershell
npm run rules:dry-run-claims-only
```

## Deploy

When the dry run succeeds, replace `firestore.rules` with `firestore.claims-only.rules`, run the rules tests, then deploy:

```powershell
npm run test:rules
npm run firebase:deploy:rules -- --project gamifiedlearningsystem
```

Do not deploy claims-only rules until the audits are clean. Otherwise admins can lose access.
