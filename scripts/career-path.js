import { MODULE_STRUCTURE } from "../data/module-data.js";

const QUIZ_LEVELS_PER_DIFFICULTY = 25;
const SUBJECT_LABELS = {
  hardware: "Computer Hardware",
  electrical: "Electrical Wiring and Electronics"
};

const CAREER_PATHS = {
  hardware: [
    { title: "Hardware Trainee", xp: 0, percent: 0, detail: "Start the Computer Hardware path." },
    { title: "PC Assembly Assistant", xp: 80, percent: 20, detail: "Build early hardware foundations." },
    { title: "Computer Assembler", xp: 180, percent: 45, detail: "Show steady module and quiz progress." },
    { title: "Junior Computer Technician", xp: 340, percent: 70, detail: "Clear most hardware activities." },
    { title: "Computer Technician", xp: 520, percent: 100, detail: "Complete the full Computer Hardware path." }
  ],
  electrical: [
    { title: "Electrical Basics Trainee", xp: 0, percent: 0, detail: "Start the Electrical path." },
    { title: "Wiring Assistant", xp: 80, percent: 20, detail: "Build early electrical safety and tool knowledge." },
    { title: "Circuit Helper", xp: 180, percent: 45, detail: "Show steady wiring and circuit progress." },
    { title: "Electrical Technician Trainee", xp: 340, percent: 70, detail: "Clear most electrical activities." },
    { title: "Electrical Systems Technician", xp: 520, percent: 100, detail: "Complete the full Electrical path." }
  ]
};

function safePercent(done, total) {
  if (!total) return 0;
  return Math.min(100, Math.max(0, Math.round((done / total) * 100)));
}

function getSavedProgress(progress = {}, key) {
  return Boolean(progress?.[key]) || localStorage.getItem(key) === "true";
}

function getResult(results = {}, key) {
  if (results?.[key]) return results[key];
  try {
    return JSON.parse(localStorage.getItem(key) || "null");
  } catch {
    return null;
  }
}

export function buildCareerSubjectsFromProgress(progress = {}, results = {}) {
  return Object.entries(MODULE_STRUCTURE).map(([subject, difficulties]) => {
    const totalModules = Object.values(difficulties).reduce((sum, count) => sum + count, 0);
    let completedModules = 0;

    Object.entries(difficulties).forEach(([difficulty, count]) => {
      for (let index = 1; index <= count; index += 1) {
        if (getSavedProgress(progress, `${subject}_${difficulty}_module_${index}_done`)) {
          completedModules += 1;
        }
      }
    });

    const totalQuizLevels = Object.keys(difficulties).length * QUIZ_LEVELS_PER_DIFFICULTY;
    let completedQuizLevels = 0;
    Object.keys(difficulties).forEach((difficulty) => {
      for (let level = 1; level <= QUIZ_LEVELS_PER_DIFFICULTY; level += 1) {
        if (
          getSavedProgress(progress, `${subject}_${difficulty}_quiz_level_${level}_done`) ||
          getResult(results, `${subject}_${difficulty}_quiz_level_${level}_result`)
        ) {
          completedQuizLevels += 1;
        }
      }
    });

    const pretestDone = Boolean(getResult(results, `${subject}_pretest`)) || getSavedProgress(progress, `${subject}_pretest_done`);
    const posttestDone = Boolean(getResult(results, `${subject}_posttest`)) || getSavedProgress(progress, `${subject}_posttest_done`);
    const completedItems = completedModules + completedQuizLevels + (pretestDone ? 1 : 0) + (posttestDone ? 1 : 0);
    const totalItems = totalModules + totalQuizLevels + 2;

    return {
      subject,
      label: SUBJECT_LABELS[subject] || subject,
      percent: safePercent(completedItems, totalItems),
      completed: completedItems >= totalItems,
      completedItems,
      totalItems
    };
  });
}

function choosePrimarySubject(subjects = []) {
  const normalized = subjects.length ? subjects : buildCareerSubjectsFromProgress();
  return [...normalized].sort((a, b) => {
    if (b.percent !== a.percent) return b.percent - a.percent;
    return a.subject === "hardware" ? -1 : 1;
  })[0] || { subject: "hardware", label: SUBJECT_LABELS.hardware, percent: 0 };
}

export function getCareerProgress({ xp = 0, subjects = [] } = {}) {
  const primarySubject = choosePrimarySubject(subjects);
  const pathKey = CAREER_PATHS[primarySubject.subject] ? primarySubject.subject : "hardware";
  const path = CAREER_PATHS[pathKey];
  const totalXP = Math.max(0, Number(xp) || 0);
  const subjectPercent = Math.max(0, Number(primarySubject.percent) || 0);

  let current = path[0];
  for (const role of path) {
    if (totalXP >= role.xp && subjectPercent >= role.percent) {
      current = role;
    }
  }

  const currentIndex = path.indexOf(current);
  const next = path[currentIndex + 1] || null;
  const xpGap = next ? Math.max(0, next.xp - totalXP) : 0;
  const percentGap = next ? Math.max(0, next.percent - subjectPercent) : 0;
  const progressToNext = next
    ? Math.min(100, Math.round(((totalXP / Math.max(next.xp, 1)) * 50) + ((subjectPercent / Math.max(next.percent, 1)) * 50)))
    : 100;

  return {
    pathKey,
    subjectLabel: primarySubject.label,
    subjectPercent,
    current,
    next,
    progressToNext,
    nextRequirement: next
      ? [
          xpGap > 0 ? `${xpGap} XP` : "",
          percentGap > 0 ? `${percentGap}% more ${primarySubject.label} progress` : ""
        ].filter(Boolean).join(" + ") || "Finish the next checkpoint"
      : "Highest career role reached"
  };
}
