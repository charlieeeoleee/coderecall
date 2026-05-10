import { app } from "./firebase-config.js";
import {
  getAuth,
  onAuthStateChanged,
  signOut,
  sendEmailVerification,
  sendPasswordResetEmail,
  verifyBeforeUpdateEmail
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
  handleMusicToggle,
  getSfxVolume,
  getMusicVolume,
  setSfxVolume,
  setMusicVolume,
  playSound
} from "./sound.js";
import { applyRoleNavigation, resolveUserRole, syncUserRole } from "./role-utils.js";
import { syncPublicLeaderboardEntry } from "./leaderboard-public.js";
import {
  getRetentionScheduleConfig,
  saveRetentionScheduleConfig,
  clearAllLocalRetentionQueueStorage,
  removeRetentionQueueItemsBySubject,
  clearRetentionQueue
} from "./retention-store.js";
import { clearWrongAnswerReview } from "./review-store.js";
import { hasTotpFactor } from "./firebase-native-mfa.js";

/* =========================
   FIREBASE CONFIG
========================= */

const auth = getAuth(app);
const db = getFirestore(app);

applyRoleNavigation("guest", "settings.html");

let currentUser = null;
let currentIsGuest = false;
let currentRole = "guest";
let pendingProfilePhotoDataUrl = "";
let currentLoginType = "Unknown";
let currentVerificationState = "Unknown";
const MODULE_XP_REWARD = 5;
const QUIZ_LEVEL_XP_PER_CORRECT = 2;
const DEFAULT_RETENTION_SCHEDULE = {
  immediateOnSeed: true,
  intervals: [1, 3, 7, 14]
};
const ACCESSIBILITY_DEFAULTS = {
  highContrast: false,
  screenReaderAssist: false,
  reducedMotion: false,
  textSize: "normal",
  narrationSpeed: 1
};
const TEXT_SIZE_OPTIONS = new Set(["normal", "large", "extra-large"]);

function readBooleanPreference(key, fallback = false) {
  const value = localStorage.getItem(key);
  if (value == null) return fallback;
  return value === "true";
}

function readNumberPreference(key, fallback, { min = 0, max = 1 } = {}) {
  const value = Number(localStorage.getItem(key));
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function getAccessibilityPreferences() {
  const textSize = localStorage.getItem("textSizePreference") || ACCESSIBILITY_DEFAULTS.textSize;

  return {
    highContrast: readBooleanPreference("highContrastMode", ACCESSIBILITY_DEFAULTS.highContrast),
    screenReaderAssist: readBooleanPreference("screenReaderAssist", ACCESSIBILITY_DEFAULTS.screenReaderAssist),
    reducedMotion: readBooleanPreference("reducedMotion", ACCESSIBILITY_DEFAULTS.reducedMotion),
    textSize: TEXT_SIZE_OPTIONS.has(textSize) ? textSize : ACCESSIBILITY_DEFAULTS.textSize,
    narrationSpeed: readNumberPreference(
      "narrationSpeed",
      ACCESSIBILITY_DEFAULTS.narrationSpeed,
      { min: 0.5, max: 2.5 }
    )
  };
}

function applyAccessibilityPreferences() {
  const prefs = getAccessibilityPreferences();
  const target = document.body;
  if (!target) return prefs;

  target.classList.toggle("access-high-contrast", prefs.highContrast);
  target.classList.toggle("access-screen-reader-assist", prefs.screenReaderAssist);
  target.classList.toggle("access-reduced-motion", prefs.reducedMotion);
  target.classList.toggle("access-text-large", prefs.textSize === "large");
  target.classList.toggle("access-text-extra-large", prefs.textSize === "extra-large");
  window.codeRecallNarrationSpeed = prefs.narrationSpeed;
  if (typeof window.applyAccessibilityPreferences === "function") {
    window.applyAccessibilityPreferences();
  }
  return prefs;
}

function formatNarrationSpeed(speed) {
  return `${speed.toFixed(2)}x`;
}

window.getCodeRecallNarrationSpeed = function() {
  return getAccessibilityPreferences().narrationSpeed;
};

function getAssessmentXP(type, result = null) {
  if (type === "pretest" || type === "posttest") {
    return Math.max(0, Number(result?.score || 0) || 0);
  }
  return 0;
}

function computeSystemXP(progress = {}, results = {}) {
  const moduleXP = Object.entries(progress).reduce((sum, [key, value]) => {
    if (!/^(hardware|electrical)_(easy|medium|hard)_module_\d+_done_xp_awarded$/.test(key)) {
      return sum;
    }
    return value ? sum + MODULE_XP_REWARD : sum;
  }, 0);

  const quickCheckXP = Object.entries(progress).reduce((sum, [key, value]) => {
    if (!/^(hardware|electrical)_(easy|medium|hard)_module_\d+_done_quick_check_best_score$/.test(key)) {
      return sum;
    }
    return sum + Math.max(0, Number(value || 0));
  }, 0);

  const assessmentAndQuizXP = Object.entries(results).reduce((sum, [key, value]) => {
    if (/^(hardware|electrical)_(pretest|posttest)$/.test(key)) {
      return sum + getAssessmentXP(value?.type, value);
    }

    if (/^(hardware|electrical)_(easy|medium|hard)_quiz_level_\d+_result$/.test(key)) {
      return sum + (Math.max(0, Number(value?.score || 0)) * QUIZ_LEVEL_XP_PER_CORRECT);
    }

    return sum;
  }, 0);

  return moduleXP + quickCheckXP + assessmentAndQuizXP;
}

function getHardwareModuleLocalKeys() {
  return Object.keys(localStorage).filter((key) =>
    /^hardware_(easy|medium|hard)_module_\d+/.test(key) ||
    /^resume_module_state_hardware_/.test(key)
  );
}

function getSubjectLabel(subject) {
  return subject === "hardware" ? "Computer Hardware" : "Electrical Wiring and Electronics";
}

function getSubjectLocalKeys(subject, { modulesOnly = false } = {}) {
  return Object.keys(localStorage).filter((key) => {
    if (modulesOnly) {
      return new RegExp(`^${subject}_(easy|medium|hard)_module_\\d+`).test(key) ||
        new RegExp(`^resume_module_state_${subject}_`).test(key);
    }

    return (
      new RegExp(`^${subject}_(pretest|posttest|quiz)$`).test(key) ||
      new RegExp(`^${subject}_(pretest|posttest)(_score|_percent|_done|_completedAt|_xp_awarded|_attempt_done)?$`).test(key) ||
      new RegExp(`^${subject}_(easy|medium|hard)_module_\\d+`).test(key) ||
      new RegExp(`^${subject}_(easy|medium|hard)_quiz_level_\\d+(_score|_percent|_done|_completedAt|_attempt_done|_xp_awarded|_result)?$`).test(key) ||
      new RegExp(`^resume_module_state_${subject}_`).test(key) ||
      new RegExp(`^resume_quiz_state_${subject}_`).test(key)
    );
  });
}

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
    currentRole = await resolveUserRole(db, user);
    applyRoleNavigation(currentRole, "settings.html");
    await loadUserSettings();
    loadPreferences();
    loadProgress();
  } else if (isGuest) {
    currentUser = null;
    currentIsGuest = true;
    currentRole = "guest";
    applyRoleNavigation("guest", "settings.html");
    loadGuestSettings();
    loadPreferences();
    loadProgress();
  } else {
    window.location.href = "auth.html";
  }
});

function getRoleLabel(role) {
  if (role === "super_admin") return "Super Admin";
  if (role === "admin") return "Admin";
  if (role === "user") return "User";
  return "Guest";
}

function setProtectionText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
}

function updateAccountProtectionCard() {
  const roleLabel = getRoleLabel(currentRole);
  const requiresMfa = currentRole === "admin" || currentRole === "super_admin";
  const hasMfa = currentUser ? hasTotpFactor(currentUser) : false;
  const verified = currentVerificationState === "Verified";

  setProtectionText("protectionRole", roleLabel);
  setProtectionText("protectionLoginType", currentLoginType);
  setProtectionText("protectionVerification", currentVerificationState);
  setProtectionText(
    "protectionMfa",
    requiresMfa ? (hasMfa ? "Enabled" : "Required") : "Not required"
  );
  setProtectionText(
    "protectionSession",
    currentIsGuest ? "Guest/local session" : "Protected by Firebase Auth"
  );
  setProtectionText(
    "protectionData",
    requiresMfa ? "Privileged access protected" : "Learner access only"
  );

  const summary = document.getElementById("protectionSummary");
  if (summary) {
    if (currentIsGuest) {
      summary.textContent = "Guest progress is local to this device. Sign in to protect and sync your account.";
    } else if (requiresMfa && hasMfa) {
      summary.textContent = "Privileged access is protected by Firebase Auth and authenticator-based 2FA.";
    } else if (requiresMfa) {
      summary.textContent = "This privileged account must finish 2FA enrollment before admin controls can open.";
    } else if (!verified && currentLoginType === "Email / Password") {
      summary.textContent = "Verify your email to complete account protection.";
    } else {
      summary.textContent = "This learner account is protected by Firebase Auth and role-based Firestore rules.";
    }
  }

  const manageMfaBtn = document.getElementById("manageMfaBtn");
  if (manageMfaBtn) {
    manageMfaBtn.hidden = !requiresMfa;
    manageMfaBtn.textContent = hasMfa ? "View 2FA Status" : "Set Up 2FA";
  }

  const verifyEmailBtn = document.getElementById("protectionVerifyEmailBtn");
  if (verifyEmailBtn) {
    verifyEmailBtn.hidden = currentIsGuest || currentLoginType !== "Email / Password" || verified;
  }
}

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
  updateAccountProtectionCard();
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
  updateAccountProtectionCard();
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
  const sfxVolumeInput = document.getElementById("sfxVolumeInput");
  const sfxVolumeValue = document.getElementById("sfxVolumeValue");
  const musicVolumeInput = document.getElementById("musicVolumeInput");
  const musicVolumeValue = document.getElementById("musicVolumeValue");
  const highContrastToggle = document.getElementById("highContrastToggle");
  const screenReaderAssistToggle = document.getElementById("screenReaderAssistToggle");
  const reducedMotionToggle = document.getElementById("reducedMotionToggle");
  const textSizeSelect = document.getElementById("textSizeSelect");
  const narrationSpeedInput = document.getElementById("narrationSpeedInput");
  const narrationSpeedValue = document.getElementById("narrationSpeedValue");
  const readAloudPageBtn = document.getElementById("readAloudPageBtn");
  const pauseNarrationBtn = document.getElementById("pauseNarrationBtn");
  const stopNarrationBtn = document.getElementById("stopNarrationBtn");
  const accessibilityPrefs = applyAccessibilityPreferences();

  if (highContrastToggle) {
    highContrastToggle.checked = accessibilityPrefs.highContrast;
    highContrastToggle.addEventListener("change", (e) => {
      localStorage.setItem("highContrastMode", e.target.checked ? "true" : "false");
      applyAccessibilityPreferences();
    });
  }

  if (screenReaderAssistToggle) {
    screenReaderAssistToggle.checked = accessibilityPrefs.screenReaderAssist;
    screenReaderAssistToggle.addEventListener("change", (e) => {
      localStorage.setItem("screenReaderAssist", e.target.checked ? "true" : "false");
      applyAccessibilityPreferences();
    });
  }

  if (reducedMotionToggle) {
    reducedMotionToggle.checked = accessibilityPrefs.reducedMotion;
    reducedMotionToggle.addEventListener("change", (e) => {
      localStorage.setItem("reducedMotion", e.target.checked ? "true" : "false");
      applyAccessibilityPreferences();
    });
  }

  if (textSizeSelect) {
    textSizeSelect.value = accessibilityPrefs.textSize;
    textSizeSelect.addEventListener("change", (e) => {
      const nextSize = TEXT_SIZE_OPTIONS.has(e.target.value) ? e.target.value : ACCESSIBILITY_DEFAULTS.textSize;
      localStorage.setItem("textSizePreference", nextSize);
      applyAccessibilityPreferences();
    });
  }

  if (narrationSpeedInput && narrationSpeedValue) {
    const savedNarrationSpeed = Math.round(accessibilityPrefs.narrationSpeed * 100);
    narrationSpeedInput.value = String(savedNarrationSpeed);
    narrationSpeedValue.textContent = formatNarrationSpeed(savedNarrationSpeed / 100);

    narrationSpeedInput.addEventListener("input", (e) => {
      const nextSpeed = Math.round(Number(e.target.value || 100)) / 100;
      localStorage.setItem("narrationSpeed", String(nextSpeed));
      narrationSpeedValue.textContent = formatNarrationSpeed(nextSpeed);
      applyAccessibilityPreferences();
    });
  }

  if (readAloudPageBtn) {
    readAloudPageBtn.addEventListener("click", () => {
      if (typeof window.readCodeRecallPageAloud === "function") {
        window.readCodeRecallPageAloud();
      } else {
        showInfoPopup("Read Aloud Unavailable", "Your browser does not support read-aloud narration on this page.");
      }
    });
  }

  if (pauseNarrationBtn) {
    pauseNarrationBtn.addEventListener("click", () => {
      if (typeof window.toggleCodeRecallNarrationPause === "function") {
        const isPaused = window.toggleCodeRecallNarrationPause();
        pauseNarrationBtn.textContent = isPaused ? "Resume" : "Pause";
      }
    });
  }

  if (stopNarrationBtn) {
    stopNarrationBtn.addEventListener("click", () => {
      if (typeof window.stopCodeRecallNarration === "function") {
        window.stopCodeRecallNarration();
      }
      if (pauseNarrationBtn) pauseNarrationBtn.textContent = "Pause";
    });
  }

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

  if (sfxVolumeInput && sfxVolumeValue) {
    const savedSfxVolume = Math.round(getSfxVolume() * 100);
    sfxVolumeInput.value = String(savedSfxVolume);
    sfxVolumeValue.textContent = `${savedSfxVolume}%`;

    sfxVolumeInput.addEventListener("input", (e) => {
      const nextVolume = Math.round(Number(e.target.value || 0));
      setSfxVolume(nextVolume / 100);
      sfxVolumeValue.textContent = `${nextVolume}%`;
      if (soundToggle) {
        soundToggle.checked = nextVolume > 0;
        handleSoundToggle(nextVolume > 0);
      }
    });

    sfxVolumeInput.addEventListener("change", () => {
      if (soundToggle?.checked !== false) playSound("click");
    });
  }

  if (musicVolumeInput && musicVolumeValue) {
    const savedMusicVolume = Math.round(getMusicVolume() * 100);
    musicVolumeInput.value = String(savedMusicVolume);
    musicVolumeValue.textContent = `${savedMusicVolume}%`;

    musicVolumeInput.addEventListener("input", (e) => {
      const nextVolume = Math.round(Number(e.target.value || 0));
      setMusicVolume(nextVolume / 100);
      musicVolumeValue.textContent = `${nextVolume}%`;
      if (musicToggle) {
        musicToggle.checked = nextVolume > 0;
        handleMusicToggle(nextVolume > 0);
      }
    });
  }

  loadRetentionScheduleSettings();
}

function loadRetentionScheduleSettings() {
  const schedule = getRetentionScheduleConfig();
  const immediateToggle = document.getElementById("retentionImmediateToggle");
  const intervalInputs = [
    document.getElementById("retentionInterval1"),
    document.getElementById("retentionInterval2"),
    document.getElementById("retentionInterval3"),
    document.getElementById("retentionInterval4")
  ];

  if (immediateToggle) {
    immediateToggle.checked = schedule.immediateOnSeed !== false;
  }

  intervalInputs.forEach((input, index) => {
    if (!input) return;
    input.value = String(schedule.intervals[index] ?? DEFAULT_RETENTION_SCHEDULE.intervals[index]);
  });
}

function readRetentionScheduleForm() {
  const immediateToggle = document.getElementById("retentionImmediateToggle");
  const intervalInputs = [
    document.getElementById("retentionInterval1"),
    document.getElementById("retentionInterval2"),
    document.getElementById("retentionInterval3"),
    document.getElementById("retentionInterval4")
  ];

  const intervals = intervalInputs.map((input, index) => {
    const fallback = DEFAULT_RETENTION_SCHEDULE.intervals[index];
    return Math.max(0, Math.floor(Number(input?.value || fallback)));
  });

  for (let index = 1; index < intervals.length; index += 1) {
    if (intervals[index] < intervals[index - 1]) {
      throw new Error("Each next stage must be equal to or later than the previous stage.");
    }
  }

  return {
    immediateOnSeed: immediateToggle?.checked !== false,
    intervals
  };
}

function wireRetentionScheduleControls() {
  const saveBtn = document.getElementById("saveRetentionScheduleBtn");
  const resetBtn = document.getElementById("resetRetentionScheduleBtn");

  if (saveBtn) {
    saveBtn.addEventListener("click", () => {
      try {
        const nextConfig = readRetentionScheduleForm();
        const saved = saveRetentionScheduleConfig(nextConfig);
        loadRetentionScheduleSettings();
        showInfoPopup(
          "Memory Review Schedule Saved",
          `Flashcards will now follow this device schedule: ${saved.intervals.join(" days, ")} days${saved.immediateOnSeed ? ", with immediate first review enabled." : "."}`
        );
      } catch (error) {
        showInfoPopup("Invalid Schedule", error?.message || "Please check the retention schedule values and try again.");
      }
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      saveRetentionScheduleConfig(DEFAULT_RETENTION_SCHEDULE);
      loadRetentionScheduleSettings();
      showInfoPopup("Memory Review Schedule Reset", "The retention schedule is back to the default 1, 3, 7, and 14 day flow.");
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
  const changeEmailBtn = document.getElementById("changeEmailBtn");
  const changeEmailInput = document.getElementById("changeEmailInput");
  const accountSecurityStatus = document.getElementById("accountSecurityStatus");
  const manageMfaBtn = document.getElementById("manageMfaBtn");
  const protectionVerifyEmailBtn = document.getElementById("protectionVerifyEmailBtn");

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
          updateAccountProtectionCard();
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

  if (changeEmailBtn) {
    changeEmailBtn.addEventListener("click", async () => {
      if (!currentUser) {
        if (accountSecurityStatus) accountSecurityStatus.textContent = "Please sign in before changing your email.";
        return;
      }

      const nextEmail = changeEmailInput?.value?.trim().toLowerCase() || "";
      const currentEmail = (currentUser.email || "").toLowerCase();

      if (!nextEmail) {
        if (accountSecurityStatus) accountSecurityStatus.textContent = "Enter the new email address first.";
        return;
      }

      if (nextEmail === currentEmail) {
        if (accountSecurityStatus) accountSecurityStatus.textContent = "That is already your current email address.";
        return;
      }

      changeEmailBtn.disabled = true;
      changeEmailBtn.textContent = "Sending...";

      try {
        await verifyBeforeUpdateEmail(currentUser, nextEmail);
        if (accountSecurityStatus) {
          accountSecurityStatus.textContent = "Email change link sent. Open it from your new inbox to finish the change.";
        }
        showInfoPopup("Email Change Sent", "Check the new email address and open the verification link to finish changing your account email.");
      } catch (error) {
        console.error("Email change error:", error);
        const needsRecentLogin = error?.code === "auth/requires-recent-login";
        if (accountSecurityStatus) {
          accountSecurityStatus.textContent = needsRecentLogin
            ? "Please log out, sign in again, then retry the email change."
            : "Unable to send the email change link right now.";
        }
        showInfoPopup(
          needsRecentLogin ? "Sign In Again Required" : "Unable to Change Email",
          needsRecentLogin
            ? "Firebase requires a fresh sign-in before changing email. Log out, sign back in, then retry."
            : "We could not send the email change link right now."
        );
      } finally {
        changeEmailBtn.disabled = false;
        changeEmailBtn.textContent = "Send Email Change Link";
      }
    });
  }

  if (manageMfaBtn) {
    manageMfaBtn.addEventListener("click", () => {
      if (currentRole === "super_admin") {
        window.location.href = "super-admin-mfa.html";
      } else if (currentRole === "admin") {
        window.location.href = "admin-mfa.html";
      }
    });
  }

  if (protectionVerifyEmailBtn && resendVerificationBtn) {
    protectionVerifyEmailBtn.addEventListener("click", () => {
      resendVerificationBtn.click();
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
  const changeEmailBtn = document.getElementById("changeEmailBtn");
  const changeEmailInput = document.getElementById("changeEmailInput");
  const accountSecurityNote = document.getElementById("accountSecurityNote");
  const accountSecurityWarning = document.getElementById("accountSecurityWarning");
  const canManageEmail = !currentIsGuest && currentLoginType === "Email / Password";
  const canManagePassword = !currentIsGuest && currentLoginType === "Email / Password";

  if (resendVerificationBtn) {
    const shouldShowResend =
      !currentIsGuest &&
      currentLoginType === "Email / Password" &&
      currentVerificationState !== "Verified";
    resendVerificationBtn.hidden = !shouldShowResend;
  }

  if (passwordResetBtn) {
    passwordResetBtn.hidden = false;
    passwordResetBtn.disabled = !canManagePassword;
  }

  if (changeEmailBtn) {
    changeEmailBtn.disabled = !canManageEmail;
  }

  if (changeEmailInput) {
    changeEmailInput.disabled = !canManageEmail;
  }

  if (accountSecurityNote) {
    if (currentIsGuest) {
      accountSecurityNote.textContent = "Sign in with an account before changing email or password.";
    } else if (currentLoginType === "Google") {
      accountSecurityNote.textContent = "This account uses Google sign-in.";
    } else if (currentLoginType === "Email / Password") {
      accountSecurityNote.textContent = "Use a verified link to change your email, or send yourself a password reset link.";
    } else {
      accountSecurityNote.textContent = "Email and password changes depend on your sign-in provider.";
    }
  }

  if (accountSecurityWarning) {
    accountSecurityWarning.hidden = canManageEmail || currentLoginType === "Email / Password";
    if (currentIsGuest) {
      accountSecurityWarning.textContent = "You are using guest mode. Sign in with an email/password account to change email or password.";
    } else {
      accountSecurityWarning.textContent = "You are not an email/password authenticated user. Email and password changes are managed by your sign-in provider.";
    }
  }

  updateAccountProtectionCard();
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

window.resetSubjectProgress = function(subject) {
  const label = getSubjectLabel(subject);

  openSystemPopup(
    `Reset ${label}`,
    `Reset the full ${label} path? This removes that subject's pre-test, modules, quizzes, post-test, review entries, history entries, and XP tied to that subject while keeping the other subject intact.`,
    async () => {
      const localKeysToRemove = getSubjectLocalKeys(subject);
      localKeysToRemove.forEach((key) => localStorage.removeItem(key));

      const recentCompletion = (() => {
        try {
          return JSON.parse(localStorage.getItem("recent_module_completion") || "null");
        } catch {
          return null;
        }
      })();

      if (recentCompletion?.subject === subject) {
        localStorage.removeItem("recent_module_completion");
      }

      const resumeActivity = (() => {
        try {
          return JSON.parse(localStorage.getItem("resume_activity") || "null");
        } catch {
          return null;
        }
      })();

      if (resumeActivity?.subject === subject) {
        localStorage.removeItem("resume_activity");
      }

      const filteredReviewItems = (() => {
        try {
          const items = JSON.parse(localStorage.getItem("wrong_answer_review_items") || "[]");
          return Array.isArray(items) ? items.filter((item) => item?.subject !== subject) : [];
        } catch {
          return [];
        }
      })();
      localStorage.setItem("wrong_answer_review_items", JSON.stringify(filteredReviewItems));

      const filteredStudyHistory = (() => {
        try {
          const items = JSON.parse(localStorage.getItem("study_history_items") || "[]");
          return Array.isArray(items) ? items.filter((item) => item?.subject !== subject) : [];
        } catch {
          return [];
        }
      })();
      localStorage.setItem("study_history_items", JSON.stringify(filteredStudyHistory));

      await removeRetentionQueueItemsBySubject({
        db,
        user: currentUser,
        subject
      });

      if (currentUser) {
        const userRef = doc(db, "users", currentUser.uid);
        const docSnap = await getDoc(userRef);

        if (docSnap.exists()) {
          const data = docSnap.data() || {};
          const nextProgress = Object.fromEntries(
            Object.entries(data.progress || {}).filter(([key]) => !key.startsWith(`${subject}_`))
          );
          const nextResults = Object.fromEntries(
            Object.entries(data.results || {}).filter(([key]) => !key.startsWith(`${subject}_`))
          );
          const nextWrongAnswerReview = Array.isArray(data.wrongAnswerReview)
            ? data.wrongAnswerReview.filter((item) => item?.subject !== subject)
            : [];
          const nextStudyHistory = Array.isArray(data.studyHistory)
            ? data.studyHistory.filter((item) => item?.subject !== subject)
            : [];
          const nextRetentionQueue = Array.isArray(data.retentionQueue)
            ? data.retentionQueue.filter((item) => item?.subject !== subject)
            : [];
          const nextXP = computeSystemXP(nextProgress, nextResults);
          const nextWeeklyXP = Math.min(Number(data.xpWeekly || 0), nextXP);

          await setDoc(userRef, {
            ...data,
            xp: nextXP,
            xpWeekly: nextWeeklyXP,
            xpChange: 0,
            progress: nextProgress,
            results: nextResults,
            wrongAnswerReview: nextWrongAnswerReview,
            studyHistory: nextStudyHistory,
            retentionQueue: nextRetentionQueue,
            resumeActivity: data.resumeActivity?.subject === subject ? null : (data.resumeActivity || null)
          });

          await syncPublicLeaderboardEntry(db, currentUser.uid, {
            name: data.name || currentUser.displayName || currentUser.email || "User",
            photo: data.photo || currentUser.photoURL || "https://i.pravatar.cc/40?img=12",
            xp: nextXP,
            xpWeekly: nextWeeklyXP,
            xpChange: 0
          });
        }
      }

      closeSystemPopup();
      showInfoPopup(`${label} Reset`, `${label} was reset successfully. The other subject stays untouched.`);
      window.location.reload();
    }
  );
};

window.clearMemoryReview = function() {
  openSystemPopup(
    "Clear Memory Review",
    "Clear all flashcard retention items without changing your subject progress, scores, or XP?",
    async () => {
      await clearRetentionQueue({
        db,
        user: currentUser
      });

      closeSystemPopup();
      showInfoPopup("Memory Review Cleared", "All retention flashcards were cleared successfully.");
      window.location.reload();
    }
  );
};

window.clearWrongAnswerReviewQueue = function() {
  openSystemPopup(
    "Clear Wrong-Answer Review",
    "Clear the wrong-answer review backlog without changing your subject progress, scores, or XP?",
    async () => {
      await clearWrongAnswerReview({
        db,
        user: currentUser
      });

      closeSystemPopup();
      showInfoPopup("Wrong-Answer Review Cleared", "The wrong-answer review queue was cleared successfully.");
      window.location.reload();
    }
  );
};

function collectLocalSubjectState(prefix) {
  return Object.fromEntries(
    Object.keys(localStorage)
      .filter((key) =>
        key.startsWith(`${prefix}_`)
        || key.startsWith(`resume_module_state_${prefix}_`)
        || key.startsWith(`resume_quiz_state_${prefix}_`)
      )
      .map((key) => [key, localStorage.getItem(key)])
  );
}

function downloadTextFile(filename, content, mimeType = "application/json") {
  const blob = new Blob([content], { type: mimeType });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}

function escapeCsvValue(value) {
  const normalized = value == null ? "" : String(value);
  return `"${normalized.replace(/"/g, '""')}"`;
}

function rowsToCsv(rows = []) {
  return rows
    .map((row) => row.map((value) => escapeCsvValue(value)).join(","))
    .join("\n");
}

function flattenObjectToRows(section, objectValue = {}, parentKey = "") {
  const rows = [];

  Object.entries(objectValue || {}).forEach(([key, value]) => {
    const nextKey = parentKey ? `${parentKey}.${key}` : key;

    if (Array.isArray(value)) {
      rows.push([section, nextKey, JSON.stringify(value)]);
      return;
    }

    if (value && typeof value === "object") {
      rows.push(...flattenObjectToRows(section, value, nextKey));
      return;
    }

    rows.push([section, nextKey, value]);
  });

  return rows;
}

window.exportProgressSnapshot = async function() {
  try {
    const generatedAt = new Date().toISOString();
    const summary = {
      generatedAt,
      role: currentRole,
      roleLabel: getRoleLabel(currentRole),
      loginType: currentLoginType,
      verificationState: currentVerificationState,
      theme: localStorage.getItem("theme") || "dark",
      totalXP: parseInt(document.getElementById("totalXP")?.textContent || "0", 10) || 0,
      level: parseInt(document.getElementById("levelValue")?.textContent || "1", 10) || 1,
      completedSubjects: parseInt(document.getElementById("completedSubjects")?.textContent || "0", 10) || 0
    };

    const csvRows = [
      ["Section", "Key", "Value"]
    ];

    csvRows.push(...flattenObjectToRows("Summary", summary));
    csvRows.push(...flattenObjectToRows("Retention Schedule", getRetentionScheduleConfig()));

    if (currentUser) {
      const userRef = doc(db, "users", currentUser.uid);
      const docSnap = await getDoc(userRef);
      const data = docSnap.exists() ? (docSnap.data() || {}) : {};

      const userInfo = {
        uid: currentUser.uid,
        email: currentUser.email || "",
        displayName: data.name || currentUser.displayName || currentUser.email || "User"
      };

      const remoteSummary = {
        xp: Number(data.xp || 0),
        xpWeekly: Number(data.xpWeekly || 0),
        wrongAnswerReviewCount: Array.isArray(data.wrongAnswerReview) ? data.wrongAnswerReview.length : 0,
        retentionQueueCount: Array.isArray(data.retentionQueue) ? data.retentionQueue.length : 0,
        studyHistoryCount: Array.isArray(data.studyHistory) ? data.studyHistory.length : 0
      };

      csvRows.push(...flattenObjectToRows("User", userInfo));
      csvRows.push(...flattenObjectToRows("Remote Summary", remoteSummary));
      csvRows.push(...flattenObjectToRows("Progress", data.progress || {}));
      csvRows.push(...flattenObjectToRows("Results", data.results || {}));
      csvRows.push(...flattenObjectToRows("Resume Activity", data.resumeActivity || {}));
    } else {
      const localSummary = {
        guest: currentIsGuest,
        guestXP: parseInt(localStorage.getItem("guest_xp") || "0", 10) || 0,
        guestXPWeekly: parseInt(localStorage.getItem("guest_xpWeekly") || "0", 10) || 0,
        wrongAnswerReviewCount: (() => {
          try {
            const items = JSON.parse(localStorage.getItem("wrong_answer_review_items") || "[]");
            return Array.isArray(items) ? items.length : 0;
          } catch {
            return 0;
          }
        })()
      };

      csvRows.push(...flattenObjectToRows("User", { guest: currentIsGuest }));
      csvRows.push(...flattenObjectToRows("Local Summary", localSummary));
      csvRows.push(...flattenObjectToRows("Hardware Local State", collectLocalSubjectState("hardware")));
      csvRows.push(...flattenObjectToRows("Electrical Local State", collectLocalSubjectState("electrical")));
    }

    const safeName = currentUser?.uid || (currentIsGuest ? "guest" : "local");
    downloadTextFile(
      `code-recall-progress-report-${safeName}-${generatedAt.slice(0, 10)}.csv`,
      rowsToCsv(csvRows),
      "text/csv;charset=utf-8"
    );
    showInfoPopup("Progress Report Exported", "Your CSV progress report was downloaded successfully.");
  } catch (error) {
    console.error("Unable to export progress snapshot.", error);
    showInfoPopup("Export Failed", "Unable to export the CSV progress report right now.");
  }
};

window.resetContactAlerts = function() {
  openSystemPopup(
    "Reset Contact Alerts",
    "Clear local contact reply alerts and seen-reply markers on this device without deleting the actual support messages?",
    () => {
      Object.keys(localStorage)
        .filter((key) => key.startsWith("contact_reply_seen"))
        .forEach((key) => localStorage.removeItem(key));

      closeSystemPopup();
      showInfoPopup("Contact Alerts Reset", "Local contact reply alerts were reset. Your support messages were not deleted.");
    }
  );
};

window.refreshRoleAccess = async function() {
  try {
    if (!currentUser) {
      currentRole = "guest";
      applyRoleNavigation("guest", "settings.html");
      showInfoPopup("Role Access Refreshed", "Guest navigation was refreshed for this session.");
      return;
    }

    const resolvedRole = await resolveUserRole(db, currentUser);
    await syncUserRole(db, currentUser, resolvedRole);
    currentRole = resolvedRole;
    applyRoleNavigation(resolvedRole, "settings.html");
    showInfoPopup("Role Access Refreshed", `Your access was refreshed as ${getRoleLabel(resolvedRole)}.`);
  } catch (error) {
    console.error("Unable to refresh role access.", error);
    showInfoPopup("Role Refresh Failed", "Unable to refresh role access right now.");
  }
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
    "wrong_answer_review_items",
    "study_history_items",
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
  clearAllLocalRetentionQueueStorage();
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
applyAccessibilityPreferences();
wireProfileEditor();
wireRetentionScheduleControls();
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

