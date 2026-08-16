(() => {
  const FAILURE_TIMEOUT_MS = 15 * 1000;
  const failureState = document.getElementById("moduleFailureState");
  const appShell = document.getElementById("moduleAppShell");
  const title = document.getElementById("moduleFailureTitle");
  const message = document.getElementById("moduleFailureMessage");
  const backLink = document.getElementById("moduleFailureBackLink");
  const retryButton = document.getElementById("moduleFailureRetry");
  let moduleReady = false;
  let failureShown = false;

  function safeModuleBackUrl() {
    const params = new URLSearchParams(window.location.search);
    const subject = String(params.get("subject") || "").toLowerCase();
    const difficulty = String(params.get("difficulty") || "").toLowerCase();
    if (!["hardware", "electrical"].includes(subject) || !["easy", "medium", "hard"].includes(difficulty)) {
      return "/subjects";
    }
    return `/module-levels?${new URLSearchParams({ subject, difficulty }).toString()}`;
  }

  function showFailure(kind) {
    if (moduleReady || failureShown || !failureState || !appShell || !title || !message) return;
    failureShown = true;
    appShell.hidden = true;
    failureState.hidden = false;
    if (backLink) backLink.href = safeModuleBackUrl();

    if (kind === "invalid") {
      title.textContent = "Module unavailable";
      message.textContent = "We couldn't find this lesson. Return to the module list and choose an available module.";
    } else {
      title.textContent = "Unable to load this module";
      message.textContent = "The lesson could not be prepared. Try again, or return to your modules and continue from there.";
    }

    title.focus();
  }

  retryButton?.addEventListener("click", () => window.location.reload());
  window.addEventListener("coderecall:module-invalid", () => showFailure("invalid"));
  window.addEventListener("coderecall:module-failed", () => showFailure("failure"));
  window.addEventListener("coderecall:module-ready", () => {
    if (failureShown) return;
    moduleReady = true;
    window.clearTimeout(failureTimer);
  });

  window.addEventListener("error", (event) => {
    if (moduleReady || failureShown) return;
    const targetId = event.target?.id || "";
    const source = String(event.filename || "");
    if (["firebaseRuntimeConfig", "moduleRuntimeScript"].includes(targetId)
        || /\/scripts\/(?:module|firebase-config)|\/data\/.*-content\.js/i.test(source)) {
      showFailure("failure");
    }
  }, true);

  window.addEventListener("unhandledrejection", () => {
    if (!moduleReady) showFailure("failure");
  });

  import("./module-routing.mjs")
    .then(({ resolveModuleLessonRoute }) => {
      try {
        resolveModuleLessonRoute(window.location.search);
      } catch {
        showFailure("invalid");
      }
    })
    .catch(() => {
      // The runtime script error listener or timeout owns the sanitized failure state.
    });

  const failureTimer = window.setTimeout(() => showFailure("failure"), FAILURE_TIMEOUT_MS);
})();
