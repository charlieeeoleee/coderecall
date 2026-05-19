(function () {
  const THEME_TOGGLE_STYLE_ID = "global-theme-toggle-style";
  const ACCESSIBILITY_STYLE_ID = "global-accessibility-preferences-style";
  const ACCESSIBILITY_SKIP_LINK_ID = "accessibilitySkipLink";
  const NARRATION_FLOATING_BUTTON_ID = "codeRecallNarrationButton";
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
  let narrationPaused = false;
  let currentNarrationText = "";
  let currentNarrationWords = [];
  let currentNarrationWordIndex = 0;
  let narrationHighlightTimer = null;
  let narrationRestoreRecords = [];
  const PERFORMANCE_LOG_KEY = "codeRecallPerfLogs";
  const PERFORMANCE_LOG_LIMIT = 30;

  const PROTECTED_CONTENT_PATHS = new Set([
    "module.html",
    "quiz.html",
    "quiz-level.html"
  ]);

  const PROTECTED_CONTENT_SELECTORS = [
    ".module-page",
    ".quiz-page",
    ".level-page",
    ".module-image-modal"
  ].join(",");

  const INTERACTIVE_CONTENT_SELECTORS = [
    "input",
    "textarea",
    "select",
    "button",
    "a",
    "label",
    "[contenteditable='true']",
    ".theme-toggle",
    ".sound-toggle-panel",
    ".module-actions",
    ".quiz-actions",
    ".level-actions",
    ".module-progress-rail"
  ].join(",");

  function readBooleanPreference(key, fallback) {
    const value = localStorage.getItem(key);
    if (value == null) return fallback;
    return value === "true";
  }

  function readNumberPreference(key, fallback, min, max) {
    const value = Number(localStorage.getItem(key));
    if (!Number.isFinite(value)) return fallback;
    return Math.min(max, Math.max(min, value));
  }

  function normalizeVisualDisplayPreferences() {
    const migrationKey = "visualPreferencesVersion";
    const currentVersion = "normal-default-20260519";
    if (localStorage.getItem(migrationKey) === currentVersion) return;

    const savedBrightness = Number(localStorage.getItem("visualBrightness"));
    const savedContrast = Number(localStorage.getItem("visualContrast"));
    const hasLegacyBrightness = Number.isFinite(savedBrightness) && savedBrightness <= 0.75;
    const hasLegacyContrast = Number.isFinite(savedContrast) && savedContrast <= 0.8;

    if (hasLegacyBrightness || hasLegacyContrast) {
      localStorage.setItem("visualBrightness", "1");
      localStorage.setItem("visualContrast", "1");
    }
    localStorage.setItem(migrationKey, currentVersion);
  }

  function getTextSizePreference() {
    const value = localStorage.getItem("textSizePreference") || "normal";
    return ["normal", "large", "extra-large"].includes(value) ? value : "normal";
  }

  function ensureAccessibilityStyle() {
    if (document.getElementById(ACCESSIBILITY_STYLE_ID)) return;

    const style = document.createElement("style");
    style.id = ACCESSIBILITY_STYLE_ID;
    style.textContent = `
      .accessibility-skip-link {
        position: fixed;
        top: 14px;
        left: 14px;
        z-index: 100000;
        transform: translateY(-180%);
        padding: 12px 16px;
        border-radius: 12px;
        background: #00ffcc;
        color: #081228;
        font: 700 14px/1.2 "Poppins", Arial, sans-serif;
        text-decoration: none;
        box-shadow: 0 12px 30px rgba(0, 0, 0, 0.28);
        transition: transform 0.2s ease;
      }

      .accessibility-skip-link:focus {
        transform: translateY(0);
        outline: 4px solid #fff;
        outline-offset: 3px;
      }

      body.access-text-large {
        font-size: 116%;
      }

      body.access-text-extra-large {
        font-size: 130%;
      }

      body.access-text-large :where(button, input, select, textarea, a, p, li, label) {
        font-size: max(1em, 15px);
      }

      body.access-text-extra-large :where(button, input, select, textarea, a, p, li, label) {
        font-size: max(1em, 18px);
      }

      body.access-text-extra-large :where(h1, .page-title) {
        font-size: max(1em, 42px);
      }

      body.access-text-extra-large :where(h2, h3) {
        font-size: max(1em, 28px);
      }

      body.access-high-contrast {
        color: #fff;
      }

      body.access-high-contrast a:focus-visible,
      body.access-high-contrast button:focus-visible,
      body.access-high-contrast input:focus-visible,
      body.access-high-contrast select:focus-visible,
      body.access-screen-reader-assist a:focus-visible,
      body.access-screen-reader-assist button:focus-visible,
      body.access-screen-reader-assist input:focus-visible,
      body.access-screen-reader-assist select:focus-visible {
        outline: 4px solid #8df6cb !important;
        outline-offset: 4px !important;
      }

      body.access-screen-reader-assist button,
      body.access-screen-reader-assist a,
      body.access-screen-reader-assist input,
      body.access-screen-reader-assist select {
        scroll-margin-top: 18px;
      }

      body.access-reduced-motion *,
      body.access-reduced-motion *::before,
      body.access-reduced-motion *::after {
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
        scroll-behavior: auto !important;
        transition-duration: 0.01ms !important;
      }

      .code-recall-narration-button {
        position: fixed;
        right: 86px;
        bottom: 18px;
        z-index: 1200;
        width: 56px;
        height: 56px;
        border: none;
        border-radius: 18px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background: linear-gradient(135deg, #00e5ff 0%, #00ffcc 100%);
        color: #081228;
        box-shadow: 0 0 24px rgba(0, 229, 255, 0.28);
        cursor: pointer;
        font: 800 22px/1 "Poppins", Arial, sans-serif;
        transition: transform 0.2s ease, box-shadow 0.2s ease, filter 0.2s ease;
      }

      .code-recall-narration-button:hover {
        transform: translateY(-2px) scale(1.03);
        box-shadow: 0 0 32px rgba(0, 255, 204, 0.36);
        filter: brightness(1.04);
      }

      .code-recall-narration-button.is-speaking {
        background: linear-gradient(135deg, #ff2e97 0%, #22d3ee 100%);
        color: #fff;
      }

      .code-recall-narration-word {
        border-radius: 6px;
        transition: background 0.12s ease, color 0.12s ease, box-shadow 0.12s ease;
      }

      .code-recall-narration-word.is-speaking {
        padding: 0 4px;
        border-radius: 8px;
        background: #8df6cb;
        color: #081228;
        box-shadow: 0 0 18px rgba(141, 246, 203, 0.28);
      }

      .code-recall-narration-word.is-near-speaking {
        padding: 0 3px;
        border-radius: 7px;
        background: rgba(141, 246, 203, 0.24);
        color: inherit;
      }

      body.light-mode .code-recall-narration-word.is-speaking {
        background: #0f766e;
        color: #fff;
        box-shadow: 0 0 16px rgba(15, 118, 110, 0.24);
      }

      body.light-mode .code-recall-narration-word.is-near-speaking {
        background: rgba(15, 118, 110, 0.14);
      }

      @media (max-width: 600px) {
        .code-recall-narration-button {
          right: 82px;
          bottom: 18px;
          width: 52px;
          height: 52px;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function ensureSkipLink(enabled) {
    const existing = document.getElementById(ACCESSIBILITY_SKIP_LINK_ID);
    if (!enabled) {
      if (existing) existing.remove();
      return;
    }

    let mainTarget = document.getElementById("mainContent");
    if (!mainTarget) {
      mainTarget = document.querySelector("main, .main, [role='main']");
      if (mainTarget) {
        mainTarget.id = "mainContent";
      }
    }

    if (!mainTarget || existing) return;

    const link = document.createElement("a");
    link.id = ACCESSIBILITY_SKIP_LINK_ID;
    link.className = "accessibility-skip-link";
    link.href = "#mainContent";
    link.textContent = "Skip to main content";
    document.body.prepend(link);
  }

  function applyAccessibilityPreferences() {
    ensureAccessibilityStyle();
    normalizeVisualDisplayPreferences();

    const textSize = getTextSizePreference();
    const highContrast = readBooleanPreference("highContrastMode", false);
    const screenReaderAssist = readBooleanPreference("screenReaderAssist", false);
    const reducedMotion = readBooleanPreference("reducedMotion", false);
    const narrationSpeed = readNumberPreference("narrationSpeed", 1, 0.5, 2.5);
    const visualBrightness = readNumberPreference("visualBrightness", 1, 0.75, 1.1);
    const visualContrast = readNumberPreference("visualContrast", 1, 0.8, 1.2);
    const effectiveContrast = highContrast ? Math.max(visualContrast, 1.12) : visualContrast;

    document.body.classList.toggle("access-high-contrast", highContrast);
    document.body.classList.toggle("access-screen-reader-assist", screenReaderAssist);
    document.body.classList.toggle("access-reduced-motion", reducedMotion);
    document.body.classList.toggle("access-text-large", textSize === "large");
    document.body.classList.toggle("access-text-extra-large", textSize === "extra-large");
    const hasNeutralVisuals = visualBrightness === 1 && effectiveContrast === 1;
    document.body.style.filter = hasNeutralVisuals ? "" : `brightness(${visualBrightness}) contrast(${effectiveContrast})`;
    window.codeRecallNarrationSpeed = narrationSpeed;
    window.getCodeRecallNarrationSpeed = function () {
      return window.codeRecallNarrationSpeed || 1;
    };
    ensureSkipLink(screenReaderAssist);
    ensureNarrationButton(screenReaderAssist);
  }

  function supportsNarration() {
    return "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
  }

  function normalizeNarrationText(text) {
    return String(text || "")
      .replace(/\s+/g, " ")
      .replace(/CODE:\s*RECALL!/gi, "Code Recall.")
      .trim();
  }

  function getReadableSource() {
    return (
      document.querySelector("[data-narration-source]") ||
      document.querySelector(".quiz-container, .module-content, .lesson-content, .main, main, [role='main']") ||
      document.body
    );
  }

  function updateNarrationButtonState() {
    const button = document.getElementById(NARRATION_FLOATING_BUTTON_ID);
    if (!button || !supportsNarration()) return;
    const isSpeaking = window.speechSynthesis.speaking && !window.speechSynthesis.paused;
    button.classList.toggle("is-speaking", isSpeaking);
    button.setAttribute("aria-label", isSpeaking ? "Stop read aloud narration" : "Read current page aloud");
    button.textContent = isSpeaking ? "■" : "▶";
  }

  function shouldSkipNarrationNode(node) {
    const parent = node?.parentElement;
    if (!parent) return true;
    return Boolean(parent.closest(
      "script, style, nav, aside, button, input, select, textarea, option, label, .sidebar, .theme-toggle, .code-recall-narration-button, .app-loader-overlay, .popup, [hidden], [aria-hidden='true']"
    ));
  }

  function resetInPageNarrationHighlight() {
    currentNarrationWords.forEach((item) => {
      item.span.classList.remove("is-speaking", "is-near-speaking");
    });
  }

  function stopNarrationHighlightTimer() {
    clearInterval(narrationHighlightTimer);
    narrationHighlightTimer = null;
  }

  function restoreNarrationTextNodes() {
    resetInPageNarrationHighlight();
    narrationRestoreRecords.slice().reverse().forEach((record) => {
      const { parent, nodes, originalText } = record;
      if (!parent || !nodes.length || !parent.contains(nodes[0])) return;
      const textNode = document.createTextNode(originalText);
      parent.insertBefore(textNode, nodes[0]);
      nodes.forEach((node) => {
        if (node.parentNode === parent) node.remove();
      });
    });
    narrationRestoreRecords = [];
    currentNarrationWords = [];
    currentNarrationWordIndex = 0;
    stopNarrationHighlightTimer();
  }

  function prepareInPageNarration() {
    restoreNarrationTextNodes();
    const source = getReadableSource();
    if (!source) return "";

    const walker = document.createTreeWalker(
      source,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          if (shouldSkipNarrationNode(node)) return NodeFilter.FILTER_REJECT;
          if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    const textNodes = [];
    while (walker.nextNode()) {
      textNodes.push(walker.currentNode);
    }

    let spokenText = "";

    textNodes.forEach((textNode) => {
      const originalText = textNode.nodeValue || "";
      const parts = originalText.match(/\s+|\S+/g);
      if (!parts) return;

      const fragment = document.createDocumentFragment();
      const replacementNodes = [];
      let hasReadableText = false;

      parts.forEach((part) => {
        if (/^\s+$/.test(part)) {
          const spaceNode = document.createTextNode(part);
          fragment.appendChild(spaceNode);
          replacementNodes.push(spaceNode);
          return;
        }

        const readablePart = normalizeNarrationText(part);
        const span = document.createElement("span");
        span.className = "code-recall-narration-word";
        span.textContent = part;
        fragment.appendChild(span);
        replacementNodes.push(span);

        if (readablePart) {
          const start = spokenText.length;
          spokenText += `${spokenText ? " " : ""}${readablePart}`;
          const adjustedStart = spokenText.length - readablePart.length;
          currentNarrationWords.push({
            span,
            start: adjustedStart,
            end: adjustedStart + readablePart.length
          });
          hasReadableText = true;
        }
      });

      if (!hasReadableText) return;
      narrationRestoreRecords.push({
        parent: textNode.parentNode,
        originalText,
        nodes: replacementNodes
      });
      textNode.parentNode.replaceChild(fragment, textNode);
    });

    return spokenText.trim();
  }

  function renderNarrationWordByIndex(wordIndex) {
    if (!currentNarrationWords.length) return;

    const activeIndex = Math.max(0, Math.min(currentNarrationWords.length - 1, Number(wordIndex || 0)));
    const activeWord = currentNarrationWords[activeIndex];

    if (!activeWord) return;
    resetInPageNarrationHighlight();

    const phraseStart = Math.max(0, activeIndex - 2);
    const phraseEnd = Math.min(currentNarrationWords.length - 1, activeIndex + 4);
    for (let wordIndex = phraseStart; wordIndex <= phraseEnd; wordIndex += 1) {
      currentNarrationWords[wordIndex].span.classList.add("is-near-speaking");
    }

    activeWord.span.classList.remove("is-near-speaking");
    activeWord.span.classList.add("is-speaking");
    activeWord.span.scrollIntoView({
      block: "center",
      inline: "nearest",
      behavior: document.body.classList.contains("access-reduced-motion") ? "auto" : "smooth"
    });
  }

  function renderNarrationHighlight(charIndex) {
    if (!currentNarrationWords.length) return;

    const index = Math.max(0, Number(charIndex || 0));
    const activeIndex = currentNarrationWords.findIndex((item) => index >= item.start && index <= item.end);
    const nextIndex = currentNarrationWords.findIndex((item) => item.start > index);
    currentNarrationWordIndex = activeIndex >= 0
      ? activeIndex
      : (nextIndex >= 0 ? nextIndex : currentNarrationWords.length - 1);
    renderNarrationWordByIndex(currentNarrationWordIndex);
  }

  function startNarrationHighlightTimer() {
    stopNarrationHighlightTimer();
    if (!currentNarrationWords.length) return;

    const rate = readNumberPreference("narrationSpeed", 1, 0.5, 2.5);
    const estimatedWordsPerMinute = 155 * rate;
    const intervalMs = Math.max(120, Math.round(60000 / estimatedWordsPerMinute));

    narrationHighlightTimer = window.setInterval(() => {
      if (!supportsNarration() || !window.speechSynthesis.speaking || window.speechSynthesis.paused) return;
      renderNarrationWordByIndex(currentNarrationWordIndex);
      currentNarrationWordIndex = Math.min(currentNarrationWords.length - 1, currentNarrationWordIndex + 1);
    }, intervalMs);
  }

  function speakCodeRecallText(text, options = {}) {
    if (!supportsNarration()) {
      window.alert?.("Read aloud is not supported by this browser.");
      return false;
    }

    const cleanText = normalizeNarrationText(text);
    if (!cleanText) {
      window.alert?.("There is no readable text available on this page.");
      return false;
    }

    if (!options.prepared) {
      window.speechSynthesis.cancel();
      restoreNarrationTextNodes();
    }
    narrationPaused = false;
    currentNarrationText = cleanText;
    currentNarrationWordIndex = 0;

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.rate = readNumberPreference("narrationSpeed", 1, 0.5, 2.5);
    utterance.pitch = 1;
    utterance.volume = 1;
    utterance.lang = options.lang || document.documentElement.lang || "en-US";
    utterance.onstart = () => {
      updateNarrationButtonState();
      renderNarrationHighlight(0);
      startNarrationHighlightTimer();
    };
    utterance.onboundary = (event) => {
      if (Number.isFinite(event.charIndex) && event.charIndex >= 0) {
        renderNarrationHighlight(event.charIndex);
      }
    };
    utterance.onend = () => {
      stopNarrationHighlightTimer();
      updateNarrationButtonState();
      restoreNarrationTextNodes();
    };
    utterance.onerror = () => {
      stopNarrationHighlightTimer();
      updateNarrationButtonState();
      restoreNarrationTextNodes();
    };

    window.speechSynthesis.speak(utterance);
    window.setTimeout(updateNarrationButtonState, 0);
    return true;
  }

  function readCodeRecallPageAloud() {
    if (supportsNarration()) window.speechSynthesis.cancel();
    const pageText = prepareInPageNarration();
    return speakCodeRecallText(pageText, { prepared: true });
  }

  function stopCodeRecallNarration() {
    if (!supportsNarration()) return;
    window.speechSynthesis.cancel();
    narrationPaused = false;
    currentNarrationText = "";
    stopNarrationHighlightTimer();
    restoreNarrationTextNodes();
    updateNarrationButtonState();
  }

  function toggleCodeRecallNarrationPause() {
    if (!supportsNarration()) return false;

    if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
      narrationPaused = false;
    } else if (window.speechSynthesis.speaking) {
      window.speechSynthesis.pause();
      narrationPaused = true;
    }

    updateNarrationButtonState();
    return narrationPaused;
  }

  function ensureNarrationButton(enabled) {
    const existing = document.getElementById(NARRATION_FLOATING_BUTTON_ID);
    if (!enabled || !supportsNarration()) {
      if (existing) existing.remove();
      return;
    }

    if (existing) return;

    const button = document.createElement("button");
    button.id = NARRATION_FLOATING_BUTTON_ID;
    button.className = "code-recall-narration-button";
    button.type = "button";
    button.title = "Read aloud";
    button.setAttribute("aria-label", "Read current page aloud");
    button.textContent = "▶";
    button.addEventListener("click", () => {
      if (window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
        stopCodeRecallNarration();
        return;
      }
      readCodeRecallPageAloud();
    });
    document.body.appendChild(button);
  }

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

  applyAccessibilityPreferences();
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

  function registerOfflineCache() {
    if (!("serviceWorker" in navigator)) return;
    if (!window.isSecureContext && location.hostname !== "localhost" && location.hostname !== "127.0.0.1") return;

    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./service-worker.js").catch((error) => {
        console.warn("Offline cache registration failed:", error);
      });
    });
  }

  function savePerformanceLog(entry) {
    try {
      const logs = JSON.parse(localStorage.getItem(PERFORMANCE_LOG_KEY) || "[]");
      const nextLogs = Array.isArray(logs) ? logs.slice(-PERFORMANCE_LOG_LIMIT + 1) : [];
      nextLogs.push(entry);
      localStorage.setItem(PERFORMANCE_LOG_KEY, JSON.stringify(nextLogs));
    } catch {
      // Performance logging should never block page startup.
    }
  }

  function initPerformanceLogger() {
    const startedAt = performance.now();
    window.addEventListener("load", () => {
      window.requestAnimationFrame(() => {
        const navigation = performance.getEntriesByType("navigation")[0];
        const loadTime = Math.round(navigation?.duration || (performance.now() - startedAt));
        const domReady = Math.round(navigation?.domContentLoadedEventEnd || 0);
        const page = location.pathname.split("/").pop() || "index.html";
        const entry = {
          page,
          loadTime,
          domReady,
          at: new Date().toISOString()
        };

        savePerformanceLog(entry);
        if (loadTime > 1800) {
          console.info(`[Code Recall perf] ${page} loaded in ${loadTime}ms`, entry);
        }
      });
    }, { once: true });
  }

  function isProtectedContentPage() {
    const page = location.pathname.split("/").pop() || "index.html";
    return PROTECTED_CONTENT_PATHS.has(page);
  }

  function shouldBlockContextMenu(target) {
    if (!isProtectedContentPage()) return false;
    if (!(target instanceof HTMLElement)) return false;
    if (target.closest(INTERACTIVE_CONTENT_SELECTORS)) return false;
    return Boolean(target.closest(PROTECTED_CONTENT_SELECTORS));
  }

  function initSelectiveContentProtection() {
    document.addEventListener("contextmenu", (event) => {
      if (!shouldBlockContextMenu(event.target)) return;
      event.preventDefault();
    }, true);
  }

  function isNavigationClick(target) {
    if (!(target instanceof HTMLElement)) return false;

    if (target.closest(".nav-toggle, .sidebar-toggle")) {
      return false;
    }

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
    if (handler.includes("toggleMobileNav") || handler.includes("toggleMobileSidebar")) {
      return false;
    }

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
  window.addEventListener("storage", (event) => {
    if ([
      "highContrastMode",
      "screenReaderAssist",
      "reducedMotion",
      "textSizePreference",
      "narrationSpeed",
      "visualBrightness",
      "visualContrast"
    ].includes(event.key)) {
      applyAccessibilityPreferences();
    }
  });

  window.showAppLoader = showLoader;
  window.hideAppLoader = hideLoader;
  window.navigateWithLoader = navigateWithLoader;
  window.applyAccessibilityPreferences = applyAccessibilityPreferences;
  window.readCodeRecallPageAloud = readCodeRecallPageAloud;
  window.speakCodeRecallText = speakCodeRecallText;
  window.stopCodeRecallNarration = stopCodeRecallNarration;
  window.toggleCodeRecallNarrationPause = toggleCodeRecallNarrationPause;

  initPerformanceLogger();
  registerOfflineCache();
  initSelectiveContentProtection();
})();
