const STORAGE_KEYS = {
  soundEnabled: "soundEnabled",
  musicEnabled: "musicEnabled",
  musicTime: "themeMusicTime",
  musicTrack: "themeMusicTrack",
  musicPlaying: "themeMusicPlaying",
  musicVolume: "themeMusicVolume"
};

let sounds = {};
let clickSoundInitialized = false;
let themeMusic = null;
let musicResumeTimer = null;

function loadSound(name, volume = 1) {
  const audio = new Audio(`assets/sounds/${name}.mp3`);
  audio.preload = "auto";
  audio.volume = volume;
  return audio;
}

function getThemeTrackName() {
  const isLight = document.body.classList.contains("light-mode");
  return isLight ? "bg-light" : "bg-dark";
}

function getSavedMusicTime() {
  const value = parseFloat(sessionStorage.getItem(STORAGE_KEYS.musicTime) || "0");
  return Number.isFinite(value) ? value : 0;
}

function saveMusicTime() {
  if (!themeMusic) return;
  sessionStorage.setItem(STORAGE_KEYS.musicTime, String(themeMusic.currentTime || 0));
}

function saveMusicState() {
  if (!themeMusic) return;

  sessionStorage.setItem(STORAGE_KEYS.musicTrack, getThemeTrackName());
  sessionStorage.setItem(STORAGE_KEYS.musicPlaying, String(!themeMusic.paused));
  sessionStorage.setItem(STORAGE_KEYS.musicVolume, String(themeMusic.volume ?? 0.35));
  saveMusicTime();
}

function clearMusicResumeTimer() {
  if (musicResumeTimer) {
    clearInterval(musicResumeTimer);
    musicResumeTimer = null;
  }
}

function startMusicStateSync() {
  clearMusicResumeTimer();

  musicResumeTimer = setInterval(() => {
    saveMusicState();
  }, 500);
}

function stopMusicStateSync() {
  clearMusicResumeTimer();
  saveMusicState();
}

function createThemeMusic() {
  const trackName = getThemeTrackName();
  const audio = new Audio(`assets/sounds/${trackName}.mp3`);
  audio.loop = true;
  audio.preload = "auto";
  audio.volume = parseFloat(sessionStorage.getItem(STORAGE_KEYS.musicVolume) || "0.35");

  const savedTrack = sessionStorage.getItem(STORAGE_KEYS.musicTrack);
  const savedTime = getSavedMusicTime();

  if (savedTrack === trackName && savedTime > 0) {
    try {
      audio.currentTime = savedTime;
    } catch {
      // ignore seek issue
    }
  } else {
    sessionStorage.setItem(STORAGE_KEYS.musicTime, "0");
  }

  audio.addEventListener("timeupdate", saveMusicTime);
  audio.addEventListener("pause", saveMusicState);
  audio.addEventListener("play", saveMusicState);
  audio.addEventListener("ended", saveMusicState);

  themeMusic = audio;
  return themeMusic;
}

function canPlayMusic() {
  return localStorage.getItem(STORAGE_KEYS.musicEnabled) !== "false";
}

function canPlaySounds() {
  return localStorage.getItem(STORAGE_KEYS.soundEnabled) !== "false";
}

export function initSounds() {
  sounds = {
    badge: loadSound("badge", 0.8),
    master: loadSound("master-badge", 0.9),
    full: loadSound("full-completion", 0.95),
    completion: loadSound("completion", 0.85),
    confetti: loadSound("confetti", 0.75),
    click: loadSound("click", 0.45),
    correct: loadSound("correct", 0.75),
    wrong: loadSound("wrong", 0.75)
  };

  if (!themeMusic) {
    createThemeMusic();
  }

  window.addEventListener("beforeunload", () => {
    stopMusicStateSync();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      saveMusicState();
    }
  });
}

export function playSound(name) {
  if (!canPlaySounds()) return;
  if (!sounds[name]) return;

  try {
    const instance = sounds[name].cloneNode();
    instance.volume = sounds[name].volume;
    instance.play().catch(() => {});
  } catch {
    // ignore playback issues
  }
}

export function initGlobalClickSound() {
  if (clickSoundInitialized) return;
  clickSoundInitialized = true;

  document.addEventListener("click", (e) => {
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;

    const clickable = target.closest("button, a, .badge-card, .top-player, .rank-item, .subject-card, .module-card");
    if (!clickable) return;

    playSound("click");
  });
}

export async function tryStartMusic() {
  if (!canPlayMusic()) return;

  if (!themeMusic) {
    createThemeMusic();
  }

  if (!themeMusic) return;

  const savedTrack = sessionStorage.getItem(STORAGE_KEYS.musicTrack);
  const currentTrack = getThemeTrackName();
  const savedTime = getSavedMusicTime();

  if (savedTrack === currentTrack && savedTime > 0 && Math.abs(themeMusic.currentTime - savedTime) > 0.5) {
    try {
      themeMusic.currentTime = savedTime;
    } catch {
      // ignore seek issues
    }
  }

  try {
    await themeMusic.play();
    sessionStorage.setItem(STORAGE_KEYS.musicPlaying, "true");
    saveMusicState();
    startMusicStateSync();
  } catch {
    // browser autoplay blocked
  }
}

export function restartThemeMusic() {
  const shouldResume = sessionStorage.getItem(STORAGE_KEYS.musicPlaying) !== "false";

  stopMusicStateSync();

  let currentTime = getSavedMusicTime();
  let currentVolume = 0.35;

  if (themeMusic) {
    currentVolume = themeMusic.volume || 0.35;
    try {
      themeMusic.pause();
    } catch {
      // ignore
    }
  }

  const oldMusic = themeMusic;
  themeMusic = null;

  if (oldMusic) {
    oldMusic.src = "";
  }

  createThemeMusic();

  if (themeMusic) {
    themeMusic.volume = currentVolume;
    try {
      themeMusic.currentTime = currentTime;
    } catch {
      // ignore
    }
  }

  sessionStorage.setItem(STORAGE_KEYS.musicTrack, getThemeTrackName());
  sessionStorage.setItem(STORAGE_KEYS.musicTime, String(currentTime));

  if (shouldResume && canPlayMusic()) {
    tryStartMusic();
  } else {
    saveMusicState();
  }
}

export function lowerThemeMusic(volume = 0.08) {
  if (!themeMusic) return;
  themeMusic.volume = volume;
  saveMusicState();
}

export function restoreThemeMusic() {
  if (!themeMusic) return;

  let savedVolume = parseFloat(sessionStorage.getItem(STORAGE_KEYS.musicVolume) || "0.35");

  if (!Number.isFinite(savedVolume) || savedVolume <= 0.1) {
    savedVolume = 0.35;
  }

  themeMusic.volume = savedVolume;
  saveMusicState();
}

export function handleSoundToggle(enabled) {
  localStorage.setItem(STORAGE_KEYS.soundEnabled, enabled ? "true" : "false");
}

export function handleMusicToggle(enabled) {
  localStorage.setItem(STORAGE_KEYS.musicEnabled, enabled ? "true" : "false");

  if (!themeMusic) {
    createThemeMusic();
  }

  if (enabled) {
    tryStartMusic();
  } else if (themeMusic) {
    themeMusic.pause();
    sessionStorage.setItem(STORAGE_KEYS.musicPlaying, "false");
    saveMusicState();
    stopMusicStateSync();
  }
}

export function stopThemeMusic() {
  if (!themeMusic) return;
  themeMusic.pause();
  sessionStorage.setItem(STORAGE_KEYS.musicPlaying, "false");
  saveMusicState();
  stopMusicStateSync();
}

export function getThemeMusic() {
  return themeMusic;
}

window.playSound = playSound;