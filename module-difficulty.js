import {
  initSounds,
  initGlobalClickSound,
  tryStartMusic,
  restartThemeMusic
} from "./sound.js";

const params = new URLSearchParams(window.location.search);
const subject = params.get("subject") || "electrical";

const subjectTitles = {
  electrical: "Electrical Module Difficulty",
  hardware: "Computer Hardware Module Difficulty"
};

const subjectDescriptions = {
  electrical: "Choose the difficulty for the Electrical modules before opening the lessons.",
  hardware: "Choose the difficulty for the Computer Hardware modules before opening the lessons."
};

document.getElementById("difficultyTitle").textContent =
  subjectTitles[subject] || "Choose Module Difficulty";

document.getElementById("difficultySubtitle").textContent =
  subjectDescriptions[subject] || "Select a difficulty before opening the modules.";

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
  window.location.href = `module-levels.html?subject=${subject}&difficulty=${difficulty}`;
};

function unlockDifficultyIfReady() {
  const mediumBtn = document.getElementById("mediumBtn");
  const hardBtn = document.getElementById("hardBtn");

  const easyDone = localStorage.getItem(`${subject}_easy_modules_done`) === "true";
  const mediumDone = localStorage.getItem(`${subject}_medium_modules_done`) === "true";

  if (easyDone) {
    mediumBtn.classList.remove("locked");
    mediumBtn.onclick = () => openDifficulty("medium");
    mediumBtn.querySelector("p").textContent = "More advanced lessons and deeper understanding.";
  }

  if (mediumDone) {
    hardBtn.classList.remove("locked");
    hardBtn.onclick = () => openDifficulty("hard");
    hardBtn.querySelector("p").textContent = "Advanced and challenging lessons for mastery.";
  }
}

loadTheme();
unlockDifficultyIfReady();

initSounds();
initGlobalClickSound();
tryStartMusic();

document.body.addEventListener("click", () => {
  tryStartMusic();
}, { once: true });
