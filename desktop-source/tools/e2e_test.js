#!/usr/bin/env node
/*
 * IT English Lab E2E test.
 *
 * Starts a disposable server and drives Microsoft Edge through the Chrome
 * DevTools Protocol. No Playwright/npm dependencies are required: Node 22+
 * provides a global WebSocket and the test talks to Edge directly.
 *
 *   node tools/e2e_test.js
 *   node tools/e2e_test.js --headful
 *   node tools/e2e_test.js --edge "C:\path\to\msedge.exe"
 *   node tools/e2e_test.js --data-dir "%TEMP%\itelab-copy"
 *
 * Checks exam map/precheck/timer, history after reload, speaking practice,
 * mobile layouts at 390x844 and 360x800, ARIA focus handling, PWA registration
 * and shell cache.
 * Screenshots are written to a temporary artifact directory and printed.
 */
"use strict";

const fs = require("fs");
const net = require("net");
const os = require("os");
const path = require("path");
const { spawn, spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const argv = process.argv.slice(2);
const headful = argv.includes("--headful");
const exe =
  process.env.ITELAB_EXE ||
  path.join(ROOT, "dist", process.platform === "win32" ? "it-english-lab.exe" : "it-english-lab");
const edge =
  readArg("--edge") ||
  process.env.ITELAB_EDGE ||
  (process.platform === "win32"
    ? path.join(process.env["PROGRAMFILES(X86)"] || "C:\\Program Files (x86)", "Microsoft", "Edge", "Application", "msedge.exe")
    : "");

const checks = [];
let passed = 0;
const artifactDir = path.join(os.tmpdir(), `itelab-e2e-${Date.now()}`);
fs.mkdirSync(artifactDir, { recursive: true });

function check(name, condition, detail = "") {
  const ok = Boolean(condition);
  checks.push({ name, ok, detail });
  if (ok) {
    passed += 1;
    console.log(`  ok  ${name}`);
  } else {
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
  return ok;
}

function readArg(name) {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] || "" : "";
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
  if (!fs.existsSync(exe)) {
    throw new Error(`Executable not found: ${exe}. Run .\\build.ps1 first.`);
  }
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
      for (let i = 0; i < 30 && child.exitCode === null; i += 1) await delay(100);
      if (child.exitCode === null && process.platform === "win32") {
        spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
        await delay(150);
      }
    },
  };
}

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.nextId = 1;
    this.pending = new Map();
    this.events = [];
    ws.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (message.id) {
        const item = this.pending.get(message.id);
        if (!item) return;
        this.pending.delete(message.id);
        if (message.error) item.reject(new Error(message.error.message || JSON.stringify(message.error)));
        else item.resolve(message.result);
      } else {
        this.events.push(message);
      }
    });
    ws.addEventListener("close", () => {
      for (const item of this.pending.values()) item.reject(new Error("CDP socket closed"));
      this.pending.clear();
    });
  }

  send(method, params = {}, timeout = 20000) {
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

function writeScreenshot(cdp, name) {
  return cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false }).then((result) => {
    const file = path.join(artifactDir, name);
    fs.writeFileSync(file, Buffer.from(result.data, "base64"));
    return file;
  });
}

async function main() {
  console.log("IT English Lab E2E test");
  if (!edge || !fs.existsSync(edge)) {
    throw new Error(`Microsoft Edge not found: ${edge || "(empty)"}. Use --edge <path>.`);
  }
  if (typeof WebSocket !== "function") {
    throw new Error("This test requires Node.js 22+ with a global WebSocket.");
  }

  const requestedDataDir = readArg("--data-dir");
  const dataDir = requestedDataDir
    ? path.resolve(requestedDataDir)
    : fs.mkdtempSync(path.join(os.tmpdir(), "itelab-e2e-data-"));
  const liveDataDir = path.join(process.env.APPDATA || "", "ITEnglishLab");
  if (requestedDataDir && path.resolve(liveDataDir).toLowerCase() === dataDir.toLowerCase()) {
    throw new Error("Refusing to run E2E against the live data directory; pass a copy.");
  }
  fs.mkdirSync(dataDir, { recursive: true });
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), "itelab-e2e-profile-"));
  const debugPort = await freePort();
  const server = await startServer(dataDir);
  let browser = null;
  let cdp = null;
  const exceptions = [];

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
      "--window-size=1280,900",
    ];
    if (!headful) args.push("--headless=new", "--disable-gpu");
    args.push("about:blank");
    browser = spawn(edge, args, { windowsHide: true, stdio: "ignore" });
    await waitHttp(`http://127.0.0.1:${debugPort}/json/version`, 20000);

    let targets = [];
    const targetStarted = Date.now();
    while (Date.now() - targetStarted < 15000) {
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
    await cdp.send("Log.enable");
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: 1280,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
      screenWidth: 1280,
      screenHeight: 900,
    });

    cdp.ws.addEventListener("message", (event) => {
      try {
        const message = JSON.parse(String(event.data));
        if (message.method === "Runtime.exceptionThrown") {
          exceptions.push(message.params.exceptionDetails.text || "Runtime exception");
        }
        if (message.method === "Log.entryAdded" && message.params.entry.level === "error") {
          exceptions.push(message.params.entry.text || "Console error");
        }
      } catch (_) {
        /* ignore malformed event */
      }
    });

    const evaluate = async (expression, awaitPromise = false) => {
      const result = await cdp.send("Runtime.evaluate", {
        expression,
        returnByValue: true,
        awaitPromise,
        userGesture: true,
      });
      if (result.exceptionDetails) {
        const text =
          result.exceptionDetails.exception && result.exceptionDetails.exception.description
            ? result.exceptionDetails.exception.description
            : result.exceptionDetails.text;
        throw new Error(`Page evaluation failed: ${text}`);
      }
      return result.result ? result.result.value : undefined;
    };

    const waitFor = async (expression, timeout = 10000) => {
      const started = Date.now();
      while (Date.now() - started < timeout) {
        try {
          if (await evaluate(`Boolean(${expression})`)) return true;
        } catch (_) {
          /* page is navigating */
        }
        await delay(120);
      }
      throw new Error(`Timed out waiting for ${expression}`);
    };

    const navigateHash = async (hash, waitExpression) => {
      await evaluate(`location.hash = ${JSON.stringify(hash)}; true`);
      await waitFor(waitExpression || "window.IT && IT.S && IT.S.ready", 12000);
      await delay(150);
    };

    const click = async (selector) => {
      const found = await evaluate(
        `(() => { const element = document.querySelector(${JSON.stringify(selector)}); if (!element) return false; try { element.focus({ preventScroll: true }); } catch (_) {} element.click(); return true; })()`
      );
      if (!found) throw new Error(`Element not found: ${selector}`);
    };

    const key = async (keyName, code, virtualKeyCode) => {
      await cdp.send("Input.dispatchKeyEvent", {
        type: "keyDown",
        key: keyName,
        code,
        windowsVirtualKeyCode: virtualKeyCode,
        nativeVirtualKeyCode: virtualKeyCode,
      });
      await cdp.send("Input.dispatchKeyEvent", {
        type: "keyUp",
        key: keyName,
        code,
        windowsVirtualKeyCode: virtualKeyCode,
        nativeVirtualKeyCode: virtualKeyCode,
      });
    };

    await cdp.send("Page.navigate", { url: server.base + "/#/home" });
    await waitFor("window.IT && IT.S && IT.S.ready", 15000);
    check("app boots", await evaluate("Boolean(window.IT && IT.S.ready)"));
    check("desktop has no horizontal overflow", await evaluate("document.documentElement.scrollWidth <= innerWidth + 1"));
    check("desktop bottom nav is hidden", await evaluate("getComputedStyle(document.querySelector('.mobile-bottom-nav')).display === 'none'"));
    check("active navigation has aria-current", await evaluate("Boolean(document.querySelector('[data-nav][aria-current=\"page\"]'))"));

    await navigateHash("#/unit/3/qa", "document.querySelector('.qa-card')");
    const qaDesktop = await evaluate(`(() => {
      const cards = [...document.querySelectorAll('.qa-card')];
      const first = cards[0];
      return {
        activeTab: document.querySelector('.tab.active')?.textContent?.trim() || '',
        tabs: document.querySelectorAll('.tab').length,
        cards: cards.length,
        numbers: cards.map((card) => card.querySelector('.qa-num')?.textContent?.trim() || ''),
        firstQuestion: first?.querySelector('.qa-question')?.textContent?.trim() || '',
        firstAnswerEn: first?.querySelector('.qa-answer-en p')?.textContent?.trim() || '',
        firstAnswerRu: first?.querySelector('.qa-answer-ru p')?.textContent?.trim() || '',
        indexChips: document.querySelectorAll('.qa-index .qa-chip').length,
        speak: document.querySelectorAll('.qa-card [data-action="speak"]').length,
        ask: document.querySelectorAll('.qa-card [data-action="ask-ai"]').length,
        answerColumns: getComputedStyle(document.querySelector('.qa-answers')).gridTemplateColumns.split(' ').length,
        overflow: document.documentElement.scrollWidth > innerWidth + 1
      };
    })()`);
    check(
      "unit 3 Q&A renders seven numbered cards",
      qaDesktop.cards === 7 && qaDesktop.numbers[0] === "06" && qaDesktop.numbers[6] === "12" && qaDesktop.indexChips === 7,
      JSON.stringify(qaDesktop)
    );
    check(
      "Q&A cards show English and Russian answers",
      qaDesktop.firstAnswerEn.includes("Hardware") && qaDesktop.firstAnswerRu.includes("Аппаратное") && qaDesktop.speak === 7 && qaDesktop.ask === 7,
      JSON.stringify(qaDesktop)
    );
    check(
      "Q&A tab is active and fits the desktop",
      qaDesktop.activeTab.startsWith("Вопросы") && qaDesktop.tabs === 5 && !qaDesktop.overflow && qaDesktop.answerColumns === 2,
      JSON.stringify(qaDesktop)
    );

    await navigateHash("#/study", "document.querySelector('.study-hero')");
    const studyDesktop = await evaluate(`(() => {
      const ring = document.querySelector('.readiness-ring');
      return {
        ring: Boolean(ring),
        counters: document.querySelectorAll('.study-counters .metric-card').length,
        planTasks: document.querySelectorAll('.plan-task').length,
        weekDays: document.querySelectorAll('.week-day').length,
        prefs: document.querySelectorAll('[data-form="study-prefs"] input').length,
        retention: document.querySelector('[data-form="study-prefs"] [name="desired_retention_pct"]')?.value || '',
        maxInterval: document.querySelector('[data-form="study-prefs"] [name="max_interval_days"]')?.value || '',
        active: document.querySelector('[data-nav][aria-current="page"]')?.dataset.nav || '',
        overflow: document.documentElement.scrollWidth > innerWidth + 1
      };
    })()`);
    check("study centre renders readiness", studyDesktop.ring, JSON.stringify(studyDesktop));
    check("study centre renders counters and plan", studyDesktop.counters === 4 && studyDesktop.planTasks > 0 && studyDesktop.weekDays >= 1, JSON.stringify(studyDesktop));
    check("study centre renders prefs form", studyDesktop.prefs === 8 && studyDesktop.retention === "90" && studyDesktop.maxInterval === "3650", JSON.stringify(studyDesktop));
    const savedPrefs = await evaluate(`(async () => {
      const form = document.querySelector('[data-form="study-prefs"]');
      form.querySelector('[name="desired_retention_pct"]').value = '95';
      form.querySelector('[name="max_interval_days"]').value = '30';
      if (form.requestSubmit) form.requestSubmit();
      else form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await new Promise((resolve) => setTimeout(resolve, 700));
      const progress = await (await fetch('/api/progress')).json();
      return {
        pct: progress.prefs.desired_retention_pct,
        max: progress.prefs.max_interval_days
      };
    })()`, true);
    check("study prefs save from UI", savedPrefs.pct === 95 && savedPrefs.max === 30, JSON.stringify(savedPrefs));
    await evaluate(`fetch('/api/study/prefs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ desired_retention_pct: 90, max_interval_days: 3650 })
    }).then((response) => response.json())`, true);
    check("study centre has no desktop overflow", !studyDesktop.overflow);
    check("study navigation is active", studyDesktop.active === "study", studyDesktop.active);
    const studyShot = await writeScreenshot(cdp, "study-desktop.png");

    const queueStarted = await evaluate(
      `(async () => {
        await IT.startQueue('new');
        return {
          items: IT.S.practice ? IT.S.practice.items.length : 0,
          mode: IT.S.practice ? IT.S.practice.queueKind : '',
          hash: location.hash
        };
      })()`,
      true
    );
    check("study queue starts a practice session", queueStarted.items > 0 && queueStarted.mode === "new", JSON.stringify(queueStarted));
    check("study queue opens practice route", queueStarted.hash.startsWith("#/practice"), queueStarted.hash);
    await click('[data-action="grade"][data-correct="1"]');
    await waitFor("document.querySelector('.schedule-note')");
    const scheduleNote = await evaluate(`(() => ({
      text: document.querySelector('.schedule-note')?.textContent || '',
      answered: Boolean(IT.S.practice && IT.S.practice.answered),
      interval: Number(IT.S.practice?.schedule?.interval_days) || 0
    }))()`);
    check("practice shows the next FSRS review", scheduleNote.answered && /Следующее повторение/.test(scheduleNote.text) && scheduleNote.interval > 0, JSON.stringify(scheduleNote));

    await navigateHash("#/trainer", "document.querySelector('.mode-card[data-mode=\"cloze\"]')");
    const clozeCard = await evaluate(`(() => {
      const card = document.querySelector('.mode-card[data-mode="cloze"]');
      return { exists: Boolean(card), disabled: Boolean(card && card.disabled), text: card?.textContent || '' };
    })()`);
    check("trainer offers contextual cloze", clozeCard.exists && !clozeCard.disabled && /Контекст/.test(clozeCard.text), JSON.stringify(clozeCard));
    await click('[data-action="start-practice"][data-mode="cloze"]');
    await waitFor("document.querySelector('.cloze-gap')");
    const clozeStarted = await evaluate(`(() => ({
      hash: location.hash,
      type: IT.S.practice?.current?.type || '',
      sentence: IT.S.practice?.current?.sentence || '',
      answer: IT.S.practice?.current?.answer || '',
      gaps: document.querySelectorAll('.cloze-gap').length
    }))()`);
    check("cloze starts from a real text", clozeStarted.hash.startsWith("#/practice") && clozeStarted.type === "cloze" && clozeStarted.sentence.includes("_____") && clozeStarted.gaps === 1, JSON.stringify(clozeStarted));
    await evaluate(`(() => {
      const input = document.querySelector('[data-practice-input]');
      input.value = ${JSON.stringify(clozeStarted.answer)};
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`);
    await click('form[data-form="typing"] button[type="submit"]');
    await waitFor("document.querySelector('.feedback.ok')");
    await waitFor("document.querySelector('.schedule-note')");
    const clozeDone = await evaluate(`(() => ({
      ok: document.querySelector('.feedback')?.classList.contains('ok') || false,
      schedule: document.querySelector('.schedule-note')?.textContent || '',
      full: document.querySelector('.cloze-full')?.textContent || ''
    }))()`);
    check("cloze answer is accepted and shows the full sentence", clozeDone.ok && /Следующее повторение/.test(clozeDone.schedule) && clozeDone.full.length > 20, JSON.stringify(clozeDone));

    const queueCloze = await evaluate(
      `(async () => {
        const realApi = IT.api;
        const word = (en, ru) => ({
          unit_id: 1,
          unit_title: 'The History of Computers',
          en,
          ru,
          definition: '',
          reason: 'due',
          leech: false,
          lapses: 0,
          stability: 1,
          retrievability: 0.5,
          due_at: 1
        });
        const fakeQueue = (mode, items) => ({ mode, items, available: items.length, remaining: items.length, counts: {} });
        let response = null;
        const run = async (mode, items) => {
          response = fakeQueue(mode, items);
          await IT.startQueue(mode);
          const p = IT.S.practice;
          return {
            mode: p.mode,
            type: p.current?.type || '',
            sentence: p.current?.sentence || '',
            variants: p.items.map((item) => item.variant || ''),
            cloze: p.items.map((item) => Boolean(item.cloze))
          };
        };
        IT.api = (path, options) =>
          String(path).startsWith('/api/study/queue')
            ? Promise.resolve(response)
            : realApi(path, options);
        try {
          const mixedReview = await run('review', [word('multiplication', 'умножение'), word('missing context', 'нет контекста')]);
          const allCloze = await run('review', [word('multiplication', 'умножение')]);
          const mixedLeech = await run('leech', [word('multiplication', 'умножение'), word('missing context', 'нет контекста')]);
          return { mixedReview, allCloze, mixedLeech };
        } finally {
          IT.api = realApi;
        }
      })()`,
      true
    );
    check(
      "review queue uses cloze for due words",
      queueCloze.mixedReview.mode === "mixed" &&
        queueCloze.mixedReview.type === "cloze" &&
        queueCloze.mixedReview.sentence.includes("_____") &&
        queueCloze.mixedReview.variants[0] === "cloze" &&
        queueCloze.mixedReview.variants[1] === "flash" &&
        queueCloze.mixedReview.cloze[0] === true &&
        queueCloze.mixedReview.cloze[1] === false,
      JSON.stringify(queueCloze.mixedReview)
    );
    check(
      "review queue becomes fully contextual when every word has a sentence",
      queueCloze.allCloze.mode === "cloze" && queueCloze.allCloze.type === "cloze",
      JSON.stringify(queueCloze.allCloze)
    );
    check(
      "leech queue falls back to typing without context",
      queueCloze.mixedLeech.mode === "mixed" &&
        queueCloze.mixedLeech.type === "cloze" &&
        queueCloze.mixedLeech.variants[0] === "cloze" &&
        queueCloze.mixedLeech.variants[1] === "typing",
      JSON.stringify(queueCloze.mixedLeech)
    );

    const realReviewQueue = await evaluate(
      `(async () => {
        IT.S.practice = null;
        await IT.startQueue('review');
        const p = IT.S.practice;
        return {
          items: p ? p.items.length : 0,
          queueKind: p ? p.queueKind : '',
          mode: p ? p.mode : '',
          currentType: p ? p.current?.type || '' : '',
          cloze: p ? p.items.filter((item) => item.cloze).length : 0
        };
      })()`,
      true
    );
    if (realReviewQueue.items > 0) {
      check(
        "server review queue keeps contextual cloze",
        realReviewQueue.queueKind === "review" &&
          realReviewQueue.cloze > 0 &&
          (realReviewQueue.mode === "mixed" || realReviewQueue.mode === "cloze") &&
          realReviewQueue.currentType === "cloze",
        JSON.stringify(realReviewQueue)
      );
    }

    await navigateHash("#/audio", "document.querySelector('.audio-card')");
    const audioDesktop = await evaluate(`(() => ({
      cards: document.querySelectorAll('.audio-card').length,
      nav: document.querySelector('[data-nav][aria-current="page"]')?.dataset.nav || '',
      overflow: document.documentElement.scrollWidth > innerWidth + 1
    }))()`);
    check("audio library renders five cards", audioDesktop.cards === 5, JSON.stringify(audioDesktop));
    check("audio navigation is active", audioDesktop.nav === "audio", audioDesktop.nav);
    check("audio library has no desktop overflow", !audioDesktop.overflow);
    await click('[data-action="audio-open"]');
    await waitFor("document.querySelector('.audio-detail audio')");
    const audioDetail = await evaluate(`(() => ({
      src: document.querySelector('.audio-detail audio')?.getAttribute('src') || '',
      tasks: document.querySelectorAll('.audio-task').length,
      transcriptHidden: document.querySelector('.audio-transcript')?.classList.contains('is-hidden')
    }))()`);
    check("audio detail loads local WAV", /^\/audio\/.+\.wav$/.test(audioDetail.src), audioDetail.src);
    check("audio detail renders tasks and hides transcript", audioDetail.tasks > 0 && audioDetail.transcriptHidden, JSON.stringify(audioDetail));
    await click('[data-action="audio-transcript"]');
    await delay(100);
    check("audio transcript toggles open", await evaluate("!document.querySelector('.audio-transcript').classList.contains('is-hidden')"));
    await evaluate(`(() => {
      const input = document.querySelector('[data-input="audio-answer"]');
      input.value = 'An independent processor inside a multicore component';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`);
    await click('[data-action="audio-check"]');
    await delay(100);
    const audioCheck = await evaluate(`(() => ({
      feedback: document.querySelector('.audio-feedback')?.textContent || '',
      ok: document.querySelector('.audio-feedback')?.classList.contains('ok') || false
    }))()`);
    check("audio answer check gives feedback", audioCheck.feedback.length > 0, JSON.stringify(audioCheck));
    await click('[data-action="audio-done"]');
    await waitFor("IT.S.progress.audio_done.includes('multicore')");
    check("audio progress is saved", await evaluate("IT.S.progress.audio_done.includes('multicore')"));
    const audioShot = await writeScreenshot(cdp, "audio-desktop.png");

    await navigateHash("#/speaking", "document.querySelector('.speaking-card')");
    const speakingDesktop = await evaluate(`(() => {
      const card = document.querySelector('.speaking-card');
      const buttons = [...document.querySelectorAll('.speaking-actions .btn')].map((button) => button.textContent.trim());
      return {
        card: Boolean(card),
        promptId: card?.dataset.promptId || '',
        prompt: card?.querySelector('h2')?.textContent || '',
        stats: [...document.querySelectorAll('.speaking-counters .metric-card b')].map((item) => item.textContent.trim()),
        nav: document.querySelector('[data-nav][aria-current="page"]')?.dataset.nav || '',
        recordButton: Boolean(document.querySelector('[data-action="speaking-record"]')),
        voiceSelect: Boolean(document.querySelector('[data-change="speaking-voice"]')),
        voiceOptions: document.querySelectorAll('[data-change="speaking-voice"] option').length,
        voiceDisabled: document.querySelector('[data-change="speaking-voice"]')?.disabled ?? true,
        repeatButton: Boolean(document.querySelector('[data-action="speaking-listen-repeat"]')),
        voiceTest: Boolean(document.querySelector('[data-action="speaking-voice-test"]')),
        ttsSupported: Boolean(window.IT && IT.tts && IT.tts.supported()),
        voiceBadge: document.querySelector('.speaking-voice-bar .badge')?.textContent || '',
        buttons,
        overflow: document.documentElement.scrollWidth > innerWidth + 1
      };
    })()`);
    check("speaking practice renders a prompt", speakingDesktop.card && speakingDesktop.promptId && speakingDesktop.prompt.length > 10, JSON.stringify(speakingDesktop));
    check("speaking stats and record control render", speakingDesktop.stats.length === 3 && speakingDesktop.recordButton, JSON.stringify(speakingDesktop.stats));
    check("speaking navigation is active", speakingDesktop.nav === "speaking", speakingDesktop.nav);
    check("speaking practice has no desktop overflow", !speakingDesktop.overflow);
    check(
      "speaking voice controls render",
      speakingDesktop.voiceSelect && speakingDesktop.voiceOptions >= 1 && speakingDesktop.repeatButton && speakingDesktop.voiceTest,
      JSON.stringify(speakingDesktop)
    );
    check(
      "speaking TTS controls match browser support",
      speakingDesktop.ttsSupported === !speakingDesktop.voiceDisabled,
      JSON.stringify({ supported: speakingDesktop.ttsSupported, disabled: speakingDesktop.voiceDisabled })
    );
    const voicePref = await evaluate(`(() => {
      const key = 'itelab.tts.voice.v1';
      const select = document.querySelector('[data-change="speaking-voice"]');
      const supported = Boolean(window.IT && IT.tts && IT.tts.supported());
      if (!supported || !select) {
        IT.tts.setVoice('test-voice');
        const stored = localStorage.getItem(key) === 'test-voice';
        IT.tts.setVoice('');
        return { supported, stored, cleared: localStorage.getItem(key) === null };
      }
      const choice = [...select.options].find((option) => option.value);
      if (choice) {
        select.value = choice.value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        const stored = localStorage.getItem(key) === choice.value;
        const next = document.querySelector('[data-change="speaking-voice"]');
        next.value = '';
        next.dispatchEvent(new Event('change', { bubbles: true }));
        return { supported, stored, cleared: localStorage.getItem(key) === null, choice: choice.textContent.trim() };
      }
      IT.tts.setVoice('test-voice');
      const stored = localStorage.getItem(key) === 'test-voice';
      IT.tts.setVoice('');
      return { supported, stored, cleared: localStorage.getItem(key) === null };
    })()`);
    check("speaking voice preference is stored per browser", voicePref.stored && voicePref.cleared, JSON.stringify(voicePref));
    const voiceApplied = await evaluate(`(() => {
      const voices = window.IT && IT.tts ? IT.tts.englishVoices() : [];
      const chosen = voices[0];
      if (!chosen) {
        IT.tts.setVoice('');
        return { available: false, applied: false };
      }
      const normalize = (value) => String(value || '').replace('_', '-');
      const key = IT.tts.voiceKey(chosen);
      IT.tts.setVoice(key);
      const utterance = IT.speak('Voice check. Listen and repeat.', 'en-US', 0.8);
      const applied = Boolean(
        utterance &&
        utterance.voice &&
        IT.tts.voiceKey(utterance.voice) === key &&
        normalize(utterance.lang) === normalize(chosen.lang) &&
        Math.abs(utterance.rate - 0.8) < 0.01
      );
      const details = {
        available: true,
        applied,
        chosenKey: key,
        chosenLang: chosen.lang,
        selectedKey: IT.tts.storedVoiceKey(),
        lang: utterance ? utterance.lang : '',
        rate: utterance ? utterance.rate : 0,
        voiceSet: Boolean(utterance && utterance.voice),
        utteranceKey: utterance && utterance.voice ? IT.tts.voiceKey(utterance.voice) : '',
      };
      IT.speakStop();
      IT.tts.setVoice('');
      return details;
    })()`);
    check("speaking selected voice is applied to TTS", !voiceApplied.available || voiceApplied.applied, JSON.stringify(voiceApplied));
    const voiceBeforeReload = await evaluate(`(() => {
      const select = document.querySelector('[data-change="speaking-voice"]');
      const choice = select ? [...select.options].find((option) => option.value) : null;
      if (!choice) return { available: false, key: '' };
      IT.tts.setVoice(choice.value);
      return { available: true, key: choice.value };
    })()`);
    if (voiceBeforeReload.available) {
      await cdp.send("Page.reload", { ignoreCache: true });
      await waitFor("document.querySelector('.speaking-card')", 10000);
      await waitFor(
        `(() => { const select = document.querySelector('[data-change="speaking-voice"]'); return Boolean(select && [...select.options].some((option) => option.value === ${JSON.stringify(voiceBeforeReload.key)})); })()`,
        10000
      );
    }
    const voiceAfterReload = await evaluate(`(() => {
      const key = 'itelab.tts.voice.v1';
      const select = document.querySelector('[data-change="speaking-voice"]');
      return {
        value: select ? select.value : '',
        stored: localStorage.getItem(key),
        selected: Boolean(window.IT && IT.tts && IT.tts.selectedVoice())
      };
    })()`);
    check(
      "speaking voice preference survives reload",
      !voiceBeforeReload.available || (voiceAfterReload.value === voiceBeforeReload.key && voiceAfterReload.stored === voiceBeforeReload.key && voiceAfterReload.selected),
      JSON.stringify({ before: voiceBeforeReload, after: voiceAfterReload })
    );
    await evaluate(`(() => {
      IT.tts.setVoice('');
      const select = document.querySelector('[data-change="speaking-voice"]');
      if (select) {
        select.value = '';
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }
      return true;
    })()`);
    await click('[data-action="speaking-record"]');
    await waitFor("document.querySelector('[data-speaking-status]')?.textContent.includes('Идёт запись')", 5000);
    await delay(700);
    await click('[data-action="speaking-record"]');
    await waitFor("document.querySelector('.speaking-audio')", 5000);
    const speakingRecording = await evaluate(`(() => {
      const audio = document.querySelector('.speaking-audio');
      return {
        src: audio?.getAttribute('src') || '',
        duration: Number(audio?.duration) || 0,
        status: document.querySelector('[data-speaking-status]')?.textContent || ''
      };
    })()`);
    check("speaking records a local blob", speakingRecording.src.startsWith("blob:") && /Запись готова/.test(speakingRecording.status), JSON.stringify(speakingRecording));
    await click('[data-action="speaking-filter"][data-filter="question"]');
    await delay(200);
    const speakingQuestions = await evaluate(`(() => ({
      active: document.querySelector('[data-action="speaking-filter"][data-filter="question"]')?.classList.contains('active') || false,
      eyebrow: document.querySelector('.speaking-card .eyebrow')?.textContent || '',
      promptId: document.querySelector('.speaking-card')?.dataset.promptId || ''
    }))()`);
    check("speaking question filter works", speakingQuestions.active && /ANSWER THE QUESTION/.test(speakingQuestions.eyebrow), JSON.stringify(speakingQuestions));
    await evaluate(`(() => {
      const select = document.querySelector('[data-change="speaking-unit"]');
      select.value = '7';
      select.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`);
    await delay(200);
    check("speaking unit filter works", await evaluate("document.querySelector('.speaking-card')?.dataset.promptId?.startsWith('u7-') || false"));
    const speakingDoneId = await evaluate("document.querySelector('.speaking-card')?.dataset.promptId || ''");
    await click('[data-action="speaking-done"]');
    await waitFor(`IT.S.progress.speaking_done.includes(${JSON.stringify(speakingDoneId)})`);
    const speakingSaved = await evaluate(`(async () => {
      const progress = await (await fetch('/api/progress')).json();
      return {
        done: progress.speaking_done.includes(${JSON.stringify(speakingDoneId)}),
        attempts: progress.speaking_attempts,
        stats: [...document.querySelectorAll('.speaking-counters .metric-card b')].map((item) => item.textContent.trim())
      };
    })()`, true);
    check("speaking self-assessment is saved", speakingSaved.done && speakingSaved.attempts >= 1, JSON.stringify(speakingSaved));
    check("speaking stats update after marking", Number(speakingSaved.stats[1]) >= 1, JSON.stringify(speakingSaved.stats));
    const speakingShot = await writeScreenshot(cdp, "speaking-desktop.png");

    // 390 x 844 phone layout.
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: 390,
      height: 844,
      deviceScaleFactor: 1,
      mobile: true,
      screenWidth: 390,
      screenHeight: 844,
    });
    await navigateHash("#/home", "document.querySelector('.home-dashboard, main')");
    const phone = await evaluate(`(() => {
      const bottom = document.querySelector('.mobile-bottom-nav');
      const rect = bottom ? bottom.getBoundingClientRect() : null;
      return {
        width: innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        bottomDisplay: bottom ? getComputedStyle(bottom).display : 'missing',
        bottomHeight: rect ? Math.round(rect.height) : 0,
        safePadding: bottom ? getComputedStyle(bottom).paddingBottom : '',
        active: document.querySelector('[data-nav][aria-current="page"]')?.dataset.nav || ''
      };
    })()`);
    check("390px viewport width", phone.width === 390, `innerWidth=${phone.width}`);
    check("390px no horizontal overflow", phone.scrollWidth <= 391, `scrollWidth=${phone.scrollWidth}`);
    check("390px bottom navigation visible", phone.bottomDisplay !== "none" && phone.bottomHeight > 20, JSON.stringify(phone));
    check("390px safe-area padding is applied", /\d/.test(phone.safePadding), phone.safePadding);
    check("390px aria-current stays in sync", phone.active === "home", phone.active);
    check("390px bottom nav has seven sections", await evaluate("document.querySelectorAll('.mobile-bottom-nav .mobile-nav-link').length === 7"));
    await evaluate("IT.toast('Проверка мобильного перекрытия'); true");
    await delay(220);
    const toastLayout = await evaluate(`(() => {
      const toast = document.querySelector('.toast');
      const nav = document.querySelector('.mobile-bottom-nav');
      const t = toast ? toast.getBoundingClientRect() : null;
      const n = nav ? nav.getBoundingClientRect() : null;
      return { shown: Boolean(toast && toast.classList.contains('show')), overlap: Boolean(t && n && t.bottom > n.top + 1) };
    })()`);
    check("390px toast does not overlap bottom navigation", toastLayout.shown && !toastLayout.overlap, JSON.stringify(toastLayout));
    const home390 = await writeScreenshot(cdp, "home-390x844.png");

    await navigateHash("#/unit/14/qa", "document.querySelector('.qa-card')");
    const qa390 = await evaluate(`(() => {
      const answers = document.querySelector('.qa-answers');
      return {
        width: innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        cards: document.querySelectorAll('.qa-card').length,
        columns: answers ? getComputedStyle(answers).gridTemplateColumns.split(' ').length : 0,
        cardWidth: Math.round(document.querySelector('.qa-card')?.getBoundingClientRect().width || 0),
        speak: document.querySelectorAll('.qa-card [data-action="speak"]').length
      };
    })()`);
    check("390px Q&A fits the phone", qa390.scrollWidth <= 391 && qa390.cardWidth <= 390, JSON.stringify(qa390));
    check("390px Q&A answers stack in one column", qa390.columns === 1 && qa390.cards === 9 && qa390.speak === 9, JSON.stringify(qa390));
    const qa390Shot = await writeScreenshot(cdp, "qa-390x844.png");

    await navigateHash("#/analytics", "document.querySelector('.analytics-page, .analytics-grid, main')");
    const analyticsPhone = await evaluate(`(() => {
      const chart = document.querySelector('.analytics-chart, .chart, svg');
      const rect = chart ? chart.getBoundingClientRect() : null;
      return {
        overflow: document.documentElement.scrollWidth > innerWidth + 1,
        chartWidth: rect ? Math.round(rect.width) : 0,
        pageWidth: innerWidth
      };
    })()`);
    check("analytics fits phone width", !analyticsPhone.overflow && analyticsPhone.chartWidth <= analyticsPhone.pageWidth + 1, JSON.stringify(analyticsPhone));
    const analytics390 = await writeScreenshot(cdp, "analytics-390x844.png");

    await navigateHash("#/study", "document.querySelector('.study-hero')");
    const studyPhone = await evaluate(`(() => {
      const ring = document.querySelector('.readiness-ring');
      const hero = document.querySelector('.study-hero');
      const counters = document.querySelector('.study-counters');
      return {
        overflow: document.documentElement.scrollWidth > innerWidth + 1,
        ringWidth: ring ? Math.round(ring.getBoundingClientRect().width) : 0,
        heroWidth: hero ? Math.round(hero.getBoundingClientRect().width) : 0,
        counterColumns: counters ? getComputedStyle(counters).gridTemplateColumns.split(' ').length : 0,
        active: document.querySelector('[data-nav][aria-current="page"]')?.dataset.nav || '',
        navLinks: document.querySelectorAll('.mobile-bottom-nav .mobile-nav-link').length
      };
    })()`);
    check("study fits phone width", !studyPhone.overflow && studyPhone.heroWidth <= 390, JSON.stringify(studyPhone));
    check("study ring is mobile sized", studyPhone.ringWidth > 50 && studyPhone.ringWidth <= 110, String(studyPhone.ringWidth));
    check("study counters stack on phone", studyPhone.counterColumns === 2, String(studyPhone.counterColumns));
    check("study mobile nav is active", studyPhone.active === "study" && studyPhone.navLinks === 7, JSON.stringify(studyPhone));
    const study390 = await writeScreenshot(cdp, "study-390x844.png");

    await navigateHash("#/speaking", "document.querySelector('.speaking-card')");
    const speakingPhone = await evaluate(`(() => {
      const card = document.querySelector('.speaking-card');
      const rect = card?.getBoundingClientRect();
      return {
        overflow: document.documentElement.scrollWidth > innerWidth + 1,
        cardWidth: rect ? Math.round(rect.width) : 0,
        buttons: document.querySelectorAll('.speaking-actions .btn').length,
        record: Boolean(document.querySelector('[data-action="speaking-record"]')),
        voice: Boolean(document.querySelector('[data-change="speaking-voice"]')),
        index: document.querySelector('.speaking-index')?.textContent || '',
        active: document.querySelector('.mobile-bottom-nav [aria-current="page"]')?.dataset.nav || '',
        navLinks: document.querySelectorAll('.mobile-bottom-nav .mobile-nav-link').length
      };
    })()`);
    check("speaking fits phone width", !speakingPhone.overflow && speakingPhone.cardWidth <= 390, JSON.stringify(speakingPhone));
    check(
      "speaking phone controls and nav render",
      speakingPhone.buttons >= 5 && speakingPhone.record && speakingPhone.voice && speakingPhone.index.length > 0 && speakingPhone.active === "speaking" && speakingPhone.navLinks === 7,
      JSON.stringify(speakingPhone)
    );
    const speaking390 = await writeScreenshot(cdp, "speaking-390x844.png");

    // 360 x 800 phone layout.
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: 360,
      height: 800,
      deviceScaleFactor: 1,
      mobile: true,
      screenWidth: 360,
      screenHeight: 800,
    });
    await navigateHash("#/home", "document.querySelector('.mobile-bottom-nav')");
    const narrow = await evaluate(`({
      width: innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      bottomDisplay: getComputedStyle(document.querySelector('.mobile-bottom-nav')).display
    })`);
    check("360px viewport width", narrow.width === 360, `innerWidth=${narrow.width}`);
    check("360px no horizontal overflow", narrow.scrollWidth <= 361, `scrollWidth=${narrow.scrollWidth}`);
    check("360px bottom navigation visible", narrow.bottomDisplay !== "none", narrow.bottomDisplay);
    const home360 = await writeScreenshot(cdp, "home-360x800.png");

    await navigateHash("#/unit/3/qa", "document.querySelector('.qa-card')");
    const qa360 = await evaluate(`({
      width: innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      cards: document.querySelectorAll('.qa-card').length,
      columns: getComputedStyle(document.querySelector('.qa-answers')).gridTemplateColumns.split(' ').length
    })`);
    check("360px Q&A fits the phone", qa360.scrollWidth <= 361 && qa360.cards === 7 && qa360.columns === 1, JSON.stringify(qa360));
    const qa360Shot = await writeScreenshot(cdp, "qa-360x800.png");

    // ARIA: menu focus/escape, modal aria-modal, inert background and focus loop.
    await navigateHash("#/settings", "document.querySelector('[data-action=\"reset-progress\"]')");
    await click('[data-action="toggle-menu"]');
    await delay(120);
    const menuOpen = await evaluate(`(() => {
      const sidebar = document.querySelector('#sidebar');
      const toggle = document.querySelector('[data-action="toggle-menu"]');
      return {
        open: sidebar.classList.contains('open'),
        expanded: toggle.getAttribute('aria-expanded'),
        focusInside: sidebar.contains(document.activeElement)
      };
    })()`);
    check("mobile menu exposes aria-expanded", menuOpen.expanded === "true", JSON.stringify(menuOpen));
    check("mobile menu moves focus inside", menuOpen.open && menuOpen.focusInside, JSON.stringify(menuOpen));
    await key("Escape", "Escape", 27);
    await delay(120);
    const menuClosed = await evaluate(`(() => ({
      open: document.querySelector('#sidebar').classList.contains('open'),
      expanded: document.querySelector('[data-action="toggle-menu"]').getAttribute('aria-expanded'),
      returned: document.activeElement === document.querySelector('[data-action="toggle-menu"]')
    }))()`);
    check("Escape closes menu and returns focus", !menuClosed.open && menuClosed.expanded === "false" && menuClosed.returned, JSON.stringify(menuClosed));

    await click('[data-action="reset-progress"]');
    await delay(150);
    const modalOpen = await evaluate(`(() => {
      const modal = document.querySelector('.modal');
      const shell = document.querySelector('.app-shell');
      return {
        exists: Boolean(modal),
        ariaModal: modal ? modal.getAttribute('aria-modal') : '',
        inert: shell ? shell.hasAttribute('inert') : false,
        focusInside: modal ? modal.contains(document.activeElement) : false
      };
    })()`);
    check("confirmation dialog has aria-modal", modalOpen.exists && modalOpen.ariaModal === "true", JSON.stringify(modalOpen));
    check("background is inert while dialog is open", modalOpen.inert, JSON.stringify(modalOpen));
    check("dialog receives focus", modalOpen.focusInside, JSON.stringify(modalOpen));
    await evaluate(`(() => { const buttons = [...document.querySelectorAll('.modal button')]; buttons[buttons.length - 1].focus(); return true; })()`);
    await key("Tab", "Tab", 9);
    await delay(100);
    const trapped = await evaluate(`(() => {
      const buttons = [...document.querySelectorAll('.modal button')];
      return { first: document.activeElement === buttons[0], text: document.activeElement?.textContent?.trim() || '' };
    })()`);
    check("Tab focus loops inside dialog", trapped.first, JSON.stringify(trapped));
    await key("Escape", "Escape", 27);
    await delay(120);
    const modalClosed = await evaluate(`(() => ({
      exists: Boolean(document.querySelector('.modal')),
      inert: document.querySelector('.app-shell').hasAttribute('inert'),
      returned: document.activeElement === document.querySelector('[data-action="reset-progress"]')
    }))()`);
    check("Escape closes dialog and returns focus", !modalClosed.exists && !modalClosed.inert && modalClosed.returned, JSON.stringify(modalClosed));

    // PWA: manifest, service worker registration and cached shell.
    const pwa = await evaluate(
      `(async () => {
        const manifest = document.querySelector('link[rel="manifest"]');
        let registration = null;
        try {
          registration = await Promise.race([
            navigator.serviceWorker.ready,
            new Promise((resolve) => setTimeout(() => resolve(null), 8000))
          ]);
        } catch (_) {}
        const keys = await caches.keys();
        let cached = [];
        if (keys.length) {
          const cache = await caches.open(keys[0]);
          cached = (await cache.keys()).map((request) => new URL(request.url).pathname);
        }
        return {
          manifest: manifest ? manifest.getAttribute('href') : '',
          registration: Boolean(registration),
          scope: registration ? registration.scope : '',
          cacheKeys: keys,
          cached
        };
      })()`,
      true
    );
    check("manifest is linked", /manifest\.webmanifest$/.test(pwa.manifest || ""), pwa.manifest);
    check("service worker registered", pwa.registration, JSON.stringify(pwa.cacheKeys));
    check(
      "shell cache is populated",
      pwa.cached.includes("/exam.js") &&
        pwa.cached.includes("/study.js") &&
        pwa.cached.includes("/audio.js") &&
        pwa.cached.includes("/speaking.js") &&
        pwa.cached.includes("/styles.css"),
      JSON.stringify(pwa.cached.slice(0, 8))
    );
    check("shell cache has the v4 cache name", pwa.cacheKeys.some((name) => /^itelab-v4-shell-\d+$/.test(name)), JSON.stringify(pwa.cacheKeys));

    // Exam: map, goto, flag, precheck warning, timer with a fake clock.
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: 390,
      height: 844,
      deviceScaleFactor: 1,
      mobile: true,
      screenWidth: 390,
      screenHeight: 844,
    });
    await navigateHash("#/exams", "document.querySelector('[data-action=\"start-exam\"]')");
    const started = await evaluate(
      `(async () => {
        await IT.examActions.start('exam1');
        return { items: IT.S.exam ? IT.S.exam.items.length : 0, view: IT.S.exam ? IT.S.exam.viewMode : '' };
      })()`,
      true
    );
    check("exam starts with questions", started.items > 0, JSON.stringify(started));
    check("exam question map is rendered", await evaluate("document.querySelectorAll('.exam-map-btn').length === IT.S.exam.items.length"));
    check("exam map marks current question", await evaluate("Boolean(document.querySelector('.exam-map-btn[aria-current=\"step\"]'))"));
    check("exam timer is not announced every second", (await evaluate("document.querySelector('#exam-timer')?.getAttribute('aria-live') || ''")) === "off");

    await click('.exam-map-btn[data-index="2"]');
    await delay(120);
    check("question map jumps to a question", (await evaluate("IT.S.exam.index")) === 2, String(await evaluate("IT.S.exam.index")));
    await click('[data-action="exam-flag"]');
    await delay(120);
    const flagged = await evaluate(`(() => ({
      flag: Boolean(IT.S.exam.items[2].flagged),
      pressed: document.querySelector('[data-action="exam-flag"]').getAttribute('aria-pressed'),
      mapFlag: Boolean(document.querySelector('.exam-map-btn[data-index="2"].flagged'))
    }))()`);
    check("flagging a question updates aria-pressed", flagged.flag && flagged.pressed === "true" && flagged.mapFlag, JSON.stringify(flagged));

    await click('[data-action="exam-finish"]');
    await waitFor("IT.S.exam && IT.S.exam.precheck");
    const precheck = await evaluate(`(() => ({
      layout: Boolean(document.querySelector('.precheck-layout')),
      unanswered: IT.S.exam.items.filter((item) => !item.answered).length,
      listed: document.querySelectorAll('.precheck-row').length,
      flagged: document.querySelectorAll('.precheck-section:last-of-type .precheck-row').length,
      confirm: Boolean(document.querySelector('[data-action="exam-precheck-finish"]'))
    }))()`);
    check("precheck lists unanswered questions before finish", precheck.layout && precheck.unanswered > 0 && precheck.listed >= precheck.unanswered, JSON.stringify(precheck));
    check("precheck keeps a confirmation action", precheck.confirm);
    const exam390 = await writeScreenshot(cdp, "exam-precheck-390x844.png");
    await evaluate("window.scrollTo(0, document.body.scrollHeight); true");
    await delay(150);
    const precheckOverlap = await evaluate(`(() => {
      const actions = document.querySelector('.precheck-actions');
      const nav = document.querySelector('.mobile-bottom-nav');
      const a = actions ? actions.getBoundingClientRect() : null;
      const n = nav ? nav.getBoundingClientRect() : null;
      return { actionsBottom: a ? Math.round(a.bottom) : 0, navTop: n ? Math.round(n.top) : 0, overlap: Boolean(a && n && a.bottom > n.top + 1) };
    })()`);
    check("precheck actions clear the bottom navigation", !precheckOverlap.overlap, JSON.stringify(precheckOverlap));
    await click('[data-action="exam-precheck-back"]');
    await waitFor("IT.S.exam && !IT.S.exam.precheck");
    const timerOverlap = await evaluate(`(() => {
      const timer = document.querySelector('#exam-timer');
      const nav = document.querySelector('.mobile-bottom-nav');
      const t = timer ? timer.getBoundingClientRect() : null;
      const n = nav ? nav.getBoundingClientRect() : null;
      return { visible: Boolean(timer && t.height > 0), overlap: Boolean(t && n && t.bottom > n.top + 1) };
    })()`);
    check("exam timer clears the bottom navigation", timerOverlap.visible && !timerOverlap.overlap, JSON.stringify(timerOverlap));

    const timeout = await evaluate(
      `(async () => {
        const exam = IT.S.exam;
        exam.timerMinutes = 1;
        exam.totalSec = 60;
        exam.deadlineAt = Date.now() - 2000;
        exam.remainingSec = 0;
        IT.startExamTimer();
        return true;
      })()`,
      true
    );
    check("fake clock starts exam timer", timeout);
    await waitFor("IT.S.exam && IT.S.exam.finished", 8000);
    await waitFor("IT.S.progress.exams && IT.S.progress.exams.length > 0", 8000);
    const finished = await evaluate(`(() => ({
      timeout: IT.S.exam.timeout,
      timeSpent: IT.S.exam.timeSpentSec,
      result: document.querySelector('.exam-result, .page, main')?.innerText?.slice(0, 120) || ''
    }))()`);
    check("fake clock auto-finishes exam on timeout", finished.timeout === true, JSON.stringify(finished));
    check("timeout stores the full timer duration", finished.timeSpent === 60, String(finished.timeSpent));

    const history = await evaluate(
      `(async () => {
        const response = await fetch('/api/exam/history');
        return await response.json();
      })()`,
      true
    );
    const attempt = history.attempts && history.attempts[0];
    check("timeout attempt is saved", Boolean(attempt && attempt.timeout), JSON.stringify(attempt && { id: attempt.id, timeout: attempt.timeout }));
    check("attempt has stable item ids", Boolean(attempt && attempt.items.every((item) => item.item_id && String(item.item_id).length)), JSON.stringify((attempt && attempt.items || []).map((item) => item.item_id)));
    check("attempt keeps per-item time", Boolean(attempt && attempt.items.every((item) => typeof item.time_ms === "number")), JSON.stringify((attempt && attempt.items || []).map((item) => item.time_ms)));
    check("attempt keeps the flagged question", Boolean(attempt && attempt.items.some((item) => item.flagged)));
    check("attempt keeps question tags", Boolean(attempt && attempt.items.every((item) => Array.isArray(item.tags) && item.tags.length)));

    // Reload proves history is hydrated from the server, not just S state.
    await cdp.send("Page.reload", { ignoreCache: true });
    await waitFor("window.IT && IT.S && IT.S.ready", 15000);
    await navigateHash("#/exams", "document.querySelector('.exam-history-row, [data-action=\"exam-start\"]')");
    const afterReload = await evaluate(`({
      attempts: IT.S.progress.exams.length,
      latestTimeout: IT.S.progress.exams[0] ? IT.S.progress.exams[0].timeout : null,
      historyRow: Boolean(document.querySelector('.exam-history-row'))
    })`);
    check("history survives a full reload", afterReload.attempts >= 1 && afterReload.historyRow, JSON.stringify(afterReload));
    check("timeout flag survives a full reload", afterReload.latestTimeout === true, JSON.stringify(afterReload));

    await navigateHash("#/study/mistakes", "document.querySelector('.mistake-card, .study-page .empty-state')");
    const notebook = await evaluate(`(() => {
      const cards = document.querySelectorAll('.mistake-card');
      const first = document.querySelector('.mistake-card');
      return {
        cards: cards.length,
        hasExplanation: Boolean(first && first.querySelector('.mistake-explain')),
        hasDrill: Boolean(first && first.querySelector('.mistake-drill')),
        overflow: document.documentElement.scrollWidth > innerWidth + 1
      };
    })()`);
    check("mistake notebook shows timed-out exam errors", notebook.cards > 0, JSON.stringify(notebook));
    check("mistake cards include explanation and drill", notebook.hasExplanation && notebook.hasDrill, JSON.stringify(notebook));
    check("mistake notebook fits phone width", !notebook.overflow);
    const notebookShot = await writeScreenshot(cdp, "mistakes-390x844.png");
    const resolvedId = await evaluate(`(() => {
      const button = document.querySelector('[data-action="mistake-resolve"][data-resolved="1"]');
      if (!button) return '';
      const id = button.dataset.id;
      button.click();
      return id;
    })()`);
    if (resolvedId) {
      await waitFor(`IT.S.progress.resolved_mistakes.includes(${JSON.stringify(resolvedId)})`);
    }
    check("mistake can be resolved from the notebook", Boolean(resolvedId) && (await evaluate(`IT.S.progress.resolved_mistakes.includes(${JSON.stringify(resolvedId)})`)));

    await navigateHash("#/exams", "document.querySelector('[data-action=\"start-diagnostic\"]')");
    check("exam page exposes diagnostic launch", await evaluate("Boolean(document.querySelector('[data-action=\"start-diagnostic\"]'))"));
    await evaluate("IT.examActions.startDiagnostic(); true");
    await waitFor("IT.S.exam && IT.S.exam.mode === 'diagnostic'", 20000);
    const diagnostic = await evaluate(`(() => ({
      mode: IT.S.exam.mode,
      items: IT.S.exam.items.length,
      timer: IT.S.exam.timerMinutes,
      view: IT.S.exam.viewMode,
      forcedReview: IT.S.exam.reviewStage
    }))()`);
    check("diagnostic starts with 20 mixed items", diagnostic.items === 20, JSON.stringify(diagnostic));
    check("diagnostic uses forced exam mode and 25 minutes", diagnostic.timer === 25 && diagnostic.view === "exam" && !diagnostic.forcedReview, JSON.stringify(diagnostic));
    check("diagnostic uses mixed item kinds", await evaluate("new Set(IT.S.exam.items.map((item) => item.kind)).size >= 4"));
    await navigateHash("#/study", "document.querySelector('.study-hero')");
    check("leaving diagnostic stops the exam timer", await evaluate("!IT.S.examTimer"));

    check("no uncaught page errors", exceptions.length === 0, exceptions.slice(0, 3).join(" | "));

    console.log(`\nScreenshots:`);
    console.log(`  ${home390}`);
    console.log(`  ${analytics390}`);
    console.log(`  ${study390}`);
    console.log(`  ${home360}`);
    console.log(`  ${exam390}`);
    console.log(`  ${studyShot}`);
    console.log(`  ${audioShot}`);
    console.log(`  ${speakingShot}`);
    console.log(`  ${speaking390}`);
    console.log(`  ${notebookShot}`);
    console.log(`  artifacts: ${artifactDir}`);
  } finally {
    if (cdp) {
      try {
        await cdp.send("Browser.close", {}, 2000);
      } catch (_) {
        /* Edge already closed */
      }
      cdp.close();
    }
    if (browser && browser.exitCode === null) {
      if (process.platform === "win32") spawnSync("taskkill", ["/PID", String(browser.pid), "/T", "/F"], { stdio: "ignore" });
      else browser.kill();
      await delay(250);
    }
    await server.stop();
    try {
      fs.rmSync(profileDir, { recursive: true, force: true });
    } catch (_) {
      /* Edge may still hold profile files */
    }
  }

  console.log(`\nE2E checks passed: ${passed} / ${checks.length}`);
  if (passed !== checks.length) {
    for (const failed of checks.filter((item) => !item.ok)) {
      console.error(`  failed: ${failed.name}${failed.detail ? ` — ${failed.detail}` : ""}`);
    }
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`\n${error && error.stack ? error.stack : error}`);
  process.exitCode = 1;
});
