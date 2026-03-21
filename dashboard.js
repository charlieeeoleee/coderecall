let user = {
  username: "Charles",
  email: "charles@email.com",
  xp: 150
};

window.onload = function(){
  loadUser();
  loadSavedTheme();
};

function loadUser(){
  document.getElementById("username").textContent = user.username;
  document.getElementById("email").textContent = user.email;
  document.getElementById("xp").textContent = user.xp;

  let level = Math.floor(user.xp / 100) + 1;
  document.getElementById("level").textContent = level;

  let progress = user.xp % 100;
  document.getElementById("progressFill").style.width = progress + "%";
  document.getElementById("progressText").textContent = progress + "%";
}

function logout(){
  localStorage.clear();
  window.location.replace("auth.html");
}

function startGame(subject){
  alert("Starting " + subject);
}

/* THEME */
function loadSavedTheme(){
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

  if(document.body.classList.contains("light-mode")){
    icon.textContent = "☀️";
  } else {
    icon.textContent = "🌙";
  }
}