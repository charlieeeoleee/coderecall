// ===============================
// GLOBAL STATE
// ===============================
let sounds = {};
let hasUserInteracted = false;
let hasStartedMusic = false;
let currentMusicVolume = 1;

// ===============================
// LOAD SOUNDS
// ===============================
function loadSound(name, loop = false) {
  const audio = new Audio(`assets/sounds/${name}.mp3`);
  audio.preload = "auto";
  audio.loop = loop;
  return audio;
}

export function initSounds() {
  sounds = {
    click: loadSound("click"),
    correct: loadSound("correct"),
    wrong: loadSound("wrong"),
    completion: loadSound("completion"),
    badge: loadSound("badge"),
    master: loadSound("master-badge"),
    confetti: loadSound("confetti"),
    full: loadSound("full-completion"),

    bgLight: loadSound("bg-light", true),
    bgDark: loadSound("bg-dark", true),
  };

  sounds.bgLight.volume = currentMusicVolume;
  sounds.bgDark.volume = currentMusicVolume;
}

// ===============================
// UTIL
// ===============================
function isSoundEnabled() {
  return localStorage.getItem("soundEnabled") !== "false";
}

function markUserInteraction() {
  hasUserInteracted = true;
}

function applyMusicVolume(volume) {
  currentMusicVolume = volume;

  if (sounds.bgLight) sounds.bgLight.volume = volume;
  if (sounds.bgDark) sounds.bgDark.volume = volume;
}

// ===============================
// PLAY SOUND (NO DELAY FIX)
// ===============================
export function playSound(name) {
  if (!isSoundEnabled()) return;

  const original = sounds[name];
  if (!original) return;

  const clone = original.cloneNode();
  clone.volume = original.volume;
  clone.play().catch(() => {});
}

// ===============================
// CLICK SOUND (GLOBAL)
// ===============================
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
      target.closest(".subject-card") ||
      target.closest(".badge-card") ||
      target.closest(".achievement-card") ||
      target.closest(".theme-toggle");

    const noClickSound = target.closest(".no-click-sound");

    if (isClickable && !noClickSound) {
      playSound("click");
    }
  });
}

// ===============================
// THEME MUSIC CORE
// ===============================
function getCurrentThemeMusic() {
  return document.body.classList.contains("light-mode")
    ? sounds.bgLight
    : sounds.bgDark;
}

function stopAllThemeMusic() {
  sounds.bgLight.pause();
  sounds.bgLight.currentTime = 0;

  sounds.bgDark.pause();
  sounds.bgDark.currentTime = 0;
}

// ===============================
// PLAY THEME MUSIC
// ===============================
export function playThemeMusic(forceRestart = false) {
  if (!isSoundEnabled()) {
    stopAllThemeMusic();
    return Promise.reject();
  }

  const audio = getCurrentThemeMusic();

  if (forceRestart) {
    stopAllThemeMusic();
    audio.currentTime = 0;
  }

  audio.volume = currentMusicVolume;
  return audio.play();
}

// ===============================
// RESTART
// ===============================
export function restartThemeMusic() {
  if (!isSoundEnabled()) return;

  stopAllThemeMusic();

  const audio = getCurrentThemeMusic();
  audio.currentTime = 0;
  audio.volume = currentMusicVolume;
  audio.play().catch(() => {});
}

// ===============================
// STOP MUSIC
// ===============================
export function stopThemeMusic() {
  stopAllThemeMusic();
}

// ===============================
// AUTO START MUSIC
// ===============================
export function tryStartMusic() {
  if (hasStartedMusic) return;

  playThemeMusic(true)
    .then(() => {
      hasStartedMusic = true;
    })
    .catch(() => {
      document.addEventListener(
        "click",
        () => {
          if (!hasStartedMusic) {
            playThemeMusic(true);
            hasStartedMusic = true;
          }
        },
        { once: true }
      );
    });
}

// ===============================
// MUSIC DUCKING FOR MODALS
// ===============================
export function lowerThemeMusic(volume = 0.15) {
  applyMusicVolume(volume);
}

export function restoreThemeMusic() {
  applyMusicVolume(1);
}

// ===============================
// SETTINGS TOGGLE INTEGRATION
// ===============================
export function handleSoundToggle(enabled) {
  localStorage.setItem("soundEnabled", enabled ? "true" : "false");

  if (!enabled) {
    stopAllThemeMusic();
  } else {
    tryStartMusic();
  }
}