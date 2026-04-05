import {
  initSounds,
  initGlobalClickSound,
  tryStartMusic,
  restartThemeMusic
} from "./sound.js";

const params = new URLSearchParams(window.location.search);
const subject = params.get("subject") || "electrical";

window.selectDifficulty = function (difficulty) {
  window.location.href = `quiz-levels.html?subject=${subject}&difficulty=${difficulty}`;
}

const subjectTitles = {
  electrical: "Electrical Quiz Difficulty",
  hardware: "Computer Hardware Quiz Difficulty"
};

const subjectDescriptions = {
  electrical: "Choose the difficulty for the Electrical quiz before opening the levels.",
  hardware: "Choose the difficulty for the Computer Hardware quiz before opening the levels."
};

document.getElementById("difficultyTitle").textContent =
  subjectTitles[subject] || "Choose Difficulty";

document.getElementById("difficultySubtitle").textContent =
  subjectDescriptions[subject] || "Select a difficulty before starting the quiz.";

function updateIcon() {
  const icon = document.getElementById("themeIcon");
  if (!icon) return;
  icon.textContent = document.body.classList.contains("light-mode") ? "☀️" : "🌙";
}

function loadTheme() {
  const saved = localStorage.getItem("theme");
  if (saved === "light") {
    document.body.classList.add("light-mode");
  }
  updateIcon();
}

window.toggleTheme = function () {
  document.body.classList.toggle("light-mode");
  const mode = document.body.classList.contains("light-mode") ? "light" : "dark";
  localStorage.setItem("theme", mode);
  updateIcon();
  restartThemeMusic();
};

window.goBack = function () {
  window.location.href = `subject.html?subject=${subject}`;
};

window.openDifficulty = function (difficulty) {
  window.location.href = `quiz-levels.html?subject=${subject}&difficulty=${difficulty}`;
};

loadTheme();

initSounds();
initGlobalClickSound();
tryStartMusic();

document.body.addEventListener("click", () => {
  tryStartMusic();
}, { once: true });
