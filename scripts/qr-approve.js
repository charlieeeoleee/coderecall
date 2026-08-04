function setStatus(message, isError = false) {
  const status = document.getElementById("approvalStatus");
  if (!status) return;
  status.textContent = message;
  status.classList.toggle("error", Boolean(isError));
}

function syncDisabledState() {
  const account = document.getElementById("approvalAccount");
  const approveBtn = document.getElementById("approveQrBtn");
  const googleBtn = document.getElementById("phoneGoogleBtn");
  const passwordToggleBtn = document.getElementById("phonePasswordToggleBtn");
  const copy = document.getElementById("approvalCopy");

  if (account) account.textContent = "QR login unavailable";
  if (approveBtn) approveBtn.disabled = true;
  if (googleBtn) googleBtn.hidden = true;
  if (passwordToggleBtn) passwordToggleBtn.hidden = true;
  document.getElementById("phonePasswordForm")?.setAttribute("hidden", "");
  if (copy) {
    copy.textContent = "Phone QR login is disabled while Code Recall is configured for the Firebase Spark plan.";
  }
  setStatus("Use Google or Email sign-in on the website, then enter your authenticator code.", true);
}

document.getElementById("approveQrBtn")?.addEventListener("click", syncDisabledState);
document.getElementById("phoneGoogleBtn")?.addEventListener("click", syncDisabledState);
document.getElementById("phonePasswordToggleBtn")?.addEventListener("click", syncDisabledState);
document.getElementById("phonePasswordForm")?.addEventListener("submit", (event) => {
  event.preventDefault();
  syncDisabledState();
});

syncDisabledState();
