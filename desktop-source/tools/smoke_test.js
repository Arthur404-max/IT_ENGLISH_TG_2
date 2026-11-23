#!/usr/bin/env node
/*
 * IT English Lab — smoke test.
 *
 * По умолчанию запускает свежий сервер на временной папке данных, проверяет
 * API, встроенную статику, историю экзаменов, импорт прогресса, сохранение
 * после перезапуска и режим --lan. Чужой прогресс не трогает.
 *
 * Примеры:
 *   node tools/smoke_test.js
 *   node tools/smoke_test.js --base http://127.0.0.1:18889
 *   node tools/smoke_test.js --base http://127.0.0.1:18889 --write
 *   node tools/smoke_test.js --no-lan
 */
"use strict";

const fs = require("fs");
const net = require("net");
const os = require("os");
const path = require("path");
const { spawn, spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const argv = process.argv.slice(2);
const explicitBase = (readArg("--base") || process.env.ITELAB_BASE || "").replace(/\/$/, "");
const allowWrite = argv.includes("--write");
const testLan = !argv.includes("--no-lan");
const keepFiles = argv.includes("--keep");
const exe =
  process.env.ITELAB_EXE ||
  path.join(ROOT, "dist", process.platform === "win32" ? "it-english-lab.exe" : "it-english-lab");

const checks = [];
const startedServers = [];
const tempDirs = [];
let base = explicitBase;

function readArg(name) {
  const index = argv.indexOf(name);
  if (index < 0) return "";
  const value = argv[index + 1];
  return value && !value.startsWith("--") ? value : "";
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function check(name, condition, detail = "") {
  if (!condition) {
    throw new Error(`FAIL: ${name}${detail ? ` — ${detail}` : ""}`);
  }
  checks.push(name);
  console.log(`  ok  ${name}`);
}

function checkEqual(name, actual, expected) {
  check(name, Object.is(actual, expected), `получено ${JSON.stringify(actual)}, ожидалось ${JSON.stringify(expected)}`);
}

async function request(pathname, options = {}) {
  const init = { method: options.method || "GET", headers: {} };
  if (options.body !== undefined) {
    init.headers["content-type"] = "application/json";
    init.body = typeof options.body === "string" ? options.body : JSON.stringify(options.body);
  }
  const response = await fetch(base + pathname, init);
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch (_) {
    /* не JSON */
  }
  return { status: response.status, headers: response.headers, text, json };
}

async function getJson(pathname) {
  const result = await request(pathname);
  check(`GET ${pathname} отвечает 200`, result.status === 200, `статус ${result.status}`);
  check(`GET ${pathname} возвращает JSON`, Boolean(result.json), result.text.slice(0, 120));
  return result.json;
}

async function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
}

async function startServer(dataDir, extraArgs = []) {
  if (!fs.existsSync(exe)) {
    throw new Error(`Не найден сервер: ${exe}. Сначала выполните .\\build.ps1`);
  }
  const port = await freePort();
  const output = { text: "" };
  const child = spawn(
    exe,
    ["--port", String(port), "--no-open", "--data-dir", dataDir, ...extraArgs],
    { cwd: ROOT, env: process.env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] }
  );
  child.stdout.on("data", (chunk) => {
    output.text += String(chunk);
  });
  child.stderr.on("data", (chunk) => {
    output.text += String(chunk);
  });
  const serverBase = `http://127.0.0.1:${port}`;
  const server = {
    base: serverBase,
    port,
    child,
    output,
    stopped: false,
    async stop() {
      if (this.stopped) return;
      this.stopped = true;
      if (child.exitCode !== null) return;
      child.kill();
      for (let i = 0; i < 40 && child.exitCode === null; i++) {
        await delay(100);
      }
      if (child.exitCode === null && process.platform === "win32") {
        spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
        await delay(150);
      }
    },
  };
  startedServers.push(server);

  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Сервер завершился с кодом ${child.exitCode}.\n${output.text}`);
    }
    try {
      const response = await fetch(serverBase + "/api/health");
      if (response.ok) return server;
    } catch (_) {
      /* сервер ещё запускается */
    }
    await delay(150);
  }
  throw new Error(`Сервер не ответил за 20 секунд.\n${output.text}`);
}

async function runReadChecks() {
  console.log("\nAPI и встроенные ассеты");

  const health = await getJson("/api/health");
  checkEqual("health.ok", health.ok, true);
  checkEqual("health.schema_version", health.schema_version, 3);
  check("health.save_error field", Object.prototype.hasOwnProperty.call(health, "save_error"));

  console.log("\nPWA и статические ресурсы");
  const manifestResponse = await request("/manifest.webmanifest");
  check("GET /manifest.webmanifest status 200", manifestResponse.status === 200, `status ${manifestResponse.status}`);
  const manifest = manifestResponse.json || {};
  check("manifest name", typeof manifest.name === "string" && manifest.name.startsWith("IT English Lab"), manifest.name);
  checkEqual("manifest display standalone", manifest.display, "standalone");
  check("manifest start_url", typeof manifest.start_url === "string" && manifest.start_url.length > 0);
  check("manifest icons 192/512", (manifest.icons || []).some((i) => String(i.sizes).includes("192")) && (manifest.icons || []).some((i) => String(i.sizes).includes("512")));
  for (const asset of ["/sw.js", "/icon.svg", "/icon-192.png", "/icon-512.png", "/analytics.js", "/pwa.js", "/study.js", "/audio.js", "/speaking.js"]) {
    const result = await request(asset);
    check(`GET ${asset} status 200`, result.status === 200, `status ${result.status}`);
  }
  const sw = await request("/sw.js");
  check("service worker has cache version", /itelab-v4-shell-\d+/.test(sw.text), sw.text.slice(0, 80));
  check(
    "service worker caches shell",
    sw.text.includes("/analytics.js") &&
      sw.text.includes("/study.js") &&
      sw.text.includes("/audio.js") &&
      sw.text.includes("/speaking.js") &&
      sw.text.includes("/audio/unit03-multicore.wav")
  );

  const indexHtml = await request("/");
  check("index viewport-fit=cover", indexHtml.text.includes("viewport-fit=cover"));
  check("index manifest link", indexHtml.text.includes("/manifest.webmanifest"));
  check("index analytics route", indexHtml.text.includes("#/analytics"));
  check("index study route", indexHtml.text.includes("#/study"));
  check("index audio route", indexHtml.text.includes("#/audio"));
  check("index speaking route", indexHtml.text.includes("#/speaking"));
  check("index speaking script", indexHtml.text.includes("/speaking.js"));
  check("index aria live route", indexHtml.text.includes('id="route-live"'));

  const index = await request("/");
  check("GET / отвечает 200", index.status === 200, `статус ${index.status}`);
  check("GET / отдаёт HTML", /text\/html/.test(index.headers.get("content-type") || ""));
  for (const marker of ["skip-link", "mobile-bottom-nav", "/exam.js", "/settings.js", "/events.js"]) {
    check(`index содержит ${marker}`, index.text.includes(marker));
  }

  const assets = [
    ["/exam.js", ["itelab.examDraft.v1", "deadlineAt", "exam-record", "exam-review-finish", "retryMistakes", "source_tab"]],
    ["/settings.js", ["importProgress", "exportProgress", "lan_url", "Мобильный доступ"]],
    ["/events.js", ["exam-resume", "import-progress", "copy-lan-url"]],
    ["/practice.js", ["buildClozeIndex", "cloze-gap", "acceptedAny"]],
    ["/styles.css", [".mobile-bottom-nav", ".exam-record-btn", "focus-visible", "prefers-reduced-motion"]],
  ];
  assets.push(["/exam.js", ["exam-map", "precheck", "preferFresh", "aria-live=\"off\"", "review_en", "tags"]]);
  assets.push(["/settings.js", ["restore-backup", "backups", "S.progress.version"]]);
  assets.push(["/views-unit.js", ["shadowing", "transcript", "0.75", "comprehension"]]);
  assets.push(["/analytics.js", ["analytics-export", "item_id", "time_ms", "weak"]]);
  assets.push(["/study.js", ["/api/study/readiness", "/api/study/plan", "mistake-option", "readiness-ring", "/api/study/prefs"]]);
  assets.push(["/audio.js", ["/api/audio", "audio-check", "audio-done", "playbackRate"]]);
  assets.push(["/app.js", ["itelab.tts.voice.v1", "speakRepeat", "englishVoices"]]);
  assets.push(["/speaking.js", ["/api/speaking", "/api/speaking/attempt", "MediaRecorder", "speaking-record", "speaking-done", "speaking-voice", "speaking-listen-repeat", "speaking-tts-note"]]);
  assets.push(["/styles.css", ["safe-area-inset-bottom", ".exam-map", ".readiness-ring", ".audio-card", ".cloze-sentence", ".cloze-gap", ".speaking-card", ".speaking-recording", ".speaking-voice-bar", ".speaking-tts-note"]]);
  for (const [asset, markers] of assets) {
    const result = await request(asset);
    check(`GET ${asset} отвечает 200`, result.status === 200, `статус ${result.status}`);
    check(`GET ${asset} непустой`, result.text.length > 200, `${result.text.length} байт`);
    for (const marker of markers) {
      check(`${asset} содержит ${marker}`, result.text.includes(marker));
    }
  }

  const favicon = await request("/favicon.ico");
  check("GET /favicon.ico отвечает 200", favicon.status === 200);
  check("favicon отдаётся как SVG", /image\/svg\+xml/.test(favicon.headers.get("content-type") || ""));

  console.log("\nМатериалы и экзаменационный банк");
  const units = await getJson("/api/units");
  checkEqual("в курсе 15 юнитов", units.total_units, 15);
  check("в словаре больше 300 слов", Number(units.total_vocab) > 300, `total_vocab=${units.total_vocab}`);
  check("GET /api/units/1 отвечает", (await request("/api/units/1")).status === 200);
  const qaTotal = (units.units || []).reduce((sum, unit) => sum + Number(unit.qa || 0), 0);
  checkEqual("в курсе 60 экзаменационных вопросов с ответами", qaTotal, 60);
  const unit3 = await getJson("/api/units/3");
  check("в юните 3 семь вопросов к экзамену", Array.isArray(unit3.qa) && unit3.qa.length === 7, `qa=${unit3.qa ? unit3.qa.length : "none"}`);
  check(
    "у каждого вопроса есть английский и русский ответ",
    Array.isArray(unit3.qa) &&
      unit3.qa.every((item) => item.num && item.question_en && item.question_ru && item.answer_en && item.answer_ru)
  );
  const allQa = [];
  for (let id = 1; id <= 15; id += 1) {
    const unit = await getJson(`/api/units/${id}`);
    allQa.push(...(unit.qa || []));
  }
  checkEqual("все 60 Q&A доступны через API", allQa.length, 60);
  check(
    "ответы Q&A не длиннее 250 символов",
    allQa.every((item) => item.answer_en.length <= 250 && item.answer_ru.length <= 250),
    `max_en=${Math.max(...allQa.map((item) => item.answer_en.length))}, max_ru=${Math.max(...allQa.map((item) => item.answer_ru.length))}`
  );
  check(
    "у всех Q&A есть английский и русский ответ",
    allQa.every((item) => item.answer_en && item.answer_ru)
  );

  console.log("\nSpeaking API");
  const speaking = await getJson("/api/speaking");
  const speakingPrompts = Array.isArray(speaking.prompts) ? speaking.prompts : [];
  check("speaking has a prompt bank", speakingPrompts.length >= 80, String(speakingPrompts.length));
  check(
    "speaking bank has sentences and questions",
    speakingPrompts.some((item) => item.kind === "sentence") && speakingPrompts.some((item) => item.kind === "question")
  );
  check("speaking prompt ids are unique", new Set(speakingPrompts.map((item) => item.id)).size === speakingPrompts.length);
  check(
    "speaking prompts have context and a unit",
    speakingPrompts.every((item) => item.text && item.context && Number(item.unit_id) > 0 && typeof item.done === "boolean")
  );
  check("speaking done starts empty", Array.isArray(speaking.done) && speaking.done.length === 0);
  checkEqual("speaking attempts start at zero", speaking.attempts, 0);
  checkEqual("speaking total matches prompt bank", speaking.total, speakingPrompts.length);
  checkEqual("speaking completed starts at zero", speaking.completed, 0);

  const exams = await getJson("/api/exams");
  checkEqual("60 вопросов", (exams.questions || []).length, 60);
  checkEqual("125 терминов", (exams.terms || []).length, 125);
  checkEqual("42 аббревиатуры", (exams.abbreviations || []).length, 42);
  checkEqual("5 текстов", (exams.texts || []).length, 5);
  const examItems = [
    ...(exams.questions || []),
    ...(exams.terms || []),
    ...(exams.abbreviations || []),
    ...(exams.texts || []),
  ];
  const withoutSource = examItems.filter(
    (item) => !item.source || !["text", "vocab"].includes(item.source_tab)
  );
  check("all bank items have a source tab", withoutSource.length === 0, `${withoutSource.length} items`);
  checkEqual("bank_version", exams.meta && exams.meta.bank_version, 2);
  check("bank ids present", examItems.every((item) => item.id !== undefined && item.id !== null && String(item.id).length > 0));
  check("bank tags present", examItems.every((item) => Array.isArray(item.tags) && item.tags.length > 0));
  check("terms have definition and translation", (exams.terms || []).every((item) => item.definition && item.ru && item.en));
  check("texts have audio tag", (exams.texts || []).every((item) => (item.tags || []).includes("audio")));
  check("questions have prompts and answers", (exams.questions || []).every((item) => item.question && item.answer));
  check("terms include definition text", (exams.terms || []).some((item) => item.definition && item.definition.length > 10));
  check("у всех заданий есть источник и раздел курса", withoutSource.length === 0, `${withoutSource.length} без источника`);

  console.log("\nНастройки и прогресс");
  const settings = await getJson("/api/settings");
  check("settings содержит lan_enabled", Object.prototype.hasOwnProperty.call(settings, "lan_enabled"));
  check("settings содержит lan_url", Object.prototype.hasOwnProperty.call(settings, "lan_url"));
  check("API-ключ не отдаётся в settings", !Object.prototype.hasOwnProperty.call(settings, "api_key"));

  const progress = await getJson("/api/progress");
  check("progress.exams — массив", Array.isArray(progress.exams));
  check("progress.stats присутствует", Boolean(progress.stats && typeof progress.stats.answers === "number"));
  check("progress.due is a number", typeof progress.due === "number", String(progress.due));
  check("progress.activity has 30 days", Array.isArray(progress.activity) && progress.activity.length === 30);
  check("progress.today has exam_answers", Boolean(progress.today) && typeof progress.today.exam_answers === "number");
  checkEqual("progress schema version", progress.schema_version, 3);
  check("progress prefs present", Boolean(progress.prefs) && typeof progress.prefs.daily_new_limit === "number");
  check("progress prefs has FSRS personalization", progress.prefs && progress.prefs.desired_retention_pct === 90 && progress.prefs.max_interval_days === 3650, JSON.stringify(progress.prefs));
  check("progress v3 counters present", Boolean(progress.today) && typeof progress.today.new === "number" && typeof progress.today.reviews === "number" && typeof progress.today.leech === "number");
  check("progress resolved_mistakes and audio_done arrays", Array.isArray(progress.resolved_mistakes) && Array.isArray(progress.audio_done));
  check(
    "progress speaking fields are safe defaults",
    Array.isArray(progress.speaking_done) &&
      typeof progress.speaking_attempts === "number" &&
      typeof progress.speaking_last_at === "number"
  );

  console.log("\nStudy API: queue, readiness, plan");
  const readiness = await getJson("/api/study/readiness");
  check("readiness score 0..100", Number(readiness.score) >= 0 && Number(readiness.score) <= 100, String(readiness.score));
  check("readiness has components", Array.isArray(readiness.components) && readiness.components.length === 4);
  check("readiness weak units array", Array.isArray(readiness.weak_units));
  check("readiness weak types array", Array.isArray(readiness.weak_types));
  const plan = await getJson("/api/study/plan");
  check("plan has seven days", Array.isArray(plan.days) && plan.days.length === 7, String(plan.days && plan.days.length));
  check("plan today has tasks", Boolean(plan.today) && Array.isArray(plan.today.tasks));
  const reviewQueue = await getJson("/api/study/queue?kind=review");
  check("queue mode review", reviewQueue.mode === "review");
  check("queue items array", Array.isArray(reviewQueue.items));
  check("queue has counts and prefs", Boolean(reviewQueue.counts) && Boolean(reviewQueue.prefs));
  const newQueue = await getJson("/api/study/queue?kind=new&limit=3");
  check("new queue limit honoured", Array.isArray(newQueue.items) && newQueue.items.length <= 3, String(newQueue.items && newQueue.items.length));
  check("new queue items have definitions", newQueue.items.every((item) => Object.prototype.hasOwnProperty.call(item, "definition") && Object.prototype.hasOwnProperty.call(item, "unit_title")));
  const history = await getJson("/api/exam/history");
  check("exam history.attempts — массив", Array.isArray(history.attempts));
}

function makeAttempt() {
  const now = Date.now();
  return {
    mode: "exam1",
    title: "Smoke exam",
    subtitle: "Проверка API",
    view_mode: "exam",
    started_at: now - 60000,
    finished_at: now,
    time_spent_sec: 60,
    timeout: false,
    items: [
      {
        item_id: "term:smoke-u01-abacus",
        kind: "term",
        time_ms: 5000,
        flagged: true,
        tags: ["unit-1", "vocab", "term"],
        review_en: "abacus",
        section: "terms",
        section_label: "Часть 1 · Терминология",
        type_label: "Перевод термина",
        unit_id: 1,
        prompt: "абак, счёты",
        answer: "abacus",
        input: "abacus",
        answer_label: "Правильный ответ",
        source: "Unit 01 · The History of Computers",
        source_tab: "vocab",
        auto: true,
        answered: true,
        graded: true,
      },
      {
        kind: "question",
        section: "questions",
        section_label: "Вопросы",
        type_label: "Вопрос по теме",
        unit_id: 2,
        item_id: "q:smoke-u02-computer",
        time_ms: 9000,
        flagged: true,
        tags: ["unit-2", "reading", "question"],
        review_en: "router",
        prompt: "What is a computer?",
        answer: "A computer is a programmable machine.",
        input: "A computer is a machine.",
        answer_label: "Образец ответа",
        source: "Unit 02 · Types of Computers",
        source_tab: "text",
        auto: false,
        answered: true,
        graded: false,
      },
      {
        kind: "question",
        section: "questions",
        section_label: "Вопросы",
        type_label: "Вопрос по теме",
        unit_id: 3,
        item_id: "q:smoke-u03-software",
        time_ms: 12000,
        tags: ["unit-3", "reading", "question"],
        prompt: "What is software?",
        answer: "Software is a set of programs.",
        input: "",
        answer_label: "Образец ответа",
        source: "Unit 03 · Software",
        source_tab: "text",
        auto: false,
        answered: false,
        graded: null,
      },
    ],
  };
}

async function runWriteChecks() {
  console.log("\nЗапись истории и импорт прогресса");
  const reset = await request("/api/progress/reset", { method: "POST", body: {} });
  check("POST /api/progress/reset", reset.status === 200, `статус ${reset.status}`);
  const migration = await request("/api/progress/import", {
    method: "POST",
    body: {
      progress: {
        version: 2,
        words: {
          "1|legacy-migrate": {
            box: 3,
            correct: 4,
            wrong: 1,
            last_seen: Math.floor(Date.now() / 1000) - 86400,
            due_at: Math.floor(Date.now() / 1000) + 3600,
            interval_days: 5,
            ease_factor: 2.4,
            reviews: 5,
          },
        },
        stats: { answers: 5, correct: 4, sessions: 1 },
        days: { "2026-01-01": 5 },
        exams: [],
      },
    },
  });
  check("v2 migration import status 200", migration.status === 200, `status ${migration.status}`);
  checkEqual("v2 migration bumps schema", migration.json && migration.json.progress.version, 3);
  const migratedWord = migration.json && migration.json.progress.words["1|legacy-migrate"];
  check("v2 migration derives FSRS stability", Boolean(migratedWord && migratedWord.stability > 0), String(migratedWord && migratedWord.stability));
  check("v2 migration derives review state", Boolean(migratedWord && migratedWord.fsrs_state === "review"), String(migratedWord && migratedWord.fsrs_state));
  check("v2 migration fills prefs", Boolean(migration.json && migration.json.progress.prefs && migration.json.progress.prefs.daily_new_limit === 12));
  await request("/api/progress/reset", { method: "POST", body: {} });

  const srsCorrect = await request("/api/answer", {
    method: "POST",
    body: { unit_id: 1, en: "abacus", correct: true, response_ms: 1234 },
  });
  check("POST /api/answer correct", srsCorrect.status === 200, `status ${srsCorrect.status}`);
  const srsWord = srsCorrect.json && srsCorrect.json.word;
  check("SRS first interval is positive", Boolean(srsWord && srsWord.interval_days >= 1), String(srsWord && srsWord.interval_days));
  checkEqual("SRS first rating stored", srsWord && srsWord.last_rating, 4);
  check("SRS FSRS state stored", Boolean(srsWord && srsWord.fsrs_state === "review" && srsWord.stability > 0), String(srsWord && srsWord.fsrs_state));
  check("SRS due_at is in the future", Boolean(srsWord && srsWord.due_at > Math.floor(Date.now() / 1000)));
  checkEqual("SRS response speed saved", srsWord && srsWord.last_ms, 1234);
  checkEqual("SRS review counter", srsWord && srsWord.reviews, 1);
  check("SRS ease factor increased", Boolean(srsWord && srsWord.ease_factor > 2.5), String(srsWord && srsWord.ease_factor));

  const srsWrong = await request("/api/answer", {
    method: "POST",
    body: { unit_id: 1, en: "abacus", correct: false, response_ms: 4321 },
  });
  check("POST /api/answer wrong", srsWrong.status === 200, `status ${srsWrong.status}`);
  const srsWrongWord = srsWrong.json && srsWrong.json.word;
  checkEqual("SRS wrong resets interval", srsWrongWord && srsWrongWord.interval_days, 0);
  const dueDelta = Number(srsWrongWord && srsWrongWord.due_at) - Math.floor(Date.now() / 1000);
  check("SRS wrong schedules in about 10 minutes", dueDelta >= 570 && dueDelta <= 630, `delta=${dueDelta}`);
  check("SRS wrong lowers ease", Boolean(srsWrongWord && srsWrongWord.ease_factor < 2.55), String(srsWrongWord && srsWrongWord.ease_factor));
  checkEqual("SRS wrong updates speed", srsWrongWord && srsWrongWord.last_ms, 4321);

  await request("/api/answer", {
    method: "POST",
    body: { unit_id: 1, en: "invention", correct: true, response_ms: 1500 },
  });
  let leechWord = null;
  for (let i = 0; i < 4; i += 1) {
    const lapse = await request("/api/answer", {
      method: "POST",
      body: { unit_id: 1, en: "invention", correct: false, response_ms: 4000 },
    });
    leechWord = lapse.json && lapse.json.word;
  }
  check("hard word becomes leech", Boolean(leechWord && leechWord.leech), JSON.stringify(leechWord && { lapses: leechWord.lapses, wrong: leechWord.wrong }));
  check("leech records lapses", Boolean(leechWord && leechWord.lapses >= 4), String(leechWord && leechWord.lapses));
  const leechQueue = await getJson("/api/study/queue?kind=leech");
  check("leech queue contains hard word", (leechQueue.items || []).some((item) => item.en === "invention"), JSON.stringify((leechQueue.items || []).map((item) => item.en)));

  const attempt = makeAttempt();
  const posted = await request("/api/exam/history", { method: "POST", body: attempt });
  check("POST /api/exam/history отвечает 200", posted.status === 200, `статус ${posted.status}`);
  const saved = posted.json && posted.json.attempt;
  check("попытка получила id", Boolean(saved && saved.id));
  checkEqual("total посчитан", saved && saved.total, 3);
  checkEqual("correct посчитан", saved && saved.correct, 1);
  checkEqual("wrong посчитан", saved && saved.wrong, 1);
  checkEqual("skipped посчитан", saved && saved.skipped, 1);
  checkEqual("score_pct посчитан", saved && saved.score_pct, 33);
  checkEqual("источники сохранены", saved && saved.items[0].source, "Unit 01 · The History of Computers");

  checkEqual("saved first item_id", saved && saved.items[0].item_id, "term:smoke-u01-abacus");
  checkEqual("saved item time_ms", saved && saved.items[1].time_ms, 9000);
  check("saved flagged item", Boolean(saved && saved.items[1].flagged));
  check("saved item tags", Boolean(saved && Array.isArray(saved.items[1].tags) && saved.items[1].tags.includes("question")));
  const progressAfterExam = await getJson("/api/progress");
  check("exam error queued for review", progressAfterExam.due >= 1, String(progressAfterExam.due));
  checkEqual("today exam answers", progressAfterExam.today && progressAfterExam.today.exam_answers, 2);
  const history = await getJson("/api/exam/history");
  checkEqual("в истории одна попытка", history.attempts.length, 1);
  checkEqual("история вернула id", history.attempts[0].id, saved.id);
  const progress = await getJson("/api/progress");
  checkEqual("progress.exams содержит попытку", progress.exams.length, 1);

  const storedPrefs = await request("/api/study/prefs", {
    method: "POST",
    body: {
      daily_new_limit: 2,
      daily_review_limit: 5,
      daily_leech_limit: 3,
      daily_exam_limit: 4,
      desired_minutes: 30,
      desired_retention_pct: 95,
      max_interval_days: 30,
      exam_date: "2026-12-31",
    },
  });
  check("POST /api/study/prefs status 200", storedPrefs.status === 200, `status ${storedPrefs.status}`);
  checkEqual("prefs new limit saved", storedPrefs.json && storedPrefs.json.prefs.daily_new_limit, 2);
  checkEqual("prefs exam date saved", storedPrefs.json && storedPrefs.json.prefs.exam_date, "2026-12-31");
  checkEqual("prefs retention saved", storedPrefs.json && storedPrefs.json.prefs.desired_retention_pct, 95);
  checkEqual("prefs max interval saved", storedPrefs.json && storedPrefs.json.prefs.max_interval_days, 30);
  const plannedQueue = await getJson("/api/study/queue?kind=new");
  check("prefs limit caps new queue", (plannedQueue.items || []).length <= 2, String((plannedQueue.items || []).length));
  const clampedPrefs = await request("/api/study/prefs", {
    method: "POST",
    body: { desired_retention_pct: 99, max_interval_days: 1 },
  });
  check("prefs clamp FSRS personalization", clampedPrefs.status === 200 && clampedPrefs.json.prefs.desired_retention_pct === 95 && clampedPrefs.json.prefs.max_interval_days === 7, JSON.stringify(clampedPrefs.json && clampedPrefs.json.prefs));
  await request("/api/study/prefs", { method: "POST", body: { desired_retention_pct: 90, max_interval_days: 3650 } });
  const invalidPrefs = await request("/api/study/prefs", { method: "POST", body: { exam_date: "31.12.2026" } });
  check("prefs reject invalid exam date", invalidPrefs.status === 400, `status ${invalidPrefs.status}`);

  console.log("\nMistake notebook and audio library");
  const mistakes = await getJson("/api/mistakes");
  check("mistakes has items", Array.isArray(mistakes.items) && mistakes.items.length >= 2, String(mistakes.items && mistakes.items.length));
  checkEqual("mistakes unresolved count", mistakes.unresolved, mistakes.items.filter((item) => !item.resolved).length);
  const firstMistake = mistakes.items.find((item) => !item.resolved);
  check("mistake has explanation", Boolean(firstMistake && firstMistake.explanation && firstMistake.explanation.length > 20));
  check("mistake has example", Boolean(firstMistake && firstMistake.example && firstMistake.example.length > 3));
  check("mistake has drill", Boolean(firstMistake && firstMistake.drill && ["choice", "self"].includes(firstMistake.drill.mode)));
  const resolved = await request("/api/mistakes/resolve", {
    method: "POST",
    body: { id: firstMistake.id, resolved: true },
  });
  check("POST /api/mistakes/resolve status 200", resolved.status === 200, `status ${resolved.status}`);
  checkEqual("resolve returns new unresolved count", resolved.json && resolved.json.unresolved, mistakes.unresolved - 1);
  const afterResolve = await getJson("/api/mistakes");
  check("resolved mistake marked", (afterResolve.items || []).find((item) => item.id === firstMistake.id).resolved === true);
  const emptyResolve = await request("/api/mistakes/resolve", { method: "POST", body: { id: "" } });
  check("mistake resolve rejects empty id", emptyResolve.status === 400, `status ${emptyResolve.status}`);

  const audio = await getJson("/api/audio");
  check("audio has five items", Array.isArray(audio.items) && audio.items.length === 5, String(audio.items && audio.items.length));
  check("audio items have tasks and transcripts", audio.items.every((item) => item.file && item.duration_sec > 0 && Array.isArray(item.tasks) && item.tasks.length > 0 && item.transcript));
  const audioFile = await request("/audio/unit03-multicore.wav");
  check("GET audio wav status 200", audioFile.status === 200, `status ${audioFile.status}`);
  check("audio wav mime type", /audio\/wav/.test(audioFile.headers.get("content-type") || ""), audioFile.headers.get("content-type"));
  check("audio wav RIFF header", audioFile.text.startsWith("RIFF") && audioFile.text.includes("WAVE"));
  const audioDone = await request("/api/audio/done", { method: "POST", body: { id: "multicore", done: true } });
  check("audio mark done status 200", audioDone.status === 200, `status ${audioDone.status}`);
  check("audio done persisted in response", (audioDone.json && audioDone.json.done || []).includes("multicore"));
  const audioProgress = await getJson("/api/progress");
  check("audio done in progress", (audioProgress.audio_done || []).includes("multicore"));
  await request("/api/audio/done", { method: "POST", body: { id: "multicore", done: false } });
  const unknownAudio = await request("/api/audio/done", { method: "POST", body: { id: "missing-audio", done: true } });
  check("audio unknown item returns 404", unknownAudio.status === 404, `status ${unknownAudio.status}`);

  console.log("\nSpeaking progress");
  const speakingBank = await getJson("/api/speaking");
  const speakingPrompt = (speakingBank.prompts || [])[0];
  check("speaking bank available for write checks", Boolean(speakingPrompt && speakingPrompt.id));
  const speakingAttempt = await request("/api/speaking/attempt", {
    method: "POST",
    body: { id: speakingPrompt.id, completed: true },
  });
  check("speaking attempt status 200", speakingAttempt.status === 200, `status ${speakingAttempt.status}`);
  checkEqual("speaking attempt count", speakingAttempt.json && speakingAttempt.json.speaking.attempts, 1);
  checkEqual("speaking completed count", speakingAttempt.json && speakingAttempt.json.speaking.completed, 1);
  check(
    "speaking attempt marks prompt done",
    Boolean(speakingAttempt.json && speakingAttempt.json.speaking.done.includes(speakingPrompt.id))
  );
  const speakingProgress = await getJson("/api/progress");
  check("speaking done in progress", (speakingProgress.speaking_done || []).includes(speakingPrompt.id));
  checkEqual("speaking attempts in progress", speakingProgress.speaking_attempts, 1);
  const speakingRetry = await request("/api/speaking/attempt", {
    method: "POST",
    body: { id: speakingPrompt.id, completed: false },
  });
  check("speaking retry keeps completed prompt", Boolean(speakingRetry.json && speakingRetry.json.speaking.done.includes(speakingPrompt.id)));
  checkEqual("speaking retry counts an attempt", speakingRetry.json && speakingRetry.json.speaking.attempts, 2);
  const unknownSpeaking = await request("/api/speaking/attempt", {
    method: "POST",
    body: { id: "missing-speaking", completed: true },
  });
  check("speaking unknown prompt returns 404", unknownSpeaking.status === 404, `status ${unknownSpeaking.status}`);
  const emptySpeaking = await request("/api/speaking/attempt", { method: "POST", body: { id: "", completed: true } });
  check("speaking empty prompt returns 400", emptySpeaking.status === 400, `status ${emptySpeaking.status}`);

  const importedAttempt = {
    ...makeAttempt(),
    id: "imported-exam",
    title: "Imported exam",
  };
  const imported = await request("/api/progress/import", {
    method: "POST",
    body: {
      progress: {
        words: {},
        stats: { answers: 12, correct: 9, sessions: 2 },
        days: { "2026-01-01": 6 },
        exams: [importedAttempt],
      },
    },
  });
  check("POST /api/progress/import отвечает 200", imported.status === 200, `статус ${imported.status}`);
  checkEqual("импорт вернул статистику", imported.json && imported.json.progress.stats.answers, 12);
  checkEqual("импорт вернул историю", imported.json && imported.json.progress.exams.length, 1);
  checkEqual("импорт сохранил id попытки", imported.json && imported.json.progress.exams[0].id, "imported-exam");

  const afterImport = await getJson("/api/progress");
  checkEqual("импорт сохранил ответы", afterImport.stats.answers, 12);
  checkEqual("импорт сохранил попытку", afterImport.exams[0].id, "imported-exam");

  const settingsAfterImport = await getJson("/api/settings");
  const backupsAfterImport = settingsAfterImport.backups || [];
  check("backups created before destructive import", backupsAfterImport.length >= 1, String(backupsAfterImport.length));
  check("newest backup uses millisecond stamp", /^progress-\d{10,}(?:-\d+)?\.json$/.test(backupsAfterImport[0] || ""), backupsAfterImport[0]);
  const backupStamps = backupsAfterImport.map((name) => Number((String(name).match(/^progress-(\d+)/) || [])[1] || 0));
  check("backups sorted newest first", backupStamps.every((stamp, i) => i === 0 || stamp <= backupStamps[i - 1]), JSON.stringify(backupsAfterImport));

  const nowSec = Math.floor(Date.now() / 1000);
  const merge = await request("/api/progress/import", {
    method: "POST",
    body: {
      merge: true,
      progress: {
        words: {
          "9|merge-word": { box: 1, correct: 1, wrong: 0, last_seen: nowSec, due_at: nowSec + 86400, interval_days: 1, ease_factor: 2.5, reviews: 1, last_ms: 600 },
        },
        stats: { answers: 0, correct: 0, sessions: 0 },
        days: {},
        exams: [],
      },
    },
  });
  check("merge import status 200", merge.status === 200, `status ${merge.status}`);
  checkEqual("merge import flag", merge.json && merge.json.merged, true);
  checkEqual("merge keeps existing answers", merge.json && merge.json.progress.stats.answers, 12);
  checkEqual("merge keeps existing exams", merge.json && merge.json.progress.exams.length, 1);
  check("merge adds a new word", Boolean(merge.json && merge.json.progress.words["9|merge-word"]));

  const backupsBeforeRestore = (await getJson("/api/settings")).backups || [];
  const restoreTarget = backupsBeforeRestore[0];
  const restored = await request("/api/progress/restore", { method: "POST", body: { name: restoreTarget } });
  check("POST /api/progress/restore status 200", restored.status === 200, `status ${restored.status}`);
  checkEqual("restore returns snapshot name", restored.json && restored.json.restored, restoreTarget);
  checkEqual("restore returns imported answers", restored.json && restored.json.progress.stats.answers, 12);
  checkEqual("restore returns imported exam", restored.json && restored.json.progress.exams[0].id, "imported-exam");

  for (let i = 0; i < 6; i += 1) {
    await request("/api/progress/reset", { method: "POST", body: {} });
  }
  const rotated = (await getJson("/api/settings")).backups || [];
  checkEqual("backup rotation keeps five snapshots", rotated.length, 5);
  check("rotated backups newest first", /^progress-\d{10,}/.test(rotated[0] || ""), rotated[0]);

  const reimported = await request("/api/progress/import", {
    method: "POST",
    body: {
      progress: {
        words: {},
        stats: { answers: 12, correct: 9, sessions: 2 },
        days: { "2026-01-01": 6 },
        exams: [importedAttempt],
        speaking_done: [speakingPrompt.id],
        speaking_attempts: 2,
        speaking_last_at: nowSec,
      },
    },
  });
  check("re-import after restore status 200", reimported.status === 200, `status ${reimported.status}`);
  checkEqual("state prepared for restart", reimported.json && reimported.json.progress.stats.answers, 12);
  check(
    "speaking progress imported for restart",
    Boolean(reimported.json && reimported.json.progress.speaking_done.includes(speakingPrompt.id))
  );

  const traversal = await request("/api/progress/restore", { method: "POST", body: { name: "../progress.json" } });
  check("restore rejects path traversal", traversal.status === 400, `status ${traversal.status}`);
  const invalid = await request("/api/progress/import", {
    method: "POST",
    body: { progress: { stats: { answers: "not-a-number" } } },
  });
  check("некорректный импорт отклоняется", invalid.status === 400, `статус ${invalid.status}`);

  return { historyId: "imported-exam", speakingId: speakingPrompt.id };
}

async function runLanChecks() {
  console.log("\nРежим мобильного доступа --lan");
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "itelab-smoke-lan-"));
  tempDirs.push(dataDir);
  const server = await startServer(dataDir, ["--lan"]);
  const previousBase = base;
  base = server.base;
  try {
    const settings = await getJson("/api/settings");
    checkEqual("lan_enabled включён", settings.lan_enabled, true);
    check("lan_url заполнен", typeof settings.lan_url === "string" && settings.lan_url.length > 0, String(settings.lan_url));
    check(
      "lan_url похож на адрес по локальной сети",
      /^http:\/\/\d+\.\d+\.\d+\.\d+:\d+$/.test(settings.lan_url || ""),
      String(settings.lan_url)
    );
    check(
      "lan_url использует тот же порт",
      (settings.lan_url || "").endsWith(`:${server.port}`),
      `${settings.lan_url} / ${server.port}`
    );
    console.log(`  адрес для телефона: ${settings.lan_url}`);
    if (settings.lan_url) {
      const lanHealth = await fetch(settings.lan_url + "/api/health");
      check("сервер доступен по lan_url", lanHealth.ok, `статус ${lanHealth.status}`);
    }
  } finally {
    base = previousBase;
    await server.stop();
  }
}

async function cleanupData() {
  console.log("\nОчистка тестовых данных");
  const cleared = await request("/api/exam/history", { method: "DELETE" });
  check("DELETE /api/exam/history", cleared.status === 200, `статус ${cleared.status}`);
  const history = await getJson("/api/exam/history");
  checkEqual("история очищена", history.attempts.length, 0);
  const reset = await request("/api/progress/reset", { method: "POST", body: {} });
  check("POST /api/progress/reset после теста", reset.status === 200, `статус ${reset.status}`);
  const progress = await getJson("/api/progress");
  checkEqual("статистика очищена", progress.stats.answers, 0);
  checkEqual("попытки очищены", progress.exams.length, 0);
}

async function main() {
  console.log("IT English Lab smoke test");
  console.log(`Сервер: ${base || "будет запущен из dist"}`);

  if (!explicitBase) {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "itelab-smoke-"));
    tempDirs.push(dataDir);
    const server = await startServer(dataDir);
    base = server.base;
    try {
      const defaults = await getJson("/api/settings");
      checkEqual("по умолчанию LAN выключен", defaults.lan_enabled, false);
      checkEqual("по умолчанию адреса LAN нет", defaults.lan_url, null);
      await runReadChecks();
      const write = await runWriteChecks();
      console.log("\nПерезапуск и сохранение прогресса");
      await server.stop();
      const restarted = await startServer(dataDir);
      base = restarted.base;
      const history = await getJson("/api/exam/history");
      check(
        "история пережила перезапуск",
        history.attempts.some((attempt) => attempt.id === write.historyId),
        JSON.stringify(history.attempts.map((attempt) => attempt.id))
      );
      const progress = await getJson("/api/progress");
      checkEqual("статистика пережила перезапуск", progress.stats.answers, 12);
      check(
        "speaking progress survived restart",
        (progress.speaking_done || []).includes(write.speakingId) && progress.speaking_attempts === 2
      );
      await cleanupData();
      await restarted.stop();
    } finally {
      await server.stop();
    }
    if (testLan) await runLanChecks();
  } else {
    await runReadChecks();
    if (allowWrite) {
      await runWriteChecks();
      await cleanupData();
    } else {
      console.log("\nЗапись пропущена: для чужого сервера нужен флаг --write");
    }
  }

  console.log(`\nВсе проверки пройдены: ${checks.length}`);
}

main()
  .catch((error) => {
    console.error(`\n${error && error.stack ? error.stack : error}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    for (const server of startedServers) {
      try {
        await server.stop();
      } catch (_) {
        /* ignore */
      }
    }
    if (!keepFiles) {
      for (const dir of tempDirs) {
        try {
          fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
        } catch (error) {
          console.warn(`Не удалось удалить временную папку ${dir}: ${error.message}`);
        }
      }
    } else if (tempDirs.length) {
      console.log(`\nВременные папки сохранены:\n${tempDirs.join("\n")}`);
    }
  });
