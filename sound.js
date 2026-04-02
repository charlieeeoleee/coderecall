// ==========================
// GLOBAL SOUND SYSTEM
// ==========================

// ---------- SOUND PATHS ----------
const soundPaths = {
  click: "assets/sounds/click.mp3",
  correct: "assets/sounds/correct.mp3",
  wrong: "assets/sounds/wrong.mp3",
  badge: "assets/sounds/badge.mp3",
  master: "assets/sounds/master-badge.mp3",
  completion: "assets/sounds/completion.mp3",
  fullCompletion: "assets/sounds/full-completion.mp3",
  confetti: "assets/sounds/confetti.mp3"
};

// ---------- PRELOADED ONE-SHOT SOUNDS ----------
const sounds = {};
for (const [key, path] of Object.entries(soundPaths)) {
  const audio = new Audio(path);
  audio.preload = "auto";
  sounds[key] = audio;
}

// ---------- THEME MUSIC ----------
const bgLight = new Audio("assets/sounds/bg-light.mp3");
const bgDark = new Audio("assets/sounds/bg-dark.mp3");

bgLight.loop = true;
bgDark.loop = true;
bgLight.preload = "auto";
bgDark.preload = "auto";

let themeMusicInitialized = false;
let userInteracted = false;

// ==========================
// HELPERS
// ==========================
function isSoundEnabled() {
  return localStorage.getItem("soundEnabled") !== "false";
}

function markUserInteraction() {
  userInteracted = true;
}

function stopAudio(audio) {
  audio.pause();
  audio.currentTime = 0;
}

function stopAllThemeMusic() {
  stopAudio(bgLight);
  stopAudio(bgDark);
}

function getActiveThemeMusic() {
  return document.body.classList.contains("light-mode") ? bgLight : bgDark;
}

function getInactiveThemeMusic() {
  return document.body.classList.contains("light-mode") ? bgDark : bgLight;
}

// ==========================
// ONE-SHOT SOUND PLAYER
// Faster click response using cloned audio
// ==========================
export function playSound(type) {
  if (!isSoundEnabled()) return;

  const original = sounds[type];
  if (!original) return;

  const clone = original.cloneNode();
  clone.volume = original.volume;
  clone.play().catch(() => {});
}

// ==========================
// CLICK SOUND
// ==========================
export function initGlobalClickSound() {
  document.addEventListener("click", (e) => {
    markUserInteraction();

    if (!isSoundEnabled()) return;

    const target = e.target;
    if (!target) return;

    const isClickable =
      target.tagName === "BUTTON" ||
      target.tagName === "A" ||
      target.tagName === "INPUT" ||
      target.tagName === "LABEL" ||
      target.closest("button") ||
      target.closest("a") ||
      target.closest("label") ||
      target.closest(".switch") ||
      target.closest(".slider") ||
      target.closest(".badge-card") ||
      target.closest(".achievement-card") ||
      target.closest(".theme-toggle");

    const noClickSound = target.closest(".no-click-sound");

    if (isClickable && !noClickSound) {
      playSound("click");
    }
  });
}

// ==========================
// THEME MUSIC
// ==========================
export function playThemeMusic(forceRestart = false) {
  if (!isSoundEnabled()) {
    stopAllThemeMusic();
    return;
  }

  if (!userInteracted) return;

  const active = getActiveThemeMusic();
  const inactive = getInactiveThemeMusic();

  // always stop the opposite track immediately
  inactive.pause();
  inactive.currentTime = 0;

  if (forceRestart) {
    active.pause();
    active.currentTime = 0;
  }

  if (active.paused) {
    active.play().catch(() => {});
  }
}

export function stopThemeMusic() {
  stopAllThemeMusic();
}

export function restartThemeMusic() {
  stopAllThemeMusic();
  playThemeMusic(true);
}

// ==========================
// INIT THEME MUSIC
// Start only after first user interaction
// ==========================
export function initThemeMusic() {
  if (themeMusicInitialized) return;
  themeMusicInitialized = true;

  const startMusic = () => {
    markUserInteraction();
    playThemeMusic(true);
  };

  document.addEventListener("click", startMusic, { once: true });
  document.addEventListener("keydown", startMusic, { once: true });
  document.addEventListener("touchstart", startMusic, { once: true });
}

// ==========================
// BADGE / COMPLETION HELPERS
// ==========================
export function playBadgeSound(isMaster = false) {
  playSound(isMaster ? "master" : "badge");
}

export function playCompletionSound(isFullCompletion = false) {
  playSound(isFullCompletion ? "fullCompletion" : "completion");
}

export function playConfettiSound() {
  playSound("confetti");
}

// ==========================
// SETTINGS INTEGRATION
// ==========================
export function handleSoundToggle(enabled) {
  localStorage.setItem("soundEnabled", enabled ? "true" : "false");

  if (enabled) {
    playThemeMusic(true);
  } else {
    stopThemeMusic();
  }
}