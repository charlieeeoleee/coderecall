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
  setDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/* FIREBASE CONFIG */
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
let isHandlingAuthFlow = false;

/* AUTH STATE */
onAuthStateChanged(auth, async (user) => {
  const pendingGoogle = localStorage.getItem(pendingGoogleKey);

  if (!user) return;
  if (isHandlingAuthFlow) return;

  if (pendingGoogle && window.location.pathname.includes("auth.html")) {
    showPendingGoogleRegistration(JSON.parse(pendingGoogle));
    return;
  }

  const userRef = doc(db, "users", user.uid);
  const docSnap = await getDoc(userRef);

  const providerIds = user.providerData?.map(p => p.providerId) || [];
  const isPasswordUser = providerIds.includes("password");
  const isGoogleUser = providerIds.includes("google.com");

  if (isPasswordUser && !user.emailVerified && window.location.pathname.includes("auth.html")) {
    return;
  }

  if ((docSnap.exists() || isGoogleUser) && window.location.pathname.includes("auth.html")) {
    window.location.replace("dashboard.html");
  }
});

/* FORM SWITCHING */
window.showRegister = function(){
  document.getElementById("loginForm").classList.remove("active");
  document.getElementById("registerForm").classList.add("active");
};

window.showLogin = function(){
  document.getElementById("registerForm").classList.remove("active");
  document.getElementById("loginForm").classList.add("active");

  document.getElementById("registerTitle").textContent = "Create Account";
  document.getElementById("registerEmail").readOnly = false;
  document.getElementById("registerPasswordWrapper").style.display = "block";
  document.getElementById("registerBtn").textContent = "Register";
  document.getElementById("googleRegisterNote").style.display = "none";
  localStorage.removeItem(pendingGoogleKey);
};

/* LOGIN */
window.login = async function(){
  try{
    const email = document.getElementById("loginEmail").value.trim();
    const password = document.getElementById("loginPassword").value;

    if (!email || !password) {
      showPopup("Missing Fields", "Please enter your email and password.");
      return;
    }

    isHandlingAuthFlow = true;
    const cred = await signInWithEmailAndPassword(auth, email, password);

    if (!cred.user.emailVerified) {
      await signOut(auth);
      isHandlingAuthFlow = false;

      showPopup(
        "Verify Your Email 📧",
        "Your email is not verified yet. Please check your inbox or spam folder before logging in.",
        {
          text: "Resend Verification",
          action: () => {
            closePopup();
            openResendPopup();
          }
        }
      );
      return;
    }

    await transferGuestProgressIfNeeded(cred.user.uid);

    window.location.replace("dashboard.html");
  }catch(error){
    isHandlingAuthFlow = false;
    showPopup("Login Error", error.message);
  }
};

/* REGISTER */
window.register = async function(){
  try{
    const name = document.getElementById("registerName").value.trim();
    const email = document.getElementById("registerEmail").value.trim();
    const passwordInput = document.getElementById("registerPassword");
    const password = passwordInput ? passwordInput.value : "";
    const pendingGoogle = localStorage.getItem(pendingGoogleKey);

    if (!name || !email) {
      showPopup("Missing Fields", "Please complete the required fields.");
      return;
    }

    /* COMPLETE GOOGLE REGISTRATION */
    if (pendingGoogle) {
      const pending = JSON.parse(pendingGoogle);
      const userRef = doc(db, "users", pending.uid);

      isHandlingAuthFlow = true;

      const existingSnap = await getDoc(userRef);
      const existingData = existingSnap.exists() ? existingSnap.data() : {};

      await setDoc(userRef, {
        xp: existingData.xp || 0,
        name,
        email: pending.email,
        photo: pending.photo || "https://i.pravatar.cc/40?img=12",
        provider: "google",
        createdAt: existingData.createdAt || Date.now(),
        progress: existingData.progress || {}
      });

      await transferGuestProgressIfNeeded(pending.uid);

      localStorage.removeItem(pendingGoogleKey);
      window.location.replace("dashboard.html");
      return;
    }

    /* EMAIL REGISTRATION */
    if (!password || password.length < 6) {
      showPopup("Weak Password", "Password must be at least 6 characters.");
      return;
    }

    isHandlingAuthFlow = true;

    const cred = await createUserWithEmailAndPassword(auth, email, password);

    await setDoc(doc(db, "users", cred.user.uid), {
      xp: 0,
      name,
      email,
      photo: "https://i.pravatar.cc/40?img=12",
      provider: "password",
      createdAt: Date.now(),
      progress: {}
    });

    await transferGuestProgressIfNeeded(cred.user.uid);

    await cred.user.reload();
    await new Promise(resolve => setTimeout(resolve, 1200));

    if (auth.currentUser) {
      await sendEmailVerification(auth.currentUser);
    }

    await signOut(auth);
    isHandlingAuthFlow = false;

    document.getElementById("loginEmail").value = email;

    showPopup(
      "Check Your Email 📧",
      "Your account was created successfully. We sent a verification link to your email. If it does not arrive right away, check your spam folder.",
      {
        text: "Resend Verification",
        action: () => {
          closePopup();
          openResendPopup();
        }
      }
    );

    showLogin();

    document.getElementById("registerName").value = "";
    document.getElementById("registerEmail").value = "";
    if (document.getElementById("registerPassword")) {
      document.getElementById("registerPassword").value = "";
    }

  }catch(error){
    isHandlingAuthFlow = false;
    console.error("REGISTER ERROR:", error);
    showPopup("Registration Error", error.message);
  }
};

/* GOOGLE LOGIN */
window.googleLogin = async function(){
  try{
    const provider = new GoogleAuthProvider();

    isHandlingAuthFlow = true;
    const result = await signInWithPopup(auth, provider);
    const user = result.user;

    const userRef = doc(db, "users", user.uid);
    const docSnap = await getDoc(userRef);

    if (docSnap.exists()) {
      await transferGuestProgressIfNeeded(user.uid);
      localStorage.removeItem(pendingGoogleKey);
      window.location.replace("dashboard.html");
      return;
    }

    const pending = {
      uid: user.uid,
      email: user.email || "",
      name: user.displayName || "",
      photo: user.photoURL || ""
    };

    localStorage.setItem(pendingGoogleKey, JSON.stringify(pending));
    isHandlingAuthFlow = false;
    showPendingGoogleRegistration(pending);
  }catch(error){
    isHandlingAuthFlow = false;
    showPopup("Google Login Error", error.message);
  }
};

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

/* RESET PASSWORD POPUP */
window.openResetPopup = function(){
  document.getElementById("resetPopup").classList.add("active");
  document.getElementById("resetEmail").value =
    document.getElementById("loginEmail").value.trim();
};

window.closeResetPopup = function(){
  document.getElementById("resetPopup").classList.remove("active");
};

window.confirmReset = async function(){
  try{
    const email = document.getElementById("resetEmail").value.trim();

    if (!email) {
      showPopup("Enter Email First", "Please enter your email.");
      return;
    }

    await sendPasswordResetEmail(auth, email);
    closeResetPopup();

    showPopup(
      "Reset Email Sent 🔑",
      "Check your email for the password reset link. Make sure to check your spam folder too."
    );
  }catch(error){
    showPopup("Reset Error", error.message);
  }
};

/* RESEND VERIFICATION POPUP */
window.openResendPopup = function(){
  document.getElementById("resendPopup").classList.add("active");
  document.getElementById("resendEmail").value =
    document.getElementById("loginEmail").value.trim();
  document.getElementById("resendPassword").value =
    document.getElementById("loginPassword").value;
};

window.closeResendPopup = function(){
  document.getElementById("resendPopup").classList.remove("active");
};

window.confirmResend = async function(){
  try{
    const email = document.getElementById("resendEmail").value.trim();
    const password = document.getElementById("resendPassword").value;

    if (!email || !password) {
      showPopup("Enter Credentials", "Please enter your email and password.");
      return;
    }

    isHandlingAuthFlow = true;
    const cred = await signInWithEmailAndPassword(auth, email, password);

    if (cred.user.emailVerified) {
      await signOut(auth);
      isHandlingAuthFlow = false;
      closeResendPopup();

      showPopup("Already Verified", "This email is already verified. You can log in normally.");
      return;
    }

    await cred.user.reload();
    await sendEmailVerification(auth.currentUser);
    await signOut(auth);
    isHandlingAuthFlow = false;

    closeResendPopup();

    showPopup(
      "Verification Resent 📧",
      "We sent another verification email. Please check your inbox or spam folder."
    );
  }catch(error){
    isHandlingAuthFlow = false;
    showPopup("Resend Error", error.message);
  }
};

/* GUEST MODE */
window.playGuest = function(){
  localStorage.setItem("guest", "true");
  if (!localStorage.getItem("guest_xp")) {
    localStorage.setItem("guest_xp", "0");
  }
  window.location.replace("dashboard.html");
};

/* GUEST SAVE SYSTEM */
async function transferGuestProgressIfNeeded(uid) {
  const shouldTransfer = localStorage.getItem("guest_pending_save") === "true";
  if (!shouldTransfer) {
    isHandlingAuthFlow = false;
    return;
  }

  const userRef = doc(db, "users", uid);
  const docSnap = await getDoc(userRef);
  const existingData = docSnap.exists() ? docSnap.data() : {};

  const guestXP = parseInt(localStorage.getItem("guest_xp")) || 0;

  const guestProgress = {
    hardware_pretest: localStorage.getItem("hardware_pretest") === "true",
    hardware_modules: localStorage.getItem("hardware_modules") === "true",
    hardware_quiz: localStorage.getItem("hardware_quiz") === "true",
    hardware_posttest: localStorage.getItem("hardware_posttest") === "true",
    electrical_pretest: localStorage.getItem("electrical_pretest") === "true",
    electrical_modules: localStorage.getItem("electrical_modules") === "true",
    electrical_quiz: localStorage.getItem("electrical_quiz") === "true",
    electrical_posttest: localStorage.getItem("electrical_posttest") === "true"
  };

  const mergedXP = (existingData.xp || 0) + guestXP;
  const mergedProgress = {
    ...(existingData.progress || {}),
    ...guestProgress
  };

  await setDoc(userRef, {
    ...existingData,
    xp: mergedXP,
    progress: mergedProgress
  });

  clearGuestAfterTransfer();
  isHandlingAuthFlow = false;
}

function clearGuestAfterTransfer() {
  const keysToRemove = [
    "guest",
    "guest_xp",
    "guest_streak",
    "guest_last_active_date",
    "guest_pending_save"
  ];

  keysToRemove.forEach((key) => localStorage.removeItem(key));
}

/* MAIN POPUP */
function showPopup(title, message, extraAction = null){
  document.getElementById("popupTitle").textContent = title;
  document.getElementById("popupMessage").textContent = message;

  const extraBtn = document.getElementById("popupExtraBtn");

  if (extraAction) {
    extraBtn.style.display = "block";
    extraBtn.textContent = extraAction.text;
    extraBtn.onclick = extraAction.action;
  } else {
    extraBtn.style.display = "none";
    extraBtn.onclick = null;
  }

  document.getElementById("popup").classList.add("active");
}

window.closePopup = function(){
  document.getElementById("popup").classList.remove("active");
};

/* NAVIGATION */
window.goBack = function(){
  window.location.href = "index.html";
};

/* THEME */
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
};

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

window.togglePassword = function(id){
  const input = document.getElementById(id);
  if (!input) return;
  input.type = input.type === "password" ? "text" : "password";
};

loadSavedTheme();
