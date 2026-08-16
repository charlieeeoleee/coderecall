export const ASSESSMENT_ROUTE_MAP = Object.freeze({
  hardware: Object.freeze({
    pretest: "hardwarePretestQuestions",
    posttest: "hardwarePosttestQuestions"
  }),
  electrical: Object.freeze({
    pretest: "electricalPretestQuestions",
    posttest: "electricalPosttestQuestions"
  })
});

export function resolveAssessmentRoute(search = "") {
  const params = new URLSearchParams(search);
  const subject = String(params.get("subject") || "").trim().toLowerCase();
  const type = String(params.get("type") || "").trim().toLowerCase();

  if (!Object.hasOwn(ASSESSMENT_ROUTE_MAP, subject)) {
    throw new Error("Invalid assessment subject. Choose Hardware or Electrical from the Subjects page.");
  }
  if (!Object.hasOwn(ASSESSMENT_ROUTE_MAP[subject], type)) {
    throw new Error("Invalid assessment type. Open a Pre-Test or Post-Test from the Subject page.");
  }
  return Object.freeze({ subject, type, bankName: ASSESSMENT_ROUTE_MAP[subject][type] });
}

export function buildAssessmentUrl(subject, type) {
  const resolved = resolveAssessmentRoute(`?subject=${encodeURIComponent(subject)}&type=${encodeURIComponent(type)}`);
  return `/quiz?subject=${encodeURIComponent(resolved.subject)}&type=${encodeURIComponent(resolved.type)}`;
}
