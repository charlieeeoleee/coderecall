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
    await loadUserUI();
    loadSubjectStats();
  } else if (isGuest) {
    loadGuestUI();
    loadSubjectStats();
  } else {
    window.location.href = "auth.html";
  }
});

/* =========================
   LOAD REAL USER
========================= */
async function loadUserUI() {
  const userRef = doc(db, "users", currentUser.uid);
  const docSnap = await getDoc(userRef);

  let name = currentUser.displayName || currentUser.email || "User";
  let photo = currentUser.photoURL || "https://i.pravatar.cc/40?img=12";

  if (!docSnap.exists()) {
    await setDoc(userRef, {
      xp: 0,
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

/* =========================
   LOAD GUEST
========================= */
function loadGuestUI() {
  document.getElementById("username").textContent = "Guest";
  document.getElementById("userPhoto").src = "https://i.pravatar.cc/40?img=8";
}

/* =========================
   SUBJECT PROGRESS
========================= */
function loadSubjectStats() {
  const subjects = ["hardware", "electrical"];
  let completedCount = 0;

  subjects.forEach(subject => {
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

    if (progress > 0) status = "In Progress";
    if (progress === 100) {
      status = "Finished";
      completedCount++;
    }

    const progressText = document.getElementById(`${subject}ProgressText`);
    const progressFill = document.getElementById(`${subject}ProgressFill`);
    const statusEl = document.getElementById(`${subject}Status`);

    if (progressText) progressText.textContent = `${progress}%`;
    if (progressFill) progressFill.style.width = `${progress}%`;
    if (statusEl) statusEl.textContent = status;
  });

  document.getElementById("completedCount").textContent = completedCount;
}

/* =========================
   OPEN SUBJECT
========================= */
window.openSubject = function(subject) {
  window.location.href = `subject.html?subject=${subject}`;
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