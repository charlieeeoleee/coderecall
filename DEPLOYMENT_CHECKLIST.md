# Code Recall Deployment Checklist

Use this checklist before pushing a production Firebase Hosting update.

## Verify Local Config

```powershell
npm.cmd run deploy:verify
```

This checks the hosting cache headers, deploy scripts, ignored private files, and the local Firebase runtime config shape. It does not print API keys or private connection strings.

## Deploy App Code

Deploy Functions and Hosting together when a change affects both browser code and callable functions:

```powershell
npm.cmd run firebase:deploy:app
```

Deploy only Hosting for HTML, CSS, JavaScript, or asset changes:

```powershell
npm.cmd run firebase:deploy:hosting
```

Deploy only Firestore Rules after rules changes:

```powershell
npm.cmd run firebase:deploy:rules
```

## Backup Before Major Releases

Check Firestore document counts first:

```powershell
npm.cmd run firestore:backup:postgres:dry-run
```

Run the PostgreSQL backup from the private local env file:

```powershell
npm.cmd run firestore:backup:postgres:local
```

## Private Files

Keep these local only:

- `scripts/firebase-config.runtime.js`
- `.postgres-backup.env`
- Firebase service account JSON files
- Generated files in `logs/`
