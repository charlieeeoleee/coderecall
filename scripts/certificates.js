import { app } from "./firebase-config.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import {
  initSounds,
  initGlobalClickSound,
  tryStartMusic,
  restartThemeMusic
} from "./sound.js";
import { applyRoleNavigation, resolveUserRole } from "./role-utils.js";
import { clearAllLocalRetentionQueueStorage } from "./retention-store.js";


const auth = getAuth(app);
const db = getFirestore(app);

applyRoleNavigation("guest", "certificates.html");

let currentUser = null;
let currentIsGuest = false;
let certificateSearchTerm = "";
let certificateStatusFilter = "all";
let certificateSubjectFilter = "all";
let certificateSortOrder = "latest";
let latestCertificates = [];

function updateUserUI(name, photo) {
  const username = document.getElementById("username");
  const userPhoto = document.getElementById("userPhoto");
  if (username) username.textContent = name;
  if (userPhoto) userPhoto.src = photo;
}

function getThemeIcon() {
  return document.body.classList.contains("light-mode") ? "\u2600\uFE0F" : "\uD83C\uDF19";
}

function updateThemeIcon() {
  const icon = document.getElementById("themeIcon");
  if (icon) icon.textContent = getThemeIcon();
}

function loadTheme() {
  if (localStorage.getItem("theme") === "light") {
    document.body.classList.add("light-mode");
  }
  updateThemeIcon();
}

window.toggleTheme = function() {
  document.body.classList.toggle("light-mode");
  localStorage.setItem("theme", document.body.classList.contains("light-mode") ? "light" : "dark");
  updateThemeIcon();
  restartThemeMusic();
};

function syncMobileSidebarButton() {
  const layout = document.querySelector(".layout");
  const toggle = document.querySelector(".sidebar-toggle");
  if (!layout || !toggle) return;

  const isOpen = layout.classList.contains("mobile-nav-open");
  toggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
  toggle.setAttribute("aria-label", isOpen ? "Close menu" : "Open menu");
}

window.toggleMobileSidebar = function() {
  const layout = document.querySelector(".layout");
  if (!layout || window.innerWidth > 900) return;
  layout.classList.toggle("mobile-nav-open");
  syncMobileSidebarButton();
};

function closeMobileSidebar() {
  const layout = document.querySelector(".layout");
  if (!layout) return;
  layout.classList.remove("mobile-nav-open");
  syncMobileSidebarButton();
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric"
  });
}

function buildCertificateId(code, name, completedAt) {
  const compactName = (name || "learner").replace(/[^a-z0-9]+/gi, "").toUpperCase().slice(0, 6) || "LEARNR";
  const date = new Date(completedAt || Date.now());
  const dateCode = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
  return `CR-${code}-${dateCode}-${compactName}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getLocalSubjectCompletionState(subject) {
  const pretest =
    localStorage.getItem(`${subject}_pretest`) === "true" ||
    localStorage.getItem(`${subject}_pretest_done`) === "true" ||
    localStorage.getItem(`${subject}_pretest_attempt_done`) === "true";
  const modules =
    localStorage.getItem(`${subject}_modules`) === "true" ||
    localStorage.getItem(`${subject}_easy_modules_done`) === "true" ||
    localStorage.getItem(`${subject}_medium_modules_done`) === "true" ||
    localStorage.getItem(`${subject}_hard_modules_done`) === "true";
  const quiz =
    localStorage.getItem(`${subject}_quiz`) === "true" ||
    localStorage.getItem(`${subject}_quiz_done`) === "true" ||
    localStorage.getItem(`${subject}_hard_quiz`) === "true";
  const posttest =
    localStorage.getItem(`${subject}_posttest`) === "true" ||
    localStorage.getItem(`${subject}_posttest_done`) === "true" ||
    localStorage.getItem(`${subject}_posttest_attempt_done`) === "true";
  return {
    pretest,
    modules,
    quiz,
    posttest,
    completed: pretest && modules && quiz && posttest,
    completedAt: localStorage.getItem(`${subject}_posttest_completedAt`) || ""
  };
}

async function getRemoteSubjectCompletionState(subject) {
  if (!currentUser) return null;
  const userRef = doc(db, "users", currentUser.uid);
  const snap = await getDoc(userRef);
  if (!snap.exists()) return null;

  const data = snap.data() || {};
  const progress = data.progress || {};
  const results = data.results || {};
  const pretest = progress[`${subject}_pretest`] === true || results[`${subject}_pretest`] != null;
  const modules =
    progress[`${subject}_modules`] === true ||
    progress[`${subject}_easy_modules_done`] === true ||
    progress[`${subject}_medium_modules_done`] === true ||
    progress[`${subject}_hard_modules_done`] === true;
  const quiz =
    progress[`${subject}_quiz`] === true ||
    progress[`${subject}_hard_quiz`] === true ||
    results[`${subject}_quiz`] != null;
  const posttest = progress[`${subject}_posttest`] === true || results[`${subject}_posttest`] != null;

  return {
    pretest,
    modules,
    quiz,
    posttest,
    completed: pretest && modules && quiz && posttest,
    completedAt: results[`${subject}_posttest`]?.completedAt || "",
    data
  };
}

function getLatestDate(values = []) {
  const parsed = values
    .filter(Boolean)
    .map((value) => new Date(value))
    .filter((date) => !Number.isNaN(date.getTime()));
  if (!parsed.length) return "";
  return new Date(Math.max(...parsed.map((date) => date.getTime()))).toISOString();
}

function getSubjectProgressChecklist(state) {
  return [
    { label: "Pre-test", complete: Boolean(state.pretest) },
    { label: "Modules", complete: Boolean(state.modules) },
    { label: "Quiz", complete: Boolean(state.quiz) },
    { label: "Post-test", complete: Boolean(state.posttest) }
  ];
}

function getCompletionPercent(steps) {
  if (!steps.length) return 0;
  return Math.round((steps.filter((step) => step.complete).length / steps.length) * 100);
}

function getNextRequirement(steps) {
  return steps.find((step) => !step.complete)?.label || "Ready to claim";
}

function buildCertificates(name, states) {
  const hardwareSteps = getSubjectProgressChecklist(states.hardware);
  const electricalSteps = getSubjectProgressChecklist(states.electrical);
  const dualSteps = [
    { label: "Hardware Certificate", complete: states.hardware.completed },
    { label: "Electrical Certificate", complete: states.electrical.completed }
  ];

  const certificates = [
    {
      key: "hardware",
      subjectKey: "hardware",
      icon: "\uD83D\uDDA5",
      title: "Computer Hardware Certificate",
      description: "Awarded after completing the full Computer Hardware path.",
      code: "HW",
      unlocked: states.hardware.completed,
      steps: hardwareSteps,
      completedAt: states.hardware.completedAt,
      actionUrl: "certificate.html?subject=hardware",
      downloadUrl: "certificate.html?subject=hardware&mode=download"
    },
    {
      key: "electrical",
      subjectKey: "electrical",
      icon: "\u26A1",
      title: "Electrical Wiring Certificate",
      description: "Awarded after completing the full Electrical Wiring and Electronics path.",
      code: "EL",
      unlocked: states.electrical.completed,
      steps: electricalSteps,
      completedAt: states.electrical.completedAt,
      actionUrl: "certificate.html?subject=electrical",
      downloadUrl: "certificate.html?subject=electrical&mode=download"
    },
    {
      key: "dual",
      subjectKey: "dual",
      icon: "\uD83C\uDF93",
      title: "Dual Subject Completion Certificate",
      description: "Awarded after completing both core subjects in Code Recall.",
      code: "DUAL",
      unlocked: states.hardware.completed && states.electrical.completed,
      steps: dualSteps,
      completedAt: getLatestDate([states.hardware.completedAt, states.electrical.completedAt]),
      actionUrl: "certificate.html?kind=dual",
      downloadUrl: "certificate.html?kind=dual&mode=download"
    }
  ];

  return certificates.map((item) => ({
    ...item,
    progressPercent: getCompletionPercent(item.steps || []),
    nextRequirement: getNextRequirement(item.steps || []),
    certificateId: item.unlocked ? buildCertificateId(item.code, name, item.completedAt) : "Locked",
    issuedLabel: item.unlocked ? formatDate(item.completedAt) : "Not issued yet"
  }));
}

function getFilteredCertificates(certificates) {
  const normalizedSearch = certificateSearchTerm.trim().toLowerCase();

  return certificates
    .filter((item) => {
      const matchesStatus =
        certificateStatusFilter === "all" ||
        (certificateStatusFilter === "unlocked" && item.unlocked) ||
        (certificateStatusFilter === "locked" && !item.unlocked);
      const matchesSubject =
        certificateSubjectFilter === "all" ||
        item.subjectKey === certificateSubjectFilter;
      const searchable = [
        item.title,
        item.description,
        item.subjectKey,
        item.certificateId,
        item.issuedLabel,
        item.unlocked ? "unlocked" : "locked",
        item.nextRequirement
      ].join(" ").toLowerCase();

      return matchesStatus && matchesSubject && (!normalizedSearch || searchable.includes(normalizedSearch));
    })
    .sort((left, right) => {
      if (certificateSortOrder === "title") {
        return left.title.localeCompare(right.title);
      }

      if (certificateSortOrder === "progress") {
        return Number(right.progressPercent || 0) - Number(left.progressPercent || 0);
      }

      const leftTime = left.completedAt ? new Date(left.completedAt).getTime() : 0;
      const rightTime = right.completedAt ? new Date(right.completedAt).getTime() : 0;

      if (certificateSortOrder === "oldest") {
        return leftTime - rightTime;
      }

      return rightTime - leftTime;
    });
}

function renderVaultSummary(totalCertificates, visibleCertificates) {
  const summary = document.getElementById("certificateVaultSummary");
  if (!summary) return;

  if (!totalCertificates.length) {
    summary.textContent = "No certificates are available yet.";
    return;
  }

  const unlockedVisible = visibleCertificates.filter((item) => item.unlocked).length;
  summary.textContent = `Showing ${visibleCertificates.length} of ${totalCertificates.length} certificate${totalCertificates.length === 1 ? "" : "s"}${visibleCertificates.length ? `, with ${unlockedVisible} unlocked in view.` : "."}`;
}

function renderIssuedHistory(certificates) {
  const historyList = document.getElementById("certificateHistoryList");
  if (!historyList) return;

  const issued = certificates
    .filter((item) => item.unlocked && item.completedAt)
    .sort((left, right) => new Date(right.completedAt).getTime() - new Date(left.completedAt).getTime());

  if (!issued.length) {
    historyList.innerHTML = `
      <div class="certificate-history-empty">
        <h4>No issued certificates yet</h4>
        <p>Finish a full subject path and your certificate history will appear here.</p>
      </div>
    `;
    return;
  }

  historyList.innerHTML = issued.map((item, index) => `
    <article class="certificate-history-card">
      <div class="certificate-history-index">${String(index + 1).padStart(2, "0")}</div>
      <div class="certificate-history-copy">
        <h4>${escapeHtml(item.title)}</h4>
        <p>${escapeHtml(item.description)}</p>
      </div>
      <div class="certificate-history-meta">
        <span>${escapeHtml(item.issuedLabel)}</span>
        <strong>${escapeHtml(item.certificateId)}</strong>
      </div>
    </article>
  `).join("");
}

function renderOverview(certificates) {
  const earned = certificates.filter((item) => item.unlocked).length;
  const ready = certificates.filter((item) => !item.unlocked).length;
  const latest = getLatestDate(certificates.filter((item) => item.unlocked).map((item) => item.completedAt));
  document.getElementById("certificatesEarnedCount").textContent = String(earned);
  document.getElementById("certificatesReadyCount").textContent = String(ready);
  document.getElementById("latestCertificateDate").textContent = latest ? formatDate(latest) : "-";
}

function renderCertificates(certificates) {
  const grid = document.getElementById("certificateVaultGrid");
  if (!grid) return;

  const filteredCertificates = getFilteredCertificates(certificates);
  renderVaultSummary(certificates, filteredCertificates);

  if (!certificates.length) {
    grid.innerHTML = `
      <div class="certificate-vault-empty">
        <h4>No certificates yet</h4>
        <p>Complete a full subject path to unlock your first certificate.</p>
      </div>
    `;
    return;
  }

  if (!filteredCertificates.length) {
    grid.innerHTML = `
      <div class="certificate-vault-empty">
        <h4>No certificates match your filter</h4>
        <p>Try searching another subject or switch the filter back to all certificates.</p>
      </div>
    `;
    return;
  }

  grid.innerHTML = filteredCertificates.map((item) => `
    <article class="certificate-vault-card ${item.unlocked ? "unlocked" : "locked"}">
      <div class="certificate-vault-top">
        <div>
          <span class="certificate-vault-badge ${item.unlocked ? "unlocked" : "locked"}">${item.unlocked ? "Unlocked" : "Locked"}</span>
          <span class="certificate-vault-progress-label">${item.unlocked ? "Certificate ready" : `${item.progressPercent}% complete`}</span>
        </div>
        <div class="certificate-vault-mark">${item.icon}</div>
      </div>
      <div class="certificate-vault-copy">
        <h4>${escapeHtml(item.title)}</h4>
        <p>${escapeHtml(item.description)}</p>
      </div>
      <div class="certificate-progress">
        <div class="certificate-progress-track">
          <span style="width:${item.progressPercent}%"></span>
        </div>
        <div class="certificate-step-list">
          ${(item.steps || []).map((step) => `
            <span class="certificate-step ${step.complete ? "done" : ""}">${step.complete ? "✓" : "○"} ${escapeHtml(step.label)}</span>
          `).join("")}
        </div>
      </div>
      <div class="certificate-vault-meta">
        <div class="certificate-vault-meta-row">
          <span>Issued</span>
          <strong>${escapeHtml(item.issuedLabel)}</strong>
        </div>
        <div class="certificate-vault-meta-row">
          <span>Certificate ID</span>
          <strong>${escapeHtml(item.certificateId)}</strong>
        </div>
        <div class="certificate-vault-meta-row">
          <span>${item.unlocked ? "Vault Status" : "Next Step"}</span>
          <strong>${escapeHtml(item.unlocked ? "Ready to open" : item.nextRequirement)}</strong>
        </div>
      </div>
      <div class="certificate-vault-actions">
        <button class="certificate-vault-btn primary" ${item.unlocked ? "" : "disabled"} data-url="${item.actionUrl}">View</button>
        <button class="certificate-vault-btn" ${item.unlocked ? "" : "disabled"} data-url="${item.downloadUrl}">Download</button>
      </div>
    </article>
  `).join("");

  grid.querySelectorAll(".certificate-vault-btn[data-url]").forEach((button) => {
    button.addEventListener("click", () => {
      const url = button.getAttribute("data-url");
      if (url) window.location.href = url;
    });
  });
}

function bindCertificateVaultControls() {
  const search = document.getElementById("certificateSearch");
  const subjectFilter = document.getElementById("certificateSubjectFilter");
  const filter = document.getElementById("certificateStatusFilter");
  const sortOrder = document.getElementById("certificateSortOrder");

  search?.addEventListener("input", () => {
    certificateSearchTerm = search.value || "";
    renderCertificates(latestCertificates);
  });

  subjectFilter?.addEventListener("change", () => {
    certificateSubjectFilter = subjectFilter.value || "all";
    renderCertificates(latestCertificates);
  });

  filter?.addEventListener("change", () => {
    certificateStatusFilter = filter.value || "all";
    renderCertificates(latestCertificates);
  });

  sortOrder?.addEventListener("change", () => {
    certificateSortOrder = sortOrder.value || "latest";
    renderCertificates(latestCertificates);
  });
}

async function loadCertificatesPage() {
  const remoteHardware = await getRemoteSubjectCompletionState("hardware");
  const remoteElectrical = await getRemoteSubjectCompletionState("electrical");
  const localHardware = getLocalSubjectCompletionState("hardware");
  const localElectrical = getLocalSubjectCompletionState("electrical");
  const hardware = {
    pretest: remoteHardware?.pretest || localHardware.pretest,
    modules: remoteHardware?.modules || localHardware.modules,
    quiz: remoteHardware?.quiz || localHardware.quiz,
    posttest: remoteHardware?.posttest || localHardware.posttest,
    completed: remoteHardware?.completed || localHardware.completed,
    completedAt: remoteHardware?.completedAt || localHardware.completedAt
  };
  const electrical = {
    pretest: remoteElectrical?.pretest || localElectrical.pretest,
    modules: remoteElectrical?.modules || localElectrical.modules,
    quiz: remoteElectrical?.quiz || localElectrical.quiz,
    posttest: remoteElectrical?.posttest || localElectrical.posttest,
    completed: remoteElectrical?.completed || localElectrical.completed,
    completedAt: remoteElectrical?.completedAt || localElectrical.completedAt
  };

  const learnerName = currentUser?.displayName
    || remoteHardware?.data?.name
    || remoteElectrical?.data?.name
    || currentUser?.email
    || (currentIsGuest ? "Guest Learner" : "Learner");

  const certificates = buildCertificates(learnerName, { hardware, electrical });
  latestCertificates = certificates;
  renderOverview(certificates);
  renderCertificates(certificates);
  renderIssuedHistory(certificates);
}

function hasGuestProgress() {
  return [
    "hardware_pretest",
    "hardware_modules",
    "hardware_quiz",
    "hardware_posttest",
    "electrical_pretest",
    "electrical_modules",
    "electrical_quiz",
    "electrical_posttest"
  ].some((key) => localStorage.getItem(key) === "true");
}

function openGuestLogoutPopup(withProgress = true) {
  const popup = document.getElementById("guestLogoutPopup");
  const title = document.getElementById("guestLogoutTitle");
  const message = document.getElementById("guestLogoutMessage");
  const primaryBtn = document.getElementById("guestPrimaryBtn");
  const secondaryBtn = document.getElementById("guestSecondaryBtn");
  const cancelBtn = document.getElementById("guestCancelBtn");

  if (withProgress) {
    title.textContent = "Save Your Progress";
    message.textContent = "You are currently using a guest account. Register an account now to save your progress and XP before logging out.";
    primaryBtn.style.display = "block";
    primaryBtn.textContent = "Register to Save Progress";
    primaryBtn.onclick = registerGuestAccount;
    secondaryBtn.style.display = "block";
    secondaryBtn.textContent = "Log Out Anyway";
    secondaryBtn.onclick = confirmGuestLogout;
    cancelBtn.style.display = "block";
  } else {
    title.textContent = "Log Out Guest Session";
    message.textContent = "You are currently using guest mode. Are you sure you want to log out?";
    primaryBtn.style.display = "block";
    primaryBtn.textContent = "Log Out";
    primaryBtn.onclick = confirmGuestLogout;
    secondaryBtn.style.display = "none";
    cancelBtn.style.display = "block";
  }

  popup.classList.add("active");
}

window.closeGuestLogoutPopup = function() {
  document.getElementById("guestLogoutPopup").classList.remove("active");
};

window.registerGuestAccount = function() {
  localStorage.setItem("guest_pending_save", "true");
  closeGuestLogoutPopup();
  window.location.href = "auth.html";
};

function clearGuestSession() {
  [
    "guest",
    "guest_xp",
    "guest_xpWeekly",
    "guest_streak",
    "guest_last_active_date",
    "guest_pending_save",
    "wrong_answer_review_items",
    "study_history_items",
    "recent_module_completion",
    "resume_activity",
    "hardware_pretest",
    "hardware_modules",
    "hardware_quiz",
    "hardware_posttest",
    "electrical_pretest",
    "electrical_modules",
    "electrical_quiz",
    "electrical_posttest"
  ].forEach((key) => localStorage.removeItem(key));
  clearAllLocalRetentionQueueStorage();
}

window.confirmGuestLogout = function() {
  clearGuestSession();
  closeGuestLogoutPopup();
  window.location.href = "auth.html";
};

window.logout = async function() {
  closeMobileSidebar();
  if (currentIsGuest) {
    openGuestLogoutPopup(hasGuestProgress());
    return;
  }
  if (auth.currentUser) {
    await signOut(auth);
  }
  window.location.href = "auth.html";
};

onAuthStateChanged(auth, async (user) => {
  currentUser = user || null;
  currentIsGuest = !user && localStorage.getItem("guest") === "true";

  if (!user && !currentIsGuest) {
    window.location.href = "auth.html";
    return;
  }

  if (user) {
    applyRoleNavigation(await resolveUserRole(db, user), "certificates.html");
    updateUserUI(user.displayName || user.email || "User", user.photoURL || "https://i.pravatar.cc/40?img=12");
  } else {
    applyRoleNavigation("guest", "certificates.html");
    updateUserUI("Guest", "https://i.pravatar.cc/40?img=8");
  }

  await loadCertificatesPage();
});

loadTheme();
bindCertificateVaultControls();
initSounds();
initGlobalClickSound();
tryStartMusic();

document.body.addEventListener("click", () => {
  tryStartMusic();
}, { once: true });

document.addEventListener("click", (event) => {
  const layout = document.querySelector(".layout");
  const sidebar = document.querySelector(".sidebar");
  const toggle = document.querySelector(".sidebar-toggle");
  if (!layout?.classList.contains("mobile-nav-open")) return;
  if (sidebar?.contains(event.target) || toggle?.contains(event.target)) return;
  closeMobileSidebar();
});

window.addEventListener("resize", () => {
  if (window.innerWidth > 900) {
    closeMobileSidebar();
  }
});
