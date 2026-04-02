import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signOut
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

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
const db = getFirestore(app);

const pendingGoogleKey = "pendingGoogleRegistration";

/* =========================
   AUTH STATE
========================= */
onAuthStateChanged(auth, async (user) => {
  const pendingGoogle = localStorage.getItem(pendingGoogleKey);

  if (!user) return;

  if (pendingGoogle && window.location.pathname.includes("auth.html")) {
    showPendingGoogleRegistration(JSON.parse(pendingGoogle));
    return;
  }

  const userRef = doc(db, "users", user.uid);
  const docSnap = await getDoc(userRef);

  if (docSnap.exists() && window.location.pathname.includes("auth.html")) {
    window.location.replace("dashboard.html");
  }
});

/* =========================
   FORM SWITCHING
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
    const email = document.getElementById("loginEmail").value.trim();
    const password = document.getElementById("loginPassword").value;

    if (!email || !password) {
      alert("Please enter your email and password.");
      return;
    }

    const cred = await signInWithEmailAndPassword(auth, email, password);

    if (!cred.user.emailVerified) {
      await signOut(auth);
      alert("Please verify your email first before logging in.");
      return;
    }

    window.location.replace("dashboard.html");
  }catch(error){
    alert(error.message);
  }
}

/* =========================
   REGISTER WITH EMAIL
========================= */
window.register = async function(){
  try{
    const name = document.getElementById("registerName").value.trim();
    const email = document.getElementById("registerEmail").value.trim();
    const passwordInput = document.getElementById("registerPassword");
    const password = passwordInput ? passwordInput.value : "";
    const pendingGoogle = localStorage.getItem(pendingGoogleKey);

    if (!name || !email) {
      alert("Please complete the required fields.");
      return;
    }

    /* COMPLETE GOOGLE REGISTRATION */
    if (pendingGoogle) {
      const pending = JSON.parse(pendingGoogle);
      const userRef = doc(db, "users", pending.uid);

      await setDoc(userRef, {
        xp: 0,
        name,
        email: pending.email,
        photo: pending.photo || "https://i.pravatar.cc/40?img=12",
        provider: "google",
        createdAt: Date.now()
      });

      localStorage.removeItem(pendingGoogleKey);
      window.location.replace("dashboard.html");
      return;
    }

    /* EMAIL/PASSWORD REGISTRATION */
    if (!password || password.length < 6) {
      alert("Password must be at least 6 characters.");
      return;
    }

    const cred = await createUserWithEmailAndPassword(auth, email, password);

    await setDoc(doc(db, "users", cred.user.uid), {
      xp: 0,
      name,
      email,
      photo: "https://i.pravatar.cc/40?img=12",
      provider: "password",
      createdAt: Date.now()
    });

    await sendEmailVerification(cred.user);
    await signOut(auth);

    alert("Registration successful. Please verify your email before logging in.");
    showLogin();
  }catch(error){
    alert(error.message);
  }
}

/* =========================
   GOOGLE LOGIN / REGISTER
========================= */
window.googleLogin = async function(){
  try{
    const provider = new GoogleAuthProvider();
    const result = await signInWithPopup(auth, provider);
    const user = result.user;

    const userRef = doc(db, "users", user.uid);
    const docSnap = await getDoc(userRef);

    if (docSnap.exists()) {
      localStorage.removeItem(pendingGoogleKey);
      window.location.replace("dashboard.html");
      return;
    }

    /* NEW GOOGLE ACCOUNT -> COMPLETE REGISTRATION FIRST */
    const pending = {
      uid: user.uid,
      email: user.email || "",
      name: user.displayName || "",
      photo: user.photoURL || ""
    };

    localStorage.setItem(pendingGoogleKey, JSON.stringify(pending));
    showPendingGoogleRegistration(pending);
  }catch(error){
    alert(error.message);
  }
}

function showPendingGoogleRegistration(pending){
  showRegister();

  document.getElementById("registerTitle").textContent = "Complete Google Registration";
  document.getElementById("registerName").value = pending.name || "";
  document.getElementById("registerEmail").value = pending.email || "";
  document.getElementById("registerEmail").readOnly = true;
  document.getElementById("registerPasswordWrapper").style.display = "none";
  document.getElementById("registerBtn").textContent = "Complete Registration";
  document.getElementById("googleRegisterNote").style.display = "block";
}

/* =========================
   FORGOT PASSWORD
========================= */
window.forgotPassword = async function(){
  try{
    const email = document.getElementById("loginEmail").value.trim();

    if (!email) {
      alert("Enter your email first, then click Forgot password.");
      return;
    }

    await sendPasswordResetEmail(auth, email);
    alert("Password reset email sent.");
  }catch(error){
    alert(error.message);
  }
}

/* =========================
   GUEST MODE
========================= */
window.playGuest = function(){
  localStorage.setItem("guest", "true");
  if (!localStorage.getItem("guest_xp")) {
    localStorage.setItem("guest_xp", "0");
  }
  window.location.replace("dashboard.html");
}

/* =========================
   NAVIGATION
========================= */
window.goBack = function(){
  window.location.href = "index.html";
}

/* =========================
   THEME
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
  if (!input) return;
  input.type = input.type === "password" ? "text" : "password";
}

loadSavedTheme();