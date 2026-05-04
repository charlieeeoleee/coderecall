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

window.goToHome = function() {
  closeMobileNav();
  window.location.href = "index.html";
};

window.toggleFaq = function(button) {
  const currentItem = button.parentElement;
  const currentAnswer = currentItem.querySelector(".faq-answer");
  const allItems = document.querySelectorAll(".faq-item");

  allItems.forEach(item => {
    const answer = item.querySelector(".faq-answer");

    if (item !== currentItem) {
      item.classList.remove("active");
      answer.style.maxHeight = null;
    }
  });

  currentItem.classList.toggle("active");

  if (currentItem.classList.contains("active")) {
    currentAnswer.style.maxHeight = currentAnswer.scrollHeight + "px";
  } else {
    currentAnswer.style.maxHeight = null;
  }
};

window.filterFaqs = function() {
  const searchValue = document.getElementById("faqSearch").value.toLowerCase().trim();
  const items = document.querySelectorAll(".faq-item");
  const noResults = document.getElementById("noResults");

  let visibleCount = 0;

  items.forEach(item => {
    const questionText = item.querySelector(".faq-question span").textContent.toLowerCase();
    const answerText = item.querySelector(".faq-answer p").textContent.toLowerCase();

    const matches = questionText.includes(searchValue) || answerText.includes(searchValue);

    if (matches) {
      item.style.display = "";
      visibleCount++;
    } else {
      item.style.display = "none";
      item.classList.remove("active");
      item.querySelector(".faq-answer").style.maxHeight = null;
    }
  });

  noResults.style.display = visibleCount === 0 ? "block" : "none";
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
