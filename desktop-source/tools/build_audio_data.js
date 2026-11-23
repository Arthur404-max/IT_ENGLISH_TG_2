#!/usr/bin/env node
/*
 * Builds data/audio.json from the listening texts in data/exams.json.
 * The WAV files themselves are generated separately by tools/generate_audio.ps1.
 *
 *   node tools/build_audio_data.js
 */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const exams = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "exams.json"), "utf8"));
const meta = {
  1: {
    id: "multicore",
    file: "unit03-multicore.wav",
    title_ru: "Многоядерные процессоры",
    level: "B1",
    summary_ru: "Что такое ядро, зачем процессору несколько ядер и какие ограничения есть у одного быстрого ядра.",
    tasks: [
      {
        question: "What is a core?",
        answer: "An independent processor inside a multicore component.",
        hint: "The text calls it the execution engine.",
      },
      {
        question: "What advantage do multicore processors provide?",
        answer: "They improve performance, reduce power consumption and process several tasks at the same time.",
        hint: "Look for the sentence with performance and power consumption.",
      },
    ],
  },
  2: {
    id: "osi-model",
    file: "unit07-osi.wav",
    title_ru: "Модель OSI",
    level: "B1",
    summary_ru: "Зачем нужна модель OSI, из скольких уровней она состоит и как помогает сетевым инженерам.",
    tasks: [
      {
        question: "How many layers does the OSI model have?",
        answer: "Seven.",
        hint: "The number is in the second sentence.",
      },
      {
        question: "What is the OSI model used for?",
        answer: "As a guideline to describe how traffic moves over networks and to troubleshoot network problems.",
        hint: "Think about describing traffic and troubleshooting.",
      },
    ],
  },
  3: {
    id: "search-engines",
    file: "unit09-search.wav",
    title_ru: "Как работают поисковые системы",
    level: "B1",
    summary_ru: "Три категории поисковиков и базовые шаги crawler-based поиска: crawling, indexing и ranking.",
    tasks: [
      {
        question: "What are the three basic steps of a crawler-based search engine?",
        answer: "Crawling, indexing and ranking.",
        hint: "They are listed at the end of the text.",
      },
      {
        question: "What types of search engines are mentioned?",
        answer: "Crawler-based search engines, human-powered directories and meta-search engines.",
        hint: "There are exactly three categories.",
      },
    ],
  },
  4: {
    id: "virus-parts",
    file: "unit12-virus.wav",
    title_ru: "Части компьютерного вируса",
    level: "B1",
    summary_ru: "Четыре части вируса и отличие трояна от вируса.",
    tasks: [
      {
        question: "What are the four main parts of a virus?",
        answer: "A misdirection routine, a reproduction routine, a trigger and a payload.",
        hint: "The text lists them one by one.",
      },
      {
        question: "What is a Trojan?",
        answer: "A program that has a payload but does not have a reproduction routine.",
        hint: "It is the last sentence.",
      },
    ],
  },
  5: {
    id: "neural-networks",
    file: "unit14-neural.wav",
    title_ru: "Искусственные нейронные сети",
    level: "B1",
    summary_ru: "Нейроны, скрытые слои, связи и веса в искусственной нейронной сети.",
    tasks: [
      {
        question: "What are the connections between artificial neurons represented by?",
        answer: "A number called a weight.",
        hint: "The last sentence mentions positive or negative numbers.",
      },
      {
        question: "What do hidden layers do?",
        answer: "They form the majority of the artificial brain and process information between input and output units.",
        hint: "Look between the input and output units.",
      },
    ],
  },
};

const items = exams.texts.map((text) => {
  const info = meta[text.id];
  if (!info) throw new Error(`No audio metadata for text ${text.id}`);
  const audioPath = path.join(ROOT, "assets", "audio", info.file);
  let durationSec = 0;
  if (fs.existsSync(audioPath)) {
    const buffer = fs.readFileSync(audioPath);
    if (buffer.toString("ascii", 0, 4) === "RIFF") {
      let offset = 12;
      let channels = 1;
      let rate = 16000;
      let bits = 16;
      let dataSize = 0;
      while (offset + 8 <= buffer.length) {
        const chunk = buffer.toString("ascii", offset, offset + 4);
        const size = buffer.readUInt32LE(offset + 4);
        if (chunk === "fmt ") {
          channels = buffer.readUInt16LE(offset + 10);
          rate = buffer.readUInt32LE(offset + 12);
          bits = buffer.readUInt16LE(offset + 22);
        } else if (chunk === "data") {
          dataSize = size;
          break;
        }
        offset += 8 + size + (size % 2);
      }
      const bytesPerSecond = rate * channels * (bits / 8);
      if (bytesPerSecond > 0 && dataSize > 0) durationSec = Math.round((dataSize / bytesPerSecond) * 10) / 10;
    }
  }
  return {
    id: info.id,
    unit_id: text.unit_id,
    title: text.title,
    title_ru: info.title_ru,
    level: info.level,
    summary_ru: info.summary_ru,
    file: info.file,
    source: `Unit ${String(text.unit_id).padStart(2, "0")} · ${text.title}`,
    duration_sec: durationSec,
    transcript: text.en,
    tasks: info.tasks,
  };
});

const out = {
  version: 1,
  generated_by: "tools/build_audio_data.js",
  note: "Local Windows SAPI recordings. Browser speech synthesis remains a fallback for other texts.",
  items,
};
fs.writeFileSync(path.join(ROOT, "data", "audio.json"), JSON.stringify(out, null, 2) + "\n", "utf8");
console.log(`wrote data/audio.json (${items.length} items)`);
