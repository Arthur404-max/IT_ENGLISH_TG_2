#!/usr/bin/env node
/*
 * Portfolio screenshot capture for IT English Lab.
 *
 * Starts a disposable server against a copy of progress, optionally seeds a
 * readable demo history, drives Microsoft Edge through CDP and writes real UI
 * screenshots into the portfolio folder.
 *
 *   node tools/portfolio_shots.js --data-dir "%TEMP%\itelab-portfolio-data"
 *   node tools/portfolio_shots.js --seed --ai --out "portfolio/assets"
 *
 * Requires Node 22+ (global WebSocket) and Microsoft Edge.
 */
"use strict";

const fs = require("fs");
const net = require("net");
const os = require("os");
const path = require("path");
const { spawn, spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const argv = process.argv.slice(2);
const outDir = path.resolve(ROOT, readArg("--out") || path.join("portfolio", "assets"));
const exe =
  process.env.ITELAB_EXE ||
  path.join(ROOT, "dist", process.platform === "win32" ? "it-english-lab-embedded.exe" : "it-english-lab-embedded");
const edge =
  readArg("--edge") ||
  process.env.ITELAB_EDGE ||
  (process.platform === "win32"
    ? path.join(process.env["PROGRAMFILES(X86)"] || "C:\\Program Files (x86)", "Microsoft", "Edge", "Application", "msedge.exe")
    : "");
const seed = argv.includes("--seed");
const ai = argv.includes("--ai");

function readArg(name) {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] || "" : "";
}
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

async function waitHttp(url, timeout = 15000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    try {
      const response = await fetch(url);
      if (response.ok) return response;
    } catch (_) {
      /* not ready */
    }
    await delay(150);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function startServer(dataDir) {
  if (!fs.existsSync(exe)) throw new Error(`Executable not found: ${exe}`);
  const port = await freePort();
  const child = spawn(exe, ["--port", String(port), "--no-open", "--data-dir", dataDir], {
    cwd: ROOT,
    env: process.env,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (chunk) => (output += String(chunk)));
  child.stderr.on("data", (chunk) => (output += String(chunk)));
  const base = `http://127.0.0.1:${port}`;
  await waitHttp(`${base}/api/health`);
  return {
    base,
    child,
    get output() {
      return output;
    },
    async stop() {
      if (child.exitCode !== null) return;
      child.kill();
      for (let i = 0; i < 40 && child.exitCode === null; i += 1) await delay(100);
      if (child.exitCode === null && process.platform === "win32") {
        spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
        await delay(200);
      }
    },
  };
}

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.nextId = 1;
    this.pending = new Map();
    ws.addEventListener("message", (event) => {
      let message;
      try {
        message = JSON.parse(String(event.data));
      } catch (_) {
        return;
      }
      if (!message.id) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message || "CDP error"));
      else pending.resolve(message.result);
    });
  }
  send(method, params = {}, timeout = 30000) {
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP timeout: ${method}`));
      }, timeout);
      this.pending.set(id, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  close() {
    try {
      this.ws.close();
    } catch (_) {
      /* already closed */
    }
  }
}

async function connectCdp(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("CDP connect timeout")), 10000);
    ws.addEventListener("open", () => {
      clearTimeout(timer);
      resolve();
    });
    ws.addEventListener("error", () => {
      clearTimeout(timer);
      reject(new Error("CDP connection failed"));
    });
  });
  return new Cdp(ws);
}

async function seedProgress(base) {
  const unitsResponse = await fetch(`${base}/api/units`);
  const units = (await unitsResponse.json()).units || [];
  let answered = 0;
  for (const summary of units) {
    const unit = await (await fetch(`${base}/api/units/${summary.id}`)).json();
    const words = (unit.vocab || []).slice(0, 5);
    for (let i = 0; i < words.length; i += 1) {
      const rating = i === 4 ? 2 : 4;
      await fetch(`${base}/api/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          unit_id: summary.id,
          en: words[i].en,
          correct: rating !== 1,
          rating,
          response_ms: 2400 + i * 900,
        }),
      });
      answered += 1;
    }
  }

  const now = Math.floor(Date.now() / 1000);
  const attempt = (id, mode, title, subtitle, view, daysAgo, items, timeSpent) => {
    const correct = items.filter((item) => item.graded === true).length;
    const wrong = items.filter((item) => item.graded === false).length;
    return {
      id,
      mode,
      title,
      subtitle,
      view_mode: view,
      started_at: now - daysAgo * 86400,
      finished_at: now - daysAgo * 86400 + timeSpent,
      time_spent_sec: timeSpent,
      timeout: false,
      total: items.length,
      correct,
      wrong,
      skipped: items.filter((item) => !item.answered).length,
      score_pct: Math.round((correct / Math.max(1, items.length)) * 100),
      items,
    };
  };
  const item = (unitId, type, section, prompt, timeMs, graded, answered = true) => ({
    item_id: `${unitId}-${type}-${Math.random().toString(36).slice(2, 8)}`,
    kind: type,
    section,
    section_label: section === "grammar" ? "Грамматика" : section === "reading" ? "Понимание текста" : section === "vocab" ? "Лексика" : "Перевод",
    type_label: type,
    unit_id: unitId,
    prompt,
    answer: "—",
    input: graded ? "—" : "—",
    answer_label: "—",
    note: "",
    source: "portfolio demo",
    source_tab: "",
    auto: false,
    answered,
    graded,
    time_ms: timeMs,
    flagged: false,
    tags: [],
    review_en: "",
  });

  const attempts = [
    attempt("demo-diag", "diagnostic", "Диагностика", "20 заданий · все темы", "exam", 11, [
      item(1, "Перевод RU→EN", "vocab", "invention → изобретение", 8200, true),
      item(2, "Выбор перевода", "vocab", "reliable →", 9100, true),
      item(3, "Контекст", "reading", "The first computer was built in …", 12400, true),
      item(4, "Грамматика", "grammar", "Present Perfect: have developed", 15800, false),
      item(5, "Аудирование", "audio", "Main idea of the recording", 22100, true),
      item(6, "Перевод EN→RU", "translation", "deploy the update", 17200, false),
      item(7, "Лексика", "vocab", "to troubleshoot →", 6800, true),
      item(8, "Понимание текста", "reading", "Which statement is true?", 19500, true),
      item(9, "Грамматика", "grammar", "Passive voice: was released", 11200, true),
      item(10, "Перевод RU→EN", "translation", "надёжный сервер", 25300, true),
    ], 1480),
    attempt("demo-u1", "exam1", "Экзамен 1", "Units 1–5 · 25 заданий", "exam", 6, [
      item(1, "Лексика", "vocab", "hardware →", 5400, true),
      item(2, "Лексика", "vocab", "software →", 6100, true),
      item(3, "Грамматика", "grammar", "Past Simple: was created", 8800, true),
      item(4, "Перевод RU→EN", "translation", "обновить приложение", 19200, false),
      item(5, "Контекст", "reading", "A compiler translates …", 22100, true),
      item(6, "Аудирование", "audio", "What is the speaker's job?", 26800, true),
      item(7, "Лексика", "vocab", "database →", 7200, true),
      item(8, "Понимание текста", "reading", "Why was the invention important?", 18400, true),
    ], 1210),
    attempt("demo-u2", "exam2", "Экзамен 2", "Units 6–10 · 25 заданий", "exam", 3, [
      item(6, "Лексика", "vocab", "encryption →", 7600, true),
      item(7, "Грамматика", "grammar", "Conditionals: would", 14600, false),
      item(8, "Перевод EN→RU", "translation", "secure connection", 13500, true),
      item(9, "Контекст", "reading", "The firewall blocks …", 17300, true),
      item(10, "Аудирование", "audio", "What does the client need?", 24200, true),
      item(11, "Лексика", "vocab", "scalable →", 8100, true),
      item(12, "Перевод RU→EN", "translation", "резервная копия", 21800, false),
      item(13, "Понимание текста", "reading", "According to the article …", 20100, true),
    ], 1320),
    attempt("demo-final", "final", "Итоговая проверка", "Все 15 юнитов", "practice", 1, [
      item(13, "Лексика", "vocab", "throughput →", 6900, true),
      item(14, "Перевод RU→EN", "translation", "распределённая система", 24700, true),
      item(15, "Грамматика", "grammar", "Reported speech", 15100, true),
      item(4, "Контекст", "reading", "The algorithm runs in …", 12700, true),
      item(5, "Аудирование", "audio", "What is the main risk?", 23600, false),
      item(2, "Лексика", "vocab", "bandwidth →", 5700, true),
    ], 890),
  ];
  for (const attemptData of attempts) {
    await fetch(`${base}/api/exam/history`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(attemptData),
    });
  }
  return answered;
}

async function enrichDays(dataDir) {
  const file = path.join(dataDir, "progress.json");
  if (!fs.existsSync(file)) return;
  const progress = JSON.parse(fs.readFileSync(file, "utf8"));
  const now = new Date();
  progress.days = progress.days || {};
  progress.day_ms = progress.day_ms || {};
  progress.stats = progress.stats || { answers: 0, correct: 0, sessions: 0 };
  progress.stats.sessions = Math.max(18, Number(progress.stats.sessions) || 0);
  progress.stats.answers = Math.max(310, Number(progress.stats.answers) || 0);
  progress.stats.correct = Math.max(274, Number(progress.stats.correct) || 0);
  progress.speaking_attempts = Math.max(26, Number(progress.speaking_attempts) || 0);
  progress.speaking_last_at = Math.floor(Date.now() / 1000) - 3600;
  progress.audio_done = ["it-careers", "it-security", "it-startup"];
  progress.speaking_done = ["sp-1", "sp-2", "sp-3", "sp-4", "sp-5", "sp-6"];
  for (let i = 0; i < 14; i += 1) {
    const date = new Date(now.getTime() - i * 86400000);
    const key = date.toISOString().slice(0, 10);
    progress.days[key] = 14 + ((i * 7) % 21);
    progress.day_ms[key] = (18 + ((i * 5) % 26)) * 60000;
  }
  fs.writeFileSync(file, JSON.stringify(progress, null, 2));
}

async function main() {
  if (!edge || !fs.existsSync(edge)) throw new Error(`Microsoft Edge not found: ${edge || "(empty)"}`);
  if (typeof WebSocket !== "function") throw new Error("Node.js 22+ with a global WebSocket is required.");

  const requestedDataDir = readArg("--data-dir");
  const dataDir = requestedDataDir
    ? path.resolve(requestedDataDir)
    : fs.mkdtempSync(path.join(os.tmpdir(), "itelab-portfolio-data-"));
  const liveDataDir = path.join(process.env.APPDATA || "", "ITEnglishLab");
  if (path.resolve(liveDataDir).toLowerCase() === dataDir.toLowerCase()) {
    throw new Error("Refusing to capture against the live data directory; pass a copy.");
  }
  fs.mkdirSync(outDir, { recursive: true });
  fs.mkdirSync(dataDir, { recursive: true });

  if (seed) {
    const pre = await startServer(dataDir);
    try {
      const count = await seedProgress(pre.base);
      console.log(`  seeded ${count} card answers and 4 exam attempts`);
    } finally {
      await pre.stop();
    }
    await enrichDays(dataDir);
  }

  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), "itelab-portfolio-profile-"));
  const debugPort = await freePort();
  const server = await startServer(dataDir);
  let browser = null;
  let cdp = null;

  const shots = [];
  const take = async (name) => {
    const result = await cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true });
    const file = path.join(outDir, name);
    fs.writeFileSync(file, Buffer.from(result.data, "base64"));
    shots.push(name);
    console.log(`  shot ${name}`);
  };

  try {
    console.log(`  server: ${server.base}`);
    console.log(`  data:   ${dataDir}`);
    const args = [
      `--remote-debugging-port=${debugPort}`,
      `--user-data-dir=${profileDir}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-background-networking",
      "--disable-component-update",
      "--disable-features=Translate,MediaRouter,OptimizationHints",
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
      "--window-size=1440,900",
      "--headless=new",
      "--disable-gpu",
      "about:blank",
    ];
    browser = spawn(edge, args, { windowsHide: true, stdio: "ignore" });
    await waitHttp(`http://127.0.0.1:${debugPort}/json/version`, 20000);
    let targets = [];
    for (let i = 0; i < 100; i += 1) {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
      targets = await response.json();
      if (targets.some((target) => target.type === "page")) break;
      await delay(150);
    }
    const pageTarget = targets.find((target) => target.type === "page");
    if (!pageTarget) throw new Error("No Edge page target found");
    cdp = await connectCdp(pageTarget.webSocketDebuggerUrl);
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    await cdp.send("Emulation.setEmulatedMedia", {
      features: [{ name: "prefers-reduced-motion", value: "reduce" }],
    });
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: 1440,
      height: 900,
      deviceScaleFactor: 2,
      mobile: false,
      screenWidth: 1440,
      screenHeight: 900,
    });

    const evaluate = async (expression, awaitPromise = false, timeout = 30000) => {
      const result = await cdp.send(
        "Runtime.evaluate",
        { expression, returnByValue: true, awaitPromise, userGesture: true },
        timeout
      );
      if (result.exceptionDetails) {
        const text =
          result.exceptionDetails.exception && result.exceptionDetails.exception.description
            ? result.exceptionDetails.exception.description
            : result.exceptionDetails.text;
        throw new Error(`Page evaluation failed: ${text}`);
      }
      return result.result ? result.result.value : undefined;
    };
    const waitFor = async (expression, timeout = 15000) => {
      const started = Date.now();
      while (Date.now() - started < timeout) {
        try {
          if (await evaluate(`Boolean(${expression})`)) return true;
        } catch (_) {
          /* navigating */
        }
        await delay(120);
      }
      throw new Error(`Timed out waiting for ${expression}`);
    };
    const navigate = async (hash, waitExpression) => {
      await evaluate(`location.hash = ${JSON.stringify(hash)}; true`);
      await waitFor(waitExpression || "window.IT && IT.S && IT.S.ready");
      await delay(350);
      await evaluate(
        "document.documentElement.style.scrollbarWidth = 'none'; document.head.insertAdjacentHTML('beforeend', '<style>::-webkit-scrollbar{width:0;height:0}</style>'); window.scrollTo(0, 0); true"
      );
      await delay(200);
    };
    const click = async (selector) => {
      const found = await evaluate(
        `(() => { const element = document.querySelector(${JSON.stringify(selector)}); if (!element) return false; element.click(); return true; })()`
      );
      if (!found) throw new Error(`Element not found: ${selector}`);
      await delay(500);
    };

    await cdp.send("Page.navigate", { url: `${server.base}/#/home` });
    await waitFor("window.IT && IT.S && IT.S.ready", 20000);
    await delay(700);
    await evaluate(
      "document.documentElement.style.scrollbarWidth = 'none'; document.head.insertAdjacentHTML('beforeend', '<style>::-webkit-scrollbar{width:0;height:0}</style>'); true"
    );

    await navigate("#/home", "document.querySelector('.home-hero')");
    await take("01-home.png");

    await navigate("#/textbook", "document.querySelector('.unit-card')");
    await take("02-textbook.png");

    await navigate("#/unit/3/qa", "document.querySelector('.qa-card')");
    await evaluate("document.querySelector('.qa-card').scrollIntoView({ block: 'start' }); true");
    await delay(450);
    await take("05-unit-qa.png");

    await navigate("#/study", "document.querySelector('.study-hero')");
    await take("06-study.png");

    await navigate("#/trainer", "document.querySelector('.mode-card')");
    await take("07-trainer.png");

    await click('[data-action="start-practice"][data-mode="cloze"]');
    await waitFor("document.querySelector('.cloze-gap')");
    await delay(500);
    await take("08-cloze.png");

    await navigate("#/exams", "document.querySelector('.exam-grid')");
    await click('[data-action="start-exam"][data-mode="exam1"]');
    await waitFor("document.querySelector('.exam-map-panel')");
    await delay(700);
    await take("10-exam-runner.png");

    await navigate("#/speaking", "document.querySelector('.speaking-page')");
    await take("13-speaking.png");

    if (ai) {
      const modelPath = path.join(dataDir, "models", "Qwen_Qwen3.5-4B-Q4_K_M.gguf");
      await fetch(`${server.base}/api/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "embedded", embedded_model: modelPath, embedded_ctx: 4096 }),
      });
      const loadResponse = await fetch(`${server.base}/api/embedded/load`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const status = await loadResponse.json().catch(() => ({}));
      console.log(`  embedded load: ${JSON.stringify(status).slice(0, 160)}`);
      let ready = false;
      const started = Date.now();
      while (Date.now() - started < 180000) {
        const state = await (await fetch(`${server.base}/api/embedded/status`)).json();
        if (state.loaded || state.ready) {
          ready = true;
          break;
        }
        if (state.error) {
          console.log(`  embedded load skipped: ${state.error}`);
          break;
        }
        await delay(1000);
      }
      if (ready) {
        await evaluate(
          `(async () => { IT.S.settings = await IT.api("/api/settings"); IT.hydrateSidebar(); return true; })()`,
          true
        );
        await navigate("#/tutor", "document.querySelector('.chat-page')");
        await delay(700);
        await take("15-tutor.png");
      } else {
        console.log("  embedded model is not ready; skipping tutor screenshot");
      }
    }

    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: 390,
      height: 844,
      deviceScaleFactor: 2,
      mobile: true,
      screenWidth: 390,
      screenHeight: 844,
    });
    await delay(500);
    await navigate("#/home", "document.querySelector('.home-hero')");
    await take("16-mobile-home.png");
    await navigate("#/study", "document.querySelector('.study-hero')");
    await take("17-mobile-study.png");
    await navigate("#/unit/14/qa", "document.querySelector('.qa-card')");
    await evaluate("document.querySelector('.qa-card').scrollIntoView({ block: 'start' }); true");
    await delay(450);
    await take("19-mobile-qa.png");

    console.log(`\n  ${shots.length} screenshots -> ${outDir}`);
  } finally {
    await server.stop();
    if (cdp) cdp.close();
    if (browser) {
      browser.kill();
      await delay(400);
      if (browser.exitCode === null && process.platform === "win32") {
        spawnSync("taskkill", ["/PID", String(browser.pid), "/T", "/F"], { stdio: "ignore" });
      }
    }
  }
}

main().catch((error) => {
  console.error(`\n  FAILED: ${error.message}`);
  process.exitCode = 1;
});
