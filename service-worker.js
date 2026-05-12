const CACHE_VERSION = "code-recall-v20260512f";
const APP_SHELL = [
  "./",
  "./offline.html",
  "./index.html",
  "./about.html",
  "./faq.html",
  "./subjects-preview.html",
  "./auth.html",
  "./dashboard.html",
  "./subjects.html",
  "./subject.html",
  "./module-difficulty.html",
  "./module-levels.html",
  "./module.html",
  "./quiz-difficulty.html",
  "./quiz-levels.html",
  "./quiz-level.html",
  "./quiz.html",
  "./review.html",
  "./history.html",
  "./leaderboard.html",
  "./achievements.html",
  "./certificates.html",
  "./certificate.html",
  "./contact.html",
  "./settings.html",
  "./privacy.html",
  "./styles/styles.css",
  "./styles/auth.css",
  "./styles/dashboard.css",
  "./styles/subjects.css",
  "./styles/subject.css",
  "./styles/module.css",
  "./styles/module-difficulty.css",
  "./styles/module-levels.css",
  "./styles/quiz.css",
  "./styles/quiz-level.css",
  "./styles/quiz-difficulty.css",
  "./styles/quiz-levels.css",
  "./styles/leaderboard.css",
  "./styles/settings.css",
  "./styles/contact.css",
  "./styles/privacy.css",
  "./scripts/loading.js",
  "./scripts/firebase-config.runtime.js",
  "./scripts/sound.js",
  "./scripts/role-utils.js",
  "./scripts/career-path.js",
  "./scripts/item-feedback.js",
  "./scripts/item-feedback-loader.js",
  "./assets/favicon.png",
  "./assets/logo-dark.png",
  "./assets/logo-light.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key !== CACHE_VERSION)
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

function isCacheableRequest(request) {
  if (request.method !== "GET") return false;
  const url = new URL(request.url);
  return url.origin === self.location.origin;
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_VERSION);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response && response.ok) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => null);

  return cached || await network || await cache.match("./offline.html");
}

async function networkFirstPage(request) {
  const cache = await caches.open(CACHE_VERSION);
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return await cache.match(request) || await cache.match("./offline.html");
  }
}

function isFreshAssetRequest(request) {
  const url = new URL(request.url);
  return [".js", ".css"].some((extension) => url.pathname.endsWith(extension));
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (!isCacheableRequest(request)) return;

  if (request.mode === "navigate" || isFreshAssetRequest(request)) {
    event.respondWith(networkFirstPage(request));
    return;
  }

  event.respondWith(staleWhileRevalidate(request));
});
