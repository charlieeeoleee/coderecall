function loadTheme() {
  const saved = localStorage.getItem("theme");

  if (saved === "light") {
    document.body.classList.add("light-mode");
  }

  updateIcon();
}

window.toggleTheme = function() {
  document.body.classList.toggle("light-mode");

  const mode = document.body.classList.contains("light-mode") ? "light" : "dark";
  localStorage.setItem("theme", mode);

  updateIcon();
};

function updateIcon() {
  const icon = document.getElementById("themeIcon");
  if (!icon) return;

  icon.textContent =
    document.body.classList.contains("light-mode") ? "\u2600\uFE0F" : "\uD83C\uDF19";
}

function syncMobileNavButton() {
  const navbar = document.querySelector(".navbar");
  const toggle = document.querySelector(".nav-toggle");
  if (!navbar || !toggle) return;

  const isOpen = navbar.classList.contains("mobile-open");
  toggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
  toggle.setAttribute("aria-label", isOpen ? "Close navigation" : "Open navigation");
}

window.toggleMobileNav = function() {
  const navbar = document.querySelector(".navbar");
  if (!navbar) return;

  navbar.classList.toggle("mobile-open");
  syncMobileNavButton();
};

function closeMobileNav() {
  const navbar = document.querySelector(".navbar");
  if (!navbar) return;

  navbar.classList.remove("mobile-open");
  syncMobileNavButton();
}

window.goToAuth = function() {
  closeMobileNav();
  window.location.href = "auth.html";
};

window.playGuest = function() {
  closeMobileNav();
  localStorage.setItem("guest", "true");
  window.location.href = "dashboard.html";
};

window.goToAbout = function() {
  closeMobileNav();
  window.location.href = "about.html";
};

document.addEventListener("click", (event) => {
  const navbar = document.querySelector(".navbar");
  if (!navbar || !navbar.classList.contains("mobile-open")) return;
  if (navbar.contains(event.target)) return;

  closeMobileNav();
});

window.addEventListener("resize", () => {
  if (window.innerWidth > 720) {
    closeMobileNav();
  }
});

document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll(".nav-links a").forEach((link) => {
    link.addEventListener("click", closeMobileNav);
  });

  syncMobileNavButton();
});

loadTheme();
