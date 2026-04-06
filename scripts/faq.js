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

window.goToAuth = function() {
  window.location.href = "auth.html";
};

window.goToHome = function() {
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

loadTheme();
