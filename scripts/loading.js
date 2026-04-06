(function () {
  const THEME_TOGGLE_STYLE_ID = "global-theme-toggle-style";
  const NAVIGATION_ACTIONS = [
    "goToAuth",
    "goToHome",
    "goHome",
    "goDashboard",
    "goToLeaderboard",
    "goToAbout",
    "playGuest",
    "startGame",
    "openSubject",
    "openPretest",
    "openModules",
    "openQuiz",
    "openPosttest",
    "openDifficulty",
    "goBack",
    "goBackToDifficulty",
    "goBackToLevels",
    "goBackToSubject",
    "goToNextDifficulty",
    "startQuiz",
    "finishLevelFlow",
    "finishQuizFlow",
    "logout",
    "confirmGuestLogout"
  ];

  let overlay = null;
  let messageEl = null;
  let progressFill = null;
  let progressTimer = null;
  let autoHideTimer = null;
  let overlayVisible = false;

  function ensureThemeToggleStyle() {
    if (document.getElementById(THEME_TOGGLE_STYLE_ID)) return;

    const style = document.createElement("style");
    style.id = THEME_TOGGLE_STYLE_ID;
    style.textContent = `
      .theme-toggle,
      .difficulty-theme-toggle,
      .levels-theme-toggle,
      .module-theme-toggle,
      .quiz-theme-toggle,
      .level-theme-toggle,
      .subject-theme-toggle {
        position: fixed !important;
        right: 18px !important;
        bottom: 18px !important;
        width: 56px !important;
        height: 56px !important;
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        border: none !important;
        border-radius: 18px !important;
        background: linear-gradient(135deg, #ff2e97 0%, #7c6cf2 52%, #22d3ee 100%) !important;
        box-shadow: 0 0 26px rgba(34, 211, 238, 0.28) !important;
        color: #ffe082 !important;
        cursor: pointer !important;
        transition: transform 0.2s ease, box-shadow 0.2s ease, filter 0.2s ease !important;
        z-index: 1200 !important;
        padding: 0 !important;
      }

      .theme-toggle:hover,
      .difficulty-theme-toggle:hover,
      .levels-theme-toggle:hover,
      .module-theme-toggle:hover,
      .quiz-theme-toggle:hover,
      .level-theme-toggle:hover,
      .subject-theme-toggle:hover {
        transform: translateY(-2px) scale(1.03) !important;
        box-shadow: 0 0 32px rgba(34, 211, 238, 0.36) !important;
        filter: brightness(1.04) !important;
      }

      .theme-toggle:active,
      .difficulty-theme-toggle:active,
      .levels-theme-toggle:active,
      .module-theme-toggle:active,
      .quiz-theme-toggle:active,
      .level-theme-toggle:active,
      .subject-theme-toggle:active {
        transform: translateY(0) scale(0.98) !important;
      }

      .theme-toggle #themeIcon,
      .difficulty-theme-toggle #themeIcon,
      .levels-theme-toggle #themeIcon,
      .module-theme-toggle #themeIcon,
      .quiz-theme-toggle #themeIcon,
      .level-theme-toggle #themeIcon,
      .subject-theme-toggle #themeIcon {
        font-size: 24px !important;
        line-height: 1 !important;
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
      }

      body.light-mode .theme-toggle,
      body.light-mode .difficulty-theme-toggle,
      body.light-mode .levels-theme-toggle,
      body.light-mode .module-theme-toggle,
      body.light-mode .quiz-theme-toggle,
      body.light-mode .level-theme-toggle,
      body.light-mode .subject-theme-toggle {
        background: linear-gradient(135deg, #ff2e97 0%, #7c6cf2 52%, #22d3ee 100%) !important;
        color: #ffe082 !important;
      }
    `;

    document.head.appendChild(style);
  }

  function ensureLoader() {
    if (overlay) return;

    ensureThemeToggleStyle();

    const style = document.createElement("style");
    style.textContent = `
      .app-loader-overlay {
        position: fixed;
        inset: 0;
        display: grid;
        place-items: center;
        background:
          radial-gradient(circle at top, rgba(41, 201, 255, 0.2), transparent 30%),
          radial-gradient(circle at bottom, rgba(255, 76, 172, 0.18), transparent 28%),
          rgba(11, 15, 34, 0.88);
        backdrop-filter: blur(14px);
        z-index: 99999;
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.25s ease;
      }

      .app-loader-overlay.active {
        opacity: 1;
        pointer-events: auto;
      }

      .app-loader-card {
        width: min(420px, calc(100vw - 32px));
        border-radius: 28px;
        padding: 28px 26px 24px;
        background: linear-gradient(180deg, rgba(27, 34, 64, 0.96), rgba(20, 24, 48, 0.96));
        border: 1px solid rgba(120, 202, 255, 0.18);
        box-shadow: 0 24px 60px rgba(0, 0, 0, 0.35);
        color: #f5f7ff;
        text-align: center;
      }

      .app-loader-badge {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 16px;
        padding: 8px 14px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.06);
        color: #a6dfff;
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      .app-loader-title {
        margin: 0;
        font-size: clamp(24px, 4vw, 34px);
        font-weight: 800;
        line-height: 1.1;
      }

      .app-loader-text {
        margin: 12px 0 20px;
        color: rgba(235, 241, 255, 0.82);
        font-size: 15px;
        line-height: 1.6;
      }

      .app-loader-spinner {
        width: 72px;
        height: 72px;
        margin: 0 auto 18px;
        border-radius: 50%;
        position: relative;
        background: conic-gradient(from 0deg, #22d3ee, #7c3aed, #ff4cac, #22d3ee);
        animation: app-loader-spin 1.05s linear infinite;
      }

      .app-loader-spinner::before {
        content: "";
        position: absolute;
        inset: 9px;
        border-radius: 50%;
        background: #12172f;
        box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.06);
      }

      .app-loader-progress {
        width: 100%;
        height: 10px;
        border-radius: 999px;
        overflow: hidden;
        background: rgba(255, 255, 255, 0.08);
      }

      .app-loader-progress-fill {
        width: 18%;
        height: 100%;
        border-radius: inherit;
        background: linear-gradient(90deg, #ff8c00, #ff2e97, #22d3ee);
        transition: width 0.35s ease;
      }

      .app-loader-tip {
        margin-top: 14px;
        font-size: 12px;
        color: rgba(196, 207, 238, 0.72);
        letter-spacing: 0.02em;
      }

      @keyframes app-loader-spin {
        to {
          transform: rotate(360deg);
        }
      }
    `;
    document.head.appendChild(style);

    overlay = document.createElement("div");
    overlay.className = "app-loader-overlay";
    overlay.setAttribute("aria-hidden", "true");
    overlay.innerHTML = `
      <div class="app-loader-card" role="status" aria-live="polite">
        <div class="app-loader-badge">System Loading</div>
        <div class="app-loader-spinner"></div>
        <h2 class="app-loader-title">Preparing the next screen</h2>
        <p class="app-loader-text">Loading your progress, visuals, and lesson state. This will only take a moment.</p>
        <div class="app-loader-progress">
          <div class="app-loader-progress-fill"></div>
        </div>
        <div class="app-loader-tip">Please wait while we bring everything in.</div>
      </div>
    `;

    document.body.appendChild(overlay);
    messageEl = overlay.querySelector(".app-loader-text");
    progressFill = overlay.querySelector(".app-loader-progress-fill");
  }

  ensureThemeToggleStyle();

  function startFakeProgress() {
    if (!progressFill) return;
    clearInterval(progressTimer);
    let width = 18;
    progressFill.style.width = `${width}%`;

    progressTimer = setInterval(() => {
      if (width >= 86) {
        clearInterval(progressTimer);
        progressTimer = null;
        return;
      }

      width += Math.max(2, Math.round((88 - width) / 6));
      progressFill.style.width = `${Math.min(width, 86)}%`;
    }, 180);
  }

  function stopFakeProgress() {
    clearInterval(progressTimer);
    progressTimer = null;
    clearTimeout(autoHideTimer);
    autoHideTimer = null;
    if (progressFill) {
      progressFill.style.width = "100%";
    }
  }

  function showLoader(message) {
    ensureLoader();
    if (!overlay || overlayVisible) return;

    overlayVisible = true;
    if (messageEl && message) {
      messageEl.textContent = message;
    }

    overlay.classList.add("active");
    overlay.setAttribute("aria-hidden", "false");
    startFakeProgress();
    autoHideTimer = window.setTimeout(() => {
      hideLoader();
    }, 1600);
  }

  function hideLoader() {
    if (!overlay || !overlayVisible) return;

    stopFakeProgress();
    overlay.classList.remove("active");
    overlay.setAttribute("aria-hidden", "true");
    overlayVisible = false;
  }

  function navigateWithLoader(url, options = {}) {
    const { delay = 120, message } = options;
    showLoader(message);
    window.setTimeout(() => {
      window.location.href = url;
    }, delay);
  }

  function isNavigationClick(target) {
    if (!(target instanceof HTMLElement)) return false;

    const anchor = target.closest("a[href]");
    if (anchor instanceof HTMLAnchorElement) {
      const href = anchor.getAttribute("href") || "";
      if (!href || href.startsWith("#") || href.startsWith("javascript:")) {
        return false;
      }
      return true;
    }

    const clickable = target.closest("button, [onclick]");
    if (!(clickable instanceof HTMLElement)) return false;

    const handler = clickable.getAttribute("onclick") || "";
    if (!handler) return false;

    return NAVIGATION_ACTIONS.some((action) => handler.includes(action)) ||
      handler.includes("window.location") ||
      handler.includes("location.href");
  }

  document.addEventListener("click", (event) => {
    if (event.defaultPrevented) return;
    if (event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

    if (isNavigationClick(event.target)) {
      showLoader();
    }
  }, true);

  window.addEventListener("pageshow", hideLoader);
  window.addEventListener("load", hideLoader);

  window.showAppLoader = showLoader;
  window.hideAppLoader = hideLoader;
  window.navigateWithLoader = navigateWithLoader;
})();
