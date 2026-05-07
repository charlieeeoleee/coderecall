# Firebase App Check

App Check helps reject traffic that does not come from the real deployed app.

## Repo Setup

The app initializes App Check from `scripts/firebase-config.js` only when a reCAPTCHA v3 site key is configured.

Add the site key in one of these places:

1. `firebaseAppCheckConfig.recaptchaV3SiteKey` in `scripts/firebase-config.js`, or
2. a page meta tag:

```html
<meta name="firebase-app-check-site-key" content="YOUR_RECAPTCHA_V3_SITE_KEY">
```

For local development, add a Firebase App Check debug token in the browser console:

```js
localStorage.setItem("firebase_app_check_debug_token", "true");
```

Reload the page, copy the debug token printed in the console, and register it in Firebase Console -> App Check -> Debug tokens. Then replace `"true"` with the registered token value if needed.

## Console Rollout

1. Firebase Console -> App Check -> Register app.
2. Choose reCAPTCHA v3 for the web app.
3. Add the production domains.
4. Put the site key into `scripts/firebase-config.js`.
5. Deploy hosting.
6. Confirm login, dashboard, contact, admin, and super-admin flows still work.
7. Enable App Check monitoring for Firestore.
8. After clean monitoring, turn on enforcement for Firestore.

Do not enable enforcement before the deployed app has a valid App Check key, or Firestore reads/writes will fail for real users.
