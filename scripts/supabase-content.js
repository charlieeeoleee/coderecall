import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL = "https://vlpmvirvokgbjzejxdqk.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_V4FiltPdgeHWePrqoc5pDQ_YJSgFRyB";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
});

function toCompatTimestamp(value) {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return {
    seconds: Math.floor(date.getTime() / 1000),
    toDate: () => date
  };
}

function normalizeChoices(row) {
  return [
    row.choice_a || "",
    row.choice_b || "",
    row.choice_c || "",
    row.choice_d || ""
  ].filter(Boolean);
}

function normalizeModuleDraft(row) {
  return {
    id: row.id,
    subject: row.subject,
    difficulty: row.difficulty,
    title: row.title || "",
    content: row.content || "",
    tip: row.tip || "",
    imageDataUrl: row.image_data_url || "",
    status: row.status || "pending",
    createdBy: row.created_by || "",
    createdByEmail: row.created_by_email || "",
    reviewedBy: row.reviewed_by || "",
    publishedBy: row.published_by || "",
    source: row.source || "supabase",
    createdAt: toCompatTimestamp(row.created_at),
    reviewedAt: toCompatTimestamp(row.reviewed_at),
    publishedAt: toCompatTimestamp(row.published_at)
  };
}

function normalizeQuizDraft(row) {
  const choices = normalizeChoices(row);

  return {
    id: row.id,
    subject: row.subject,
    quizType: row.quiz_type,
    question: row.question || "",
    choices,
    choiceA: row.choice_a || "",
    choiceB: row.choice_b || "",
    choiceC: row.choice_c || "",
    choiceD: row.choice_d || "",
    answerLetter: row.answer_letter || "",
    answerText: row.answer_text || "",
    rationale: row.rationale || "",
    imageDataUrl: row.image_data_url || "",
    status: row.status || "pending",
    createdBy: row.created_by || "",
    createdByEmail: row.created_by_email || "",
    reviewedBy: row.reviewed_by || "",
    publishedBy: row.published_by || "",
    source: row.source || "supabase",
    createdAt: toCompatTimestamp(row.created_at),
    reviewedAt: toCompatTimestamp(row.reviewed_at),
    publishedAt: toCompatTimestamp(row.published_at)
  };
}

function normalizePublishedModule(row) {
  return {
    id: row.id,
    sourceDraftId: row.source_draft_id || "",
    subject: row.subject,
    difficulty: row.difficulty,
    title: row.title || "",
    content: row.content || "",
    tip: row.tip || "",
    imageDataUrl: row.image_data_url || "",
    publishedOrder: Number(row.published_order || 0),
    createdBy: row.created_by || "",
    createdByEmail: row.created_by_email || "",
    publishedBy: row.published_by || "",
    source: row.source || "supabase",
    createdAt: toCompatTimestamp(row.created_at),
    publishedAt: toCompatTimestamp(row.published_at)
  };
}

function normalizePublishedQuiz(row) {
  const choices = normalizeChoices(row);

  return {
    id: row.id,
    sourceDraftId: row.source_draft_id || "",
    subject: row.subject,
    quizType: row.quiz_type,
    question: row.question || "",
    choices,
    answerLetter: row.answer_letter || "",
    answerText: row.answer_text || "",
    answer: row.answer_text || "",
    rationale: row.rationale || "",
    imageDataUrl: row.image_data_url || "",
    publishedOrder: Number(row.published_order || 0),
    createdBy: row.created_by || "",
    createdByEmail: row.created_by_email || "",
    publishedBy: row.published_by || "",
    source: row.source || "supabase",
    createdAt: toCompatTimestamp(row.created_at),
    publishedAt: toCompatTimestamp(row.published_at)
  };
}

function requireSuccess(result, label) {
  if (result.error) {
    console.error(`Supabase ${label} failed:`, result.error);
    throw result.error;
  }

  return result.data;
}

function buildQuizDraftPayload(payload) {
  const choices = Array.isArray(payload.choices) ? payload.choices : [];

  return {
    subject: payload.subject,
    quiz_type: payload.quizType,
    question: payload.question,
    choice_a: choices[0] || "",
    choice_b: choices[1] || "",
    choice_c: choices[2] || "",
    choice_d: choices[3] || "",
    answer_letter: payload.answerLetter,
    answer_text: payload.answerText || "",
    rationale: payload.rationale || "",
    image_data_url: payload.imageDataUrl || "",
    status: payload.status || "pending",
    created_by: payload.createdBy || "",
    created_by_email: payload.createdByEmail || "",
    reviewed_by: payload.reviewedBy || "",
    published_by: payload.publishedBy || "",
    source: payload.source || "supabase"
  };
}

export async function fetchModuleDrafts() {
  const result = await supabase
    .from("module_drafts")
    .select("*")
    .order("created_at", { ascending: false });

  return requireSuccess(result, "module draft fetch").map(normalizeModuleDraft);
}

export async function fetchQuizDrafts() {
  const result = await supabase
    .from("quiz_drafts")
    .select("*")
    .order("created_at", { ascending: false });

  return requireSuccess(result, "quiz draft fetch").map(normalizeQuizDraft);
}

export async function saveModuleDraft(payload) {
  const result = await supabase
    .from("module_drafts")
    .insert({
      subject: payload.subject,
      difficulty: payload.difficulty,
      title: payload.title,
      content: payload.content || "",
      tip: payload.tip || "",
      image_data_url: payload.imageDataUrl || "",
      status: payload.status || "pending",
      created_by: payload.createdBy || "",
      created_by_email: payload.createdByEmail || "",
      source: payload.source || "supabase"
    })
    .select("*")
    .single();

  return normalizeModuleDraft(requireSuccess(result, "module draft save"));
}

export async function saveQuizDraft(payload) {
  const result = await supabase
    .from("quiz_drafts")
    .insert(buildQuizDraftPayload(payload))
    .select("*")
    .single();

  return normalizeQuizDraft(requireSuccess(result, "quiz draft save"));
}

export async function reviewModuleDraft(draftId, status, reviewerEmail) {
  const result = await supabase
    .from("module_drafts")
    .update({
      status,
      reviewed_by: reviewerEmail || "",
      reviewed_at: new Date().toISOString()
    })
    .eq("id", draftId)
    .select("*")
    .single();

  return normalizeModuleDraft(requireSuccess(result, "module draft review"));
}

export async function reviewQuizDraft(draftId, status, reviewerEmail) {
  const result = await supabase
    .from("quiz_drafts")
    .update({
      status,
      reviewed_by: reviewerEmail || "",
      reviewed_at: new Date().toISOString()
    })
    .eq("id", draftId)
    .select("*")
    .single();

  return normalizeQuizDraft(requireSuccess(result, "quiz draft review"));
}

export async function fetchPublishedModules(filters = {}) {
  let query = supabase
    .from("published_modules")
    .select("*")
    .order("published_order", { ascending: true })
    .order("published_at", { ascending: true });

  if (filters.subject) {
    query = query.eq("subject", filters.subject);
  }

  if (filters.difficulty) {
    query = query.eq("difficulty", filters.difficulty);
  }

  const result = await query;
  return requireSuccess(result, "published module fetch").map(normalizePublishedModule);
}

export async function fetchPublishedQuizzes(filters = {}) {
  let query = supabase
    .from("published_quizzes")
    .select("*")
    .order("published_order", { ascending: true })
    .order("published_at", { ascending: true });

  if (filters.subject) {
    query = query.eq("subject", filters.subject);
  }

  if (filters.quizType) {
    query = query.eq("quiz_type", filters.quizType);
  }

  const result = await query;
  return requireSuccess(result, "published quiz fetch").map(normalizePublishedQuiz);
}

export async function publishModuleDraft(draft, actorEmail) {
  const publishedItems = await fetchPublishedModules({
    subject: draft.subject,
    difficulty: draft.difficulty
  });

  const nextOrder = publishedItems.length + 1;
  const insertResult = await supabase
    .from("published_modules")
    .insert({
      source_draft_id: draft.id,
      subject: draft.subject,
      difficulty: draft.difficulty,
      title: draft.title || `Published Module ${nextOrder}`,
      content: draft.content || "",
      tip: draft.tip || "",
      image_data_url: draft.imageDataUrl || "",
      published_order: nextOrder,
      created_by: draft.createdBy || "",
      created_by_email: draft.createdByEmail || "",
      published_by: actorEmail || "",
      source: "supabase"
    })
    .select("*")
    .single();

  const publishedRow = normalizePublishedModule(requireSuccess(insertResult, "module publish insert"));

  await supabase
    .from("module_drafts")
    .update({
      status: "published",
      published_by: actorEmail || "",
      published_at: new Date().toISOString(),
      reviewed_by: actorEmail || "",
      reviewed_at: new Date().toISOString()
    })
    .eq("id", draft.id);

  return publishedRow;
}

export async function publishQuizDraft(draft, actorEmail) {
  const publishedItems = await fetchPublishedQuizzes({
    subject: draft.subject,
    quizType: draft.quizType
  });

  const nextOrder = publishedItems.length + 1;
  const insertResult = await supabase
    .from("published_quizzes")
    .insert({
      source_draft_id: draft.id,
      subject: draft.subject,
      quiz_type: draft.quizType,
      question: draft.question || "",
      choice_a: draft.choices?.[0] || draft.choiceA || "",
      choice_b: draft.choices?.[1] || draft.choiceB || "",
      choice_c: draft.choices?.[2] || draft.choiceC || "",
      choice_d: draft.choices?.[3] || draft.choiceD || "",
      answer_letter: draft.answerLetter || "",
      answer_text: draft.answerText || "",
      rationale: draft.rationale || "",
      image_data_url: draft.imageDataUrl || "",
      published_order: nextOrder,
      created_by: draft.createdBy || "",
      created_by_email: draft.createdByEmail || "",
      published_by: actorEmail || "",
      source: "supabase"
    })
    .select("*")
    .single();

  const publishedRow = normalizePublishedQuiz(requireSuccess(insertResult, "quiz publish insert"));

  await supabase
    .from("quiz_drafts")
    .update({
      status: "published",
      published_by: actorEmail || "",
      published_at: new Date().toISOString(),
      reviewed_by: actorEmail || "",
      reviewed_at: new Date().toISOString()
    })
    .eq("id", draft.id);

  return publishedRow;
}
