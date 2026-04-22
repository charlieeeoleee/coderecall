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
    detail.textContent = "You can send your own notes here and also review or reply to all learner messages below.";
    return;
  }

  badge.textContent = "Learner Contact";
  detail.textContent = "Send concerns or ideas, then check back here for replies from admins.";
}

function updatePageVisibility() {
  const loginPrompt = document.getElementById("contactLoginPrompt");
  const workspace = document.getElementById("contactWorkspace");
  const adminInbox = document.getElementById("adminInboxSection");

  if (loginPrompt) {
    loginPrompt.hidden = Boolean(currentUser);
  }

  if (workspace) {
    workspace.hidden = !currentUser;
  }

  if (adminInbox) {
    adminInbox.hidden = !roleMeetsMinimum(currentRole, "admin");
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
      replyText: "",
      repliedAt: null,
      repliedByUid: "",
      repliedByName: "",
      repliedByRole: ""
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

function renderMyMessages(messages) {
  const target = document.getElementById("myMessagesList");
  if (!target) return;

  if (!messages.length) {
    target.innerHTML = `
      <article class="message-card empty-card">
        <h3>No messages yet</h3>
        <p>Your submitted concerns and feedback will appear here once you send one.</p>
      </article>
    `;
    return;
  }

  target.innerHTML = messages.map((item) => `
    <article class="message-card">
      <div class="message-top">
        <div>
          <h3>${escapeHtml(item.subject || "Untitled message")}</h3>
          <div class="message-meta-wrap">
            <span class="message-meta">${escapeHtml(item.category || "feedback")}</span>
            <span class="message-meta">${escapeHtml(item.status || "open")}</span>
          </div>
        </div>
        <span class="message-small">${escapeHtml(formatDate(item.createdAt))}</span>
      </div>
      <p class="message-body">${escapeHtml(item.message || "")}</p>
      ${item.replyText ? `
        <div class="message-reply-box">
          <span class="message-reply-title">Admin Reply</span>
          <p class="message-reply">${escapeHtml(item.replyText)}</p>
          <span class="message-small">Replied by ${escapeHtml(item.repliedByName || item.repliedByRole || "Admin")} on ${escapeHtml(formatDate(item.repliedAt))}</span>
        </div>
      ` : ""}
    </article>
  `).join("");
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

  if (roleMeetsMinimum(currentRole, "admin")) {
    const snapshot = await getDocs(collection(db, "contactMessages"));
    return snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }));
  }

  const ownMessagesQuery = query(
    collection(db, "contactMessages"),
    where("createdByUid", "==", currentUser.uid)
  );

  const snapshot = await getDocs(ownMessagesQuery);
  return snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }));
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
        await updateDoc(doc(db, "contactMessages", messageId), {
          replyText,
          status: "replied",
          repliedAt: serverTimestamp(),
          repliedByUid: profile.uid,
          repliedByName: profile.name,
          repliedByRole: profile.role,
          updatedAt: serverTimestamp()
        });

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

function renderAdminInbox(messages) {
  const target = document.getElementById("adminInboxList");
  if (!target) return;

  if (!messages.length) {
    target.innerHTML = `
      <article class="message-card empty-card">
        <h3>No contact messages yet</h3>
        <p>Incoming learner concerns and feedback will appear here.</p>
      </article>
    `;
    return;
  }

  target.innerHTML = messages.map((item) => `
    <article class="message-card">
      <div class="message-top">
        <div>
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
      <p class="message-body">${escapeHtml(item.message || "")}</p>
      ${item.replyText ? `
        <div class="message-reply-box">
          <span class="message-reply-title">Current Reply</span>
          <p class="message-reply">${escapeHtml(item.replyText)}</p>
          <span class="message-small">Saved by ${escapeHtml(item.repliedByName || item.repliedByRole || "Admin")} on ${escapeHtml(formatDate(item.repliedAt))}</span>
        </div>
      ` : ""}
      <div class="reply-form">
        <span class="reply-label">Reply to this message</span>
        <textarea rows="4" data-reply-input="${escapeHtml(item.id)}" placeholder="Write a reply for this learner.">${escapeHtml(item.replyText || "")}</textarea>
        <div class="reply-actions">
          <button type="button" class="reply-btn" data-reply-message="${escapeHtml(item.id)}">Save Reply</button>
        </div>
        <p class="form-status" data-reply-status="${escapeHtml(item.id)}"></p>
      </div>
    </article>
  `).join("");

  bindReplyActions();
}

async function refreshContactLists() {
  if (!currentUser) return;

  renderListLoading("myMessagesList", "Loading messages...", "Fetching your contact history.");
  if (roleMeetsMinimum(currentRole, "admin")) {
    renderListLoading("adminInboxList", "Loading inbox...", "Fetching learner contact messages.");
  }

  try {
    const allMessages = (await fetchContactMessagesForCurrentRole())
      .sort((a, b) => timestampToMillis(b.updatedAt || b.createdAt) - timestampToMillis(a.updatedAt || a.createdAt));

    const myMessages = roleMeetsMinimum(currentRole, "admin")
      ? allMessages.filter((item) => item.createdByUid === currentUser.uid)
      : allMessages;

    renderMyMessages(myMessages);

    if (roleMeetsMinimum(currentRole, "admin")) {
      renderAdminInbox(allMessages);
    }
  } catch (error) {
    console.error("Unable to load contact messages:", error);

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
}

function wireContactForm() {
  const form = document.getElementById("contactForm");
  form?.addEventListener("submit", handleContactSubmit);
}

onAuthStateChanged(auth, async (user) => {
  currentUser = user || null;
  currentRole = user ? await resolveUserRole(db, user) : "guest";
  updateNavAction();
  updateRoleBanner();
  updatePageVisibility();

  if (currentUser) {
    await refreshContactLists();
  }
});

loadTheme();
wireContactForm();
