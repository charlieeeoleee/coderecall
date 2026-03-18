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
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_AUTH_DOMAIN",
  projectId: "YOUR_PROJECT_ID"
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