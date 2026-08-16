const LOCAL_PROGRESS_PREFIX = "code_recall_module_progress";

export function getLocalProgressNamespace(uid = null) {
  return uid ? `user:${uid}` : "guest";
}

export function getScopedLocalProgressKey(baseKey, uid = null) {
  if (!baseKey) throw new Error("A module progress key is required.");
  return `${LOCAL_PROGRESS_PREFIX}:${getLocalProgressNamespace(uid)}:${baseKey}`;
}

export function readScopedLocalProgress(storage, baseKey, uid = null, { migrateLegacyGuest = false } = {}) {
  const scopedKey = getScopedLocalProgressKey(baseKey, uid);
  const scopedValue = storage.getItem(scopedKey);
  if (scopedValue !== null || uid || !migrateLegacyGuest) return scopedValue;

  const legacyValue = storage.getItem(baseKey);
  if (legacyValue !== null) {
    storage.setItem(scopedKey, legacyValue);
  }
  return legacyValue;
}

export function writeScopedLocalProgress(storage, baseKey, value, uid = null) {
  storage.setItem(getScopedLocalProgressKey(baseKey, uid), String(value));
}

export function createFreshMatchingSolvedSet() {
  return new Set();
}

export function shouldPersistMatchingCompletion(durableCompletion) {
  return !durableCompletion;
}

export function resolveModuleRailLayout({ structured = false, troubleshooting = false } = {}) {
  if (troubleshooting) {
    return {
      notes: { visible: false, target: "moduleDocumentSection" },
      path: { visible: true, target: "moduleSectionsSection" }
    };
  }

  if (structured) {
    return {
      notes: { visible: true, target: "moduleDocumentSection" },
      path: { visible: true, target: "moduleDocument" }
    };
  }

  return {
    notes: { visible: true, target: "moduleDocumentSection" },
    path: { visible: true, target: "moduleSectionsSection" }
  };
}

export function getRailTargetActivationOffset({ key, target, viewportHeight = 0 } = {}) {
  if (key !== "path" || target !== "moduleDocument") return 0;
  return Math.min(260, Math.max(96, Math.round(viewportHeight * 0.3)));
}

export function selectActiveRailKey(steps, anchorY) {
  const availableSteps = steps.filter((step) => !step.hidden && Number.isFinite(step.documentTop));
  if (!availableSteps.length) return null;

  let activeStep = availableSteps[0];
  let activeBoundary = Number.NEGATIVE_INFINITY;

  availableSteps.forEach((step) => {
    const boundary = step.documentTop + Math.max(0, Number(step.activationOffset) || 0);
    if (boundary <= anchorY && boundary >= activeBoundary) {
      activeStep = step;
      activeBoundary = boundary;
    }
  });

  return activeStep.key;
}
