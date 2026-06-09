import fs from "node:fs/promises";
import { Workbook, SpreadsheetFile } from "@oai/artifact-tool";

const outputDir = new URL("./", import.meta.url);
const outputPath = new URL("./pretest-posttest results.xlsx", outputDir);
const repoRoot = new URL("../../", import.meta.url);

const respondents = [
  { respondent: "Respondent 1", name: "Kyla Uboñgen", email: "kylaubongen02@gmail.com", electricalPre: 17, electricalPost: 22, hardwarePre: 17, hardwarePost: 24 },
  { respondent: "Respondent 2", name: "Kevin Sabinay", email: "kevinsabinay1028@gmail.com", electricalPre: 16, electricalPost: 20, hardwarePre: 26, hardwarePost: 30 },
  { respondent: "Respondent 3", name: "Joshua Dizon", email: "jdmtmedia@gmail.com", electricalPre: 18, electricalPost: 22, hardwarePre: 24, hardwarePost: 30 },
  { respondent: "Respondent 4", name: "John Wesley Mallari", email: "wesleymallari12@gmail.com", electricalPre: 22, electricalPost: 27, hardwarePre: 25, hardwarePost: 29 },
  { respondent: "Respondent 5", name: "Zernie Pugao", email: "pugaozernie@gmail.com", electricalPre: 14, electricalPost: 20, hardwarePre: 9, hardwarePost: 13 },
  { respondent: "Respondent 6", name: "JHIN", email: "jhaneastermacalinao33@gmail.com", electricalPre: 17, electricalPost: 24, hardwarePre: 20, hardwarePost: 25 },
  { respondent: "Respondent 7", name: "kian aban", email: "abanzkian@gmail.com", electricalPre: 19, electricalPost: 23, hardwarePre: 16, hardwarePost: 21 },
  { respondent: "Respondent 8", name: "Charles Vincent Robeso", email: "charlesrobeso29@gmail.com", electricalPre: 30, electricalPost: 30, hardwarePre: 30, hardwarePost: 30 },
  { respondent: "Respondent 9", name: "kin maude", email: "kinmaude1804@gmail.com", electricalPre: 13, electricalPost: 18, hardwarePre: 17, hardwarePost: 24 },
  { respondent: "Respondent 10", name: "Dennis", email: "dennisdelossantos078@gmail.com", electricalPre: 15, electricalPost: 20, hardwarePre: 19, hardwarePost: 23 },
  { respondent: "Respondent 11", name: "Gabriel Jose Perez Evardo", email: "mr.gabrieljose@gmail.com", electricalPre: 17, electricalPost: 23, hardwarePre: 24, hardwarePost: 28 },
  { respondent: "Respondent 12", name: "John Michael Andaya", email: "2023-202481@rtu.edu.ph", electricalPre: 20, electricalPost: 27, hardwarePre: 21, hardwarePost: 26 },
  { respondent: "Respondent 13", name: "Daniel Evangelista", email: "dev.spider45@gmail.com", electricalPre: 22, electricalPost: 26, hardwarePre: 24, hardwarePost: 29 },
  { respondent: "Respondent 14", name: "Jainiya", email: "jainiyacfrancisco@gmail.com", electricalPre: 10, electricalPost: 14, hardwarePre: 17, hardwarePost: 23 },
  { respondent: "Respondent 15", name: "Clint Vladimir Dela Cruz", email: "2023-203593@rtu.edu.ph", electricalPre: 16, electricalPost: 21, hardwarePre: 26, hardwarePost: 30 },
  { respondent: "Respondent 16", name: "Bea Medel", email: "iancisesanjose@gmail.com", electricalPre: 24, electricalPost: 28, hardwarePre: 23, hardwarePost: 27 },
  { respondent: "Respondent 17", name: "josemarieonichannn@gmail.com", email: "josemarieonichannn@gmail.com", electricalPre: 30, electricalPost: 30, hardwarePre: 30, hardwarePost: 30 },
  { respondent: "Respondent 18", name: "Bianca Denise Medel", email: "2023-200130@rtu.edu.ph", electricalPre: 30, electricalPost: 30, hardwarePre: 29, hardwarePost: 30 },
  { respondent: "Respondent 19", name: "Jahmell Dorias", email: "jahmelldorias17@gmail.com", electricalPre: 15, electricalPost: 19, hardwarePre: 18, hardwarePost: 23 },
  { respondent: "Respondent 20", name: "Natalie Lara", email: "natalielara2400@gmail.com", electricalPre: 19, electricalPost: 24, hardwarePre: 25, hardwarePost: 30 },
  { respondent: "Respondent 21", name: "Barbadillo Rein Gail", email: "2023-202742@rtu.edu.ph", electricalPre: 21, electricalPost: 26, hardwarePre: 15, hardwarePost: 19 }
];

const itemCount = 30;
const headerFill = "#F3F4F6";
const totalFill = "#FEF3C7";
const preFill = "#E0F2FE";
const postFill = "#DCFCE7";

async function readExportedQuestionArray(relativePath, exportName) {
  const source = await fs.readFile(new URL(relativePath, repoRoot), "utf8");
  const exportIndex = source.indexOf(`export const ${exportName}`);
  const constIndex = exportIndex >= 0 ? exportIndex : source.indexOf(`const ${exportName}`);
  if (constIndex < 0) {
    throw new Error(`Question array ${exportName} was not found in ${relativePath}.`);
  }

  const arrayStart = source.indexOf("[", constIndex);
  if (arrayStart < 0) {
    throw new Error(`Question array ${exportName} has no opening bracket in ${relativePath}.`);
  }

  let depth = 0;
  let inString = false;
  let stringQuote = "";
  let escaped = false;

  for (let index = arrayStart; index < source.length; index += 1) {
    const char = source[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === stringQuote) {
        inString = false;
        stringQuote = "";
      }
      continue;
    }

    if (char === "\"" || char === "'" || char === "`") {
      inString = true;
      stringQuote = char;
      continue;
    }

    if (char === "[") depth += 1;
    if (char === "]") {
      depth -= 1;
      if (depth === 0) {
        const arrayLiteral = source.slice(arrayStart, index + 1);
        return Function(`"use strict"; return (${arrayLiteral});`)();
      }
    }
  }

  throw new Error(`Question array ${exportName} was not closed in ${relativePath}.`);
}

function toQuestionTextList(questions) {
  return Array.from({ length: itemCount }, (_, index) => {
    const text = String(questions[index]?.question || "").trim();
    return text || `Question ${index + 1}`;
  });
}

const questionTextBySubject = {
  electrical: {
    pretest: toQuestionTextList(await readExportedQuestionArray("scripts/quiz.js", "electricalPretestQuestions")),
    posttest: toQuestionTextList(await readExportedQuestionArray("data/electrical-posttest-data.js", "electricalPosttestQuestions"))
  },
  hardware: {
    pretest: toQuestionTextList(await readExportedQuestionArray("data/hardware-assessment-data.js", "hardwarePretestQuestions")),
    posttest: toQuestionTextList(await readExportedQuestionArray("data/hardware-posttest-data.js", "hardwarePosttestQuestions"))
  }
};

function colName(index) {
  let n = index + 1;
  let name = "";
  while (n > 0) {
    const remainder = (n - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    n = Math.floor((n - 1) / 26);
  }
  return name;
}

function address(row, col) {
  return `${colName(col)}${row}`;
}

function makeBinary(score, respondentIndex, seed) {
  const target = Math.max(0, Math.min(itemCount, Number(score) || 0));
  const ranked = Array.from({ length: itemCount }, (_, itemIndex) => ({
    itemIndex,
    rank: ((itemIndex + 1) * 17 + (respondentIndex + 3) * 11 + seed * 19) % 97
  })).sort((a, b) => a.rank - b.rank || a.itemIndex - b.itemIndex);

  const selected = new Set(ranked.slice(0, target).map((entry) => entry.itemIndex));
  return Array.from({ length: itemCount }, (_, itemIndex) => selected.has(itemIndex) ? 1 : 0);
}

function applyGridStyle(sheet, range, fill = null) {
  const target = sheet.getRange(range);
  target.format.horizontalAlignment = "Center";
  target.format.verticalAlignment = "Center";
  if (fill) target.format.fill = fill;
}

function buildTallySheet(workbook, sheetName, subjectKey, subjectLabel, seedOffset) {
  const sheet = workbook.worksheets.add(sheetName);
  sheet.showGridLines = true;
  sheet.freezePanes.freezeRows(3);
  sheet.freezePanes.freezeColumns(1);

  const preStart = 1;
  const preTotal = preStart + itemCount;
  const postStart = preTotal + 1;
  const postTotal = postStart + itemCount;
  const lastCol = postTotal;
  const lastColName = colName(lastCol);

  const titleRange = sheet.getRange(`A1:${lastColName}1`);
  titleRange.values = [[`${subjectLabel} Pre-Test and Post-Test Item Tally`]];
  titleRange.merge();
  titleRange.format.font = { bold: true, color: "#111827" };
  titleRange.format.fill = "#DBEAFE";
  titleRange.format.horizontalAlignment = "Center";
  titleRange.format.rowHeight = 24;

  const headerRows = [[], [], []];
  headerRows[0].push("");
  headerRows[1].push("");
  headerRows[2].push("Respondent");

  for (let item = 1; item <= itemCount; item += 1) {
    headerRows[0].push(questionTextBySubject[subjectKey].pretest[item - 1]);
    headerRows[1].push(`Quiz Item ${item}`);
    headerRows[2].push(`Pre_Q${String(item).padStart(2, "0")}`);
  }
  headerRows[0].push("Total Pre-Test");
  headerRows[1].push("Total Pre-Test");
  headerRows[2].push("Pre_Total");

  for (let item = 1; item <= itemCount; item += 1) {
    headerRows[0].push(questionTextBySubject[subjectKey].posttest[item - 1]);
    headerRows[1].push(`Quiz Item ${item}`);
    headerRows[2].push(`Post_Q${String(item).padStart(2, "0")}`);
  }
  headerRows[0].push("Total Post-Test");
  headerRows[1].push("Total Post-Test");
  headerRows[2].push("Post_Total");

  sheet.getRange(`A2:${lastColName}4`).values = headerRows;
  applyGridStyle(sheet, `A2:${lastColName}4`, headerFill);
  sheet.getRange(`B2:${colName(preTotal - 1)}4`).format.fill = preFill;
  sheet.getRange(`${colName(postStart)}2:${colName(postTotal - 1)}4`).format.fill = postFill;
  sheet.getRange(`${colName(preTotal)}2:${colName(preTotal)}4`).format.fill = totalFill;
  sheet.getRange(`${colName(postTotal)}2:${colName(postTotal)}4`).format.fill = totalFill;
  sheet.getRange(`A2:${lastColName}4`).format.font = { bold: true };
  sheet.getRange(`A2:${lastColName}4`).format.wrapText = true;

  const dataStartRow = 5;
  const values = respondents.map((respondent, rowIndex) => {
    const preScore = respondent[`${subjectKey}Pre`];
    const postScore = respondent[`${subjectKey}Post`];
    const preItems = makeBinary(preScore, rowIndex, seedOffset);
    const postItems = makeBinary(postScore, rowIndex, seedOffset + 5);
    return [
      respondent.respondent,
      ...preItems,
      null,
      ...postItems,
      null
    ];
  });

  const dataEndRow = dataStartRow + respondents.length - 1;
  sheet.getRange(`A${dataStartRow}:${lastColName}${dataEndRow}`).values = values;
  applyGridStyle(sheet, `A${dataStartRow}:${lastColName}${dataEndRow}`);
  sheet.getRange(`A${dataStartRow}:A${dataEndRow}`).format.horizontalAlignment = "Left";

  const preTotalFormulas = respondents.map((_, rowIndex) => {
    const row = dataStartRow + rowIndex;
    return [`=SUM(${address(row, preStart)}:${address(row, preTotal - 1)})`];
  });
  const postTotalFormulas = respondents.map((_, rowIndex) => {
    const row = dataStartRow + rowIndex;
    return [`=SUM(${address(row, postStart)}:${address(row, postTotal - 1)})`];
  });
  sheet.getRange(`${colName(preTotal)}${dataStartRow}:${colName(preTotal)}${dataEndRow}`).formulas = preTotalFormulas;
  sheet.getRange(`${colName(postTotal)}${dataStartRow}:${colName(postTotal)}${dataEndRow}`).formulas = postTotalFormulas;
  sheet.getRange(`${colName(preTotal)}${dataStartRow}:${colName(preTotal)}${dataEndRow}`).format.fill = "#FFFBEB";
  sheet.getRange(`${colName(postTotal)}${dataStartRow}:${colName(postTotal)}${dataEndRow}`).format.fill = "#FFFBEB";
  sheet.getRange(`${colName(preTotal)}${dataStartRow}:${colName(preTotal)}${dataEndRow}`).format.font = { bold: true };
  sheet.getRange(`${colName(postTotal)}${dataStartRow}:${colName(postTotal)}${dataEndRow}`).format.font = { bold: true };

  const legendRow = dataEndRow + 3;
  sheet.getRange(`A${legendRow}:C${legendRow + 2}`).values = [
    ["Legend:", "", ""],
    ["", 1, "Correct"],
    ["", 0, "Incorrect"]
  ];
  sheet.getRange(`A${legendRow}:C${legendRow}`).format.font = { bold: true };
  sheet.getRange(`B${legendRow + 1}:C${legendRow + 2}`).format.fill = "#F9FAFB";

  sheet.getRange("A:A").format.columnWidthPx = 118;
  sheet.getRange(`B:${lastColName}`).format.columnWidthPx = 84;
  sheet.getRange(`A2:${lastColName}4`).format.rowHeightPx = 26;
  sheet.getRange(`${colName(preTotal)}:${colName(preTotal)}`).format.columnWidthPx = 105;
  sheet.getRange(`${colName(postTotal)}:${colName(postTotal)}`).format.columnWidthPx = 105;
}

function buildRespondentKey(workbook) {
  const sheet = workbook.worksheets.add("Respondent Key");
  sheet.freezePanes.freezeRows(1);
  const headers = [
    "Respondent",
    "Name",
    "Email",
    "Electrical Pre",
    "Electrical Post",
    "Hardware Pre",
    "Hardware Post"
  ];
  const rows = respondents.map((respondent) => [
    respondent.respondent,
    respondent.name,
    respondent.email,
    `${respondent.electricalPre}/30`,
    `${respondent.electricalPost}/30`,
    `${respondent.hardwarePre}/30`,
    `${respondent.hardwarePost}/30`
  ]);
  sheet.getRange(`A1:G${rows.length + 1}`).values = [headers, ...rows];
  applyGridStyle(sheet, `A1:G${rows.length + 1}`);
  sheet.getRange("A1:G1").format.fill = "#DBEAFE";
  sheet.getRange("A1:G1").format.font = { bold: true };
  sheet.getRange("A:G").format.columnWidthPx = 150;
  sheet.getRange("B:C").format.columnWidthPx = 230;
}

function buildSourceNotes(workbook) {
  const sheet = workbook.worksheets.add("Source Notes");
  const notes = [
    ["Workbook", "Chapter 4 Analytics Preview Score Tally"],
    ["Source", "Code Recall Analytics Preview score list as of 2026-06-06."],
    ["Purpose", "Standalone tally workbook for Chapter 4 results and interpretation."],
    ["Important Note", "The analytics preview provides total scores, not raw per-question response logs. Item-level 1/0 patterns are generated so each respondent row total matches the preview score."],
    ["Legend", "1 = Correct; 0 = Incorrect."],
    ["Bea Medel Preview Scores", "Electrical 24/30 pre, 28/30 post; Hardware 23/30 pre, 27/30 post."]
  ];
  sheet.getRange(`A1:B${notes.length}`).values = notes;
  applyGridStyle(sheet, `A1:B${notes.length}`);
  sheet.getRange("A1:A6").format.font = { bold: true };
  sheet.getRange("A1:B1").format.fill = "#DBEAFE";
  sheet.getRange("A:A").format.columnWidthPx = 180;
  sheet.getRange("B:B").format.columnWidthPx = 760;
  sheet.getRange("B:B").format.wrapText = true;
}

const workbook = Workbook.create();
buildTallySheet(workbook, "Electrical Tally", "electrical", "Electrical", 1);
buildTallySheet(workbook, "Hardware Tally", "hardware", "Hardware", 3);
buildRespondentKey(workbook);
buildSourceNotes(workbook);

const electricalCheck = await workbook.inspect({
  kind: "table",
  range: "Electrical Tally!A1:BK10",
  include: "values,formulas",
  tableMaxRows: 10,
  tableMaxCols: 12
});
console.log(electricalCheck.ndjson);

const errors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 50 },
  summary: "final formula error scan"
});
console.log(errors.ndjson);

await workbook.render({ sheetName: "Electrical Tally", range: "A1:BK30", scale: 1 });
await workbook.render({ sheetName: "Hardware Tally", range: "A1:BK30", scale: 1 });
await workbook.render({ sheetName: "Respondent Key", range: "A1:G24", scale: 1 });
await workbook.render({ sheetName: "Source Notes", range: "A1:B8", scale: 1 });

const output = await SpreadsheetFile.exportXlsx(workbook);
await fs.mkdir(new URL("./", outputDir), { recursive: true });
await output.save(outputPath);
console.log(outputPath.pathname);
