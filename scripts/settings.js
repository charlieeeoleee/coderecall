import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signOut,
  sendEmailVerification,
  sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import {
  initSounds,
  initGlobalClickSound,
  tryStartMusic,
  restartThemeMusic,
  handleSoundToggle,
  handleMusicToggle
} from "./sound.js";
import { applyRoleNavigation, resolveUserRole } from "./role-utils.js";
import { syncPublicLeaderboardEntry } from "./leaderboard-public.js";

/* =========================
   FIREBASE CONFIG
========================= */
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
let currentIsGuest = false;
let pendingProfilePhotoDataUrl = "";
let currentLoginType = "Unknown";
let currentVerificationState = "Unknown";

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

/* =========================
   AUTH STATE
========================= */
onAuthStateChanged(auth, async (user) => {
  const isGuest = localStorage.getItem("guest") === "true";

  if (user) {
    currentUser = user;
    currentIsGuest = false;
    applyRoleNavigation(await resolveUserRole(db, user), "settings.html");
    await loadUserSettings();
    loadPreferences();
    loadProgress();
  } else if (isGuest) {
    currentUser = null;
    currentIsGuest = true;
    applyRoleNavigation("guest", "settings.html");
    loadGuestSettings();
    loadPreferences();
    loadProgress();
  } else {
    window.location.href = "auth.html";
  }
});

/* =========================
   LOAD REAL USER
========================= */
async function loadUserSettings() {
  const userRef = doc(db, "users", currentUser.uid);
  const docSnap = await getDoc(userRef);

  let name = "User";
  let email = currentUser.email || "No email";
  let photo = currentUser.photoURL || "https://i.pravatar.cc/80?img=12";

  if (!docSnap.exists()) {
    name = currentUser.displayName || currentUser.email || "User";

    await setDoc(userRef, {
      xp: 0,
      xpWeekly: 0,
      xpChange: 0,
      name,
      photo,
      email
    });
  } else {
    const data = docSnap.data();

    name =
      data.name ||
      currentUser.displayName ||
      currentUser.email ||
      "User";

    email =
      data.email ||
      currentUser.email ||
      "No email";

    photo =
      data.photo ||
      currentUser.photoURL ||
      "https://i.pravatar.cc/80?img=12";
  }

  const providerIds = currentUser.providerData?.map(p => p.providerId) || [];
  let loginType = "Unknown";
  let verificationText = "Unknown";
  let verificationClass = "locked";

  if (providerIds.includes("google.com")) {
    loginType = "Google";
    verificationText = "Verified";
    verificationClass = "unlocked";
  } else if (providerIds.includes("password")) {
    loginType = "Email / Password";
    verificationText = currentUser.emailVerified ? "Verified" : "Not Verified";
    verificationClass = currentUser.emailVerified ? "unlocked" : "locked";
  }

  document.getElementById("usernameTop").textContent = name;
  document.getElementById("userPhotoTop").src = photo;

  document.getElementById("profileName").textContent = name;
  document.getElementById("profileEmail").textContent = email;
  document.getElementById("profilePhoto").src = photo;
  document.getElementById("loginType").textContent = loginType;
  currentLoginType = loginType;
  currentVerificationState = verificationText;

  const editName = document.getElementById("editProfileName");
  const editPhotoUrl = document.getElementById("editProfilePhotoUrl");
  if (editName) editName.value = name;
  if (editPhotoUrl) editPhotoUrl.value = dataOrEmpty(docSnap, "photo");

  const verificationStatus = document.getElementById("verificationStatus");
  verificationStatus.textContent = verificationText;
  verificationStatus.className = `status-pill ${verificationClass}`;
  updateAccountActionVisibility();
}

/* =========================
   LOAD GUEST
========================= */
function loadGuestSettings() {
  const guestPhoto = "https://i.pravatar.cc/80?img=8";

  document.getElementById("usernameTop").textContent = "Guest";
  document.getElementById("userPhotoTop").src = guestPhoto;

  document.getElementById("profileName").textContent = "Guest";
  document.getElementById("profileEmail").textContent = "No email";
  document.getElementById("profilePhoto").src = guestPhoto;
  document.getElementById("loginType").textContent = "Guest Mode";
  currentLoginType = "Guest Mode";
  currentVerificationState = "Guest Session";

  const editName = document.getElementById("editProfileName");
  const editPhotoUrl = document.getElementById("editProfilePhotoUrl");
  const editPhotoFile = document.getElementById("editProfilePhotoFile");
  const profileStatus = document.getElementById("profileEditStatus");
  const profileForm = document.getElementById("profileEditForm");
  const resetPhotoBtn = document.getElementById("resetProfilePhotoBtn");

  if (editName) editName.value = "Guest";
  if (editPhotoUrl) editPhotoUrl.value = "";
  if (editName) editName.disabled = true;
  if (editPhotoUrl) editPhotoUrl.disabled = true;
  if (editPhotoFile) editPhotoFile.disabled = true;
  if (profileForm) {
    const submitButton = profileForm.querySelector('button[type="submit"]');
    if (submitButton) submitButton.disabled = true;
  }
  if (resetPhotoBtn) resetPhotoBtn.disabled = true;
  if (profileStatus) {
    profileStatus.textContent = "Profile editing is available for signed-in accounts.";
  }

  const verificationStatus = document.getElementById("verificationStatus");
  verificationStatus.textContent = "Guest Session";
  verificationStatus.className = "status-pill locked";
  updateAccountActionVisibility();
}

function dataOrEmpty(docSnap, key) {
  if (!docSnap?.exists()) return "";
  const value = docSnap.data()?.[key];
  return typeof value === "string" ? value : "";
}

/* =========================
   PREFERENCES
========================= */
function loadPreferences() {
  const soundEnabled = localStorage.getItem("soundEnabled");
  const autoAdvance = localStorage.getItem("autoAdvance");
  const musicEnabled = localStorage.getItem("musicEnabled");

  const soundToggle = document.getElementById("soundToggle");
  const autoAdvanceToggle = document.getElementById("autoAdvanceToggle");
  const musicToggle = document.getElementById("musicToggle");

  if (soundToggle) {
    soundToggle.checked = soundEnabled !== "false";
    soundToggle.addEventListener("change", (e) => {
      handleSoundToggle(e.target.checked);
    });
  }

  if (autoAdvanceToggle) {
    autoAdvanceToggle.checked = autoAdvance === "true";
    autoAdvanceToggle.addEventListener("change", (e) => {
      localStorage.setItem("autoAdvance", e.target.checked ? "true" : "false");
    });
  }

  if (musicToggle) {
    musicToggle.checked = musicEnabled !== "false";
    musicToggle.addEventListener("change", (e) => {
      handleMusicToggle(e.target.checked);
    });
  }
}


/* =========================
   PROGRESS
========================= */
function loadProgress() {
  if (currentUser) {
    loadProgressFromFirestore();
    return;
  }

  const xp = parseInt(localStorage.getItem("guest_xp")) || 0;
  const progress = getLocalProgressState();
  renderProgress(xp, progress);
}

function getLocalProgressState() {
  const progress = {};
  ["hardware", "electrical"].forEach((subject) => {
    progress[`${subject}_pretest`] = localStorage.getItem(`${subject}_pretest`) === "true";
    progress[`${subject}_modules`] = localStorage.getItem(`${subject}_modules`) === "true";
    progress[`${subject}_quiz`] = localStorage.getItem(`${subject}_quiz`) === "true";
    progress[`${subject}_posttest`] = localStorage.getItem(`${subject}_posttest`) === "true";
  });
  return progress;
}

function getSavedProgress(progressObj, key) {
  return progressObj?.[key] === true || localStorage.getItem(key) === "true";
}

function isSubjectCompleted(progressObj, resultsObj, subjectName) {
  const posttestKey = `${subjectName}_posttest`;
  const resultKey = `${subjectName}_posttest`;
  const resultDoneKey = `${resultKey}_done`;

  return (
    getSavedProgress(progressObj, posttestKey) ||
    resultsObj?.[resultKey] != null ||
    localStorage.getItem(resultDoneKey) === "true"
  );
}

async function loadProgressFromFirestore() {
  const userRef = doc(db, "users", currentUser.uid);
  const docSnap = await getDoc(userRef);

  let xp = 0;
  let progress = getLocalProgressState();
  let results = {};
  if (docSnap.exists()) {
    const data = docSnap.data();
    xp = data.xp || 0;
    progress = {
      ...progress,
      ...(data.progress || {})
    };
    results = data.results || {};
  }

  renderProgress(xp, progress, results);
}

function renderProgress(xp, progress = getLocalProgressState(), results = {}) {
  const xpPerLevel = 100;
  const level = Math.floor(xp / xpPerLevel) + 1;
  const currentXP = xp % xpPerLevel;
  const xpPercent = Math.floor((currentXP / xpPerLevel) * 100);

  let completedSubjects = 0;
  const subjects = ["hardware", "electrical"];
  const totalSubjects = subjects.length;

  subjects.forEach(subject => {
    const done = isSubjectCompleted(progress, results, subject);
    if (done) completedSubjects++;
  });

  const subjectPercent = Math.floor((completedSubjects / totalSubjects) * 100);

  // ✅ TEXT VALUES (animated)
  animateNumber(document.getElementById("totalXP"), xp);
  animateNumber(document.getElementById("levelValue"), level);
  animateNumber(document.getElementById("completedSubjects"), completedSubjects);

  // ✅ BARS
  const xpBar = document.getElementById("xpProgressBar");
  const levelBar = document.getElementById("levelProgressBar");
  const subjectBar = document.getElementById("subjectProgressBar");

  if (xpBar) xpBar.style.width = xpPercent + "%";
  if (levelBar) levelBar.style.width = xpPercent + "%"; // same as XP (progress to next level)
  if (subjectBar) subjectBar.style.width = subjectPercent + "%";

  // ✅ TEXT UNDER BARS
  const xpText = document.getElementById("xpProgressText");
  const levelText = document.getElementById("levelProgressText");
  const subjectText = document.getElementById("subjectProgressText");

  if (xpText) xpText.textContent = `${xpPercent}% to next level`;
  if (levelText) levelText.textContent = `Level ${level}`;
  if (subjectText) subjectText.textContent = `${subjectPercent}% completed`;
}

window.renderProgress = renderProgress; // expose for external calls

function animateNumber(element, targetValue) {
  if (!element) return;

  const duration = 900;
  const startTime = performance.now();

  function update(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const value = Math.round(targetValue * eased);

    element.textContent = value;

    if (progress < 1) {
      requestAnimationFrame(update);
    }
  }

  requestAnimationFrame(update);
}

function wireProfileEditor() {
  const form = document.getElementById("profileEditForm");
  const fileInput = document.getElementById("editProfilePhotoFile");
  const statusEl = document.getElementById("profileEditStatus");
  const resetPhotoBtn = document.getElementById("resetProfilePhotoBtn");
  const resendVerificationBtn = document.getElementById("resendVerificationBtn");
  const passwordResetBtn = document.getElementById("passwordResetBtn");

  if (fileInput) {
    fileInput.addEventListener("change", () => {
      const file = fileInput.files?.[0];
      pendingProfilePhotoDataUrl = "";

      if (!file) return;

      const reader = new FileReader();
      reader.onload = () => {
        pendingProfilePhotoDataUrl = typeof reader.result === "string" ? reader.result : "";
        if (statusEl && pendingProfilePhotoDataUrl) {
          statusEl.textContent = "Image ready. Save profile to apply it.";
        }
      };
      reader.readAsDataURL(file);
    });
  }

  if (resetPhotoBtn) {
    resetPhotoBtn.addEventListener("click", () => {
      if (!currentUser) {
        if (statusEl) statusEl.textContent = "Please sign in to edit your profile.";
        return;
      }

      pendingProfilePhotoDataUrl = "";
      if (fileInput) fileInput.value = "";

      const photoUrlInput = document.getElementById("editProfilePhotoUrl");
      if (photoUrlInput) photoUrlInput.value = "";
      if (statusEl) statusEl.textContent = "Profile photo will reset after you save.";
    });
  }

  if (resendVerificationBtn) {
    resendVerificationBtn.addEventListener("click", async () => {
      if (!currentUser) return;

      try {
        await currentUser.reload();

        if (currentUser.emailVerified) {
          currentVerificationState = "Verified";
          const verificationStatus = document.getElementById("verificationStatus");
          verificationStatus.textContent = "Verified";
          verificationStatus.className = "status-pill unlocked";
          updateAccountActionVisibility();
          showInfoPopup("Already Verified", "This account is already verified.");
          return;
        }

        await sendEmailVerification(currentUser);
        showInfoPopup("Verification Sent", "A new verification email has been sent to your inbox.");
      } catch (error) {
        console.error("Verification resend error:", error);
        showInfoPopup("Unable to Send", "We could not resend the verification email right now.");
      }
    });
  }

  if (passwordResetBtn) {
    passwordResetBtn.addEventListener("click", async () => {
      const email = currentUser?.email || document.getElementById("profileEmail").textContent;

      if (!email || email === "No email") {
        showInfoPopup("No Email Found", "This account does not have an email address available for password reset.");
        return;
      }

      try {
        await sendPasswordResetEmail(auth, email);
        showInfoPopup("Password Reset Sent", "Check your email for the password reset link.");
      } catch (error) {
        console.error("Password reset error:", error);
        showInfoPopup("Unable to Send", "We could not send a password reset email right now.");
      }
    });
  }

  if (!form) return;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!currentUser) {
      if (statusEl) statusEl.textContent = "Please sign in to edit your profile.";
      return;
    }

    const nameInput = document.getElementById("editProfileName");
    const photoUrlInput = document.getElementById("editProfilePhotoUrl");

    const nextName = nameInput?.value.trim() || "User";
    const nextPhoto = pendingProfilePhotoDataUrl || photoUrlInput?.value.trim() || document.getElementById("profilePhoto").src;

    try {
      const userRef = doc(db, "users", currentUser.uid);
      await updateDoc(userRef, {
        name: nextName,
        photo: nextPhoto
      });

      const snap = await getDoc(userRef);
      const data = snap.data() || {};
      await syncPublicLeaderboardEntry(db, currentUser.uid, {
        name: nextName,
        photo: nextPhoto,
        xp: Number(data.xp || 0),
        xpWeekly: Number(data.xpWeekly || 0),
        xpChange: Number(data.xpChange || 0)
      });

      document.getElementById("usernameTop").textContent = nextName;
      document.getElementById("userPhotoTop").src = nextPhoto;
      document.getElementById("profileName").textContent = nextName;
      document.getElementById("profilePhoto").src = nextPhoto;

      pendingProfilePhotoDataUrl = "";
      if (fileInput) fileInput.value = "";
      if (statusEl) statusEl.textContent = "Profile updated successfully.";
    } catch (error) {
      console.error("Profile update error:", error);
      if (statusEl) statusEl.textContent = "Unable to save profile changes right now.";
    }
  });
}

function updateAccountActionVisibility() {
  const resendVerificationBtn = document.getElementById("resendVerificationBtn");
  const passwordResetBtn = document.getElementById("passwordResetBtn");

  if (resendVerificationBtn) {
    const shouldShowResend =
      !currentIsGuest &&
      currentLoginType === "Email / Password" &&
      currentVerificationState !== "Verified";
    resendVerificationBtn.hidden = !shouldShowResend;
  }

  if (passwordResetBtn) {
    const shouldShowPasswordReset =
      !currentIsGuest &&
      currentLoginType === "Email / Password";
    passwordResetBtn.hidden = !shouldShowPasswordReset;
  }
}

/* =========================
   RESET PROGRESS
========================= */
window.resetProgress = function() {
  openSystemPopup(
    "Reset Progress",
    "Are you sure you want to reset all progress? This action cannot be undone.",
    async () => {
      const keysToRemove = [
        "hardware_pretest",
        "hardware_modules",
        "hardware_quiz",
        "hardware_posttest",
        "electrical_pretest",
        "electrical_modules",
        "electrical_quiz",
        "electrical_posttest",
        "guest_xp",
        "guest_xpWeekly"
      ];

      keysToRemove.forEach(key => localStorage.removeItem(key));

      if (currentUser) {
        const userRef = doc(db, "users", currentUser.uid);
        const docSnap = await getDoc(userRef);

        if (docSnap.exists()) {
          const data = docSnap.data();
          await setDoc(userRef, {
            ...data,
            xp: 0,
            xpWeekly: 0,
            xpChange: 0,
            progress: {},
            results: {}
          });

          await syncPublicLeaderboardEntry(db, currentUser.uid, {
            name: data.name || currentUser.displayName || currentUser.email || "User",
            photo: data.photo || currentUser.photoURL || "https://i.pravatar.cc/40?img=12",
            xp: 0,
            xpWeekly: 0,
            xpChange: 0
          });
        }
      }

      closeSystemPopup();
      showInfoPopup("Progress Reset", "Progress reset successfully.");
      window.location.reload();
    }
  );
};

/* =========================
   CLEAR LOCAL DATA
========================= */
window.clearLocalData = function() {
  openSystemPopup(
    "Clear Local Data",
    "Clear local preferences and cached data on this device?",
    () => {
      const keepKeys = ["guest"];
      const allKeys = Object.keys(localStorage);

      allKeys.forEach(key => {
        if (!keepKeys.includes(key)) {
          localStorage.removeItem(key);
        }
      });

      closeSystemPopup();
      showInfoPopup("Local Data Cleared", "Local data cleared successfully.");
      window.location.reload();
    }
  );
};

/* =========================
   GUEST LOGOUT HELPERS
========================= */
function hasGuestProgress() {
  const guestXP = parseInt(localStorage.getItem("guest_xp")) || 0;

  const progressKeys = [
    "hardware_pretest",
    "hardware_modules",
    "hardware_quiz",
    "hardware_posttest",
    "electrical_pretest",
    "electrical_modules",
    "electrical_quiz",
    "electrical_posttest"
  ];

  const hasProgressKey = progressKeys.some((key) => localStorage.getItem(key) === "true");
  return guestXP > 0 || hasProgressKey;
}

function clearGuestSession() {
  const keysToRemove = [
    "guest",
    "guest_xp",
    "guest_xpWeekly",
    "guest_streak",
    "guest_last_active_date",
    "guest_pending_save",
    "hardware_pretest",
    "hardware_modules",
    "hardware_quiz",
    "hardware_posttest",
    "electrical_pretest",
    "electrical_modules",
    "electrical_quiz",
    "electrical_posttest"
  ];

  keysToRemove.forEach((key) => localStorage.removeItem(key));
}

function openGuestLogoutPopup() {
  document.getElementById("guestLogoutPopup").classList.add("active");
}

window.closeGuestLogoutPopup = function() {
  document.getElementById("guestLogoutPopup").classList.remove("active");
};

window.registerGuestAccount = function() {
  localStorage.setItem("guest_pending_save", "true");
  closeGuestLogoutPopup();
  window.location.href = "auth.html";
};

window.confirmGuestLogout = function() {
  clearGuestSession();
  closeGuestLogoutPopup();
  window.location.href = "auth.html";
};

/* =========================
   LOGOUT
========================= */
window.logout = async function() {
  closeMobileSidebar();
  if (currentIsGuest) {
    if (hasGuestProgress()) {
      openGuestLogoutPopup();
      return;
    } else {
      openSystemPopup(
        "Log Out Guest Session",
        "Are you sure you want to log out of guest mode?",
        () => {
          clearGuestSession();
          closeSystemPopup();
          window.location.href = "auth.html";
        }
      );
      return;
    }
  }

  if (auth.currentUser) {
    await signOut(auth);
  }

  window.location.href = "auth.html";
};

/* =========================
   SYSTEM POPUP
========================= */
function openSystemPopup(title, message, confirmAction) {
  document.getElementById("systemPopupTitle").textContent = title;
  document.getElementById("systemPopupMessage").textContent = message;

  const confirmBtn = document.getElementById("systemPopupConfirmBtn");
  confirmBtn.onclick = confirmAction;

  document.getElementById("systemPopup").classList.add("active");
}

window.closeSystemPopup = function() {
  document.getElementById("systemPopup").classList.remove("active");
};

/* =========================
   INFO POPUP
========================= */
function showInfoPopup(title, message) {
  document.getElementById("infoPopupTitle").textContent = title;
  document.getElementById("infoPopupMessage").textContent = message;
  document.getElementById("infoPopup").classList.add("active");
}

window.closeInfoPopup = function() {
  document.getElementById("infoPopup").classList.remove("active");
};

/* =========================
   THEME
========================= */
function loadTheme() {
  const saved = localStorage.getItem("theme");
  if (saved === "light") {
    document.body.classList.add("light-mode");
  }
  updateIcon();
}

window.toggleTheme = function() {
  document.body.classList.toggle("light-mode");
  const mode = document.body.classList.contains("light-mode") ? "light" : "dark";
  localStorage.setItem("theme", mode);
  updateIcon();
  restartThemeMusic();
};

function updateIcon() {
  const icon = document.getElementById("themeIcon");
  if (!icon) return;
  icon.textContent = document.body.classList.contains("light-mode") ? "☀️" : "🌙";
}

/* =========================
   INIT
========================= */
loadTheme();
wireProfileEditor();
initSounds();
initGlobalClickSound();
tryStartMusic();

document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll(".menu a").forEach((link) => {
    link.addEventListener("click", closeMobileSidebar);
  });
  syncMobileSidebarButton();
});

document.addEventListener("click", (event) => {
  const layout = document.querySelector(".layout");
  const sidebar = document.querySelector(".sidebar");
  const toggle = document.querySelector(".sidebar-toggle");
  if (!layout || !sidebar || !toggle) return;
  if (!layout.classList.contains("mobile-nav-open")) return;
  if (window.innerWidth > 900) return;
  if (sidebar.contains(event.target) || toggle.contains(event.target)) return;
  closeMobileSidebar();
});

window.addEventListener("resize", () => {
  if (window.innerWidth > 900) closeMobileSidebar();
});

