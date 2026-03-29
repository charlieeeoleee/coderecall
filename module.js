import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

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
   AUTH CHECK
========================= */
onAuthStateChanged(auth, (user) => {
  const isGuest = localStorage.getItem("guest");

  if(!user && !isGuest){
    window.location.href = "auth.html";
  }
});

/* =========================
   GET PARAMETERS
========================= */
const params = new URLSearchParams(window.location.search);
const subject = params.get("subject");
const moduleName = params.get("module");

/* =========================
   MODULE DATA (EDIT HERE)
========================= */
const modules = {

  hardware: {
    module1: {
      title: "CPU Basics",
      content: "The CPU (Central Processing Unit) is the brain of the computer. It processes instructions and performs calculations."
    },
    module2: {
      title: "RAM Basics",
      content: "RAM (Random Access Memory) stores temporary data used by programs while running."
    }
  },

  circuits: {
    module1: {
      title: "Electric Current",
      content: "Electric current is the flow of electric charge through a conductor."
    },
    module2: {
      title: "Voltage",
      content: "Voltage is the difference in electrical potential between two points."
    }
  }

};

/* =========================
   LOAD MODULE
========================= */
const data = modules[subject]?.[moduleName];

if(!data){
  document.getElementById("title").textContent = "Module not found";
}else{
  document.getElementById("title").textContent = data.title;
  document.getElementById("content").textContent = data.content;
}

/* =========================
   START QUIZ
========================= */
window.startQuiz = function(){
  const quizType = moduleName.replace("module","quiz");
  window.location.href = `quiz.html?subject=${subject}&type=${quizType}`;
}

/* =========================
   THEME SYSTEM
========================= */
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
}

function updateIcon(){
  const icon = document.getElementById("themeIcon");

  if(document.body.classList.contains("light-mode")){
    icon.textContent = "☀️";
  } else {
    icon.textContent = "🌙";
  }
}

/* RUN */
loadTheme();