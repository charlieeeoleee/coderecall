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

/* =========================
   AUTH STATE
========================= */
onAuthStateChanged(auth, async (user) => {
  const isGuest = localStorage.getItem("guest") === "true";

  if (user) {
    currentUser = user;
    await loadUserSettings();
    loadPreferences();
    loadProgress();
  } else if (isGuest) {
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

  let name = currentUser.displayName || currentUser.email || "User";
  let email = currentUser.email || "No email";
  let photo = currentUser.photoURL || "https://i.pravatar.cc/80?img=12";

  if (!docSnap.exists()) {
    await setDoc(userRef, {
      xp: 0,
      name,
      photo,
      email
    });
  } else {
    const data = docSnap.data();
    name = currentUser.displayName || data.name || currentUser.email || "User";
    email = currentUser.email || data.email || "No email";
    photo = currentUser.photoURL || data.photo || "https://i.pravatar.cc/80?img=12";
  }

  const loginType = currentUser.providerData?.[0]?.providerId || "unknown";

  document.getElementById("usernameTop").textContent = name;
  document.getElementById("userPhotoTop").src = photo;

  document.getElementById("profileName").textContent = name;
  document.getElementById("profileEmail").textContent = email;
  document.getElementById("profilePhoto").src = photo;

  if (loginType.includes("google")) {
    document.getElementById("loginType").textContent = "Google";
  } else if (loginType.includes("password")) {
    document.getElementById("loginType").textContent = "Email / Password";
  } else {
    document.getElementById("loginType").textContent = "Unknown";
  }
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
  let xp = 0;

  if (currentUser) {
    loadXPFromFirestore();
    return;
  }

  xp = parseInt(localStorage.getItem("guest_xp")) || 0;
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
window.resetProgress = async function() {
  const confirmed = confirm("Are you sure you want to reset all progress?");
  if (!confirmed) return;

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

  alert("Progress reset successfully.");
  window.location.reload();
};

/* =========================
   CLEAR LOCAL DATA
========================= */
window.clearLocalData = function() {
  const confirmed = confirm("Clear local preferences and cached data?");
  if (!confirmed) return;

  const keepKeys = [];
  const allKeys = Object.keys(localStorage);

  allKeys.forEach(key => {
    if (!keepKeys.includes(key)) {
      localStorage.removeItem(key);
    }
  });

  alert("Local data cleared.");
  window.location.reload();
};

/* =========================
   LOGOUT
========================= */
window.logout = async function() {
  localStorage.removeItem("guest");

  if (auth.currentUser) {
    await signOut(auth);
  }

  window.location.href = "auth.html";
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