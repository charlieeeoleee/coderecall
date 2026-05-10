# Security Plan B: App-Level Authenticator 2FA

Plan B keeps the original free-plan-friendly authenticator flow. Firebase handles first-factor login, then Code Recall blocks admin and super-admin screens until the user verifies a TOTP code or backup code inside the app.

## When To Use

- The project stays on Firebase Spark.
- Firebase Console only shows SMS MFA and native TOTP is unavailable.
- You need a working QR-code authenticator flow without upgrading Firebase.

## Current Flow

1. Admin or super-admin signs in normally.
2. The login router sends privileged users to `admin-mfa.html` or `super-admin-mfa.html`.
3. The page creates or reads the user's `securityProfiles/{uid}` document.
4. New users scan the QR code, save backup codes, and verify one authenticator code.
5. A successful check stores a short browser session in `sessionStorage`.
6. Admin pages re-check that session before loading privileged controls.

## Security Notes

- This protects the app UI and normal privileged workflows, but Firestore rules cannot read browser `sessionStorage`.
- `securityProfiles` stores the TOTP secret so the browser can verify future codes. Only the owner and super admins can read that profile.
- Use Plan A later if you need Firebase token-level MFA enforcement.

## Operational Checklist

- Deploy the updated Firestore rules before testing enrollment.
- Log out and sign in again to confirm privileged accounts land on the 2FA page first.
- Scan the QR code with an authenticator app and keep backup codes offline.
- Test a normal user account to confirm it still lands on the dashboard.
