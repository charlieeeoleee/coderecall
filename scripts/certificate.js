import { app } from "./firebase-config.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import {
  initSounds,
  initGlobalClickSound,
  tryStartMusic,
  restartThemeMusic
} from "./sound.js";


const auth = getAuth(app);
const db = getFirestore(app);

const params = new URLSearchParams(window.location.search);
const validSubjects = new Set(["hardware", "electrical"]);
const requestedKind = (params.get("kind") || "subject").toLowerCase();
const certificateKind = requestedKind === "dual" ? "dual" : "subject";
const subjectParam = (params.get("subject") || "").toLowerCase();
const savedSubject = (sessionStorage.getItem("selectedSubject") || "").toLowerCase();
const subject = validSubjects.has(subjectParam)
  ? subjectParam
  : validSubjects.has(savedSubject)
    ? savedSubject
    : "hardware";
const initialMode = (params.get("mode") || "").toLowerCase();

const subjectMeta = {
  hardware: {
    title: "Computer Hardware",
    shortCode: "HW"
  },
  electrical: {
    title: "Electrical Wiring and Electronics Circuit Components",
    shortCode: "EL"
  }
};

const currentMeta = subjectMeta[subject] || subjectMeta.hardware;
const dualMeta = {
  title: "Code Recall Full Subject Completion",
  shortCode: "DUAL"
};

function updateThemeIcon() {
  const icon = document.getElementById("themeIcon");
  if (!icon) return;
  icon.textContent = document.body.classList.contains("light-mode") ? "\u2600\uFE0F" : "\uD83C\uDF19";
}

function loadTheme() {
  if (localStorage.getItem("theme") === "light") {
    document.body.classList.add("light-mode");
  }
  updateThemeIcon();
}

window.toggleTheme = function() {
  document.body.classList.toggle("light-mode");
  localStorage.setItem("theme", document.body.classList.contains("light-mode") ? "light" : "dark");
  updateThemeIcon();
  restartThemeMusic();
};

function setStatus(message, isError = false) {
  const status = document.getElementById("certificateStatus");
  if (!status) return;
  status.textContent = message;
  status.classList.toggle("is-error", isError);
}

function setExportMode(mode = "") {
  document.body.classList.remove("certificate-export-mode", "certificate-export-print");

  if (mode === "png") {
    document.body.classList.add("certificate-export-mode");
  }

  if (mode === "print") {
    document.body.classList.add("certificate-export-mode", "certificate-export-print");
  }
}

function normalizeCertificateText(value) {
  return String(value || "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
}

function createGradientNameDataUrl(text) {
  const safeText = String(text || "Learner")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

  const width = Math.max(900, safeText.length * 52);
  const height = 170;

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <defs>
        <linearGradient id="nameGradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="#ff8a2a" />
          <stop offset="54%" stop-color="#ff2e88" />
          <stop offset="100%" stop-color="#00b8ff" />
        </linearGradient>
      </defs>
      <rect width="100%" height="100%" fill="transparent" />
      <text
        x="50%"
        y="58%"
        text-anchor="middle"
        dominant-baseline="middle"
        font-family="Montserrat, Arial, sans-serif"
        font-size="88"
        font-weight="800"
        fill="url(#nameGradient)"
      >${safeText}</text>
    </svg>
  `;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function formatDate(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) {
    return new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric"
    });
  }

  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric"
  });
}

function buildCertificateId(name, completedAt) {
  const compactName = (name || "learner")
    .replace(/[^a-z0-9]+/gi, "")
    .toUpperCase()
    .slice(0, 6) || "LEARNR";
  const date = new Date(completedAt || Date.now());
  const dateCode = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
  const code = certificateKind === "dual" ? dualMeta.shortCode : currentMeta.shortCode;
  return `CR-${code}-${dateCode}-${compactName}`;
}

function hasLocalCompletion(name) {
  const progressKey = `${subject}_${name}`;
  return (
    localStorage.getItem(progressKey) === "true" ||
    localStorage.getItem(`${progressKey}_done`) === "true" ||
    localStorage.getItem(`${progressKey}_attempt_done`) === "true"
  );
}

function getLocalCompletionState() {
  const pretest = hasLocalCompletion("pretest");
  const modules =
    hasLocalCompletion("modules") ||
    localStorage.getItem(`${subject}_easy_modules_done`) === "true" ||
    localStorage.getItem(`${subject}_medium_modules_done`) === "true" ||
    localStorage.getItem(`${subject}_hard_modules_done`) === "true";
  const quiz =
    hasLocalCompletion("quiz") ||
    localStorage.getItem(`${subject}_hard_quiz`) === "true";
  const posttest = hasLocalCompletion("posttest");
  const completedAt = localStorage.getItem(`${subject}_posttest_completedAt`) || "";

  return {
    completed: pretest && modules && quiz && posttest,
    completedAt
  };
}

function getLocalSubjectCompletionState(targetSubject) {
  const pretest =
    localStorage.getItem(`${targetSubject}_pretest`) === "true" ||
    localStorage.getItem(`${targetSubject}_pretest_done`) === "true" ||
    localStorage.getItem(`${targetSubject}_pretest_attempt_done`) === "true";
  const modules =
    localStorage.getItem(`${targetSubject}_modules`) === "true" ||
    localStorage.getItem(`${targetSubject}_easy_modules_done`) === "true" ||
    localStorage.getItem(`${targetSubject}_medium_modules_done`) === "true" ||
    localStorage.getItem(`${targetSubject}_hard_modules_done`) === "true";
  const quiz =
    localStorage.getItem(`${targetSubject}_quiz`) === "true" ||
    localStorage.getItem(`${targetSubject}_quiz_done`) === "true" ||
    localStorage.getItem(`${targetSubject}_hard_quiz`) === "true";
  const posttest =
    localStorage.getItem(`${targetSubject}_posttest`) === "true" ||
    localStorage.getItem(`${targetSubject}_posttest_done`) === "true" ||
    localStorage.getItem(`${targetSubject}_posttest_attempt_done`) === "true";
  return {
    completed: pretest && modules && quiz && posttest,
    completedAt: localStorage.getItem(`${targetSubject}_posttest_completedAt`) || ""
  };
}

async function getRemoteCompletionState(user) {
  if (!user) return null;

  const userRef = doc(db, "users", user.uid);
  const snap = await getDoc(userRef);
  if (!snap.exists()) return null;

  const data = snap.data() || {};
  const progress = data.progress || {};
  const results = data.results || {};

  const pretest = progress[`${subject}_pretest`] === true || results[`${subject}_pretest`] != null;
  const modules =
    progress[`${subject}_modules`] === true ||
    progress[`${subject}_easy_modules_done`] === true ||
    progress[`${subject}_medium_modules_done`] === true ||
    progress[`${subject}_hard_modules_done`] === true;
  const quiz =
    progress[`${subject}_quiz`] === true ||
    progress[`${subject}_hard_quiz`] === true ||
    results[`${subject}_quiz`] != null;
  const posttest = progress[`${subject}_posttest`] === true || results[`${subject}_posttest`] != null;
  const completedAt = results[`${subject}_posttest`]?.completedAt || "";

  return {
    completed: pretest && modules && quiz && posttest,
    completedAt,
    data
  };
}

async function getRemoteSubjectCompletionState(user, targetSubject) {
  if (!user) return null;

  const userRef = doc(db, "users", user.uid);
  const snap = await getDoc(userRef);
  if (!snap.exists()) return null;

  const data = snap.data() || {};
  const progress = data.progress || {};
  const results = data.results || {};

  const pretest = progress[`${targetSubject}_pretest`] === true || results[`${targetSubject}_pretest`] != null;
  const modules =
    progress[`${targetSubject}_modules`] === true ||
    progress[`${targetSubject}_easy_modules_done`] === true ||
    progress[`${targetSubject}_medium_modules_done`] === true ||
    progress[`${targetSubject}_hard_modules_done`] === true;
  const quiz =
    progress[`${targetSubject}_quiz`] === true ||
    progress[`${targetSubject}_hard_quiz`] === true ||
    results[`${targetSubject}_quiz`] != null;
  const posttest = progress[`${targetSubject}_posttest`] === true || results[`${targetSubject}_posttest`] != null;

  return {
    completed: pretest && modules && quiz && posttest,
    completedAt: results[`${targetSubject}_posttest`]?.completedAt || "",
    data
  };
}

function populateCertificate({ learnerName, completedAt }) {
  document.getElementById("certificateLearnerName").textContent = normalizeCertificateText(learnerName);
  document.getElementById("certificateSubjectTitle").textContent =
    normalizeCertificateText(certificateKind === "dual" ? dualMeta.title : currentMeta.title);
  document.getElementById("certificateIssueDate").textContent = formatDate(completedAt);
  document.getElementById("certificateId").textContent = buildCertificateId(normalizeCertificateText(learnerName), completedAt);
  document.querySelector(".certificate-topline").textContent =
    certificateKind === "dual" ? "Code Recall Master Completion Award" : "Code Recall Learning Achievement";
  document.querySelector(".certificate-body-detail").textContent =
    certificateKind === "dual"
      ? "after finishing both core subjects, including all required pre-tests, modules, quizzes, and post-tests across the system."
      : "after finishing the full learning path including the pre-test, modules, quizzes, and post-test.";
}

async function prepareCertificate(user) {
  let completion;
  let userData = null;

  if (certificateKind === "dual") {
    const localHardware = getLocalSubjectCompletionState("hardware");
    const localElectrical = getLocalSubjectCompletionState("electrical");
    const remoteHardware = await getRemoteSubjectCompletionState(user, "hardware");
    const remoteElectrical = await getRemoteSubjectCompletionState(user, "electrical");
    const hardwareDone = remoteHardware?.completed || localHardware.completed;
    const electricalDone = remoteElectrical?.completed || localElectrical.completed;
    const completedAtCandidates = [
      remoteHardware?.completedAt,
      remoteElectrical?.completedAt,
      localHardware.completedAt,
      localElectrical.completedAt
    ].filter(Boolean).map((value) => new Date(value)).filter((date) => !Number.isNaN(date.getTime()));
    const latestCompletedAt = completedAtCandidates.length
      ? new Date(Math.max(...completedAtCandidates.map((date) => date.getTime()))).toISOString()
      : "";

    completion = {
      completed: hardwareDone && electricalDone,
      completedAt: latestCompletedAt
    };
    userData = remoteHardware?.data || remoteElectrical?.data || null;
  } else {
    const localState = getLocalCompletionState();
    const remoteState = await getRemoteCompletionState(user);
    completion = remoteState?.completed ? remoteState : localState;
    userData = remoteState?.data || null;
  }

  const userName = user?.displayName
    || userData?.name
    || user?.email
    || (localStorage.getItem("guest") === "true" ? "Guest Learner" : "Learner");

  populateCertificate({
    learnerName: userName,
    completedAt: completion.completedAt || new Date().toISOString()
  });

  const downloadButton = document.getElementById("downloadCertificateBtn");
  const printButton = document.getElementById("printCertificateBtn");

  if (!completion.completed) {
    setStatus(
      certificateKind === "dual"
        ? "This certificate unlocks after you complete both full subject paths."
        : "This certificate unlocks after you complete the full subject path.",
      true
    );
    if (downloadButton) downloadButton.disabled = true;
    if (printButton) printButton.disabled = true;
    return false;
  }

  setStatus(`${certificateKind === "dual" ? dualMeta.title : currentMeta.title} certificate ready to view and download.`);
  if (downloadButton) downloadButton.disabled = false;
  if (printButton) printButton.disabled = false;
  return true;
}

async function downloadCertificateAsImage() {
  if (typeof window.html2canvas !== "function") {
    setStatus("PNG download is unavailable right now. Use Download PDF instead.", true);
    return;
  }

  const button = document.getElementById("downloadCertificateBtn");
  const previousText = button?.textContent || "Download PNG";
  if (button) {
    button.disabled = true;
    button.textContent = "Preparing...";
  }

  try {
    const canvas = await renderCertificateCanvas("png");
    const link = document.createElement("a");
    const fileTitle = certificateKind === "dual" ? dualMeta.title : currentMeta.title;
    link.download = `${fileTitle.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-certificate.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
    setStatus("Certificate downloaded as PNG.");
  } catch (error) {
    console.error("Certificate download failed:", error);
    setStatus("Unable to download PNG right now. You can still use Download PDF.", true);
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = previousText;
    }
  }
}

async function renderCertificateCanvas(mode = "png") {
  const card = document.getElementById("certificateCard");
  if (!card) {
    throw new Error("Certificate card not found.");
  }

  if (typeof window.html2canvas !== "function") {
    throw new Error("html2canvas is unavailable.");
  }

  let exportHost = null;

  try {
    exportHost = document.createElement("div");
    exportHost.style.position = "fixed";
    exportHost.style.left = "-100000px";
    exportHost.style.top = "0";
    exportHost.style.width = "0";
    exportHost.style.height = "0";
    exportHost.style.overflow = "hidden";
    exportHost.style.pointerEvents = "none";
    exportHost.setAttribute("aria-hidden", "true");

    const exportCard = card.cloneNode(true);
    exportCard.removeAttribute("id");
    exportCard.style.width = "1600px";
    exportCard.style.maxWidth = "1600px";
    exportCard.style.minWidth = "1600px";
    exportCard.style.minHeight = "1120px";
    exportCard.style.margin = "0";
    exportCard.style.boxSizing = "border-box";

    const exportInner = exportCard.querySelector(".certificate-inner");
    if (exportInner) {
      exportInner.style.minHeight = "1120px";
      exportInner.style.padding = "98px 100px";
      exportInner.style.boxSizing = "border-box";
    }

    const exportName = exportCard.querySelector("#certificateLearnerName");
    if (exportName) {
      const normalizedName = normalizeCertificateText(exportName.textContent);
      const gradientImage = document.createElement("img");
      gradientImage.src = createGradientNameDataUrl(normalizedName);
      gradientImage.alt = normalizedName;
      gradientImage.style.display = "block";
      gradientImage.style.width = "min(100%, 900px)";
      gradientImage.style.maxWidth = "900px";
      gradientImage.style.height = "auto";
      gradientImage.style.margin = "0 auto";

      exportName.textContent = "";
      exportName.style.background = "none";
      exportName.style.webkitTextFillColor = "initial";
      exportName.style.color = "transparent";
      exportName.appendChild(gradientImage);
    }

    const exportSubject = exportCard.querySelector("#certificateSubjectTitle");
    if (exportSubject) {
      exportSubject.textContent = normalizeCertificateText(
        certificateKind === "dual" ? dualMeta.title : currentMeta.title
      );
      exportSubject.style.whiteSpace = "normal";
      exportSubject.style.wordBreak = "normal";
      exportSubject.style.overflowWrap = "normal";
    }

    exportHost.appendChild(exportCard);
    document.body.appendChild(exportHost);

    await new Promise((resolve) => {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(resolve);
      });
    });

    const canvas = await window.html2canvas(exportCard, {
      backgroundColor: "#f7f9ff",
      scale: Math.max(2, Math.min(window.devicePixelRatio || 2, 3)),
      useCORS: true,
      width: 1600,
      height: 1120,
      windowWidth: 1600,
      windowHeight: 1120,
      scrollX: 0,
      scrollY: 0
    });

    return canvas;
  } finally {
    exportHost?.remove();
    setExportMode("");
  }
}

async function downloadCertificateAsPdf() {
  if (!window.jspdf?.jsPDF) {
    setStatus("PDF download is unavailable right now. Please try again in a moment.", true);
    return;
  }

  const button = document.getElementById("printCertificateBtn");
  const previousText = button?.textContent || "Download PDF";
  if (button) {
    button.disabled = true;
    button.textContent = "Preparing...";
  }

  try {
    const canvas = await renderCertificateCanvas("print");
    const imageData = canvas.toDataURL("image/png");
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({
      orientation: "landscape",
      unit: "mm",
      format: "a4",
      compress: true
    });

    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 8;
    const maxWidth = pageWidth - margin * 2;
    const maxHeight = pageHeight - margin * 2;
    const imageRatio = canvas.width / canvas.height;

    let renderWidth = maxWidth;
    let renderHeight = renderWidth / imageRatio;

    if (renderHeight > maxHeight) {
      renderHeight = maxHeight;
      renderWidth = renderHeight * imageRatio;
    }

    const x = (pageWidth - renderWidth) / 2;
    const y = (pageHeight - renderHeight) / 2;

    pdf.addImage(imageData, "PNG", x, y, renderWidth, renderHeight, undefined, "FAST");

    const fileTitle = certificateKind === "dual" ? dualMeta.title : currentMeta.title;
    pdf.save(`${fileTitle.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-certificate.pdf`);
    setStatus("Certificate downloaded as PDF.");
  } catch (error) {
    console.error("Certificate PDF download failed:", error);
    setStatus("Unable to download PDF right now. Please try again.", true);
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = previousText;
    }
  }
}

window.printCertificate = function() {
  downloadCertificateAsPdf();
};

window.goBackToSubject = function() {
  if (certificateKind === "dual") {
    window.location.href = "certificates.html";
    return;
  }
  window.location.href = `subject.html?subject=${encodeURIComponent(subject)}`;
};

document.getElementById("downloadCertificateBtn")?.addEventListener("click", () => {
  downloadCertificateAsImage();
});

loadTheme();
initSounds();
initGlobalClickSound();
tryStartMusic();

document.body.addEventListener("click", () => {
  tryStartMusic();
}, { once: true });

onAuthStateChanged(auth, async (user) => {
  try {
    const isReady = await prepareCertificate(user || null);
    if (isReady && initialMode === "download") {
      setTimeout(() => {
        downloadCertificateAsImage();
      }, 250);
    }
  } catch (error) {
    console.error("Unable to prepare certificate:", error);
    setStatus("We couldn't load this certificate right now. Please try again.", true);
  }
});
