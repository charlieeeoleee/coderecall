function goHome() {
  closeMobileNav();
  window.location.href = "index.html";
}

function goDashboard() {
  closeMobileNav();
  window.location.href = "dashboard.html";
}

function goToAuth() {
  closeMobileNav();
  window.location.href = "auth.html";
}

function goBack() {
  if (window.history.length > 1) {
    window.history.back();
    return;
  }

  goHome();
}

function toggleMobileNav() {
  const navbar = document.querySelector(".navbar");
  const toggle = document.querySelector(".nav-toggle");
  if (!navbar || !toggle) return;

  const isOpen = navbar.classList.toggle("mobile-nav-open");
  navbar.classList.toggle("mobile-open", isOpen);
  toggle.setAttribute("aria-expanded", String(isOpen));
  toggle.setAttribute("aria-label", isOpen ? "Close navigation" : "Open navigation");
}

function closeMobileNav() {
  const navbar = document.querySelector(".navbar");
  const toggle = document.querySelector(".nav-toggle");
  if (!navbar) return;

  navbar.classList.remove("mobile-nav-open", "mobile-open");
  if (toggle) {
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-label", "Open navigation");
  }
}

document.querySelectorAll(".nav-links a").forEach((link) => {
  link.addEventListener("click", closeMobileNav);
});

function updateIcon() {
  const icon = document.getElementById("themeIcon");
  if (!icon) return;

  icon.textContent = document.body.classList.contains("light-mode") ? "\u2600\uFE0F" : "\uD83C\uDF19";
}

function loadTheme() {
  const saved = localStorage.getItem("theme");
  if (saved === "light") {
    document.body.classList.add("light-mode");
  }
  updateIcon();
}

function toggleTheme() {
  document.body.classList.toggle("light-mode");
  const mode = document.body.classList.contains("light-mode") ? "light" : "dark";
  localStorage.setItem("theme", mode);
  updateIcon();
}

function titleCase(value) {
  return value
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function applyFeatureContext() {
  const params = new URLSearchParams(window.location.search);
  const feature = params.get("feature") || params.get("page") || params.get("module");
  const state = params.get("state") || "in development";
  const note = params.get("note");

  const featureTagline = document.getElementById("featureTagline");
  const featureTitle = document.getElementById("featureTitle");
  const featureDescription = document.getElementById("featureDescription");
  const statusHeadline = document.getElementById("statusHeadline");
  const statusMessage = document.getElementById("statusMessage");
  const releaseStage = document.getElementById("releaseStage");
  const statusLabel = document.getElementById("statusLabel");

  const readableFeature = feature ? titleCase(feature) : "";
  const readableState = titleCase(state);

  if (releaseStage) {
    releaseStage.textContent = readableState;
  }

  if (statusLabel) {
    statusLabel.textContent = readableState;
  }

  if (!readableFeature) {
    return;
  }

  document.title = `${readableFeature} - Code Recall`;

  if (featureTagline) {
    featureTagline.textContent = `${readableFeature} is already linked in the platform, but the full flow is not finished yet.`;
  }

  if (featureTitle) {
    featureTitle.textContent = `${readableFeature} is not ready for release yet.`;
  }

  if (featureDescription) {
    featureDescription.textContent = note
      ? note
      : `${readableFeature} has been added to the system structure, but the full experience is still being completed. You can safely return to the live pages and come back once this feature is ready.`;
  }

  if (statusHeadline) {
    statusHeadline.textContent = `${readableFeature} is currently ${state.toLowerCase()}.`;
  }

  if (statusMessage) {
    statusMessage.textContent = `This fallback page helps keep navigation stable while ${readableFeature} is still being built, polished, or tested.`;
  }
}

loadTheme();
applyFeatureContext();
