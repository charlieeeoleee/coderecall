let currentUser = null;

// Replace these placeholder entries with final researcher names, photos, and details.
const researchers = [
  {
    name: "Rein Gail Barbadillo",
    role: "Documentation / Content Coordinator",
    email: "2023-202742@rtu.edu.ph",
    section: "Computer System Servicing Research Team",
    summary: "Organized documentation, learning materials, and written research content.",
    bio: "Supported the preparation of research documentation, helped organize the learning content, and reviewed written materials used for the development and presentation of Code Recall.",
    tags: ["Documentation", "Content Review", "Research Writing"],
    image: "assets/researchers/researcher-1.png"
  },
  {
    name: "Jhane Aster Macalinao",
    role: "Research Coordinator / Evaluation Lead",
    email: "2023-204568@rtu.edu.ph",
    section: "Computer System Servicing Research Team",
    summary: "Coordinated the research process, evaluation flow, and study alignment.",
    bio: "Focused on aligning Code Recall with the study objectives, coordinating the research process, and supporting the evaluation flow used to assess the system.",
    tags: ["Research Planning", "Evaluation", "Study Coordination"],
    image: "assets/researchers/researcher-2.png"
  },
  {
    name: "Charles Vincent Robeso",
    role: "Group Leader / Main Developer",
    email: "2023-203748@rtu.edu.ph",
    section: "Computer System Servicing Research Team",
    summary: "Led the group and handled the main development of the Code Recall system.",
    bio: "Served as the group leader and main developer of Code Recall, leading the technical implementation, feature integration, interface refinement, and final system preparation for demonstration.",
    tags: ["Group Leadership", "Main Development", "System Integration"],
    image: "assets/researchers/researcher-5.png"
  },
  {
    name: "Marvic Mansibang",
    role: "Content and Assessment Coordinator",
    email: "2023-200087@rtu.edu.ph",
    section: "Computer System Servicing Research Team",
    summary: "Organized learning topics, assessment content, and subject-based materials.",
    bio: "Helped prepare and review the module content, quiz flow, pre-test and post-test structure, and learning materials used in the gamified learning experience.",
    tags: ["Learning Content", "Assessments", "Module Review"],
    image: "assets/researchers/researcher-3.png"
  },
  {
    name: "Bianca Denise Medel",
    role: "Documentation and Testing Coordinator",
    email: "2023-200130@rtu.edu.ph",
    section: "Computer System Servicing Research Team",
    summary: "Handled documentation support, testing checks, and presentation readiness.",
    bio: "Supported the documentation of system features, checked usability issues, reviewed presentation materials, and helped prepare the system for final demonstration.",
    tags: ["Documentation", "Testing", "Presentation"],
    image: "assets/researchers/researcher-4.png"
  }
];

const grid = document.getElementById("researcherGrid");
const modal = document.getElementById("researcherModal");
const modalCard = modal?.querySelector(".researcher-modal-card");
const modalName = document.getElementById("researcherModalName");
const modalRole = document.getElementById("researcherModalRole");
const modalSection = document.getElementById("researcherModalSection");
const modalBio = document.getElementById("researcherModalBio");
const modalTags = document.getElementById("researcherModalTags");

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function createPhotoMarkup(researcher, isLarge = false) {
  const photoClass = isLarge ? "researcher-modal-photo" : "researcher-photo";
  const photoId = isLarge ? ' id="researcherModalPhoto"' : "";

  if (!researcher.image) {
    return `<div${photoId} class="${photoClass}"></div>`;
  }

  return `
    <div${photoId} class="${photoClass}">
      <img src="${escapeHtml(researcher.image)}" alt="${escapeHtml(researcher.name)}">
    </div>
  `;
}

function handleMissingImages(scope = document) {
  scope.querySelectorAll(".researcher-photo img, .researcher-modal-photo img").forEach((image) => {
    image.addEventListener("error", () => {
      image.remove();
    }, { once: true });
  });
}

function renderResearchers() {
  if (!grid) return;

  grid.innerHTML = researchers.map((researcher, index) => `
    <article class="researcher-card" tabindex="0" role="button" data-researcher-index="${index}" aria-label="View details for ${escapeHtml(researcher.name)}">
      ${createPhotoMarkup(researcher)}
      <div class="researcher-card-body">
        <p class="researcher-card-role">${escapeHtml(researcher.role)}</p>
        <h3>${escapeHtml(researcher.name)}</h3>
        <a class="researcher-card-email" href="mailto:${escapeHtml(researcher.email)}">${escapeHtml(researcher.email)}</a>
        <p>${escapeHtml(researcher.summary)}</p>
      </div>
    </article>
  `).join("");

  grid.querySelectorAll("[data-researcher-index]").forEach((card) => {
    card.addEventListener("click", (event) => {
      if (event.target.closest("a")) return;
      openResearcher(Number(card.dataset.researcherIndex));
    });
    card.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      openResearcher(Number(card.dataset.researcherIndex));
    });
  });

  handleMissingImages(grid);
}

function openResearcher(index) {
  const researcher = researchers[index];
  const currentModalPhoto = document.getElementById("researcherModalPhoto");
  if (!researcher || !modal || !currentModalPhoto || !modalName || !modalRole || !modalSection || !modalBio || !modalTags) return;

  currentModalPhoto.outerHTML = createPhotoMarkup(researcher, true);
  handleMissingImages(modal);

  modalName.textContent = researcher.name;
  modalRole.textContent = researcher.role;
  modalSection.innerHTML = `${escapeHtml(researcher.section)} | <a href="mailto:${escapeHtml(researcher.email)}">${escapeHtml(researcher.email)}</a>`;
  modalBio.textContent = researcher.bio;
  modalTags.innerHTML = researcher.tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("");

  modal.hidden = false;
  document.body.classList.add("modal-open");
  modalCard?.focus();
}

function closeResearcherModal() {
  if (!modal) return;

  modal.hidden = true;
  document.body.classList.remove("modal-open");
}

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

function updateAuthButtons() {
  const signedIn = Boolean(currentUser);
  document.querySelectorAll("[data-auth-cta]").forEach((button) => {
    button.textContent = signedIn
      ? button.dataset.signedInLabel || "Dashboard"
      : button.dataset.signedOutLabel || "Login";
    button.setAttribute("aria-label", signedIn ? "Open dashboard" : "Open login");
  });
}

async function watchAuthState() {
  try {
    const [{ app }, authModule] = await Promise.all([
      import("./firebase-config.js"),
      import("https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js")
    ]);
    const auth = authModule.getAuth(app);

    authModule.onAuthStateChanged(auth, (user) => {
      currentUser = user || null;
      updateAuthButtons();
    });
  } catch (error) {
    currentUser = null;
    updateAuthButtons();
  }
}

window.goToAuth = function() {
  closeMobileNav();
  window.location.href = currentUser ? "dashboard.html" : "auth.html";
};

document.addEventListener("click", (event) => {
  const closeTarget = event.target.closest("[data-close-modal]");
  if (closeTarget) {
    closeResearcherModal();
    return;
  }

  const navbar = document.querySelector(".navbar");
  if (!navbar || !navbar.classList.contains("mobile-open")) return;
  if (navbar.contains(event.target)) return;

  closeMobileNav();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeResearcherModal();
  }
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

  renderResearchers();
  syncMobileNavButton();
  updateAuthButtons();
});

loadTheme();
watchAuthState();
