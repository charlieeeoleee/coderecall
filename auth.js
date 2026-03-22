import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { 
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
  signInAnonymously,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

/* =========================
   FIREBASE CONFIG
========================= */
const firebaseConfig = {
  apiKey: "AIzaSyDZiVk1T6ZbpKJrhRt1wQAr2vSSn4Wa_KU",
  authDomain: "gamifiedlearningsystem.firebaseapp.com",
  projectId: "gamifiedlearningsystem",
  appId: "1:516998404507:web:0c625f9af2809ca4b6a93e"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

/* =========================
   🔥 SAFE REDIRECT (NO LOOP)
========================= */
let redirected = false;

onAuthStateChanged(auth, (user) => {
  if(user && !redirected){
    redirected = true;

    if(window.location.pathname.includes("auth.html")){
      window.location.replace("dashboard.html");
    }
  }
});

/* =========================
   FORM SWITCHING (FIXED)
========================= */
window.showRegister = function(){
  document.getElementById("loginForm").classList.remove("active");
  document.getElementById("registerForm").classList.add("active");
}

window.showLogin = function(){
  document.getElementById("registerForm").classList.remove("active");
  document.getElementById("loginForm").classList.add("active");
}

/* =========================
   LOGIN
========================= */
window.login = async function(){
  try{
    const email = document.getElementById("loginEmail").value;
    const password = document.getElementById("loginPassword").value;

    await signInWithEmailAndPassword(auth, email, password);
    window.location.replace("dashboard.html");
  }catch(error){
    alert(error.message);
  }
}

/* =========================
   REGISTER
========================= */
window.register = async function(){
  try{
    const email = document.getElementById("registerEmail").value;
    const password = document.getElementById("registerPassword").value;

    await createUserWithEmailAndPassword(auth, email, password);
    window.location.replace("dashboard.html");
  }catch(error){
    alert(error.message);
  }
}

/* =========================
   GOOGLE LOGIN
========================= */
window.googleLogin = async function(){
  try{
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
    window.location.replace("dashboard.html");
  }catch(error){
    alert(error.message);
  }
}

/* =========================
   ✅ GUEST LOGIN
========================= */
window.playGuest = async function(){
  try{
    await signInAnonymously(auth);

    if(!redirected){
      redirected = true;
      window.location.replace("dashboard.html");
    }

  }catch(error){
    alert(error.message);
  }
}

/* =========================
   🎨 THEME SYSTEM (FIXED LOGO)
========================= */

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
  const logo = document.querySelector(".main-logo");

  if(document.body.classList.contains("light-mode")){
    if(icon) icon.textContent = "☀️";
    if(logo) logo.src = "assets/logo-light.png";
  } else {
    if(icon) icon.textContent = "🌙";
    if(logo) logo.src = "assets/logo-dark.png";
  }
}

/* =========================
   PASSWORD TOGGLE
========================= */
window.togglePassword = function(id){
  const input = document.getElementById(id);
  input.type = input.type === "password" ? "text" : "password";
}

/* =========================
   RUN ON LOAD
========================= */
loadSavedTheme();