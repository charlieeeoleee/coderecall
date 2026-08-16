const VALID_SUBJECTS = new Set(["hardware", "electrical"]);
const VALID_DIFFICULTIES = new Set(["easy", "medium", "hard"]);

export function requireModuleSubject(value) {
  const subject = String(value || "").trim().toLowerCase();
  if (!VALID_SUBJECTS.has(subject)) {
    throw new Error("This module link is missing a valid subject. Return to Subjects and choose Computer Hardware or Electrical.");
  }
  return subject;
}

export function requireModuleDifficulty(value) {
  const difficulty = String(value || "").trim().toLowerCase();
  if (!VALID_DIFFICULTIES.has(difficulty)) {
    throw new Error("This module link is missing a valid difficulty. Return to the module difficulty page and choose a level.");
  }
  return difficulty;
}

export function resolveModuleDifficultyRoute(search = "") {
  const params = new URLSearchParams(search);
  return {
    subject: requireModuleSubject(params.get("subject")),
    unlockMode: String(params.get("unlock") || "").trim().toLowerCase()
  };
}

export function resolveModuleLevelsRoute(search = "") {
  const params = new URLSearchParams(search);
  return Object.freeze({
    subject: requireModuleSubject(params.get("subject")),
    difficulty: requireModuleDifficulty(params.get("difficulty")),
    unlockMode: String(params.get("unlock") || "").trim().toLowerCase()
  });
}

export function requireModuleKey(value) {
  const moduleKey = String(value || "").trim().toLowerCase();
  if (!/^module[1-9]\d*$/.test(moduleKey)) {
    throw new Error("This module link is missing a valid module number. Return to Module Levels and choose a lesson.");
  }
  return moduleKey;
}

export function resolveModuleLessonRoute(search = "") {
  const params = new URLSearchParams(search);
  return Object.freeze({
    subject: requireModuleSubject(params.get("subject")),
    difficulty: requireModuleDifficulty(params.get("difficulty")),
    moduleKey: requireModuleKey(params.get("module"))
  });
}

export function buildModuleDifficultyUrl(subject, unlockMode = "") {
  const params = new URLSearchParams({ subject: requireModuleSubject(subject) });
  if (unlockMode) params.set("unlock", String(unlockMode).trim().toLowerCase());
  return `/module-difficulty?${params.toString()}`;
}

export function buildModuleLevelsUrl(subject, difficulty, unlockMode = "") {
  const params = new URLSearchParams({
    subject: requireModuleSubject(subject),
    difficulty: requireModuleDifficulty(difficulty)
  });
  if (unlockMode) params.set("unlock", String(unlockMode).trim().toLowerCase());
  return `/module-levels?${params.toString()}`;
}

export function buildModuleLessonUrl(subject, difficulty, moduleKey) {
  const params = new URLSearchParams({
    subject: requireModuleSubject(subject),
    difficulty: requireModuleDifficulty(difficulty),
    module: requireModuleKey(moduleKey)
  });
  return `/module?${params.toString()}`;
}
