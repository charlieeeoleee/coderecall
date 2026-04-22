import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
  getFirestore,
  collection,
  getDocs,
  addDoc,
  updateDoc,
  doc,
  getDoc,
  query,
  where,
  onSnapshot,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { resolveUserRole, roleMeetsMinimum } from "./role-utils.js";

const firebaseConfig = {
  apiKey: "AIzaSyDZiVk1T6ZbpKJrhRt1wQAr2vSSn4Wa_KU",
  authDomain: "gamifiedlearningsystem.firebaseapp.com",
  projectId: "gamifiedlearningsystem",
  storageBucket: "gamifiedlearningsystem.firebasestorage.app",
  messagingSenderId: "516998404507",
  appId: "1:516998404507:web:0c625f9af2809ca4b6a93e"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let currentUser = null;
let currentRole = "guest";
const replySeenKeyPrefix = "contact_reply_seen";
let contactMessagesUnsubscribe = null;
let currentAdminInboxFilter = "all";
let currentAdminCategoryFilter = "all";
let currentMyMessagesSearch = "";
let currentAdminSearchTerm = "";
let currentMyMessagesSort = "newest";
let currentAdminSort = "newest";
let lastRenderedContactMessages = [];

function goHome() {
  window.location.href = "index.html";
}

function goToAuth() {
  window.location.href = "auth.html";
}

function goToDashboard() {
  window.location.href = "dashboard.html";
}

window.goHome = goHome;
window.goToAuth = goToAuth;
window.goToDashboard = goToDashboard;
window.closeReplyPopup = function () {
  document.getElementById("replyPopup")?.classList.remove("active");
};
window.closeTicketDetailModal = function () {
  document.getElementById("ticketDetailModal")?.classList.remove("active");
};

window.toggleMobileNav = function () {
  const navbar = document.querySelector(".navbar");
  const toggle = document.querySelector(".nav-toggle");
  if (!navbar || !toggle) return;

  const isOpen = navbar.classList.toggle("mobile-nav-open");
  toggle.setAttribute("aria-expanded", String(isOpen));
};

function updateIcon() {
  const icon = document.getElementById("themeIcon");
  if (!icon) return;
  icon.textContent = document.body.classList.contains("light-mode") ? "\u2600\uFE0F" : "\uD83C\uDF19";
}

function loadTheme() {
  const saved = localStorage.getItem("theme");
  if (saved === "light") {
    document.body.classList.add("light-mode");
  }
  updateIcon();
}

window.toggleTheme = function () {
  document.body.classList.toggle("light-mode");
  localStorage.setItem("theme", document.body.classList.contains("light-mode") ? "light" : "dark");
  updateIcon();
};

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function timestampToMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value.seconds === "number") return value.seconds * 1000;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatDate(value) {
  const millis = timestampToMillis(value);
  if (!millis) return "Pending timestamp";
  return new Date(millis).toLocaleString();
}

function setStatus(id, message, isError = false) {
  const element = document.getElementById(id);
  if (!element) return;
  element.textContent = message;
  element.style.color = isError ? "#ffb4b8" : "#8df6cb";
}

function buildTicketId() {
  const timePart = Date.now().toString().slice(-6);
  const randomPart = Math.floor(Math.random() * 900 + 100);
  return `TCK-${timePart}${randomPart}`;
}

function getLearnerStatusInfo(item) {
  const status = String(item?.status || "open");

  if (status === "resolved") {
    return {
      label: "Resolved",
      className: "resolved",
      helper: `Your concern was marked resolved by ${item.resolvedByName || item.assignedAdminName || "support"}.`
    };
  }

  if (item?.assignedAdminUid) {
    return {
      label: "Claimed by Admin",
      className: "claimed",
      helper: `Your ticket is currently being handled by ${item.assignedAdminName || "an admin"}.`
    };
  }

  return {
    label: "Waiting for Support",
    className: "waiting",
    helper: "Your ticket is in the support queue and waiting for an admin to claim it."
  };
}

function getReplySeenStorageKey() {
  return currentUser ? `${replySeenKeyPrefix}:${currentUser.uid}` : "";
}

function readSeenReplies() {
  const key = getReplySeenStorageKey();
  if (!key) return {};

  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) || {} : {};
  } catch {
    return {};
  }
}

function writeSeenReplies(map) {
  const key = getReplySeenStorageKey();
  if (!key) return;

  try {
    localStorage.setItem(key, JSON.stringify(map));
  } catch {
    // Ignore local storage write issues.
  }
}

function getReplyHistory(item) {
  const history = Array.isArray(item?.replyHistory) ? item.replyHistory.filter(Boolean) : [];

  if (history.length) {
    return history;
  }

  if (item?.replyText) {
    return [{
      text: item.replyText,
      byName: item.repliedByName || item.repliedByRole || "Admin",
      byRole: item.repliedByRole || "admin",
      at: item.repliedAt || null
    }];
  }

  return [];
}

function getConversationHistory(item) {
  const conversation = Array.isArray(item?.conversationHistory)
    ? item.conversationHistory.filter(Boolean)
    : [];

  if (conversation.length) {
    return conversation;
  }

  const fallback = [];

  if (item?.message) {
    fallback.push({
      type: "learner",
      text: item.message,
      byUid: item.createdByUid || "",
      byName: item.createdByName || "You",
      byRole: item.createdByRole || "user",
      at: item.createdAt || null
    });
  }

  getReplyHistory(item).forEach((entry) => {
    fallback.push({
      type: "admin",
      text: entry.text || "",
      byUid: entry.byUid || "",
      byName: entry.byName || "Admin",
      byRole: entry.byRole || "admin",
      at: entry.at || null
    });
  });

  return fallback;
}

function isAdminConversationEntry(entry) {
  const role = String(entry?.byRole || "").toLowerCase();
  return entry?.type === "admin" || role === "admin" || role === "super_admin";
}

function getLatestAdminConversationEntry(item) {
  const adminEntries = getConversationHistory(item).filter((entry) => isAdminConversationEntry(entry));
  return adminEntries[adminEntries.length - 1] || null;
}

function renderConversationHistory(item, options = {}) {
  const conversation = getConversationHistory(item);
  if (!conversation.length) return "";

  const viewerIsAdmin = options.viewerIsAdmin ?? roleMeetsMinimum(currentRole, "admin");

  return `
    <div class="conversation-thread">
      ${conversation.map((entry, index) => {
        const isAdmin = isAdminConversationEntry(entry);
        const speakerLabel = isAdmin
          ? "Admin Reply"
          : (viewerIsAdmin ? "Learner Message" : "Your Message");
        const roleLabel = entry?.byName || (isAdmin ? "Admin" : "Learner");

        return `
          <div class="conversation-entry ${isAdmin ? "admin" : "learner"} ${index === conversation.length - 1 ? "latest" : ""}">
            <div class="conversation-entry-head">
              <span class="message-reply-title">${escapeHtml(speakerLabel)}</span>
              <span class="message-small">${escapeHtml(formatDate(entry.at))}</span>
            </div>
            <p class="message-reply">${escapeHtml(entry.text || "")}</p>
            <span class="message-small">Sent by ${escapeHtml(roleLabel)}</span>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function renderReplyHistory(history) {
  if (!history.length) return "";

  return `
    <div class="reply-history-list">
      ${history.map((entry, index) => `
        <div class="reply-history-item ${index === history.length - 1 ? "latest" : ""}">
          <span class="message-reply-title">${index === history.length - 1 ? "Latest Admin Reply" : "Previous Reply"}</span>
          <p class="message-reply">${escapeHtml(entry.text || "")}</p>
          <span class="message-small">Replied by ${escapeHtml(entry.byName || entry.byRole || "Admin")} on ${escapeHtml(formatDate(entry.at))}</span>
        </div>
      `).join("")}
    </div>
  `;
}

function showReplyPopup(message) {
  const popup = document.getElementById("replyPopup");
  const title = document.getElementById("replyPopupTitle");
  const body = document.getElementById("replyPopupMessage");
  if (!popup || !title || !body) return;

  title.textContent = "New Admin Reply";
  body.textContent = message;
  popup.classList.add("active");
}

function getUnseenReplyMessageIds(messages) {
  if (!currentUser || roleMeetsMinimum(currentRole, "admin")) return [];

  const seenReplies = readSeenReplies();
  return messages
    .filter((item) => {
      const latestReply = getLatestAdminConversationEntry(item);
      const replyTimestamp = timestampToMillis(latestReply?.at || item.repliedAt);
      return latestReply && replyTimestamp && seenReplies[item.id] !== replyTimestamp;
    })
    .sort((a, b) => {
      return timestampToMillis(getLatestAdminConversationEntry(b)?.at || b.repliedAt)
        - timestampToMillis(getLatestAdminConversationEntry(a)?.at || a.repliedAt);
    })
    .map((item) => item.id);
}

function highlightNewestReply(messageIds) {
  if (!Array.isArray(messageIds) || !messageIds.length) return;

  const newestId = messageIds[0];
  const target = document.querySelector(`[data-message-id="${newestId}"]`);
  if (!target) return;

  target.classList.add("reply-highlight-live");
  target.scrollIntoView({ behavior: "smooth", block: "center" });

  window.setTimeout(() => {
    target.classList.remove("reply-highlight-live");
  }, 3600);
}

function sortContactMessages(messages) {
  return [...messages].sort(
    (a, b) => timestampToMillis(b.updatedAt || b.createdAt) - timestampToMillis(a.updatedAt || a.createdAt)
  );
}

function getStatusSortWeight(item) {
  if (item?.status === "resolved") return 2;
  if (item?.assignedAdminUid) return 1;
  return 0;
}

function applyMessageSort(messages, sortMode = "newest") {
  const list = [...messages];

  if (sortMode === "oldest") {
    return list.sort((a, b) => timestampToMillis(a.createdAt) - timestampToMillis(b.createdAt));
  }

  if (sortMode === "recent_reply") {
    return list.sort((a, b) => {
      const diff = timestampToMillis(b.repliedAt) - timestampToMillis(a.repliedAt);
      if (diff !== 0) return diff;
      return timestampToMillis(b.updatedAt || b.createdAt) - timestampToMillis(a.updatedAt || a.createdAt);
    });
  }

  if (sortMode === "status") {
    return list.sort((a, b) => {
      const weightDiff = getStatusSortWeight(a) - getStatusSortWeight(b);
      if (weightDiff !== 0) return weightDiff;
      return timestampToMillis(b.updatedAt || b.createdAt) - timestampToMillis(a.updatedAt || a.createdAt);
    });
  }

  return list.sort((a, b) => timestampToMillis(b.updatedAt || b.createdAt) - timestampToMillis(a.updatedAt || a.createdAt));
}

function normalizeSearchValue(value) {
  return String(value || "").trim().toLowerCase();
}

function ticketMatchesSearch(item, searchTerm, options = {}) {
  const normalizedTerm = normalizeSearchValue(searchTerm);
  if (!normalizedTerm) return true;

  const values = [
    item.ticketId,
    item.subject,
    item.message,
    item.replyText,
    item.category
  ];

  getConversationHistory(item).forEach((entry) => {
    values.push(entry.text, entry.byName, entry.byRole);
  });

  if (options.includeAdminFields) {
    values.push(
      item.createdByName,
      item.createdByEmail,
      item.createdByRole,
      item.assignedAdminName,
      item.repliedByName
    );
  }

  return values.some((value) => normalizeSearchValue(value).includes(normalizedTerm));
}

function markRepliesAsSeen(messages) {
  if (!currentUser || roleMeetsMinimum(currentRole, "admin")) return;

  const seenReplies = readSeenReplies();
  let hasChanges = false;

  messages.forEach((item) => {
    const latestReply = getLatestAdminConversationEntry(item);
    const replyTimestamp = timestampToMillis(latestReply?.at || item.repliedAt);
    if (!latestReply || !replyTimestamp) return;
    if (seenReplies[item.id] === replyTimestamp) return;

    seenReplies[item.id] = replyTimestamp;
    hasChanges = true;
  });

  if (hasChanges) {
    writeSeenReplies(seenReplies);
  }
}

function notifyOnNewReplies(messages) {
  if (!currentUser || roleMeetsMinimum(currentRole, "admin")) return;

  const seenReplies = readSeenReplies();
  const repliedMessages = messages
    .filter((item) => Boolean(getLatestAdminConversationEntry(item)))
    .sort((a, b) => {
      return timestampToMillis(getLatestAdminConversationEntry(b)?.at || b.repliedAt)
        - timestampToMillis(getLatestAdminConversationEntry(a)?.at || a.repliedAt);
    });

  const newestUnseenReply = repliedMessages.find((item) => {
    const latestReply = getLatestAdminConversationEntry(item);
    const replyTimestamp = timestampToMillis(latestReply?.at || item.repliedAt);
    return replyTimestamp && seenReplies[item.id] !== replyTimestamp;
  });

  if (!newestUnseenReply) return;

  const latestReply = getLatestAdminConversationEntry(newestUnseenReply);
  const replyTimestamp = timestampToMillis(latestReply?.at || newestUnseenReply.repliedAt);
  seenReplies[newestUnseenReply.id] = replyTimestamp;
  writeSeenReplies(seenReplies);

  showReplyPopup(
    `An admin replied to "${newestUnseenReply.subject || "your message"}". Open your conversation history to read it.`
  );
}

function describeFirestoreError(error, fallbackMessage) {
  const code = String(error?.code || "");

  if (code.includes("permission-denied") || code.includes("insufficient-permissions")) {
    return "The database blocked this action. Firestore rules still need to allow this contact feature.";
  }

  if (code.includes("unauthenticated")) {
    return "Your session is no longer valid. Please log in again and retry.";
  }

  if (code.includes("unavailable")) {
    return "The database is temporarily unavailable. Please try again in a moment.";
  }

  return fallbackMessage;
}

function updateNavAction() {
  const actionBtn = document.getElementById("navActionBtn");
  if (!actionBtn) return;

  if (currentUser) {
    actionBtn.textContent = "Dashboard";
    actionBtn.onclick = goToDashboard;
    return;
  }

  actionBtn.textContent = "Login";
  actionBtn.onclick = goToAuth;
}

function updateRoleBanner() {
  const badge = document.getElementById("contactRoleBadge");
  const detail = document.getElementById("contactRoleDetail");
  if (!badge || !detail) return;

  if (!currentUser) {
    badge.textContent = "Visitor View";
    detail.textContent = "Login to send feedback and track replies from the team.";
    return;
  }

  if (roleMeetsMinimum(currentRole, "admin")) {
    badge.textContent = currentRole === "super_admin" ? "Super Admin Inbox" : "Admin Inbox";
    detail.textContent = "You can review support tickets here, claim tickets, reply, and resolve them based on your role.";
    return;
  }

  badge.textContent = "Private Ticket View";
  detail.textContent = "Send concerns or ideas as private support tickets, then check back here for replies from admins.";
}

function updatePageVisibility() {
  const loginPrompt = document.getElementById("contactLoginPrompt");
  const workspace = document.getElementById("contactWorkspace");
  const adminInbox = document.getElementById("adminInboxSection");
  const isAdmin = roleMeetsMinimum(currentRole, "admin");

  if (loginPrompt) {
    loginPrompt.hidden = Boolean(currentUser);
  }

  if (workspace) {
    workspace.hidden = !currentUser;
  }

  if (adminInbox) {
    adminInbox.hidden = !isAdmin;
  }

  if (!isAdmin) {
    const adminInboxList = document.getElementById("adminInboxList");
    if (adminInboxList) {
      adminInboxList.innerHTML = `
        <article class="message-card empty-card">
          <h3>Admin inbox hidden</h3>
          <p>This inbox is only available to admin and super admin accounts.</p>
        </article>
      `;
    }
  }
}

async function buildCurrentUserProfile(user) {
  const userDoc = await getDoc(doc(db, "users", user.uid)).catch(() => null);
  const data = userDoc?.exists() ? userDoc.data() || {} : {};

  return {
    uid: user.uid,
    role: currentRole,
    name: data.name || user.displayName || user.email || "User",
    email: data.email || user.email || "",
    photo: data.photo || user.photoURL || "https://i.pravatar.cc/40?img=12"
  };
}

async function handleContactSubmit(event) {
  event.preventDefault();

  if (!currentUser) {
    setStatus("contactFormStatus", "Login first so your message can be linked to your account.", true);
    return;
  }

  const category = document.getElementById("contactCategory")?.value || "feedback";
  const subject = document.getElementById("contactSubject")?.value.trim() || "";
  const message = document.getElementById("contactMessage")?.value.trim() || "";

  if (!subject || !message) {
    setStatus("contactFormStatus", "Please complete the subject and message fields.", true);
    return;
  }

  const profile = await buildCurrentUserProfile(currentUser);

  try {
    await addDoc(collection(db, "contactMessages"), {
      ticketId: buildTicketId(),
      category,
      subject,
      message,
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
      conversationHistory: [{
        type: "learner",
        text: message,
        byUid: profile.uid,
        byName: profile.name,
        byRole: profile.role,
        at: new Date().toISOString()
      }],
      repliedAt: null,
      repliedByUid: "",
      repliedByName: "",
      repliedByRole: "",
      resolvedAt: null,
      resolvedByUid: "",
      resolvedByName: "",
      resolvedByRole: ""
    });

    const form = document.getElementById("contactForm");
    form?.reset();
    setStatus("contactFormStatus", "Your message was sent successfully.");
    await refreshContactLists();
  } catch (error) {
    console.error("Unable to save contact message:", error);
    setStatus(
      "contactFormStatus",
      describeFirestoreError(error, "Unable to send your message right now. Please try again."),
      true
    );
  }
}

function renderMyMessages(messages, highlightedIds = []) {
  const target = document.getElementById("myMessagesList");
  if (!target) return;

  const filteredMessages = applyMessageSort(
    messages.filter((item) => ticketMatchesSearch(item, currentMyMessagesSearch)),
    currentMyMessagesSort
  );

  if (!messages.length) {
    target.innerHTML = `
      <article class="message-card empty-card">
        <h3>No messages yet</h3>
        <p>Your submitted concerns and feedback will appear here once you send one.</p>
      </article>
    `;
    return;
  }

  if (!filteredMessages.length) {
    target.innerHTML = `
      <article class="message-card empty-card">
        <h3>No private tickets match your search</h3>
        <p>Try a different keyword like the ticket ID, subject, or a word from your message.</p>
      </article>
    `;
    return;
  }

  const highlightedSet = new Set(highlightedIds);

  target.innerHTML = filteredMessages.map((item) => `
    <article class="message-card ${highlightedSet.has(item.id) ? "reply-highlight-card" : ""}" data-message-id="${escapeHtml(item.id)}">
      <div class="message-top">
        <div>
          <span class="ticket-id">${escapeHtml(item.ticketId || item.id || "TCK-PENDING")}</span>
          <h3>${escapeHtml(item.subject || "Untitled message")}</h3>
          <div class="message-meta-wrap">
            <span class="message-meta">${escapeHtml(item.category || "feedback")}</span>
            <span class="message-meta learner-status-chip ${escapeHtml(getLearnerStatusInfo(item).className)}">${escapeHtml(getLearnerStatusInfo(item).label)}</span>
            ${highlightedSet.has(item.id) ? `<span class="message-meta reply-alert-pill">New Reply</span>` : ""}
          </div>
        </div>
        <span class="message-small">${escapeHtml(formatDate(item.createdAt))}</span>
      </div>
      <p class="ticket-owner-note">
        ${escapeHtml(getLearnerStatusInfo(item).helper)}
      </p>
      <p class="message-body">${escapeHtml(item.message || "")}</p>
      ${getConversationHistory(item).length ? `
        <div class="message-reply-box">
          <span class="message-reply-title">Private Conversation</span>
          ${renderConversationHistory(item, { viewerIsAdmin: false })}
        </div>
      ` : ""}
      ${item.status !== "resolved" ? `
        <div class="reply-form learner-reply-form">
          <span class="reply-label">Send a follow-up reply</span>
          <textarea rows="4" data-learner-reply-input="${escapeHtml(item.id)}" placeholder="Add more detail so the assigned admin can continue helping."></textarea>
          <div class="reply-actions">
            <button type="button" class="reply-btn" data-learner-reply-message="${escapeHtml(item.id)}">Send Follow-up</button>
          </div>
          <p class="form-status" data-learner-reply-status="${escapeHtml(item.id)}"></p>
        </div>
      ` : ""}
      <div class="ticket-action-row">
        <button type="button" class="ticket-action-btn detail" data-ticket-detail="${escapeHtml(item.id)}">View Detail</button>
      </div>
    </article>
  `).join("");

  bindTicketDetailActions();
  bindLearnerReplyActions();
}

function renderListLoading(targetId, title, message) {
  const target = document.getElementById(targetId);
  if (!target) return;

  target.innerHTML = `
    <article class="message-card empty-card">
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(message)}</p>
    </article>
  `;
}

async function fetchContactMessagesForCurrentRole() {
  if (!currentUser) return [];

  if (currentRole === "super_admin") {
    const snapshot = await getDocs(collection(db, "contactMessages"));
    return snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }));
  }

  if (currentRole === "admin") {
    const sources = getContactMessagesSource();
    const snapshots = await Promise.all(sources.map((source) => getDocs(source)));
    const messageMap = new Map();

    snapshots.forEach((snapshot) => {
      snapshot.docs.forEach((entry) => {
        messageMap.set(entry.id, { id: entry.id, ...entry.data() });
      });
    });

    return Array.from(messageMap.values());
  }

  const ownMessagesQuery = query(
    collection(db, "contactMessages"),
    where("createdByUid", "==", currentUser.uid)
  );

  const snapshot = await getDocs(ownMessagesQuery);
  return snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }));
}

function getContactMessagesSource() {
  if (!currentUser) return null;

  if (currentRole === "super_admin") {
    return collection(db, "contactMessages");
  }

  if (currentRole === "admin") {
    return [
      query(collection(db, "contactMessages"), where("assignedAdminUid", "==", "")),
      query(collection(db, "contactMessages"), where("assignedAdminUid", "==", currentUser.uid)),
      query(collection(db, "contactMessages"), where("createdByUid", "==", currentUser.uid))
    ];
  }

  return query(
    collection(db, "contactMessages"),
    where("createdByUid", "==", currentUser.uid)
  );
}

function getCurrentUserPrivateMessages(messages) {
  if (!currentUser) return [];
  return messages.filter((item) => item.createdByUid === currentUser.uid);
}

function getFilteredAdminMessages(messages) {
  let filtered = [...messages];

  if (currentAdminInboxFilter === "unassigned") {
    filtered = filtered.filter((item) => !item.assignedAdminUid && item.status !== "resolved");
  } else if (currentAdminInboxFilter === "mine") {
    filtered = filtered.filter((item) => item.assignedAdminUid === currentUser?.uid && item.status !== "resolved");
  } else if (currentAdminInboxFilter === "resolved") {
    filtered = filtered.filter((item) => item.status === "resolved");
  }

  if (currentAdminCategoryFilter !== "all") {
    filtered = filtered.filter((item) => item.category === currentAdminCategoryFilter);
  }

  if (currentAdminSearchTerm) {
    filtered = filtered.filter((item) => ticketMatchesSearch(item, currentAdminSearchTerm, { includeAdminFields: true }));
  }

  return applyMessageSort(filtered, currentAdminSort);
}

function canManageTicket(item) {
  if (!currentUser) return false;
  if (currentRole === "super_admin") return true;
  if (currentRole !== "admin") return false;
  return !item.assignedAdminUid || item.assignedAdminUid === currentUser.uid;
}

function getTicketOwnerLabel(item) {
  if (item.status === "resolved") {
    return `Resolved by ${escapeHtml(item.resolvedByName || item.assignedAdminName || "Admin")}`;
  }

  if (item.assignedAdminUid) {
    return `Assigned to ${escapeHtml(item.assignedAdminName || "Admin")}`;
  }

  return "Unassigned ticket";
}

function openTicketDetailModal(messageId) {
  const item = lastRenderedContactMessages.find((entry) => entry.id === messageId);
  const modal = document.getElementById("ticketDetailModal");
  const title = document.getElementById("ticketDetailTitle");
  const content = document.getElementById("ticketDetailContent");

  if (!item || !modal || !title || !content) return;

  const learnerStatus = getLearnerStatusInfo(item);
  const showAdminView = roleMeetsMinimum(currentRole, "admin");
  const conversation = getConversationHistory(item);

  title.textContent = item.subject || item.ticketId || "Ticket";
  content.innerHTML = `
    <div class="ticket-detail-grid">
      <div class="ticket-detail-stat">
        <span class="ticket-detail-stat-label">Ticket ID</span>
        <div class="ticket-detail-stat-value">${escapeHtml(item.ticketId || item.id || "TCK-PENDING")}</div>
      </div>
      <div class="ticket-detail-stat">
        <span class="ticket-detail-stat-label">Category</span>
        <div class="ticket-detail-stat-value">${escapeHtml(item.category || "feedback")}</div>
      </div>
      <div class="ticket-detail-stat">
        <span class="ticket-detail-stat-label">${showAdminView ? "Status" : "Learner Status"}</span>
        <div class="ticket-detail-stat-value">${escapeHtml(showAdminView ? (item.status || "open") : learnerStatus.label)}</div>
      </div>
      <div class="ticket-detail-stat">
        <span class="ticket-detail-stat-label">Created</span>
        <div class="ticket-detail-stat-value">${escapeHtml(formatDate(item.createdAt))}</div>
      </div>
      ${showAdminView ? `
        <div class="ticket-detail-stat">
          <span class="ticket-detail-stat-label">From</span>
          <div class="ticket-detail-stat-value">${escapeHtml(item.createdByName || "User")}${item.createdByEmail ? `<br>${escapeHtml(item.createdByEmail)}` : ""}</div>
        </div>
        <div class="ticket-detail-stat">
          <span class="ticket-detail-stat-label">Assignment</span>
          <div class="ticket-detail-stat-value">${item.assignedAdminUid ? escapeHtml(item.assignedAdminName || "Assigned admin") : "Unassigned"}</div>
        </div>
      ` : `
        <div class="ticket-detail-stat">
          <span class="ticket-detail-stat-label">Support Update</span>
          <div class="ticket-detail-stat-value">${escapeHtml(learnerStatus.helper)}</div>
        </div>
        <div class="ticket-detail-stat">
          <span class="ticket-detail-stat-label">Last Update</span>
          <div class="ticket-detail-stat-value">${escapeHtml(formatDate(item.updatedAt || item.createdAt))}</div>
        </div>
      `}
    </div>
    <section class="ticket-detail-section">
      <h4>Your Message</h4>
      <p class="ticket-detail-text">${escapeHtml(item.message || "")}</p>
    </section>
    ${conversation.length ? `
      <section class="ticket-detail-section">
        <h4>Conversation History</h4>
        ${renderConversationHistory(item, { viewerIsAdmin: showAdminView })}
      </section>
    ` : ""}
    ${showAdminView ? `
      <section class="ticket-detail-section">
        <h4>Admin Summary</h4>
        <p class="ticket-detail-text">${escapeHtml(getTicketOwnerLabel(item).replace(/<[^>]+>/g, ""))}</p>
      </section>
    ` : ""}
  `;

  modal.classList.add("active");
}

async function updateTicket(messageId, updates, successText, statusElement) {
  try {
    await updateDoc(doc(db, "contactMessages", messageId), {
      ...updates,
      updatedAt: serverTimestamp()
    });

    if (statusElement && successText) {
      statusElement.textContent = successText;
    }
  } catch (error) {
    console.error("Unable to update ticket:", error);
    if (statusElement) {
      statusElement.textContent = describeFirestoreError(error, "Unable to update this ticket right now.");
    }
  }
}

function bindTicketActions() {
  document.querySelectorAll("[data-claim-ticket]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!currentUser || !roleMeetsMinimum(currentRole, "admin")) return;

      const messageId = button.getAttribute("data-claim-ticket");
      const statusElement = document.querySelector(`[data-ticket-status="${messageId}"]`);
      const profile = await buildCurrentUserProfile(currentUser);

      await updateTicket(
        messageId,
        {
          assignedAdminUid: profile.uid,
          assignedAdminName: profile.name,
          assignedAdminRole: profile.role,
          status: "claimed"
        },
        "Ticket claimed.",
        statusElement
      );
    });
  });

  document.querySelectorAll("[data-release-ticket]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!currentUser || !roleMeetsMinimum(currentRole, "admin")) return;

      const messageId = button.getAttribute("data-release-ticket");
      const statusElement = document.querySelector(`[data-ticket-status="${messageId}"]`);

      await updateTicket(
        messageId,
        {
          assignedAdminUid: "",
          assignedAdminName: "",
          assignedAdminRole: "",
          status: "open"
        },
        "Ticket released back to the inbox.",
        statusElement
      );
    });
  });

  document.querySelectorAll("[data-resolve-ticket]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!currentUser || !roleMeetsMinimum(currentRole, "admin")) return;

      const messageId = button.getAttribute("data-resolve-ticket");
      const statusElement = document.querySelector(`[data-ticket-status="${messageId}"]`);
      const profile = await buildCurrentUserProfile(currentUser);

      await updateTicket(
        messageId,
        {
          status: "resolved",
          assignedAdminUid: profile.uid,
          assignedAdminName: profile.name,
          assignedAdminRole: profile.role,
          resolvedAt: serverTimestamp(),
          resolvedByUid: profile.uid,
          resolvedByName: profile.name,
          resolvedByRole: profile.role
        },
        "Ticket resolved.",
        statusElement
      );
    });
  });

  document.querySelectorAll("[data-reopen-ticket]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!currentUser || !roleMeetsMinimum(currentRole, "admin")) return;

      const messageId = button.getAttribute("data-reopen-ticket");
      const statusElement = document.querySelector(`[data-ticket-status="${messageId}"]`);
      const profile = await buildCurrentUserProfile(currentUser);

      await updateTicket(
        messageId,
        {
          status: "claimed",
          assignedAdminUid: profile.uid,
          assignedAdminName: profile.name,
          assignedAdminRole: profile.role,
          resolvedAt: null,
          resolvedByUid: "",
          resolvedByName: "",
          resolvedByRole: ""
        },
        "Ticket reopened.",
        statusElement
      );
    });
  });

  document.querySelectorAll("[data-takeover-ticket]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!currentUser || currentRole !== "super_admin") return;

      const messageId = button.getAttribute("data-takeover-ticket");
      const statusElement = document.querySelector(`[data-ticket-status="${messageId}"]`);
      const profile = await buildCurrentUserProfile(currentUser);

      await updateTicket(
        messageId,
        {
          assignedAdminUid: profile.uid,
          assignedAdminName: profile.name,
          assignedAdminRole: profile.role,
          status: "claimed"
        },
        "Ticket reassigned to you.",
        statusElement
      );
    });
  });
}

function bindAdminFilters() {
  document.querySelectorAll("[data-ticket-filter]").forEach((button) => {
    if (button.dataset.bound === "true") return;
    button.dataset.bound = "true";

    button.addEventListener("click", () => {
      currentAdminInboxFilter = button.getAttribute("data-ticket-filter") || "all";
      document.querySelectorAll("[data-ticket-filter]").forEach((entry) => {
        entry.classList.toggle("active", entry === button);
      });

      refreshContactLists();
    });
  });

  const categorySelect = document.getElementById("adminCategoryFilter");
  if (categorySelect && categorySelect.dataset.bound !== "true") {
    categorySelect.dataset.bound = "true";
    categorySelect.addEventListener("change", () => {
      currentAdminCategoryFilter = categorySelect.value || "all";
      refreshContactLists();
    });
  }

  const adminSearch = document.getElementById("adminInboxSearch");
  if (adminSearch && adminSearch.dataset.bound !== "true") {
    adminSearch.dataset.bound = "true";
    adminSearch.addEventListener("input", () => {
      currentAdminSearchTerm = adminSearch.value || "";
      refreshContactLists();
    });
  }

  const adminSort = document.getElementById("adminSortFilter");
  if (adminSort && adminSort.dataset.bound !== "true") {
    adminSort.dataset.bound = "true";
    adminSort.addEventListener("change", () => {
      currentAdminSort = adminSort.value || "newest";
      refreshContactLists();
    });
  }
}

function bindLearnerSearch() {
  const learnerSearch = document.getElementById("myMessagesSearch");
  if (!learnerSearch || learnerSearch.dataset.bound === "true") return;

  learnerSearch.dataset.bound = "true";
  learnerSearch.addEventListener("input", () => {
    currentMyMessagesSearch = learnerSearch.value || "";
    refreshContactLists();
  });

  const learnerSort = document.getElementById("myMessagesSort");
  if (learnerSort && learnerSort.dataset.bound !== "true") {
    learnerSort.dataset.bound = "true";
    learnerSort.addEventListener("change", () => {
      currentMyMessagesSort = learnerSort.value || "newest";
      refreshContactLists();
    });
  }
}

function bindReplyActions() {
  document.querySelectorAll("[data-reply-message]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!currentUser || !roleMeetsMinimum(currentRole, "admin")) {
        return;
      }

      const messageId = button.getAttribute("data-reply-message");
      const textarea = document.querySelector(`[data-reply-input="${messageId}"]`);
      const status = document.querySelector(`[data-reply-status="${messageId}"]`);
      const replyText = textarea?.value.trim() || "";

      if (!messageId || !replyText) {
        if (status) status.textContent = "Write a reply first.";
        return;
      }

      try {
        const profile = await buildCurrentUserProfile(currentUser);
        const ticket = lastRenderedContactMessages.find((entry) => entry.id === messageId);
        const conversationHistory = getConversationHistory(ticket);
        const replyHistory = getReplyHistory(ticket);
        const newReplyEntry = {
          text: replyText,
          byUid: profile.uid,
          byName: profile.name,
          byRole: profile.role,
          at: new Date().toISOString()
        };

        await updateDoc(doc(db, "contactMessages", messageId), {
          assignedAdminUid: profile.uid,
          assignedAdminName: profile.name,
          assignedAdminRole: profile.role,
          replyText,
          status: "claimed",
          repliedAt: serverTimestamp(),
          repliedByUid: profile.uid,
          repliedByName: profile.name,
          repliedByRole: profile.role,
          replyHistory: [...replyHistory, newReplyEntry],
          conversationHistory: [...conversationHistory, { ...newReplyEntry, type: "admin" }],
          updatedAt: serverTimestamp()
        });

        if (textarea) textarea.value = "";
        if (status) status.textContent = "Reply saved.";
        await refreshContactLists();
      } catch (error) {
        console.error("Unable to save reply:", error);
        if (status) {
          status.textContent = describeFirestoreError(error, "Unable to save reply right now.");
        }
      }
    });
  });
}

function bindLearnerReplyActions() {
  document.querySelectorAll("[data-learner-reply-message]").forEach((button) => {
    if (button.dataset.bound === "true") return;
    button.dataset.bound = "true";

    button.addEventListener("click", async () => {
      if (!currentUser || roleMeetsMinimum(currentRole, "admin")) return;

      const messageId = button.getAttribute("data-learner-reply-message");
      const textarea = document.querySelector(`[data-learner-reply-input="${messageId}"]`);
      const status = document.querySelector(`[data-learner-reply-status="${messageId}"]`);
      const replyText = textarea?.value.trim() || "";
      const ticket = lastRenderedContactMessages.find((entry) => entry.id === messageId);

      if (!messageId || !ticket) return;

      if (ticket.status === "resolved") {
        if (status) status.textContent = "This ticket is already resolved.";
        return;
      }

      if (!replyText) {
        if (status) status.textContent = "Write your follow-up reply first.";
        return;
      }

      try {
        const profile = await buildCurrentUserProfile(currentUser);
        const conversationHistory = getConversationHistory(ticket);
        const newEntry = {
          type: "learner",
          text: replyText,
          byUid: profile.uid,
          byName: profile.name,
          byRole: profile.role,
          at: new Date().toISOString()
        };

        await updateDoc(doc(db, "contactMessages", messageId), {
          conversationHistory: [...conversationHistory, newEntry],
          updatedAt: serverTimestamp()
        });

        if (textarea) textarea.value = "";
        if (status) status.textContent = "Follow-up sent.";
        await refreshContactLists();
      } catch (error) {
        console.error("Unable to send learner follow-up:", error);
        if (status) {
          status.textContent = describeFirestoreError(error, "Unable to send your follow-up right now.");
        }
      }
    });
  });
}

function bindTicketDetailActions() {
  document.querySelectorAll("[data-ticket-detail]").forEach((button) => {
    if (button.dataset.bound === "true") return;
    button.dataset.bound = "true";

    button.addEventListener("click", () => {
      const messageId = button.getAttribute("data-ticket-detail");
      if (!messageId) return;
      openTicketDetailModal(messageId);
    });
  });
}

function renderAdminInbox(messages) {
  const target = document.getElementById("adminInboxList");
  if (!target) return;

  bindAdminFilters();

  if (!messages.length) {
    target.innerHTML = `
      <article class="message-card empty-card">
        <h3>No contact messages yet</h3>
        <p>Incoming learner concerns and feedback will appear here.</p>
      </article>
    `;
    return;
  }

  const visibleMessages = currentRole === "super_admin"
    ? messages
    : messages.filter((item) => !item.assignedAdminUid || item.assignedAdminUid === currentUser?.uid);

  const filteredMessages = getFilteredAdminMessages(visibleMessages);

  if (!filteredMessages.length) {
    target.innerHTML = `
      <article class="message-card empty-card">
        <h3>No tickets match the current filters</h3>
        <p>Try changing the ticket status, category, or search term to view other tickets.</p>
      </article>
    `;
    return;
  }

  target.innerHTML = filteredMessages.map((item) => {
    const canManage = canManageTicket(item);
    const isClaimedByOther = item.assignedAdminUid && item.assignedAdminUid !== currentUser?.uid;
    const canReply = canManage && item.status !== "resolved";

    return `
    <article class="message-card">
      <div class="message-top">
        <div>
          <span class="ticket-id">${escapeHtml(item.ticketId || item.id || "TCK-PENDING")}</span>
          <h3>${escapeHtml(item.subject || "Untitled message")}</h3>
          <div class="message-meta-wrap">
            <span class="message-meta">${escapeHtml(item.category || "feedback")}</span>
            <span class="message-meta">${escapeHtml(item.status || "open")}</span>
            <span class="message-meta">${escapeHtml(item.createdByRole || "user")}</span>
          </div>
        </div>
        <span class="message-small">${escapeHtml(formatDate(item.createdAt))}</span>
      </div>
      <div class="message-small">From: ${escapeHtml(item.createdByName || "User")} ${item.createdByEmail ? `(${escapeHtml(item.createdByEmail)})` : ""}</div>
      <p class="ticket-owner-note">${getTicketOwnerLabel(item)}</p>
      <p class="message-body">${escapeHtml(item.message || "")}</p>
      ${getConversationHistory(item).length ? `
        <div class="message-reply-box">
          <span class="message-reply-title">Private Conversation</span>
          ${renderConversationHistory(item, { viewerIsAdmin: true })}
        </div>
      ` : ""}
      <div class="reply-form">
        <span class="reply-label">Reply to this message</span>
        <textarea rows="4" data-reply-input="${escapeHtml(item.id)}" placeholder="Write a reply for this learner." ${canReply ? "" : "disabled"}></textarea>
        <div class="ticket-action-row">
          <button type="button" class="ticket-action-btn detail" data-ticket-detail="${escapeHtml(item.id)}">View Detail</button>
          ${!item.assignedAdminUid && item.status !== "resolved" ? `<button type="button" class="ticket-action-btn success" data-claim-ticket="${escapeHtml(item.id)}">Claim Ticket</button>` : ""}
          ${currentRole === "super_admin" && isClaimedByOther && item.status !== "resolved" ? `<button type="button" class="ticket-action-btn warning" data-takeover-ticket="${escapeHtml(item.id)}">Take Over</button>` : ""}
          ${item.assignedAdminUid && canManage && item.status !== "resolved" ? `<button type="button" class="ticket-action-btn secondary" data-release-ticket="${escapeHtml(item.id)}">Release Ticket</button>` : ""}
          ${canManage && item.status !== "resolved" ? `<button type="button" class="ticket-action-btn warning" data-resolve-ticket="${escapeHtml(item.id)}">Resolve Ticket</button>` : ""}
          ${canManage && item.status === "resolved" ? `<button type="button" class="ticket-action-btn secondary" data-reopen-ticket="${escapeHtml(item.id)}">Reopen Ticket</button>` : ""}
        </div>
        <div class="reply-actions">
          <button type="button" class="reply-btn" data-reply-message="${escapeHtml(item.id)}" ${canReply ? "" : "disabled"}>Save Reply</button>
        </div>
        <p class="form-status" data-reply-status="${escapeHtml(item.id)}" data-ticket-status="${escapeHtml(item.id)}">${!canManage && isClaimedByOther ? "This ticket is currently assigned to another admin." : ""}</p>
      </div>
    </article>
  `;
  }).join("");

  bindTicketDetailActions();
  bindTicketActions();
  bindReplyActions();
}

function renderContactListsFromMessages(rawMessages) {
  const allMessages = sortContactMessages(rawMessages);
  lastRenderedContactMessages = allMessages;
  const myMessages = getCurrentUserPrivateMessages(allMessages);

  const unseenReplyIds = getUnseenReplyMessageIds(myMessages);
  renderMyMessages(myMessages, unseenReplyIds);
  notifyOnNewReplies(myMessages);
  highlightNewestReply(unseenReplyIds);
  markRepliesAsSeen(myMessages);

  if (roleMeetsMinimum(currentRole, "admin")) {
    renderAdminInbox(allMessages);
  }

  updateContactPageBadges(myMessages, allMessages);
}

function renderContactLoadError() {
  const myMessagesTarget = document.getElementById("myMessagesList");
  if (myMessagesTarget) {
    myMessagesTarget.innerHTML = `
      <article class="message-card empty-card">
        <h3>Unable to load your messages</h3>
        <p>Please refresh the page or try again later.</p>
      </article>
    `;
  }

  if (roleMeetsMinimum(currentRole, "admin")) {
    const adminInboxTarget = document.getElementById("adminInboxList");
    if (adminInboxTarget) {
      adminInboxTarget.innerHTML = `
        <article class="message-card empty-card">
          <h3>Unable to load admin inbox</h3>
          <p>Please refresh the page or check your permissions.</p>
        </article>
      `;
    }
  }
}

function updateContactPageBadges(myMessages, allMessages) {
  const unreadBadge = document.getElementById("myMessagesUnreadBadge");
  const adminOpenBadge = document.getElementById("adminInboxOpenBadge");

  const unseenReplyIds = getUnseenReplyMessageIds(myMessages);
  const unseenCount = unseenReplyIds.length;

  if (unreadBadge) {
    unreadBadge.hidden = unseenCount === 0;
    unreadBadge.textContent = `${unseenCount} New`;
  }

  if (adminOpenBadge) {
    const openCount = roleMeetsMinimum(currentRole, "admin")
      ? allMessages.filter((item) => item.status !== "resolved").length
      : 0;
    adminOpenBadge.hidden = openCount === 0;
    adminOpenBadge.textContent = `${openCount} Open`;
  }

  if (!roleMeetsMinimum(currentRole, "admin")) {
    document.title = unseenCount > 0
      ? `(${unseenCount}) Contact Us - Code Recall`
      : "Contact Us - Code Recall";
  } else {
    const openCount = allMessages.filter((item) => item.status !== "resolved").length;
    document.title = openCount > 0
      ? `(${openCount}) Contact Inbox - Code Recall`
      : "Contact Us - Code Recall";
  }
}

function stopContactMessagesSubscription() {
  if (typeof contactMessagesUnsubscribe === "function") {
    contactMessagesUnsubscribe();
  }
  contactMessagesUnsubscribe = null;
}

function startContactMessagesSubscription() {
  stopContactMessagesSubscription();
  if (!currentUser) return;

  const source = getContactMessagesSource();
  if (!source) return;

  renderListLoading("myMessagesList", "Loading messages...", "Fetching your contact history.");
  if (roleMeetsMinimum(currentRole, "admin")) {
    renderListLoading("adminInboxList", "Loading inbox...", "Fetching learner contact messages.");
  }

  if (Array.isArray(source)) {
    const sourceCaches = source.map(() => new Map());
    const rebuildMessages = () => {
      const merged = new Map();
      sourceCaches.forEach((cache) => {
        cache.forEach((value, key) => merged.set(key, value));
      });
      renderContactListsFromMessages(Array.from(merged.values()));
    };

    const unsubscribers = source.map((entrySource, index) => onSnapshot(
      entrySource,
      (snapshot) => {
        const nextCache = new Map();
        snapshot.docs.forEach((entry) => {
          nextCache.set(entry.id, { id: entry.id, ...entry.data() });
        });
        sourceCaches[index] = nextCache;
        rebuildMessages();
      },
      (error) => {
        console.error("Unable to load contact messages:", error);
        renderContactLoadError();
      }
    ));

    contactMessagesUnsubscribe = () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
    return;
  }

  contactMessagesUnsubscribe = onSnapshot(
    source,
    (snapshot) => {
      const messages = snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }));
      renderContactListsFromMessages(messages);
    },
    (error) => {
      console.error("Unable to load contact messages:", error);
      renderContactLoadError();
    }
  );
}

async function refreshContactLists() {
  if (!currentUser) return;

  try {
    const messages = await fetchContactMessagesForCurrentRole();
    renderContactListsFromMessages(messages);
  } catch (error) {
    console.error("Unable to refresh contact messages:", error);
    renderContactLoadError();
  }
}

function wireContactForm() {
  const form = document.getElementById("contactForm");
  form?.addEventListener("submit", handleContactSubmit);
  bindLearnerSearch();
  bindAdminFilters();

  const ticketDetailModal = document.getElementById("ticketDetailModal");
  ticketDetailModal?.addEventListener("click", (event) => {
    if (event.target === ticketDetailModal) {
      window.closeTicketDetailModal();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      window.closeTicketDetailModal();
    }
  });
}

onAuthStateChanged(auth, async (user) => {
  stopContactMessagesSubscription();
  currentUser = user || null;
  currentRole = user ? await resolveUserRole(db, user) : "guest";
  updateNavAction();
  updateRoleBanner();
  updatePageVisibility();

  if (currentUser) {
    startContactMessagesSubscription();
  } else {
    renderMyMessages([]);
  }
});

loadTheme();
wireContactForm();
