function goHome(){
  window.location.href = "index.html";
}

function goDashboard(){
  window.location.href = "dashboard.html";
}

/* THEME */
function loadTheme(){
  const saved = localStorage.getItem("theme");

  if(saved === "light"){
    document.body.classList.add("light-mode");
  }

  updateIcon();
}

function toggleTheme(){
  document.body.classList.toggle("light-mode");

  const mode = document.body.classList.contains("light-mode") ? "light" : "dark";
  localStorage.setItem("theme", mode);

  updateIcon();
}

function updateIcon(){
  const icon = document.getElementById("themeIcon");

  if(!icon) return;

  icon.textContent =
    document.body.classList.contains("light-mode") ? "☀️" : "🌙";
}

loadTheme();