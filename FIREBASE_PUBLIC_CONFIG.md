# Firebase public config handling

Firebase browser configuration is public at runtime, but this repository should not commit the live project values repeatedly.

## Local/deploy setup

1. Copy `scripts/firebase-config.js` values from the Firebase Console web app settings.
2. Keep any private notes or local backup copy in `scripts/firebase-config.local.js`; that file is ignored by Git.
3. Before deploying, make sure `scripts/firebase-config.js` contains the intended public web config for the target Firebase project.

## Required console hardening

In Google Cloud Console, restrict the Firebase web API key:

- Application restriction: HTTP referrers.
- Allow only production and development domains you use.
- API restrictions: only the Firebase/Google APIs required by this app.

Recommended referrer allowlist:

- `https://gamifiedlearningsystem.web.app/*`
- `https://gamifiedlearningsystem.firebaseapp.com/*`
- Any custom production domain, with `/*`.
- Local development origins only while needed, such as `http://localhost:*/*` or `http://127.0.0.1:*/*`.

Recommended API allowlist:

- Firebase Authentication API
- Cloud Firestore API
- Firebase App Check API, after App Check is enabled
- Any other Firebase API the app actually uses

In Firebase Console:

- Enable and enforce App Check for Firestore after testing.
- Keep Firestore rules as the security boundary.
- Never commit service account JSON, Admin SDK private keys, service-role Supabase keys, or backend `.env` files.

## If the old key was public

1. Create a new web API key in Google Cloud Console.
2. Apply the referrer and API restrictions above before using it.
3. Update `scripts/firebase-config.js` with the new key.
4. Deploy hosting.
5. Confirm login, Firestore reads/writes, contact tickets, admin, and super-admin pages still work.
6. Disable or delete the old unrestricted key.

## Local audit

Run this before committing Firebase config changes:

```powershell
npm run security:audit-firebase-config
```

The audit checks that Firebase public config is centralized in `scripts/firebase-config.js` and flags obvious private-key/service-account material accidentally committed into text files.
