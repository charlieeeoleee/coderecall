# Firebase Role Claims

Privileged roles should be assigned from a trusted environment with Firebase Admin SDK, not from browser code.

## Setup

Download a Firebase service-account JSON file from:

Project settings -> Service accounts -> Generate new private key

Keep that file out of git. This repo ignores common service-account filenames, but still store it carefully.

In PowerShell:

```powershell
$env:GOOGLE_APPLICATION_CREDENTIALS="C:\path\to\service-account.json"
```

## Set Roles

Set a super admin:

```powershell
npm run roles:set -- --email=charlesvrobeso@gmail.com --role=super_admin
```

Set an admin:

```powershell
npm run roles:set -- --email=admin@example.com --role=admin
```

Return someone to normal user:

```powershell
npm run roles:set -- --email=user@example.com --role=user
```

The script updates Firebase Auth custom claims and mirrors the role into `users/{uid}` for dashboard display compatibility. After a role change, the user should sign out and sign back in so Firebase refreshes the ID token.

## Audit Privileged MFA

After roles are assigned, verify that every privileged Firebase Auth user has native MFA enrolled:

```powershell
npm run roles:audit-mfa
```

The command exits with code `2` when any admin or super admin account is missing Firebase Auth MFA. That is intentional so it can be used in a release checklist.

## Audit Temporary Role Fallbacks

Before removing temporary email or Firestore role fallbacks from the app and rules, run:

```powershell
npm run roles:audit-fallbacks
```

The command compares:

- emails in `data/admin-config.js`
- privileged `users/{uid}.role` and `users/{uid}.progress.role` values
- Firebase Auth custom claims

It exits with code `2` until every privileged role has matching Firebase Auth custom claims. Once it reports `safeToRemoveFallbacks: true`, the temporary fallback logic can be removed without locking out admins.

## After Migration

When all privileged users have custom claims and Firebase Auth MFA, remove the temporary email and stored-role fallbacks from `firestore.rules` and `scripts/role-utils.js`.
