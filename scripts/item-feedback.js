import { app } from "./firebase-config.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getFirestore,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { resolveUserRole } from "./role-utils.js";

const auth = getAuth(app);
const db = getFirestore(app);

let activeContext = {};
let activeFeedbackTrigger = null;
let previousBodyOverflow = "";

function buildTicketId() {
  const timePart = Date.now().toString().slice(-6);
  const randomPart = Math.floor(Math.random() * 900 + 100);
  return `TCK-${timePart}${randomPart}`;
}

function getText(id) {
  return document.getElementById(id)?.textContent?.trim() || "";
}

function getQueryValue(...keys) {
  const params = new URLSearchParams(window.location.search);
  for (const key of keys) {
    const value = params.get(key);
    if (value) return value;
  }
  return "";
}

function titleCase(value) {
  return String(value || "")
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .trim();
}

function buildContext(button) {
  const page = window.location.pathname.split("/").pop() || "unknown";
  const sourceType = button.dataset.feedbackSourceType || (page.includes("module") ? "module" : "assessment");
  const subject = getQueryValue("subject") || "";
  const difficulty = getQueryValue("difficulty") || "";
  const level = getQueryValue("module", "quizLevel", "level") || "";
  const pageTitle = getText("title") || getText("quizTitle") || getText("levelTitle") || document.title || "Learning item";
  const questionText = getText("questionText");
  const tag = getText("quizTag") || getText("levelTag") || "";

  return {
    sourceType,
    sourcePage: page,
    sourceUrl: `${window.location.pathname}${window.location.search}`,
    sourceSubject: titleCase(subject),
    sourceDifficulty: titleCase(difficulty),
    sourceLevel: titleCase(level),
    sourceItemTitle: pageTitle,
    sourceQuestionText: questionText,
    sourceTag: tag
  };
}

async function buildUserProfile(user) {
  const fallback = {
    uid: user.uid,
    role: "user",
    name: user.displayName || user.email || "User",
    email: user.email || "",
    photo: user.photoURL || ""
  };

  try {
    const [role, snap] = await Promise.all([
      resolveUserRole(db, user),
      getDoc(doc(db, "users", user.uid))
    ]);
    const data = snap.exists() ? snap.data() : {};
    return {
      uid: user.uid,
      role,
      name: data.name || user.displayName || user.email || "User",
      email: data.email || user.email || "",
      photo: data.photo || user.photoURL || ""
    };
  } catch (error) {
    console.warn("Unable to build item feedback profile:", error);
    return fallback;
  }
}

function ensureModal() {
  if (document.getElementById("itemFeedbackModal")) return;

  const modal = document.createElement("div");
  modal.className = "item-feedback-modal";
  modal.id = "itemFeedbackModal";
  modal.setAttribute("aria-hidden", "true");
  modal.innerHTML = `
    <div class="item-feedback-dialog" role="dialog" aria-modal="true" aria-labelledby="itemFeedbackTitle" tabindex="-1">
      <div class="item-feedback-head">
        <div>
          <span class="item-feedback-kicker">ITEM FEEDBACK</span>
          <h2 id="itemFeedbackTitle">Report an Issue or Concern</h2>
        </div>
        <button type="button" class="item-feedback-close" id="itemFeedbackClose" aria-label="Close feedback form">&times;</button>
      </div>
      <p class="item-feedback-context" id="itemFeedbackContext">This will include the current item context for the admin team.</p>
      <form id="itemFeedbackForm" class="item-feedback-form">
        <label>
          <span>What happened?</span>
          <select id="itemFeedbackType" required>
            <option value="technical_issue">Technical Issue</option>
            <option value="confusing_content">Confusing Content</option>
            <option value="wrong_answer">Wrong Answer or Explanation</option>
            <option value="accessibility">Accessibility Concern</option>
            <option value="suggestion">Suggestion</option>
            <option value="other">Other Concern</option>
          </select>
        </label>
        <label>
          <span>Details</span>
          <textarea id="itemFeedbackMessage" rows="5" placeholder="Tell us what went wrong or what could be improved." required></textarea>
        </label>
        <div class="item-feedback-actions">
          <button type="button" class="item-feedback-button secondary" id="itemFeedbackCancel">Cancel</button>
          <button type="submit" class="item-feedback-button primary" id="itemFeedbackSubmit">Send Feedback</button>
        </div>
        <p class="item-feedback-status" id="itemFeedbackStatus" role="status"></p>
      </form>
    </div>
  `;

  document.body.appendChild(modal);
  document.getElementById("itemFeedbackClose")?.addEventListener("click", closeModal);
  document.getElementById("itemFeedbackCancel")?.addEventListener("click", closeModal);
  modal.addEventListener("click", (event) => {
    if (event.target === modal) closeModal();
  });
  document.getElementById("itemFeedbackForm")?.addEventListener("submit", submitFeedback);
}

function setStatus(message, isError = false) {
  const status = document.getElementById("itemFeedbackStatus");
  if (!status) return;
  status.textContent = message;
  status.classList.toggle("error", isError);
}

function openModal(context, triggerButton = null) {
  ensureModal();
  activeContext = context;
  activeFeedbackTrigger = triggerButton;
  const modal = document.getElementById("itemFeedbackModal");
  const summary = document.getElementById("itemFeedbackContext");
  const form = document.getElementById("itemFeedbackForm");
  const itemLabel = [context.sourceItemTitle, context.sourceSubject, context.sourceDifficulty, context.sourceLevel]
    .filter(Boolean)
    .join(" - ");

  if (summary) summary.textContent = itemLabel || "This feedback will be attached to the current learning item.";
  form?.reset();
  setStatus("");
  previousBodyOverflow = document.body.style.overflow;
  document.body.style.overflow = "hidden";
  modal?.classList.add("active");
  modal?.setAttribute("aria-hidden", "false");
  document.querySelector("#itemFeedbackModal .item-feedback-dialog")?.focus({ preventScroll: true });
  document.getElementById("itemFeedbackType")?.focus({ preventScroll: true });
}

function closeModal() {
  const modal = document.getElementById("itemFeedbackModal");
  modal?.classList.remove("active");
  modal?.setAttribute("aria-hidden", "true");
  document.body.style.overflow = previousBodyOverflow;
  activeFeedbackTrigger?.focus?.({ preventScroll: true });
  activeFeedbackTrigger = null;
}

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  const modal = document.getElementById("itemFeedbackModal");
  if (modal?.classList.contains("active")) {
    closeModal();
  }
});

function buildMessageBody(message, feedbackLabel) {
  const lines = [
    message,
    "",
    "Item context:",
    `- Feedback type: ${feedbackLabel}`,
    `- Page: ${activeContext.sourcePage || "Not recorded"}`,
    `- Item: ${activeContext.sourceItemTitle || "Not recorded"}`
  ];

  if (activeContext.sourceSubject) lines.push(`- Subject: ${activeContext.sourceSubject}`);
  if (activeContext.sourceDifficulty) lines.push(`- Difficulty: ${activeContext.sourceDifficulty}`);
  if (activeContext.sourceLevel) lines.push(`- Level/Module: ${activeContext.sourceLevel}`);
  if (activeContext.sourceQuestionText) lines.push(`- Question: ${activeContext.sourceQuestionText}`);
  if (activeContext.sourceUrl) lines.push(`- Source URL: ${activeContext.sourceUrl}`);

  return lines.join("\n");
}

async function submitFeedback(event) {
  event.preventDefault();
  const user = auth.currentUser;
  const typeSelect = document.getElementById("itemFeedbackType");
  const messageInput = document.getElementById("itemFeedbackMessage");
  const submitButton = document.getElementById("itemFeedbackSubmit");
  const feedbackType = typeSelect?.value || "technical_issue";
  const feedbackLabel = typeSelect?.selectedOptions?.[0]?.textContent || "Technical Issue";
  const message = messageInput?.value.trim() || "";

  if (!user) {
    setStatus("Please log in first so admins can reply to your feedback.", true);
    return;
  }

  if (!message) {
    setStatus("Please describe the issue or concern.", true);
    return;
  }

  if (submitButton) submitButton.disabled = true;
  setStatus("Sending feedback...");

  try {
    const profile = await buildUserProfile(user);
    const subject = `Item feedback: ${activeContext.sourceItemTitle || activeContext.sourcePage || "Learning item"}`;
    const fullMessage = buildMessageBody(message, feedbackLabel);
    const conversationEntry = {
      type: "learner",
      text: fullMessage,
      byUid: profile.uid,
      byName: profile.name,
      byRole: profile.role,
      at: new Date().toISOString()
    };

    await addDoc(collection(db, "contactMessages"), {
      ticketId: buildTicketId(),
      category: "item_feedback",
      feedbackType,
      subject,
      message: fullMessage,
      status: "open",
      createdByUid: profile.uid,
      createdByName: profile.name,
      createdByEmail: profile.email,
      createdByRole: profile.role,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      assignedAdminUid: "",
      assignedAdminName: "",
      assignedAdminRole: "",
      replyText: "",
      replyHistory: [],
      conversationHistory: [conversationEntry],
      repliedAt: null,
      repliedByUid: "",
      repliedByName: "",
      repliedByRole: "",
      resolvedAt: null,
      resolvedByUid: "",
      resolvedByName: "",
      resolvedByRole: "",
      sourceType: activeContext.sourceType || "",
      sourcePage: activeContext.sourcePage || "",
      sourceUrl: activeContext.sourceUrl || "",
      sourceSubject: activeContext.sourceSubject || "",
      sourceDifficulty: activeContext.sourceDifficulty || "",
      sourceLevel: activeContext.sourceLevel || "",
      sourceItemTitle: activeContext.sourceItemTitle || "",
      sourceQuestionText: activeContext.sourceQuestionText || "",
      sourceTag: activeContext.sourceTag || ""
    });

    setStatus("Feedback sent. Admins can now review it in Contact Inbox.");
    window.setTimeout(closeModal, 900);
  } catch (error) {
    console.error("Unable to submit item feedback:", error);
    setStatus("Unable to send feedback right now. Please try again.", true);
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
}

function bindFeedbackButtons() {
  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-item-feedback]");
    if (!button) return;
    openModal(buildContext(button), button);
  });
}

window.openCodeRecallItemFeedback = function(button) {
  if (!button) return;
  openModal(buildContext(button), button);
};

if (window.CODE_RECALL_ITEM_FEEDBACK_MANUAL === true) {
  // A tiny loader will import this module on first use and call openCodeRecallItemFeedback.
} else if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bindFeedbackButtons);
} else {
  bindFeedbackButtons();
}
