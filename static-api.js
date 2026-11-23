/* IT English Lab — static, browser-only implementation of the former /api server.
 *
 * The UI still calls IT.api("/api/..."), but every endpoint below is handled
 * locally. Progress lives in IndexedDB with a localStorage fallback, and JSON
 * export/import remains available in Settings for backup or transfer.
 */
(() => {
  "use strict";

  const IT = window.IT;
  const C = window.ITLocal;
  if (!IT || !C) {
    console.error("IT English Lab: local-core.js must load before static-api.js");
    return;
  }

  document.documentElement.classList.add("static-mode");

  const DB_NAME = "it-english-lab-static";
  const DB_VERSION = 1;
  const STORE_NAME = "state";
  const STATE_KEY = "app";
  const FALLBACK_KEY = "itelab-static-state-v1";
  const SETTINGS_KEY = "itelab-static-settings-v1";

  const DEFAULT_SETTINGS = {
    mode: "off",
    base_url: "http://127.0.0.1:11434/v1",
    model: "qwen3.5:4b",
    temperature: 0.4,
    max_tokens: 700,
    embedded_model: "",
    embedded_ctx: 4096,
    system_extra: "",
  };

  const STATIC_EMBEDDED = {
    compiled: false,
    loaded: false,
    downloading: false,
    progress: 0,
    bytes: 0,
    total: 0,
    error: null,
    path: "",
  };

  let progress = null;
  let backups = [];
  let settings = { ...DEFAULT_SETTINGS };
  let saveError = null;
  let writeChain = Promise.resolve();
  let dbPromise = null;

  const clone = (value) => {
    try {
      return structuredClone(value);
    } catch (_) {
      return JSON.parse(JSON.stringify(value));
    }
  };

  const apiError = (status, message) => {
    const error = new Error(message);
    error.status = status;
    return error;
  };

  // ------------------------------------------------------------------
  // Durable storage
  // ------------------------------------------------------------------

  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve) => {
      if (!("indexedDB" in window)) {
        resolve(null);
        return;
      }
      let request;
      try {
        request = window.indexedDB.open(DB_NAME, DB_VERSION);
      } catch (_) {
        resolve(null);
        return;
      }
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    });
    return dbPromise;
  }

  async function readStoredState() {
    const db = await openDb();
    if (db) {
      const fromDb = await new Promise((resolve) => {
        try {
          const tx = db.transaction(STORE_NAME, "readonly");
          const request = tx.objectStore(STORE_NAME).get(STATE_KEY);
          request.onsuccess = () => resolve(request.result || null);
          request.onerror = () => resolve(null);
        } catch (_) {
          resolve(null);
        }
      });
      if (fromDb) return fromDb;
    }
    try {
      const raw = localStorage.getItem(FALLBACK_KEY);
      if (raw) return JSON.parse(raw);
    } catch (_) {
      /* private mode or quota — the app can still run for this session */
    }
    return null;
  }

  async function writeStoredState(snapshot) {
    let ok = false;
    const db = await openDb();
    if (db) {
      ok = await new Promise((resolve) => {
        try {
          const tx = db.transaction(STORE_NAME, "readwrite");
          tx.objectStore(STORE_NAME).put(snapshot, STATE_KEY);
          tx.oncomplete = () => resolve(true);
          tx.onerror = () => resolve(false);
          tx.onabort = () => resolve(false);
        } catch (_) {
          resolve(false);
        }
      });
    }
    if (!ok) {
      try {
        localStorage.setItem(FALLBACK_KEY, JSON.stringify(snapshot));
        ok = true;
      } catch (_) {
        ok = false;
      }
    }
    if (!ok) {
      saveError = "Не удалось сохранить прогресс в браузере. Экспортируйте JSON, чтобы не потерять данные.";
      throw new Error(saveError);
    }
    saveError = null;
  }

  function persist() {
    const snapshot = clone({ progress, backups });
    writeChain = writeChain
      .catch(() => {})
      .then(() => writeStoredState(snapshot));
    return writeChain;
  }

  function readSettings() {
    let stored = {};
    try {
      stored = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
      if (!stored || typeof stored !== "object") stored = {};
    } catch (_) {
      stored = {};
    }
    const merged = { ...DEFAULT_SETTINGS, ...stored };
    merged.mode = "off";
    merged.static_mode = true;
    merged.has_key = false;
    merged.key_hint = "";
    merged.temperature = C.clamp(Number(merged.temperature) || 0.4, 0, 1.5);
    merged.max_tokens = C.clamp(C.integer(merged.max_tokens, 700), 64, 4096);
    merged.embedded_ctx = C.clamp(C.integer(merged.embedded_ctx, 4096), 512, 16384);
    return merged;
  }

  function saveSettings() {
    try {
      const stored = {
        base_url: settings.base_url,
        model: settings.model,
        temperature: settings.temperature,
        max_tokens: settings.max_tokens,
        embedded_model: settings.embedded_model,
        embedded_ctx: settings.embedded_ctx,
        system_extra: settings.system_extra,
      };
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(stored));
    } catch (_) {
      /* settings are non-critical; progress uses IndexedDB */
    }
  }

  function settingsView() {
    return {
      ...settings,
      mode: "off",
      has_key: false,
      key_hint: "",
      data_dir: "Этот браузер · IndexedDB",
      backups: backups
        .slice()
        .sort((a, b) => C.integer(b.created_at) - C.integer(a.created_at))
        .map((backup) => backup.name),
      lan_enabled: false,
      lan_url: null,
      embedded: { ...STATIC_EMBEDDED, path: settings.embedded_model || "" },
      static_mode: true,
    };
  }

  // ------------------------------------------------------------------
  // Backups
  // ------------------------------------------------------------------

  function backupName() {
    const date = new Date();
    const stamp =
      `${date.getFullYear()}${C.integer(date.getMonth() + 1).toString().padStart(2, "0")}${C.integer(date.getDate()).toString().padStart(2, "0")}` +
      `-${C.integer(date.getHours()).toString().padStart(2, "0")}${C.integer(date.getMinutes()).toString().padStart(2, "0")}${C.integer(date.getSeconds()).toString().padStart(2, "0")}` +
      `-${C.integer(date.getMilliseconds()).toString().padStart(3, "0")}`;
    return `progress-${stamp}.json`;
  }

  function createBackup() {
    if (!progress) return null;
    const name = backupName();
    backups.unshift({
      name,
      created_at: C.nowTs(),
      progress: clone(progress),
    });
    backups = backups.slice(0, 5);
    return name;
  }

  // ------------------------------------------------------------------
  // Initialisation
  // ------------------------------------------------------------------

  const ready = (async () => {
    settings = readSettings();
    const stored = await readStoredState();
    if (stored && stored.progress) {
      progress = C.ensureProgress(stored.progress);
      backups = Array.isArray(stored.backups)
        ? stored.backups.filter((item) => item && item.name && item.progress)
        : [];
    } else if (stored && (stored.words || stored.stats || stored.version)) {
      // Tolerate a raw progress object from an early static build.
      progress = C.ensureProgress(stored);
      backups = [];
    } else {
      progress = C.defaultProgress();
      backups = [];
    }
    await C.loadData();
    // Persist a v3 copy after migration without creating a new user-facing
    // backup; the first mutating action will take a proper snapshot.
    if (!stored || C.integer(stored.progress && stored.progress.version, 0) !== C.SCHEMA_VERSION) {
      try {
        await writeStoredState(clone({ progress, backups }));
      } catch (_) {
        /* a failed first write is surfaced by /api/health and the next action */
      }
    }
  })();

  // ------------------------------------------------------------------
  // Endpoint handlers
  // ------------------------------------------------------------------

  function unitsResponse() {
    return {
      units: C.contentSummary(),
      total_vocab: C.totalVocab(),
      total_units: C.getContent().units.length,
    };
  }

  function healthResponse() {
    return {
      ok: true,
      version: "static-1.0.0",
      schema_version: C.SCHEMA_VERSION,
      data_dir: "Этот браузер · IndexedDB",
      warnings: [],
      save_error: saveError,
      static: true,
    };
  }

  function prefsRequest(body) {
    const source = body && typeof body === "object" ? body : {};
    if (source.daily_new_limit != null) {
      progress.prefs.daily_new_limit = Math.min(C.integer(source.daily_new_limit), 100);
    }
    if (source.daily_review_limit != null) {
      progress.prefs.daily_review_limit = Math.min(C.integer(source.daily_review_limit), 500);
    }
    if (source.daily_leech_limit != null) {
      progress.prefs.daily_leech_limit = Math.min(C.integer(source.daily_leech_limit), 100);
    }
    if (source.daily_exam_limit != null) {
      progress.prefs.daily_exam_limit = Math.min(C.integer(source.daily_exam_limit), 100);
    }
    if (source.desired_minutes != null) {
      progress.prefs.desired_minutes = C.clamp(C.integer(source.desired_minutes), 5, 180);
    }
    if (source.desired_retention_pct != null) {
      progress.prefs.desired_retention_pct = C.clamp(C.integer(source.desired_retention_pct), 80, 95);
    }
    if (source.max_interval_days != null) {
      progress.prefs.max_interval_days = C.clamp(C.integer(source.max_interval_days), 7, 3650);
    }
    if (source.exam_date != null) {
      const value = C.trim(source.exam_date);
      if (value && !C.parseDateKey(value)) {
        throw apiError(400, "Дата экзамена должна быть в формате ГГГГ-ММ-ДД");
      }
      progress.prefs.exam_date = value;
    }
  }

  async function handleGet(route, url) {
    if (route === "/api/health") return healthResponse();
    if (route === "/api/units") return unitsResponse();
    if (route === "/api/exams") return clone(C.getExams());

    const unitMatch = /^\/api\/units\/(\d+)$/.exec(route);
    if (unitMatch) {
      const unit = C.unitById(Number(unitMatch[1]));
      if (!unit) throw apiError(404, `Юнит ${unitMatch[1]} не найден`);
      return clone(unit);
    }

    if (route === "/api/progress") {
      return { ...C.progressView(progress), warnings: [] };
    }
    if (route === "/api/study/queue") {
      return C.studyQueue(progress, url.searchParams.get("kind") || "review", url.searchParams.get("limit"));
    }
    if (route === "/api/study/readiness") return C.readiness(progress);
    if (route === "/api/study/plan") return C.plan(progress);
    if (route === "/api/mistakes") return C.mistakes(progress);

    if (route === "/api/audio") {
      const audio = clone(C.getAudio());
      audio.done = [...progress.audio_done];
      audio.completed = progress.audio_done.length;
      return audio;
    }
    if (route === "/api/speaking") return C.speakingView(progress);

    if (route === "/api/exam/history") return { attempts: clone(progress.exams) };

    if (route === "/api/settings") return settingsView();

    if (route === "/api/ai/models") return { models: [], static: true };
    if (route === "/api/embedded/status") {
      return { ...STATIC_EMBEDDED, path: settings.embedded_model || "" };
    }

    throw apiError(404, `Неизвестный запрос: ${route}`);
  }

  async function handlePost(route, body) {
    if (route === "/api/answer") {
      const source = body && typeof body === "object" ? body : {};
      const en = C.text(source.en);
      const unitId = C.integer(source.unit_id);
      const responseMs = Math.min(Math.max(0, C.integer(source.response_ms)), 600_000);
      const word = source.rating != null
        ? C.recordRating(progress, unitId, en, C.integer(source.rating), responseMs)
        : C.recordAnswer(progress, unitId, en, Boolean(source.correct), responseMs);
      await persist();
      return {
        word: clone(word),
        stats: clone(progress.stats),
        streak: C.streak(progress),
        learned: C.learnedCount(progress),
        today: C.todayJson(progress),
        due: C.dueCount(progress),
      };
    }

    if (route === "/api/session") {
      C.finishSession(progress);
      await persist();
      return {
        ok: true,
        stats: clone(progress.stats),
        correct: C.integer(body && body.correct),
        total: C.integer(body && body.total),
      };
    }

    if (route === "/api/study/prefs") {
      prefsRequest(body);
      await persist();
      return { ok: true, prefs: clone(progress.prefs) };
    }

    if (route === "/api/mistakes/resolve") {
      const id = C.trim(body && body.id);
      if (!id) throw apiError(400, "Не указан id ошибки");
      const resolved = body && body.resolved != null ? Boolean(body.resolved) : true;
      C.setMistakeResolved(progress, id, resolved);
      await persist();
      return {
        ok: true,
        id,
        resolved,
        unresolved: C.mistakes(progress).unresolved,
      };
    }

    if (route === "/api/audio/done") {
      const id = C.trim(body && body.id);
      if (!id) throw apiError(400, "Не указан аудиоматериал");
      const audio = C.getAudio();
      const known = Array.isArray(audio.items) && audio.items.some((item) => item.id === id);
      if (!known) throw apiError(404, "Аудиоматериал не найден");
      const done = body && body.done != null ? Boolean(body.done) : true;
      const exists = progress.audio_done.includes(id);
      if (done && !exists) progress.audio_done.push(id);
      else if (!done && exists) progress.audio_done = progress.audio_done.filter((item) => item !== id);
      await persist();
      return { ok: true, id, done: [...progress.audio_done] };
    }

    if (route === "/api/speaking/attempt") {
      const id = C.trim(body && body.id);
      if (!id) throw apiError(400, "Не указана фраза");
      if (!C.speakingContains(id)) throw apiError(404, "Фраза не найдена");
      const completed = Boolean(body && body.completed);
      progress.speaking_attempts = C.integer(progress.speaking_attempts) + 1;
      progress.speaking_last_at = C.nowTs();
      if (completed && !progress.speaking_done.includes(id)) progress.speaking_done.push(id);
      await persist();
      return {
        ok: true,
        id,
        completed,
        speaking: C.speakingView(progress),
      };
    }

    if (route === "/api/exam/history") {
      if (!body || typeof body !== "object" || Array.isArray(body)) {
        throw apiError(400, "Ожидалась попытка экзамена");
      }
      const saved = C.addExam(progress, clone(body));
      await persist();
      return {
        ok: true,
        attempt: clone(saved),
        today: C.todayJson(progress),
        due: C.dueCount(progress),
      };
    }

    if (route === "/api/progress/reset") {
      createBackup();
      progress = C.defaultProgress();
      await persist();
      return { ok: true };
    }

    if (route === "/api/progress/import") {
      const source = body && typeof body === "object" ? body : {};
      const incoming = source.progress;
      if (!incoming || typeof incoming !== "object" || Array.isArray(incoming)) {
        throw apiError(400, "Ожидался объект прогресса");
      }
      const known = [
        "version", "schema_version", "words", "stats", "days", "exams", "day_ms",
        "day_exams", "day_new", "day_reviews", "prefs", "resolved_mistakes",
        "audio_done", "speaking_done", "speaking_attempts", "speaking_last_at",
      ];
      if (!known.some((field) => Object.prototype.hasOwnProperty.call(incoming, field))) {
        throw apiError(400, "В файле нет данных IT English Lab: ожидались поля progress/words/stats/exams.");
      }
      const imported = C.ensureProgress(incoming);
      createBackup();
      const merged = Boolean(source.merge);
      if (merged) C.mergeProgress(progress, imported);
      else progress = imported;
      await persist();
      return { ok: true, merged, progress: C.progressView(progress) };
    }

    if (route === "/api/progress/restore") {
      const name = C.trim(body && body.name);
      const found = backups.find((backup) => backup.name === name);
      if (!found) throw apiError(400, "Резервная копия не найдена. Обновите список и попробуйте снова.");
      createBackup();
      progress = C.ensureProgress(found.progress);
      await persist();
      return { ok: true, restored: name, progress: C.progressView(progress) };
    }

    if (route === "/api/settings") {
      const source = body && typeof body === "object" ? body : {};
      if (source.base_url != null) settings.base_url = C.trim(source.base_url);
      if (source.model != null) settings.model = C.trim(source.model);
      if (source.temperature != null) settings.temperature = C.clamp(Number(source.temperature) || 0, 0, 1.5);
      if (source.max_tokens != null) settings.max_tokens = C.clamp(C.integer(source.max_tokens), 64, 4096);
      if (source.embedded_model != null) settings.embedded_model = C.trim(source.embedded_model);
      if (source.embedded_ctx != null) settings.embedded_ctx = C.clamp(C.integer(source.embedded_ctx), 512, 16384);
      if (source.system_extra != null) settings.system_extra = C.trim(source.system_extra);
      // AI is intentionally unavailable in the static build, regardless of an
      // old client sending mode=openai/embedded.
      settings.mode = "off";
      saveSettings();
      return settingsView();
    }

    if (route === "/api/ai/chat" || route === "/api/ai/check" || route === "/api/ai/test") {
      throw apiError(400, "ИИ отключён в статической версии. Все упражнения работают офлайн.");
    }
    if (route === "/api/embedded/load" || route === "/api/embedded/unload" || route === "/api/embedded/download") {
      throw apiError(400, "Встроенная модель недоступна в статической версии.");
    }

    throw apiError(404, `Неизвестный запрос: ${route}`);
  }

  async function handleDelete(route) {
    if (route === "/api/exam/history") {
      createBackup();
      C.clearExams(progress);
      await persist();
      return { ok: true, due: C.dueCount(progress) };
    }
    throw apiError(404, `Неизвестный запрос: ${route}`);
  }

  function routePath(pathname) {
    const index = pathname.lastIndexOf("/api/");
    return index >= 0 ? pathname.slice(index) : pathname;
  }

  function parseBody(raw) {
    if (raw == null) return {};
    if (typeof raw !== "string") return raw;
    if (!raw.trim()) return {};
    try {
      return JSON.parse(raw);
    } catch (_) {
      return raw;
    }
  }

  // Replace the fetch-based client from app.js. This is the only integration
  // point the original frontend needs; all existing views keep working.
  IT.api = async (path, opts = {}) => {
    await ready;
    const method = String(opts.method || "GET").toUpperCase();
    const url = new URL(path, document.baseURI);
    const route = routePath(url.pathname);
    const body = parseBody(opts.body);

    if (!route.startsWith("/api/")) {
      // Keep a safe escape hatch for non-API resources. Normal calls never
      // reach this branch in the static build.
      const response = await fetch(path, opts);
      let data = null;
      try {
        data = await response.json();
      } catch (_) {
        data = null;
      }
      if (!response.ok) {
        throw apiError(response.status, data && data.error ? data.error : `Ошибка запроса (${response.status})`);
      }
      return data;
    }

    if (method === "GET") return handleGet(route, url);
    if (method === "POST") return handlePost(route, body);
    if (method === "DELETE") return handleDelete(route);
    throw apiError(405, `Метод ${method} не поддерживается`);
  };

  IT.staticMode = true;
  IT.staticReady = ready;

  // Expose a small diagnostic surface for the browser console and for tests.
  IT.staticDebug = {
    snapshot: () => clone({ progress, backups, settings: settingsView() }),
    clear: async () => {
      createBackup();
      progress = C.defaultProgress();
      await persist();
    },
  };
})();
