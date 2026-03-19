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

/* YOUR CONFIG */
const firebaseConfig = {
  apiKey: "AIzaSyDZiVk1T6ZbpKJrhRt1wQAr2vSSn4Wa_KU",
  authDomain: "gamifiedlearningsystem.firebaseapp.com",
  projectId: "gamifiedlearningsystem"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

/* CHECK USER */
onAuthStateChanged(auth, async (user) => {

  if(!user){
    window.location.href = "auth.html";
    return;
  }

  document.getElementById("userEmail").textContent = user.email;

  const userRef = doc(db, "users", user.uid);
  const userSnap = await getDoc(userRef);

  let data;

  if(!userSnap.exists()){
    data = {
      xp: 0,
      level: 1,
      role: "student"
    };

    await setDoc(userRef, data);
  } else {
    data = userSnap.data();
  }

  document.getElementById("xp").textContent = data.xp;
  document.getElementById("level").textContent = data.level;
  document.getElementById("userRole").textContent = data.role;

  /* PROGRESS CALCULATION */
  const progressPercent = (data.xp % 100);
  document.getElementById("progress").style.width = progressPercent + "%";

});

/* LOGOUT */
window.logout = function(){
  signOut(auth);
}

/* START GAME */
window.startGame = function(subject){
  localStorage.setItem("subject", subject);
  window.location.href = "game.html";
}

/* THEME SYSTEM */
function detectSystemTheme(){
  if(window.matchMedia('(prefers-color-scheme: light)').matches){
    document.body.classList.add("light-mode");
  }
}

function loadSavedTheme(){
  const saved = localStorage.getItem("theme");

  if(saved){
    document.body.classList.toggle("light-mode", saved === "light");
  } else {
    detectSystemTheme();
  }

  updateIcon();
}

window.toggleTheme = function(){
  document.body.classList.toggle("light-mode");

  const mode = document.body.classList.contains("light-mode") ? "light" : "dark";
  localStorage.setItem("theme", mode);

  updateIcon();
}

function updateIcon(){
  const icon = document.getElementById("themeIcon");

  if(!icon) return;

  if(document.body.classList.contains("light-mode")){
    icon.textContent = "☀️";
  } else {
    icon.textContent = "🌙";
  }
}

/* RUN THEME */
loadSavedTheme();