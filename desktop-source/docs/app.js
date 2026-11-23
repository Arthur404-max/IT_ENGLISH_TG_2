/* IT English Lab — core, state, router */
(() => {
  "use strict";
  const IT = (window.IT = window.IT || {});

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  const esc = (s = "") =>
    String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const svg = (p, w = 1.7) =>
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;

  const I = {
    arrow: svg('<path d="M5 12h14M13 6l6 6-6 6"/>', 1.8),
    back: svg('<path d="M19 12H5M11 18l-6-6 6-6"/>', 1.8),
    chev: svg('<path d="m6 9 6 6 6-6"/>', 1.8),
    book: svg('<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v18H6.5A2.5 2.5 0 0 0 4 23V5.5Z"/><path d="M4 18.5A2.5 2.5 0 0 1 6.5 16H20"/>'),
    text: svg('<path d="M4 6h16M4 11h12M4 16h16M4 21h9"/>'),
    tasks: svg('<path d="m4 6 1.5 1.5L8 5M4 12l1.5 1.5L8 11M4 18l1.5 1.5L8 17M11 6h9M11 12h9M11 18h9"/>'),
    cards: svg('<rect x="3" y="6" width="13" height="15" rx="2"/><path d="M8 3h11a2 2 0 0 1 2 2v13"/>'),
    spark: svg('<path d="m12 3 1.7 4.3L18 9l-4.3 1.7L12 15l-1.7-4.3L6 9l4.3-1.7L12 3Z"/><path d="m19 14 .9 2.1L22 17l-2.1.9L19 20l-.9-2.1L16 17l2.1-.9L19 14Z"/>'),
    speaker: svg('<path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18 6a9 9 0 0 1 0 12"/>'),
    search: svg('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
    play: svg('<path d="m8 5 11 7-11 7V5Z"/>'),
    check: svg('<path d="m4 12 5 5L20 6"/>'),
    x: svg('<path d="M6 6l12 12M18 6 6 18"/>'),
    send: svg('<path d="m3 11 18-8-8 18-2.5-7.5L3 11Z"/><path d="M13 13 21 3"/>'),
    download: svg('<path d="M12 3v12M7 10l5 5 5-5"/><path d="M4 19h16"/>'),
    key: svg('<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M16 5l3 3M13 8l3 3"/>'),
    chip: svg('<rect x="7" y="7" width="10" height="10" rx="2"/><path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3"/>'),
    flame: svg('<path d="M12 3c3 4 0 5 0 7 0 1.5 1.3 2 2.5 1 1.5 2 1.5 4 .5 6a5.5 5.5 0 0 1-9.5-2c0-3.5 3-5 3.5-7.5C9.8 6.3 11 4.5 12 3Z"/>'),
    target: svg('<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>'),
    brain: svg('<path d="M9.5 3a3.5 3.5 0 0 0-3.4 4.3A3.5 3.5 0 0 0 4 11a3.5 3.5 0 0 0 1.3 2.7A3.5 3.5 0 0 0 9.5 19c1.5 0 2.5-.5 3-1.2V4.2A3.5 3.5 0 0 0 9.5 3Z"/><path d="M14.5 3a3.5 3.5 0 0 1 3.4 4.3A3.5 3.5 0 0 1 20 11a3.5 3.5 0 0 1-1.3 2.7A3.5 3.5 0 0 1 14.5 19c-1.5 0-2.5-.5-3-1.2"/>'),
    refresh: svg('<path d="M20 11a8 8 0 1 0 .5 4M20 5v6h-6"/>'),
    lock: svg('<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>'),
    info: svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>'),
    trash: svg('<path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 11v6M14 11v6"/>'),
    upload: svg('<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 19h16"/>'),
    layers: svg('<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5M3 16l9 5 9-5"/>'),
    chart: svg('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'),
    flag: svg('<path d="M5 21V4M5 4h12l-2.5 4L17 12H5"/>'),
    headphones: svg('<path d="M4 15v-3a8 8 0 0 1 16 0v3"/><path d="M4 14h2a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a1 1 0 0 1-1-1v-6ZM20 14h-2a2 2 0 0 0-2 2v3a2 2 0 0 0 2 2h1a1 1 0 0 0 1-1v-6Z"/>'),
    clock: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
    calendar: svg('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/>'),
    mic: svg('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6"/>'),
    pause: svg('<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>'),
  };

  const S = (IT.S = {
    ready: false,
    units: [],
    totalVocab: 0,
    progress: {
      words: {},
      stats: { answers: 0, correct: 0, sessions: 0 },
      days: {},
      streak: 0,
      learned: 0,
      activity: [],
      exams: [],
      due: 0,
      today: { answers: 0, ms: 0, exams: 0, due: 0, new: 0, reviews: 0, leech: 0, exam_errors: 0 },
      prefs: {
        daily_new_limit: 12,
        daily_review_limit: 60,
        daily_leech_limit: 15,
        daily_exam_limit: 15,
        desired_minutes: 25,
        desired_retention_pct: 90,
        max_interval_days: 3650,
        exam_date: "",
      },
      resolved_mistakes: [],
      audio_done: [],
      speaking_done: [],
      speaking_attempts: 0,
      speaking_last_at: 0,
      day_new: {},
      day_reviews: {},
      day_leech: {},
      day_exam_errors: {},
    },
    study: null,
    studyMode: "overview",
    studyDrills: {},
    settings: null,
    settingsDraft: null,
    currentNav: "",
    analytics: { a: "", b: "" },
    installPrompt: null,
    unit: null,
    unitTab: "vocab",
    unitCache: {},
    trainerUnit: null,
    practice: null,
    practiceConfig: { limit: 10, direction: "ru-en" },
    examContent: null,
    exam: null,
    examTimer: null,
    examConfig: {
      exam1Count: 10,
      exam1Timer: 20,
      exam2Timer: 60,
      finalCount: 20,
      finalTimer: 0,
      viewMode: "practice",
      custom: { units: [], types: [], count: 20, timer: 30 },
    },
    examFilter: "all",
    chat: { messages: [], unitId: null, busy: false, input: "" },
    embeddedStatus: null,
    testResult: null,
    models: [],
    modalConfirm: null,
    toastTimer: null,
    bootError: null,
  });

  const view = () => $("#view");
  const modalRoot = () => $("#modal-root");
  const toastEl = () => $("#toast");
  let modalSeq = 0;

  IT.$ = $;
  IT.$$ = $$;
  IT.esc = esc;
  IT.icons = I;

  IT.api = async (path, opts = {}) => {
    const init = { ...opts, headers: { ...(opts.headers || {}) } };
    if (init.body && typeof init.body !== "string") {
      init.body = JSON.stringify(init.body);
      init.headers["Content-Type"] = "application/json";
    }
    const res = await fetch(path, init);
    let data = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    if (!res.ok) {
      const msg = data && data.error ? data.error : `Ошибка запроса (${res.status})`;
      throw new Error(msg);
    }
    return data;
  };

  IT.toast = (message, type = "") => {
    const el = toastEl();
    if (!el) return;
    el.textContent = message;
    el.className = "toast show" + (type ? " " + type : "");
    clearTimeout(S.toastTimer);
    S.toastTimer = setTimeout(() => {
      el.className = "toast";
    }, 3400);
  };

  IT.confirm = ({ title, text, label = "Подтвердить", danger = false, onConfirm }) => {
    S.modalConfirm = onConfirm;
    S.modalReturnFocus = document.activeElement;
    const titleId = `modal-title-${++modalSeq}`;
    modalRoot().innerHTML = `
      <div class="modal-backdrop" data-action="modal-cancel">
        <div class="modal" role="dialog" aria-modal="true" aria-labelledby="${titleId}" tabindex="-1">
          <h3 id="${titleId}">${esc(title)}</h3>
          <p>${esc(text)}</p>
          <div class="modal-actions">
            <button class="btn btn-sm" type="button" data-action="modal-cancel">Отмена</button>
            <button class="btn btn-sm ${danger ? "btn-danger" : "btn-primary"}" type="button" data-action="modal-confirm">${esc(label)}</button>
          </div>
        </div>
      </div>`;
    const confirm = modalRoot().querySelector('[data-action="modal-confirm"]');
    if (confirm) setTimeout(() => confirm.focus(), 0);
    // Keep keyboard and screen-reader navigation inside the dialog while it is
    // open. The modal root sits outside the app shell on purpose.
    S.modalInert = [document.querySelector(".app-shell"), document.querySelector(".mobile-bottom-nav")].filter(Boolean);
    S.modalInert.forEach((el) => el.setAttribute("inert", ""));
  };

  IT.closeModal = () => {
    S.modalConfirm = null;
    modalRoot().innerHTML = "";
    (S.modalInert || []).forEach((el) => el.removeAttribute("inert"));
    S.modalInert = [];
    if (S.modalReturnFocus && document.contains(S.modalReturnFocus)) {
      try {
        S.modalReturnFocus.focus();
      } catch (e) {
        /* element disappeared */
      }
    }
    S.modalReturnFocus = null;
  };

  IT.trapFocus = (event) => {
    if (event.key !== "Tab") return false;
    const modal = modalRoot().querySelector(".modal");
    if (!modal) return false;
    const focusable = [...modal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter(
      (el) => !el.disabled && el.offsetParent !== null
    );
    if (!focusable.length) {
      event.preventDefault();
      modal.focus();
      return true;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
      return true;
    }
    if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
      return true;
    }
    if (!modal.contains(document.activeElement)) {
      event.preventDefault();
      first.focus();
      return true;
    }
    return false;
  };

  IT.announce = (text) => {
    const live = $("#route-live");
    if (live) live.textContent = String(text || "");
  };

  IT.setView = (html) => {
    view().innerHTML = `<div class="page">${html}</div>`;
    window.scrollTo(0, 0);
  };

  IT.showError = (error) => {
    const msg = error && error.message ? error.message : String(error);
    IT.setView(`
      <div class="error-box">
        <div class="eyebrow">Ошибка</div>
        <h2>Что-то пошло не так</h2>
        <p>${esc(msg)}</p>
        <button class="btn btn-primary" data-action="reload">Перезагрузить</button>
      </div>`);
  };

  IT.shuffle = (arr) => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  IT.norm = (s = "") =>
    String(s)
      .toLowerCase()
      .replace(/[’‘`]/g, "'")
      .replace(/[^\p{L}\p{N}\s-]/gu, " ")
      .replace(/\s+/g, " ")
      .trim();

  IT.uniqueBy = (arr, keyFn) => {
    const seen = new Set();
    return arr.filter((x) => {
      const k = keyFn(x);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  };

  IT.wordKey = (unitId, en) => `${unitId}|${String(en).trim().toLowerCase()}`;

  IT.wordStat = (unitId, en) => {
    return (
      S.progress.words[IT.wordKey(unitId, en)] || {
        box: 0,
        correct: 0,
        wrong: 0,
        last_seen: 0,
        due_at: 0,
        interval_days: 0,
        ease_factor: 2.5,
        reviews: 0,
        last_ms: 0,
        stability: 0,
        difficulty: 5,
        fsrs_state: "new",
        lapses: 0,
        leech: false,
        scheduled_days: 0,
        elapsed_days: 0,
        last_rating: 0,
        streak_correct: 0,
      }
    );
  };

  IT.hasStudied = (stat) =>
    Boolean(
      stat &&
        ((Number(stat.reviews) || 0) > 0 ||
          (Number(stat.correct) || 0) + (Number(stat.wrong) || 0) > 0 ||
          (Number(stat.last_seen) || 0) > 0 ||
          (Number(stat.due_at) || 0) > 0)
    );

  IT.isDue = (stat, nowSec = Date.now() / 1000) => {
    if (!IT.hasStudied(stat)) return false;
    const due = Number(stat && stat.due_at) || 0;
    return due === 0 || due <= nowSec;
  };

  IT.dueWords = (unit, nowSec = Date.now() / 1000) =>
    (unit.vocab || []).filter((v) => IT.isDue(IT.wordStat(unit.id, v.en), nowSec));

  IT.GOALS = { cards: 20, minutes: 15, exams: 1 };

  IT.today = () => {
    const t = (S.progress && S.progress.today) || {};
    return {
      answers: Number(t.answers) || 0,
      examAnswers: Number(t.exam_answers) || 0,
      ms: Number(t.ms) || 0,
      exams: Number(t.exams) || 0,
      due: Number(t.due ?? (S.progress && S.progress.due) ?? 0),
      new: Number(t.new) || 0,
      reviews: Number(t.reviews) || 0,
      leech: Number(t.leech) || 0,
      examErrors: Number(t.exam_errors) || 0,
    };
  };

  IT.applyProgress = (progress) => {
    if (!progress) return;
    S.progress = {
      ...S.progress,
      ...progress,
      words: progress.words || S.progress.words || {},
      stats: progress.stats || S.progress.stats,
      days: progress.days || S.progress.days || {},
      exams: progress.exams || S.progress.exams || [],
      today: progress.today || S.progress.today,
      prefs: progress.prefs || S.progress.prefs,
      resolved_mistakes: progress.resolved_mistakes || S.progress.resolved_mistakes || [],
      audio_done: progress.audio_done || S.progress.audio_done || [],
      speaking_done: progress.speaking_done || S.progress.speaking_done || [],
      speaking_attempts: Number(progress.speaking_attempts ?? S.progress.speaking_attempts) || 0,
      speaking_last_at: Number(progress.speaking_last_at ?? S.progress.speaking_last_at) || 0,
    };
    IT.hydrateSidebar();
  };

  IT.unitStats = (unitId, total) => {
    let learned = 0;
    let studied = 0;
    const prefix = `${unitId}|`;
    for (const [k, v] of Object.entries(S.progress.words || {})) {
      if (!k.startsWith(prefix)) continue;
      studied++;
      if (v.box >= 3) learned++;
    }
    return { learned, studied, total, pct: total ? Math.round((learned / total) * 100) : 0 };
  };

  IT.unitById = (id) => S.units.find((u) => u.id === Number(id));

  IT.plural = (n, one, few, many) => {
    const value = Math.abs(Number(n) || 0);
    const mod10 = value % 10;
    const mod100 = value % 100;
    if (mod10 === 1 && mod100 !== 11) return one;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
    return many;
  };

  IT.ensureUnit = async (id) => {
    const key = Number(id);
    if (S.unit && Number(S.unit.id) === key) return S.unit;
    if (S.unitCache[key]) {
      S.unit = S.unitCache[key];
      return S.unit;
    }
    const unit = await IT.api(`/api/units/${key}`);
    S.unitCache[key] = unit;
    S.unit = unit;
    return unit;
  };

  IT.readingMinutes = (texts) => {
    const text = (texts || []).flatMap((t) => t.paragraphs || []).join(" ");
    const words = text.split(/\s+/).filter(Boolean).length;
    return Math.max(1, Math.round(words / 190));
  };

  IT.basename = (p) => String(p || "").split(/[\\/]/).pop() || "";

  const TTS_VOICE_KEY = "itelab.tts.voice.v1";
  let speechTimer = null;
  let speechRun = 0;

  const ttsSupported = () => "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
  const voiceKey = (voice) => String((voice && (voice.voiceURI || voice.name)) || "");
  const englishVoice = (voice) => /^en(?:[-_]|$)/i.test(String((voice && voice.lang) || ""));
  const readVoices = () => {
    if (!ttsSupported()) return [];
    try {
      return window.speechSynthesis.getVoices() || [];
    } catch (_) {
      return [];
    }
  };
  const englishVoices = () => {
    const seen = new Set();
    return readVoices()
      .filter(englishVoice)
      .filter((voice) => {
        const key = voiceKey(voice) || `${voice.name || ""}|${voice.lang || ""}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => {
        const lang = (voice) => String(voice.lang || "").replace("_", "-").toLowerCase();
        const rank = (voice) => (lang(voice) === "en-us" ? 0 : lang(voice) === "en-gb" ? 1 : 2);
        const local = (voice) => (voice.localService ? 0 : 1);
        return rank(a) - rank(b) || local(a) - local(b) || String(a.name || "").localeCompare(String(b.name || ""));
      });
  };
  const storedVoiceKey = () => {
    try {
      return localStorage.getItem(TTS_VOICE_KEY) || "";
    } catch (_) {
      return "";
    }
  };
  const selectedVoice = () => {
    const key = storedVoiceKey();
    if (!key) return null;
    return englishVoices().find((voice) => voiceKey(voice) === key) || null;
  };
  const chooseVoice = (voiceURI, lang) => {
    if (!/^en(?:[-_]|$)/i.test(String(lang || "en-US"))) return null;
    const voices = englishVoices();
    if (voiceURI) {
      const requested = voices.find((voice) => voiceKey(voice) === voiceURI);
      if (requested) return requested;
    }
    const normalized = String(lang || "en-US").replace("_", "-").toLowerCase();
    return (
      voices.find((voice) => String(voice.lang || "").replace("_", "-").toLowerCase() === normalized) ||
      voices[0] ||
      null
    );
  };
  const makeUtterance = (text, lang, rate, voiceURI) => {
    const clean = String(text || "").replace(/\s+/g, " ").trim();
    if (!clean) return null;
    const u = new SpeechSynthesisUtterance(clean);
    const voice = chooseVoice(voiceURI || storedVoiceKey(), lang);
    u.lang = String((voice && voice.lang) || lang || "en-US").replace("_", "-");
    u.rate = Number(rate) || (String(u.lang).toLowerCase().startsWith("en") ? 0.88 : 0.95);
    if (voice) u.voice = voice;
    return u;
  };
  const clearSpeechTimer = () => {
    if (speechTimer) clearTimeout(speechTimer);
    speechTimer = null;
  };

  IT.tts = {
    supported: ttsSupported,
    voices: readVoices,
    englishVoices,
    voiceKey,
    storedVoiceKey,
    selectedVoice,
    setVoice: (voiceURI) => {
      const value = String(voiceURI || "").trim();
      try {
        if (value) localStorage.setItem(TTS_VOICE_KEY, value);
        else localStorage.removeItem(TTS_VOICE_KEY);
        return true;
      } catch (_) {
        return false;
      }
    },
  };

  IT.speak = (text, lang = "en-US", rate, voiceURI) => {
    if (!ttsSupported()) {
      IT.toast("Браузер не поддерживает озвучивание", "error");
      return;
    }
    IT.speakStop();
    const u = makeUtterance(text, lang, rate, voiceURI);
    if (!u) return;
    window.speechSynthesis.speak(u);
    return u;
  };

  IT.speakRepeat = (text, lang = "en-US", rate, times = 2, gapMs = 600, voiceURI) => {
    if (!ttsSupported()) {
      IT.toast("Браузер не поддерживает озвучивание", "error");
      return;
    }
    IT.speakStop();
    const run = ++speechRun;
    let remaining = Math.max(1, Math.min(5, Number(times) || 2));
    const say = () => {
      if (run !== speechRun || remaining <= 0) return;
      remaining -= 1;
      const u = makeUtterance(text, lang, rate, voiceURI);
      if (!u) return;
      u.onend = () => {
        if (run !== speechRun || remaining <= 0) return;
        speechTimer = setTimeout(say, Math.max(150, Number(gapMs) || 600));
      };
      window.speechSynthesis.speak(u);
    };
    say();
  };

  IT.speakStop = () => {
    speechRun += 1;
    clearSpeechTimer();
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  };

  IT.aiMode = () => (S.settings && S.settings.mode) || "off";
  IT.aiOn = () => IT.aiMode() === "openai" || IT.aiMode() === "embedded";

  IT.aiLabel = () => {
    const mode = IT.aiMode();
    if (mode === "openai") return `API · ${(S.settings && S.settings.model) || "модель"}`;
    if (mode === "embedded") {
      const file = IT.basename(S.settings && S.settings.embedded_model);
      return `Встроенная · ${file || "GGUF"}`;
    }
    return "ИИ выключен";
  };

  // Compact label for the narrow sidebar pill; the full name stays in the tooltip.
  IT.aiShortLabel = () => {
    const mode = IT.aiMode();
    if (mode === "openai") return `API · ${(S.settings && S.settings.model) || "модель"}`;
    if (mode === "embedded") {
      const file = IT.basename(S.settings && S.settings.embedded_model) || "";
      const family = file.match(/qwen[^0-9]*([0-9]+(?:\.[0-9]+)?)/i);
      const size = file.match(/([0-9]+(?:\.[0-9]+)?)b(?=[-_.]|$)/i);
      if (family && size) return `Qwen${family[1]} ${size[1]}B · локально`;
      return "Локальная модель";
    }
    return "ИИ выключен";
  };

  IT.hydrateSidebar = () => {
    const p = S.progress || {};
    const learned = Number(p.learned || 0);
    const total = Number(S.totalVocab || 0);
    const pct = total ? Math.min(100, Math.round((learned / total) * 100)) : 0;
    const bar = $("#sidebar-bar");
    if (bar) bar.style.width = pct + "%";
    const sl = $("#sidebar-learned");
    if (sl) sl.textContent = `${learned} ${IT.plural(learned, "слово", "слова", "слов")}`;
    const st = $("#sidebar-total");
    if (st) st.textContent = `${total} всего`;
    const streak = $("#sidebar-streak");
    if (streak) streak.textContent = `${Number(p.streak || 0)} дн.`;

    const mode = IT.aiMode();
    const pill = $("#ai-pill");
    if (pill) {
      pill.className = "ai-pill " + (mode === "openai" ? "on" : mode === "embedded" ? "embedded" : "");
      pill.innerHTML = `<span class="dot"></span><span>${esc(IT.aiShortLabel())}</span>`;
      pill.title = IT.aiLabel();
    }
    const live = $("#nav-live");
    if (live) {
      live.className = "nav-live" + (mode === "openai" ? " on" : mode === "embedded" ? " embedded" : "");
      live.title = IT.aiLabel();
    }
  };

  IT.closeMenu = (returnFocus = false) => {
    const side = $("#sidebar");
    const wasOpen = Boolean(side && side.classList.contains("open"));
    if (side) side.classList.remove("open");
    const toggle = $("#menu-toggle");
    if (toggle) toggle.setAttribute("aria-expanded", "false");
    if (returnFocus && wasOpen && toggle) toggle.focus();
  };

  IT.toggleMenu = () => {
    const side = $("#sidebar");
    if (!side) return;
    const open = !side.classList.contains("open");
    side.classList.toggle("open", open);
    const toggle = $("#menu-toggle");
    if (toggle) toggle.setAttribute("aria-expanded", String(open));
    if (open) {
      const first = side.querySelector("a, button");
      if (first) first.focus();
    }
  };

  IT.activeNav = (name) => {
    $$("[data-nav]").forEach((a) => {
      const active = a.dataset.nav === name;
      a.classList.toggle("active", active);
      if (active) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });
    if (S.currentNav !== name) {
      S.currentNav = name;
      const labels = { home: "Главная", textbook: "Материалы", trainer: "Тренажёр", study: "Центр учёбы", exams: "Экзамены", audio: "Аудио", speaking: "Речь", analytics: "Аналитика", tutor: "ИИ-репетитор", settings: "Настройки" };
      IT.announce(labels[name] || name);
    }
  };

  IT.initSettingsDraft = () => {
    if (!S.settings) return;
    S.settingsDraft = {
      ...S.settings,
      api_key: "",
      clear_key: false,
      temperature: Number(S.settings.temperature ?? 0.4),
      max_tokens: Number(S.settings.max_tokens ?? 700),
      embedded_ctx: Number(S.settings.embedded_ctx ?? 4096),
    };
  };

  IT.router = async () => {
    if (!S.ready) return;
    const raw = (location.hash || "#/home").replace(/^#/, "") || "/home";
    const parts = raw.split("/").filter(Boolean);
    IT.closeMenu();
    if (parts[0] !== "exam" && IT.stopExamTimer) IT.stopExamTimer();
    if (parts[0] !== "exam" && IT.stopExamAudio) IT.stopExamAudio();
    if (parts[0] !== "speaking" && IT.stopSpeakingAudio) IT.stopSpeakingAudio();
    try {
      if (parts[0] === "study") {
        IT.activeNav("study");
        IT.views.study(parts[1] || "overview");
        return;
      }
      if (parts[0] === "audio") {
        IT.activeNav("audio");
        IT.views.audio();
        return;
      }
      if (parts[0] === "speaking") {
        IT.activeNav("speaking");
        IT.views.speaking();
        return;
      }
      if (parts[0] === "exams") {
        IT.activeNav("exams");
        IT.views.exams();
        return;
      }
      if (parts[0] === "exam") {
        IT.activeNav("exams");
        if (!S.exam) {
          location.hash = "#/exams";
          return;
        }
        IT.views.exam();
        return;
      }
      if (parts[0] === "unit") {
        const id = Number(parts[1]);
        if (!Number.isFinite(id) || !IT.unitById(id)) {
          location.hash = "#/textbook";
          return;
        }
        const tab = parts[2] || "vocab";
        S.unitTab = ["vocab", "text", "tasks", "practice", "qa"].includes(tab) ? tab : "vocab";
        IT.activeNav("textbook");
        await IT.ensureUnit(id);
        IT.views.unit();
        return;
      }
      if (parts[0] === "textbook") {
        IT.activeNav("textbook");
        IT.views.textbook();
        return;
      }
      if (parts[0] === "trainer") {
        IT.activeNav("trainer");
        IT.views.trainer();
        return;
      }
      if (parts[0] === "practice") {
        IT.activeNav("trainer");
        if (!S.practice) {
          location.hash = "#/trainer";
          return;
        }
        IT.views.practice();
        return;
      }
      if (parts[0] === "tutor") {
        IT.activeNav("tutor");
        IT.views.tutor();
        return;
      }
      if (parts[0] === "analytics") {
        IT.activeNav("analytics");
        IT.views.analytics();
        return;
      }
      if (parts[0] === "view") {
        view().focus();
        return;
      }
      if (parts[0] === "settings") {
        IT.activeNav("settings");
        IT.views.settings();
        return;
      }
      IT.activeNav("home");
      IT.views.home();
    } catch (e) {
      console.error(e);
      IT.showError(e);
    }
  };

  window.addEventListener("hashchange", () => {
    if (!S.ready) return;
    IT.router().then(() => {
      const main = view();
      if (main) {
        try {
          main.focus({ preventScroll: true });
        } catch (e) {
          main.focus();
        }
      }
    });
  });

  IT.boot = async () => {
    try {
      const [unitsRes, progress, settings, health] = await Promise.all([
        IT.api("/api/units"),
        IT.api("/api/progress"),
        IT.api("/api/settings"),
        IT.api("/api/health"),
      ]);
      S.units = unitsRes.units || [];
      S.totalVocab = unitsRes.total_vocab || S.units.reduce((n, u) => n + (u.vocab || 0), 0);
      const warnings = Array.isArray(progress && progress.warnings) ? progress.warnings : [];
      if (health && health.save_error) warnings.push(`Ошибка сохранения: ${health.save_error}`);
      IT.applyProgress({
        words: {},
        stats: { answers: 0, correct: 0, sessions: 0 },
        days: {},
        streak: 0,
        learned: 0,
        activity: [],
        due: 0,
        today: { answers: 0, ms: 0, exams: 0, due: 0, new: 0, reviews: 0, leech: 0, exam_errors: 0 },
        ...(progress || {}),
      });
      if (warnings.length) {
        warnings.forEach((w) => console.warn(w));
        setTimeout(() => IT.toast(warnings[0], "error"), 500);
      }
      S.settings = settings;
      S.ready = true;
      IT.initSettingsDraft();
      IT.hydrateSidebar();
      S.lastSaveError = (health && health.save_error) || "";
      if (!S.saveWatchStarted) {
        S.saveWatchStarted = true;
        window.setInterval(async () => {
          try {
            const h = await IT.api("/api/health");
            const current = (h && h.save_error) || "";
            if (current && current !== S.lastSaveError) {
              S.lastSaveError = current;
              IT.toast(`Ошибка сохранения: ${current}`, "error");
            } else if (!current) {
              S.lastSaveError = "";
            }
          } catch (_) {
            /* offline or server stopped — keep the last known state */
          }
        }, 60000);
      }
      if (!location.hash) location.hash = "#/home";
      await IT.router();
    } catch (e) {
      console.error(e);
      IT.showError(e);
    }
  };
})();
