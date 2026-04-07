import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import {
  initSounds,
  initGlobalClickSound,
  tryStartMusic,
  restartThemeMusic
} from "./sound.js";
import { applyRoleNavigation, resolveUserRole } from "./role-utils.js";

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
const SELECTED_SUBJECT_KEY = "selectedSubject";

onAuthStateChanged(auth, async (user) => {
  const isGuest = localStorage.getItem("guest") === "true";

  if (user) {
    currentUser = user;
    currentIsGuest = false;
    applyRoleNavigation(await resolveUserRole(db, user), "subjects.html");
    await loadUserUI();
    loadSubjectStats();
  } else if (isGuest) {
    currentUser = null;
    currentIsGuest = true;
    applyRoleNavigation("guest", "subjects.html");
    loadGuestUI();
    loadSubjectStats();
  } else {
    window.location.href = "auth.html";
  }
});

async function loadUserUI() {
  const userRef = doc(db, "users", currentUser.uid);
  const docSnap = await getDoc(userRef);

  let name = currentUser.displayName || currentUser.email || "User";
  let photo = currentUser.photoURL || "https://i.pravatar.cc/40?img=12";

  if (!docSnap.exists()) {
    await setDoc(userRef, {
      xp: 0,
      xpWeekly: 0,
      xpChange: 0,
      name,
      photo,
      email: currentUser.email || ""
    });
  } else {
    const data = docSnap.data();
    name = currentUser.displayName || data.name || currentUser.email || "User";
    photo = currentUser.photoURL || data.photo || "https://i.pravatar.cc/40?img=12";
  }

  document.getElementById("username").textContent = name;
  document.getElementById("userPhoto").src = photo;
}

function loadGuestUI() {
  document.getElementById("username").textContent = "Guest";
  document.getElementById("userPhoto").src = "https://i.pravatar.cc/40?img=8";
}

function loadSubjectStats() {
  const subjects = ["hardware", "electrical"];
  let completedCount = 0;
  let activeCount = 0;

  subjects.forEach((subject) => {
    const pretest = localStorage.getItem(`${subject}_pretest`) === "true";
    const modules = localStorage.getItem(`${subject}_modules`) === "true";
    const quiz = localStorage.getItem(`${subject}_quiz`) === "true";
    const posttest = localStorage.getItem(`${subject}_posttest`) === "true";

    let progress = 0;
    let status = "Not Started";

    if (pretest) progress += 25;
    if (modules) progress += 25;
    if (quiz) progress += 25;
    if (posttest) progress += 25;

    if (progress > 0) {
      status = "In Progress";
      activeCount++;
    }

    if (progress === 100) {
      status = "Finished";
      completedCount++;
    }

    const progressText = document.getElementById(`${subject}ProgressText`);
    const progressFill = document.getElementById(`${subject}ProgressFill`);
    const statusEl = document.getElementById(`${subject}Status`);

    if (progressText) progressText.textContent = `${progress}%`;
    if (statusEl) statusEl.textContent = status;

    if (progressFill) {
      progressFill.style.width = "0%";
      requestAnimationFrame(() => {
        progressFill.style.width = `${progress}%`;
      });
    }
  });

  const completedEl = document.getElementById("completedCount");
  const activeEl = document.getElementById("activeSubjects");
  const totalEl = document.getElementById("totalSubjects");

  animateNumber(completedEl, completedCount);
  animateNumber(activeEl, activeCount || 2);
  animateNumber(totalEl, 2);
}

function animateNumber(element, targetValue) {
  if (!element) return;

  const duration = 900;
  const start = 0;
  const startTime = performance.now();

  function update(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const value = Math.round(start + (targetValue - start) * eased);

    element.textContent = value;

    if (progress < 1) {
      requestAnimationFrame(update);
    }
  }

  requestAnimationFrame(update);
}

window.openSubject = function(subject) {
  sessionStorage.setItem(SELECTED_SUBJECT_KEY, subject);
  window.location.href = `subject.html?subject=${subject}`;
};

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

window.confirmGuestLogout = function() {
  clearGuestSession();
  closeGuestLogoutPopup();
  window.location.href = "auth.html";
};

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

window.logout = async function() {
  if (currentIsGuest) {
    if (hasGuestProgress()) {
      openGuestLogoutPopup(true);
      return;
    }

    openGuestLogoutPopup(false);
    return;
  }

  localStorage.removeItem("guest");

  if (auth.currentUser) {
    await signOut(auth);
  }

  window.location.href = "auth.html";
};

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
  icon.textContent = document.body.classList.contains("light-mode") ? "\u2600\uFE0F" : "\uD83C\uDF19";
}

loadTheme();
initSounds();
initGlobalClickSound();
tryStartMusic();

document.body.addEventListener("click", () => {
  tryStartMusic();
}, { once: true });
