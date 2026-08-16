export const FIREBASE_PUBLIC_ENV_NAMES = Object.freeze([
  "CODE_RECALL_FIREBASE_API_KEY",
  "CODE_RECALL_FIREBASE_AUTH_DOMAIN",
  "CODE_RECALL_FIREBASE_PROJECT_ID",
  "CODE_RECALL_FIREBASE_STORAGE_BUCKET",
  "CODE_RECALL_FIREBASE_MESSAGING_SENDER_ID",
  "CODE_RECALL_FIREBASE_APP_ID"
]);

const SUPPORTED_DEPLOYMENT_ENVIRONMENTS = new Set([
  "development",
  "preview",
  "production"
]);

export function resolveDeploymentEnvironment(env = process.env) {
  const vercelEnvironment = String(env.VERCEL_ENV || "").trim().toLowerCase();
  if (vercelEnvironment) {
    if (!SUPPORTED_DEPLOYMENT_ENVIRONMENTS.has(vercelEnvironment)) {
      throw new Error("Unsupported Vercel deployment environment.");
    }
    return vercelEnvironment;
  }

  return "development";
}

function readRequiredPublicValue(env, name) {
  const value = String(env[name] || "").trim();
  if (!value) {
    throw new Error(`Missing required Firebase public configuration variable: ${name}.`);
  }
  return value;
}

export function buildFirebaseRuntimeConfiguration(env = process.env) {
  const environment = resolveDeploymentEnvironment(env);
  const values = Object.fromEntries(
    FIREBASE_PUBLIC_ENV_NAMES.map((name) => [name, readRequiredPublicValue(env, name)])
  );

  if (environment === "production") {
    const productionProjectId = readRequiredPublicValue(
      env,
      "CODE_RECALL_PRODUCTION_FIREBASE_PROJECT_ID"
    );
    if (values.CODE_RECALL_FIREBASE_PROJECT_ID !== productionProjectId) {
      throw new Error("Production Firebase configuration does not match the Production project contract.");
    }
  }

  if (environment === "preview") {
    const productionProjectId = readRequiredPublicValue(
      env,
      "CODE_RECALL_PRODUCTION_FIREBASE_PROJECT_ID"
    );
    if (values.CODE_RECALL_FIREBASE_PROJECT_ID === productionProjectId) {
      throw new Error("Preview Firebase configuration must not use the Production project.");
    }
  }

  return {
    environment,
    config: {
      apiKey: values.CODE_RECALL_FIREBASE_API_KEY,
      authDomain: values.CODE_RECALL_FIREBASE_AUTH_DOMAIN,
      projectId: values.CODE_RECALL_FIREBASE_PROJECT_ID,
      storageBucket: values.CODE_RECALL_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: values.CODE_RECALL_FIREBASE_MESSAGING_SENDER_ID,
      appId: values.CODE_RECALL_FIREBASE_APP_ID
    },
    appCheckSiteKey: String(env.CODE_RECALL_FIREBASE_APP_CHECK_SITE_KEY || "").trim()
  };
}
