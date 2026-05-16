# PostgreSQL Backup for Firestore

This project keeps Firestore as the live app database and uses PostgreSQL as a backup/replica target. The backup script copies selected Firestore collections into PostgreSQL as JSONB records, keyed by collection name and document ID.

## What Gets Backed Up

Default collections:

- `users`
- `leaderboard_public`
- `accessRoles`
- `securityProfiles`
- `pendingUsers`
- `contactMessages`
- `feedbackNotes`
- `auditLogs`

The PostgreSQL table is intentionally generic so future Firestore fields can be backed up without changing table columns.

## PostgreSQL Tables

The script creates these tables automatically:

- `firestore_backups`: one row per Firestore document
- `firestore_backup_runs`: one row per backup run

Each backup run updates existing rows instead of creating duplicates.

## Setup

Install dependencies after pulling this change:

```powershell
npm.cmd install
```

Set Firebase Admin credentials:

```powershell
$env:GOOGLE_APPLICATION_CREDENTIALS="C:\Users\robes\firebase-keys\coderecall-service-account.json"
```

Set your PostgreSQL connection string:

```powershell
$env:POSTGRES_URL="postgresql://USER:PASSWORD@HOST:5432/DATABASE"
```

For hosted PostgreSQL providers such as Supabase, Neon, or Railway, SSL is enabled by default. For local PostgreSQL, use:

```powershell
$env:PGSSL="false"
```

## Run a Safe Count First

This checks how many documents will be backed up without writing to PostgreSQL:

```powershell
npm.cmd run firestore:backup:postgres:dry-run
```

## Run the Backup

```powershell
npm.cmd run firestore:backup:postgres
```

To back up only specific collections:

```powershell
npm.cmd run firestore:backup:postgres -- --collections=users,contactMessages,auditLogs
```

## Schedule Daily Backups on Windows

Create a private local env file:

```powershell
Copy-Item postgres-backup.env.example .postgres-backup.env
notepad .postgres-backup.env
```

Fill in the real values:

```text
GOOGLE_APPLICATION_CREDENTIALS=C:\Users\robes\firebase-keys\coderecall-service-account.json
POSTGRES_URL=postgresql://postgres.PROJECT_REF:ENCODED_PASSWORD@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres
PGSSL=true
```

Run the local backup runner once:

```powershell
npm.cmd run firestore:backup:postgres:local
```

The local runner writes a timestamped log to `logs/`. That folder is ignored by Git so backup output stays on this machine.

Register a daily Windows scheduled task:

```powershell
npm.cmd run firestore:backup:postgres:schedule
```

By default, it runs daily at 11:00 PM. To choose a different time:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/register-postgres-backup-task.ps1 -At "21:30"
```

To check or edit the task later, open **Task Scheduler** and look for:

```text
Code Recall Firestore PostgreSQL Backup
```

## Check the Backup

```sql
select collection_name, count(*)
from firestore_backups
group by collection_name
order by collection_name;
```

```sql
select *
from firestore_backup_runs
order by started_at desc
limit 5;
```

## Notes

- This is a backup and reporting copy, not a live failover database yet.
- Keep the PostgreSQL URL private. Do not commit it to the repo.
- Run the backup manually before major releases, or schedule it later with Windows Task Scheduler, GitHub Actions secrets, or a server cron job.
