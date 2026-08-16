export function hasAuthoritativeAssessmentCompletion(data = {}, subject = "", type = "") {
  const key = `${String(subject || "").trim().toLowerCase()}_${String(type || "").trim().toLowerCase()}`;
  if (!/^(hardware|electrical)_(pretest|posttest)$/.test(key)) return false;
  return data?.progress?.[key] === true || Boolean(data?.results?.[key]);
}
