import fs from "node:fs";
import { initializeApp, cert, applicationDefault } from "firebase-admin/app";
import { getFirestore, Timestamp, GeoPoint, DocumentReference } from "firebase-admin/firestore";
import pg from "pg";

const { Pool } = pg;

const DEFAULT_COLLECTIONS = [
  "users",
  "leaderboard_public",
  "accessRoles",
  "securityProfiles",
  "pendingUsers",
  "contactMessages",
  "feedbackNotes",
  "auditLogs"
];

function getArg(name, fallback = "") {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length).trim() : fallback;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function readCollections() {
  const value = getArg("collections", process.env.FIRESTORE_BACKUP_COLLECTIONS || "");
  if (!value) return DEFAULT_COLLECTIONS;
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function initializeFirebase(projectId) {
  const credentialPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;

  if (credentialPath && fs.existsSync(credentialPath)) {
    const serviceAccount = JSON.parse(fs.readFileSync(credentialPath, "utf8"));
    initializeApp({
      credential: cert(serviceAccount),
      projectId
    });
    return;
  }

  initializeApp({
    credential: applicationDefault(),
    projectId
  });
}

function toJsonValue(value) {
  if (value === undefined) return null;
  if (value === null) return null;
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  if (value instanceof GeoPoint) {
    return {
      latitude: value.latitude,
      longitude: value.longitude
    };
  }
  if (value instanceof DocumentReference) return value.path;
  if (Array.isArray(value)) return value.map(toJsonValue);
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entryValue]) => entryValue !== undefined)
        .map(([key, entryValue]) => [key, toJsonValue(entryValue)])
    );
  }
  return value;
}

function getSourceUpdatedAt(data) {
  const candidates = [
    data.updatedAt,
    data.lastUpdatedAt,
    data.lastVerifiedAt,
    data.createdAt,
    data.timestamp
  ];
  const match = candidates.find(Boolean);

  if (match instanceof Timestamp) return match.toDate();
  if (match instanceof Date) return match;
  if (typeof match === "string") {
    const parsed = new Date(match);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  return null;
}

function getPostgresUrl() {
  return process.env.POSTGRES_URL || process.env.DATABASE_URL || "";
}

function shouldUseSsl(postgresUrl) {
  if (process.env.PGSSL === "false") return false;
  if (process.env.PGSSL === "true") return true;
  return !postgresUrl.includes("localhost") && !postgresUrl.includes("127.0.0.1");
}

async function ensureSchema(client) {
  await client.query(`
    create table if not exists firestore_backup_runs (
      id bigserial primary key,
      project_id text not null,
      status text not null,
      collection_count integer not null default 0,
      document_count integer not null default 0,
      started_at timestamptz not null default now(),
      finished_at timestamptz,
      error_message text
    );
  `);

  await client.query(`
    create table if not exists firestore_backups (
      collection_name text not null,
      document_id text not null,
      data jsonb not null,
      source_updated_at timestamptz,
      backed_up_at timestamptz not null default now(),
      primary key (collection_name, document_id)
    );
  `);

  await client.query(`
    create index if not exists idx_firestore_backups_collection
      on firestore_backups(collection_name);
  `);

  await client.query(`
    create index if not exists idx_firestore_backups_source_updated_at
      on firestore_backups(source_updated_at);
  `);

  await client.query(`
    create index if not exists idx_firestore_backups_data_gin
      on firestore_backups using gin(data);
  `);
}

async function createRun(client, projectId) {
  const result = await client.query(
    `insert into firestore_backup_runs(project_id, status)
     values ($1, 'running')
     returning id`,
    [projectId]
  );
  return result.rows[0].id;
}

async function finishRun(client, runId, status, collectionCount, documentCount, errorMessage = null) {
  await client.query(
    `update firestore_backup_runs
     set status = $2,
         collection_count = $3,
         document_count = $4,
         finished_at = now(),
         error_message = $5
     where id = $1`,
    [runId, status, collectionCount, documentCount, errorMessage]
  );
}

async function backupCollection({ db, client, collectionName, dryRun }) {
  const snapshot = await db.collection(collectionName).get();

  if (dryRun) {
    return {
      collectionName,
      count: snapshot.size
    };
  }

  for (const documentSnapshot of snapshot.docs) {
    const rawData = documentSnapshot.data();
    await client.query(
      `insert into firestore_backups(
         collection_name,
         document_id,
         data,
         source_updated_at,
         backed_up_at
       )
       values ($1, $2, $3::jsonb, $4, now())
       on conflict (collection_name, document_id)
       do update set
         data = excluded.data,
         source_updated_at = excluded.source_updated_at,
         backed_up_at = now()`,
      [
        collectionName,
        documentSnapshot.id,
        JSON.stringify(toJsonValue(rawData)),
        getSourceUpdatedAt(rawData)
      ]
    );
  }

  return {
    collectionName,
    count: snapshot.size
  };
}

async function main() {
  const projectId = getArg("project", process.env.FIREBASE_PROJECT_ID || "gamifiedlearningsystem");
  const collections = readCollections();
  const dryRun = hasFlag("dry-run");
  const postgresUrl = getPostgresUrl();

  initializeFirebase(projectId);
  const db = getFirestore();

  if (dryRun) {
    const results = [];
    for (const collectionName of collections) {
      results.push(await backupCollection({ db, client: null, collectionName, dryRun: true }));
    }
    console.log(JSON.stringify({ projectId, dryRun: true, collections: results }, null, 2));
    return;
  }

  if (!postgresUrl) {
    throw new Error("Missing POSTGRES_URL or DATABASE_URL. Set it before running the backup.");
  }

  const pool = new Pool({
    connectionString: postgresUrl,
    ssl: shouldUseSsl(postgresUrl) ? { rejectUnauthorized: false } : false
  });

  const client = await pool.connect();
  let runId = null;
  let documentCount = 0;

  try {
    await client.query("begin");
    await ensureSchema(client);
    runId = await createRun(client, projectId);
    await client.query("commit");

    const results = [];
    for (const collectionName of collections) {
      const result = await backupCollection({ db, client, collectionName, dryRun: false });
      documentCount += result.count;
      results.push(result);
    }

    await finishRun(client, runId, "success", collections.length, documentCount);

    console.log(
      JSON.stringify(
        {
          projectId,
          status: "success",
          runId,
          collectionCount: collections.length,
          documentCount,
          collections: results
        },
        null,
        2
      )
    );
  } catch (error) {
    if (runId) {
      await finishRun(client, runId, "failed", collections.length, documentCount, error.message);
    }
    if (error?.code === "ENOTFOUND" && error?.hostname) {
      error.message = `${error.message}. Check POSTGRES_URL in .postgres-backup.env. If your password contains symbols, copy the Session pooler URI from Supabase and replace [YOUR-PASSWORD] with the percent-encoded password.`;
    }
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
