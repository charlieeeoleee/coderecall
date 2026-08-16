const VALID_SUBJECTS = new Set(["hardware", "electrical"]);

export function requireSubject(value) {
  const subject = String(value || "").trim().toLowerCase();
  if (!VALID_SUBJECTS.has(subject)) {
    throw new Error("This subject link is missing a valid subject. Return to Subjects and choose Computer Hardware or Electrical.");
  }
  return subject;
}

export function resolveSubjectRoute(search = "") {
  const params = new URLSearchParams(search);
  return {
    subject: requireSubject(params.get("subject")),
    unlockMode: String(params.get("unlock") || "").trim().toLowerCase()
  };
}

export function buildSubjectUrl(subject, unlockMode = "") {
  const params = new URLSearchParams({ subject: requireSubject(subject) });
  if (unlockMode) params.set("unlock", String(unlockMode).trim().toLowerCase());
  return `/subject?${params.toString()}`;
}

export function normalizeSubjectUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const url = new URL(raw, "https://coderecall.invalid");
  if (!["/subject", "/subject.html"].includes(url.pathname)) return raw;
  try {
    return buildSubjectUrl(url.searchParams.get("subject"), url.searchParams.get("unlock"));
  } catch {
    return null;
  }
}
