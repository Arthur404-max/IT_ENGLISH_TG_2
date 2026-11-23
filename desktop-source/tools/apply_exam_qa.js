#!/usr/bin/env node
/*
 * Injects the bilingual exam Q&A bank from data/exam_questions.json into
 * data/units.json. The app reads `unit.qa` through GET /api/units/{id}.
 *
 *   node tools/apply_exam_qa.js
 *   node tools/apply_exam_qa.js --check
 */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const unitsPath = path.join(ROOT, "data", "units.json");
const qaPath = path.join(ROOT, "data", "exam_questions.json");
const backupPath = path.join(ROOT, "data", "units.before-qa.json");
const checkOnly = process.argv.includes("--check");
const MAX_ANSWER_LENGTH = 250;

const content = JSON.parse(fs.readFileSync(unitsPath, "utf8"));
const bank = JSON.parse(fs.readFileSync(qaPath, "utf8"));
const units = Array.isArray(content.units) ? content.units : [];
const numbers = [];

for (const [unitId, items] of Object.entries(bank)) {
  if (!Array.isArray(items)) throw new Error(`Unit ${unitId}: expected an array`);
  for (const item of items) {
    if (!Number.isInteger(item.num) || item.num < 1) {
      throw new Error(`Unit ${unitId}: invalid question number`);
    }
    for (const field of ["question_en", "question_ru", "answer_en", "answer_ru"]) {
      if (!String(item[field] || "").trim()) {
        throw new Error(`Question ${item.num}: empty ${field}`);
      }
    }
    if (item.answer_en.length > MAX_ANSWER_LENGTH) {
      throw new Error(
        `Question ${item.num}: answer_en is ${item.answer_en.length} characters (max ${MAX_ANSWER_LENGTH})`
      );
    }
    if (item.answer_ru.length > MAX_ANSWER_LENGTH) {
      throw new Error(
        `Question ${item.num}: answer_ru is ${item.answer_ru.length} characters (max ${MAX_ANSWER_LENGTH})`
      );
    }
    numbers.push(item.num);
  }
}

const missing = [];
for (let n = 1; n <= 60; n += 1) if (!numbers.includes(n)) missing.push(n);
if (missing.length) throw new Error(`Missing questions: ${missing.join(", ")}`);
if (new Set(numbers).size !== numbers.length) throw new Error("Duplicate question numbers");

let attached = 0;
for (const unit of units) {
  const items = bank[String(unit.id)] || [];
  unit.qa = items.slice().sort((a, b) => a.num - b.num);
  attached += unit.qa.length;
}
if (attached !== 60) throw new Error(`Attached ${attached} questions, expected 60`);

const serialized = `${JSON.stringify(content, null, 2)}\n`;
if (checkOnly) {
  const current = JSON.parse(fs.readFileSync(unitsPath, "utf8"));
  const same = JSON.stringify(current) === JSON.stringify(content);
  console.log(`  QA bank: ${attached} questions in ${units.length} units`);
  console.log(`  units.json is ${same ? "up to date" : "out of date"}`);
  process.exitCode = same ? 0 : 1;
} else {
  if (!fs.existsSync(backupPath)) {
    fs.copyFileSync(unitsPath, backupPath);
    console.log(`  backup: ${backupPath}`);
  }
  fs.writeFileSync(unitsPath, serialized, "utf8");
  console.log(`  attached ${attached} questions to ${units.length} units`);
  console.log(`  wrote ${unitsPath}`);
}
