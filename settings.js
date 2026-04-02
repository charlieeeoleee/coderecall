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

/* =========================
   AUTH STATE
========================= */
onAuthStateChanged(auth, async (user) => {
  const isGuest = localStorage.getItem("guest") === "true";

  if (user) {
    currentUser = user;
    currentIsGuest = false;
    await loadUserSettings();
    loadPreferences();
    loadProgress();
  } else if (isGuest) {
    currentUser = null;
    currentIsGuest = true;
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

  const verificationStatus = document.getElementById("verificationStatus");
  verificationStatus.textContent = verificationText;
  verificationStatus.className = `status-pill ${verificationClass}`;
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

  const verificationStatus = document.getElementById("verificationStatus");
  verificationStatus.textContent = "Guest Session";
  verificationStatus.className = "status-pill locked";
}

/* =========================
   PREFERENCES
========================= */
function loadPreferences() {
  const soundEnabled = localStorage.getItem("soundEnabled");
  const autoAdvance = localStorage.getItem("autoAdvance");

  document.getElementById("soundToggle").checked = soundEnabled !== "false";
  document.getElementById("autoAdvanceToggle").checked = autoAdvance === "true";

  document.getElementById("soundToggle").addEventListener("change", (e) => {
    localStorage.setItem("soundEnabled", e.target.checked ? "true" : "false");
  });

  document.getElementById("autoAdvanceToggle").addEventListener("change", (e) => {
    localStorage.setItem("autoAdvance", e.target.checked ? "true" : "false");
  });
}

/* =========================
   PROGRESS
========================= */
function loadProgress() {
  if (currentUser) {
    loadXPFromFirestore();
    return;
  }

  const xp = parseInt(localStorage.getItem("guest_xp")) || 0;
  renderProgress(xp);
}

async function loadXPFromFirestore() {
  const userRef = doc(db, "users", currentUser.uid);
  const docSnap = await getDoc(userRef);

  let xp = 0;
  if (docSnap.exists()) {
    xp = docSnap.data().xp || 0;
  }

  renderProgress(xp);
}

function renderProgress(xp) {
  const level = Math.floor(xp / 100) + 1;

  let completedSubjects = 0;
  const subjects = ["hardware", "electrical"];

  subjects.forEach(subject => {
    const done = localStorage.getItem(`${subject}_posttest`) === "true";
    if (done) completedSubjects++;
  });

  document.getElementById("totalXP").textContent = xp;
  document.getElementById("levelValue").textContent = level;
  document.getElementById("completedSubjects").textContent = completedSubjects;
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
        "guest_xp"
      ];

      keysToRemove.forEach(key => localStorage.removeItem(key));

      if (currentUser) {
        const userRef = doc(db, "users", currentUser.uid);
        const docSnap = await getDoc(userRef);

        if (docSnap.exists()) {
          const data = docSnap.data();
          await setDoc(userRef, {
            ...data,
            xp: 0
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
};

function updateIcon() {
  const icon = document.getElementById("themeIcon");
  if (!icon) return;
  icon.textContent = document.body.classList.contains("light-mode") ? "☀️" : "🌙";
}

loadTheme();