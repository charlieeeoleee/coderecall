const params = new URLSearchParams(window.location.search);
const subject = params.get("subject") || "electrical";

/* =========================
   SUBJECT LABELS
========================= */
const subjectMeta = {
  electrical: {
    title: "ELECTRICAL",
    desc: "Take the pre-test, study the modules, answer quizzes, and finish the post-test."
  },
  hardware: {
    title: "HARDWARE",
    desc: "Take the pre-test, study the modules, answer quizzes, and finish the post-test."
  }
};

const meta = subjectMeta[subject] || {
  title: subject.toUpperCase(),
  desc: "Choose what you want to open."
};

document.getElementById("subjectTitle").textContent = meta.title;
document.getElementById("subjectDesc").textContent = meta.desc;

/* =========================
   NAVIGATION
========================= */
function goBack(){
  window.location.href = "dashboard.html";
}

function openPretest(){
  window.location.href = `quiz.html?subject=${subject}&level=easy&type=pretest`;
}

function openModules(){
  window.location.href = `modules.html?subject=${subject}&level=easy`;
}

function openQuizzes(){
  window.location.href = `quiz-select.html?subject=${subject}&level=easy`;
}

function openPosttest(){
  window.location.href = `quiz.html?subject=${subject}&level=easy&type=posttest`;
}

/* =========================
   LOCK STATE
========================= */
function getProgressKey(name){
  return `${subject}_${name}`;
}

function unlockButton(buttonId){
  const btn = document.getElementById(buttonId);
  btn.classList.remove("locked");
  const badge = btn.querySelector(".lock-badge");
  if(badge) badge.remove();
}

function loadProgress(){
  const pretestDone = localStorage.getItem(getProgressKey("pretest")) === "true";
  const modulesDone = localStorage.getItem(getProgressKey("modules")) === "true";
  const quizzesDone = localStorage.getItem(getProgressKey("quizzes")) === "true";

  if(pretestDone){
    unlockButton("modulesBtn");
  }

  if(modulesDone){
    unlockButton("quizzesBtn");
  }

  if(quizzesDone){
    unlockButton("posttestBtn");
  }
}

/* =========================
   THEME
========================= */
function loadTheme(){
  const saved = localStorage.getItem("theme");
  if(saved === "light"){
    document.body.classList.add("light-mode");
  }
  updateIcon();
}

function toggleTheme(){
  document.body.classList.toggle("light-mode");
  const mode = document.body.classList.contains("light-mode") ? "light" : "dark";
  localStorage.setItem("theme", mode);
  updateIcon();
}

function updateIcon(){
  const icon = document.getElementById("themeIcon");
  if(!icon) return;
  icon.textContent = document.body.classList.contains("light-mode") ? "☀️" : "🌙";
}

loadTheme();
loadProgress();