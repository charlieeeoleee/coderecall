/* =========================
   FIREBASE IMPORTS
========================= */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

import {
  getFirestore,
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/* =========================
   CONFIG (YOUR REAL CONFIG)
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

/* =========================
   BADGES
========================= */
const badges = [
  { name: "First Win", icon: "🥇", xp: 0 },
  { name: "Rookie", icon: "🎯", xp: 50 },
  { name: "Learner", icon: "📘", xp: 100 },
  { name: "Intermediate", icon: "⚡", xp: 200 },
  { name: "Pro", icon: "🔥", xp: 300 },
  { name: "Master", icon: "👑", xp: 500 }
];

/* =========================
   AUTH + LOAD DATA
========================= */
onAuthStateChanged(auth, async (user) => {
  if(user){
    const userRef = doc(db, "users", user.uid);
    const docSnap = await getDoc(userRef);

    let xp = 0;

    if(docSnap.exists()){
      xp = docSnap.data().xp || 0;
    }

    loadBadges(xp);
  } else {
    window.location.href = "auth.html";
  }
});

/* =========================
   LOAD BADGES
========================= */
function loadBadges(xp){

  const grid = document.getElementById("badgesGrid");
  if(!grid) return;

  grid.innerHTML = "";

  let unlocked = 0;

  badges.forEach(badge => {

    const isUnlocked = xp >= badge.xp;

    if(isUnlocked) unlocked++;

    const div = document.createElement("div");
    div.className = "badge " + (isUnlocked ? "" : "locked");

    div.innerHTML = `
      <div class="badge-icon">${badge.icon}</div>
      <div>${badge.name}</div>
    `;

    grid.appendChild(div);
  });

  document.getElementById("achievementCount").textContent =
    unlocked + "/" + badges.length + " Unlocked";

  document.getElementById("progressFill").style.width =
    (unlocked / badges.length * 100) + "%";
}

/* =========================
   ✅ MAKE FUNCTIONS GLOBAL
========================= */
window.logout = async function(){
  await signOut(auth);
  window.location.href = "auth.html";
};

window.toggleTheme = function(){
  document.body.classList.toggle("light-mode");

  const mode = document.body.classList.contains("light-mode") ? "light" : "dark";
  localStorage.setItem("theme", mode);

  updateIcon();
};

/* =========================
   THEME LOAD
========================= */
function loadTheme(){
  const saved = localStorage.getItem("theme");

  if(saved === "light"){
    document.body.classList.add("light-mode");
  }

  updateIcon();
}

function updateIcon(){
  const icon = document.getElementById("themeIcon");

  if(!icon) return;

  icon.textContent =
    document.body.classList.contains("light-mode") ? "☀️" : "🌙";
}

/* RUN THEME ON LOAD */
loadTheme();