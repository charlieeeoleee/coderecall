import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

/* FIREBASE CONFIG */
const firebaseConfig = {
  apiKey: "AIzaSyDZiVk1T6ZbpKJrhRt1wQAr2vSSn4Wa_KU",
  authDomain: "gamifiedlearningsystem.firebaseapp.com",
  projectId: "gamifiedlearningsystem",
  appId: "1:516998404507:web:0c625f9af2809ca4b6a93e"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

/* AUTH CHECK */
onAuthStateChanged(auth, (user) => {
  const isGuest = localStorage.getItem("guest");

  if (!user && !isGuest) {
    window.location.href = "auth.html";
  }
});

/* LOGOUT FIXED */
window.logout = function(){

  const isGuest = localStorage.getItem("guest");

  if(isGuest){
    localStorage.removeItem("guest");
    window.location.replace("auth.html");
    return;
  }

  signOut(auth)
    .then(() => {
      window.location.replace("auth.html");
    })
    .catch((error) => {
      alert(error.message);
    });
};

/* DATA */
let xp = 150;

/* LOAD */
window.onload = function(){
  loadDashboard();
  loadTheme();
};

function loadDashboard(){
  let level = Math.floor(xp / 100) + 1;
  let progress = xp % 100;

  document.getElementById("xp").textContent = xp;
  document.getElementById("level").textContent = level;
  document.getElementById("progressText").textContent = progress + "%";
  document.getElementById("progressFill").style.width = progress + "%";
}

/* THEME FIXED */
function loadTheme(){
  const saved = localStorage.getItem("theme");

  if(saved === "light"){
    document.body.classList.add("light-mode");
  }

  updateIcon();
}

window.toggleTheme = function(){
  document.body.classList.toggle("light-mode");

  const mode = document.body.classList.contains("light-mode") ? "light" : "dark";
  localStorage.setItem("theme", mode);

  updateIcon();
};

function updateIcon(){
  const icon = document.getElementById("themeIcon");
  if(!icon) return;

  icon.textContent = document.body.classList.contains("light-mode") ? "☀️" : "🌙";
}

/* SUBJECT */
window.startGame = function(subject){
  alert("Starting " + subject);
};