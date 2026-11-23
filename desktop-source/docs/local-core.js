/* IT English Lab — browser-side core: content, FSRS progress, study and speaking.
 *
 * This file is a direct port of the deterministic parts of src/progress.rs,
 * src/study.rs and src/speaking.rs. It deliberately has no network or storage
 * side effects so the same functions can be used by the static API, tests and
 * future local clients.
 */
(() => {
  "use strict";

  const C = (window.ITLocal = window.ITLocal || {});
  const SCHEMA_VERSION = 3;

  // FSRS-5 default weights, identical to src/progress.rs.
  const FSRS_W = [
    0.40255, 1.18385, 3.173, 15.69105, 7.1949, 0.5345, 1.4604, 0.0046, 1.54575,
    0.1192, 1.01925, 1.9395, 0.11, 0.29605, 2.2698, 0.2315, 2.9898,
  ];
  const FSRS_DECAY = -0.5;
  const FSRS_FACTOR = 19 / 81;
  const DAY = 86_400;

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const finite = (value, fallback = 0) => {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
  };
  const integer = (value, fallback = 0) => Math.trunc(finite(value, fallback));
  const text = (value) => (value == null ? "" : String(value));
  const trim = (value) => text(value).trim();
  const round = (value, digits) => {
    const factor = 10 ** digits;
    return Math.round(finite(value) * factor) / factor;
  };

  const pad = (value) => String(value).padStart(2, "0");
  const dateKey = (date = new Date()) =>
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const dateFromParts = (year, month, day) => new Date(year, month - 1, day, 12, 0, 0, 0);
  const parseDateKey = (value) => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trim(value));
    if (!match) return null;
    const date = dateFromParts(Number(match[1]), Number(match[2]), Number(match[3]));
    return Number.isNaN(date.getTime()) ? null : date;
  };
  const addDays = (date, count) => {
    const next = new Date(date);
    next.setDate(next.getDate() + count);
    return next;
  };
  const dayDiff = (from, to) => {
    const a = new Date(from);
    const b = new Date(to);
    a.setHours(12, 0, 0, 0);
    b.setHours(12, 0, 0, 0);
    return Math.round((b - a) / (DAY * 1000));
  };
  const nowTs = () => Math.floor(Date.now() / 1000);
  const todayKey = () => dateKey(new Date());
  const dateKeyFromTs = (seconds) => {
    const value = finite(seconds);
    const date = new Date(value * 1000);
    return Number.isNaN(date.getTime()) ? todayKey() : dateKey(date);
  };
  const normalizeTimestamp = (value) => {
    const num = integer(value);
    return num > 10_000_000_000 ? Math.floor(num / 1000) : num;
  };

  const key = (unitId, en) => `${integer(unitId)}|${trim(en).toLowerCase()}`;
  const normalize = (value) => trim(value).toLowerCase();

  // ------------------------------------------------------------------
  // Default progress (schema v3)
  // ------------------------------------------------------------------

  function defaultPrefs() {
    return {
      daily_new_limit: 12,
      daily_review_limit: 60,
      daily_leech_limit: 15,
      daily_exam_limit: 15,
      desired_minutes: 25,
      desired_retention_pct: 90,
      max_interval_days: 3650,
      exam_date: "",
    };
  }

  function defaultWord() {
    return {
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
    };
  }

  function defaultProgress() {
    return {
      version: SCHEMA_VERSION,
      words: {},
      stats: { answers: 0, correct: 0, sessions: 0 },
      days: {},
      exams: [],
      day_ms: {},
      day_exams: {},
      day_new: {},
      day_reviews: {},
      day_leech: {},
      day_exam_errors: {},
      prefs: defaultPrefs(),
      resolved_mistakes: [],
      audio_done: [],
      speaking_done: [],
      speaking_attempts: 0,
      speaking_last_at: 0,
    };
  }

  function normalizeWord(raw) {
    const source = raw && typeof raw === "object" ? raw : {};
    const word = { ...defaultWord(), ...source };
    if (source.box == null && source.box_ != null) word.box = source.box_;
    delete word.box_;

    word.correct = Math.max(0, integer(word.correct));
    word.wrong = Math.max(0, integer(word.wrong));
    word.last_seen = integer(word.last_seen);
    word.due_at = integer(word.due_at);
    word.interval_days = Math.min(Math.max(0, integer(word.interval_days)), 3650);
    word.ease_factor = finite(word.ease_factor, 2.5);
    if (!(word.ease_factor > 0)) word.ease_factor = 2.5;
    word.ease_factor = clamp(word.ease_factor, 1.3, 4.0);
    word.reviews = Math.max(0, integer(word.reviews));
    word.last_ms = Math.max(0, integer(word.last_ms));
    word.stability = finite(word.stability, 0);
    if (!(word.stability >= 0)) word.stability = 0;
    word.stability = Math.min(word.stability, 3650);
    word.difficulty = finite(word.difficulty, 5);
    if (!(word.difficulty > 0)) word.difficulty = 5;
    word.difficulty = clamp(word.difficulty, 1, 10);
    if (!["new", "learning", "review", "relearning"].includes(word.fsrs_state)) {
      word.fsrs_state = word.reviews > 0 ? "review" : "new";
    }
    word.lapses = Math.max(0, integer(word.lapses));
    word.leech = Boolean(word.leech);
    word.scheduled_days = Math.min(Math.max(0, integer(word.scheduled_days)), 3650);
    word.elapsed_days = Math.min(Math.max(0, integer(word.elapsed_days)), 3650);
    word.last_rating = Math.min(Math.max(0, integer(word.last_rating)), 4);
    word.streak_correct = Math.min(Math.max(0, integer(word.streak_correct)), 1000);
    word.box = Math.min(Math.max(0, integer(word.box)), 5);
    return word;
  }

  function normalizePrefs(raw) {
    const source = raw && typeof raw === "object" ? raw : {};
    const prefs = { ...defaultPrefs(), ...source };
    prefs.daily_new_limit = clamp(integer(prefs.daily_new_limit, 12), 0, 100);
    prefs.daily_review_limit = clamp(integer(prefs.daily_review_limit, 60), 0, 500);
    prefs.daily_leech_limit = clamp(integer(prefs.daily_leech_limit, 15), 0, 100);
    prefs.daily_exam_limit = clamp(integer(prefs.daily_exam_limit, 15), 0, 100);
    prefs.desired_minutes = clamp(integer(prefs.desired_minutes, 25), 5, 180);
    prefs.desired_retention_pct = clamp(integer(prefs.desired_retention_pct, 90), 80, 95);
    prefs.max_interval_days = clamp(integer(prefs.max_interval_days, 3650), 7, 3650);
    prefs.exam_date = trim(prefs.exam_date);
    if (prefs.exam_date && !parseDateKey(prefs.exam_date)) prefs.exam_date = "";
    return prefs;
  }

  function numberMap(raw) {
    const out = {};
    if (!raw || typeof raw !== "object") return out;
    for (const [k, value] of Object.entries(raw)) {
      const num = finite(value);
      if (Number.isFinite(num)) out[k] = num;
    }
    return out;
  }

  function stringList(raw) {
    if (!Array.isArray(raw)) return [];
    return [...new Set(raw.map(trim).filter(Boolean))];
  }

  function normalizeProgress(raw) {
    let source = raw && typeof raw === "object" ? raw : {};
    if (source.progress && typeof source.progress === "object" && !source.words) {
      source = source.progress;
    }
    const p = defaultProgress();
    p.version = source.version != null
      ? integer(source.version, 0)
      : source.schema_version != null
        ? integer(source.schema_version, 0)
        : 0;
    p.words = {};
    if (source.words && typeof source.words === "object" && !Array.isArray(source.words)) {
      for (const [wordKey, word] of Object.entries(source.words)) {
        p.words[wordKey] = normalizeWord(word);
      }
    }
    const stats = source.stats && typeof source.stats === "object" ? source.stats : {};
    p.stats = {
      answers: Math.max(0, integer(stats.answers)),
      correct: Math.max(0, integer(stats.correct)),
      sessions: Math.max(0, integer(stats.sessions)),
    };
    p.days = numberMap(source.days);
    p.exams = Array.isArray(source.exams)
      ? source.exams.filter((attempt) => attempt && typeof attempt === "object").slice(0, 100)
      : [];
    p.day_ms = numberMap(source.day_ms);
    p.day_exams = numberMap(source.day_exams);
    p.day_new = numberMap(source.day_new);
    p.day_reviews = numberMap(source.day_reviews);
    p.day_leech = numberMap(source.day_leech);
    p.day_exam_errors = numberMap(source.day_exam_errors);
    p.prefs = normalizePrefs(source.prefs);
    p.resolved_mistakes = stringList(source.resolved_mistakes);
    p.audio_done = stringList(source.audio_done);
    p.speaking_done = stringList(source.speaking_done);
    p.speaking_attempts = Math.max(0, integer(source.speaking_attempts));
    p.speaking_last_at = Math.max(0, integer(source.speaking_last_at));
    return p;
  }

  const boxInterval = (box) => [0, 1, 2, 4, 8, 16][clamp(integer(box), 0, 5)] || 0;
  const boxFromInterval = (days) => {
    const value = integer(days);
    if (value <= 0) return 0;
    if (value === 1) return 1;
    if (value <= 3) return 2;
    if (value <= 7) return 3;
    if (value <= 15) return 4;
    return 5;
  };

  function isActive(word) {
    if (!word) return false;
    return (
      integer(word.reviews) > 0 ||
      integer(word.correct) > 0 ||
      integer(word.wrong) > 0 ||
      integer(word.last_seen) > 0 ||
      integer(word.due_at) > 0 ||
      finite(word.stability) > 0
    );
  }

  function isDue(word, now = nowTs()) {
    if (!word) return true;
    const due = integer(word.due_at);
    return due === 0 || due <= now;
  }

  function retrievabilityAt(word, now = nowTs()) {
    if (!word || finite(word.stability) <= 0 || integer(word.last_seen) <= 0) return 0;
    const elapsed = Math.max(0, integer(now) - integer(word.last_seen)) / DAY;
    return (1 + FSRS_FACTOR * elapsed / finite(word.stability)) ** FSRS_DECAY;
  }

  function refreshLeech(word) {
    const attempts = integer(word.correct) + integer(word.wrong);
    const accuracy = attempts === 0 ? 1 : integer(word.correct) / attempts;
    if (integer(word.lapses) >= 4 || (integer(word.wrong) >= 5 && accuracy < 0.6)) {
      word.leech = true;
    }
    if (word.leech && integer(word.streak_correct) >= 3) word.leech = false;
  }

  function initialStability(rating) {
    return FSRS_W[clamp(integer(rating), 1, 4) - 1];
  }

  function initialDifficulty(rating) {
    const value = clamp(integer(rating), 1, 4);
    return clamp(FSRS_W[4] - Math.exp(FSRS_W[5] * (value - 1)) + 1, 1, 10);
  }

  function nextDifficulty(current, rating) {
    const delta = -0.7 * (clamp(integer(rating), 1, 4) - 3);
    const next = finite(current) + delta;
    return clamp(0.05 * initialDifficulty(4) + 0.95 * next, 1, 10);
  }

  function successStability(current, difficulty, retrievability, rating) {
    const hardPenalty = integer(rating) === 2 ? FSRS_W[15] : 1;
    const easyBonus = integer(rating) === 4 ? FSRS_W[16] : 1;
    const growth =
      Math.exp(FSRS_W[8]) *
      (11 - finite(difficulty)) *
      Math.pow(Math.max(0.1, finite(current)), -FSRS_W[9]) *
      (Math.expm1((1 - finite(retrievability)) * FSRS_W[10]) || 0) *
      hardPenalty *
      easyBonus;
    return clamp(current * (1 + growth), 0.1, 3650);
  }

  function lapseStability(current, difficulty, retrievability) {
    const next =
      FSRS_W[11] *
      Math.pow(finite(difficulty), -FSRS_W[12]) *
      (Math.pow(finite(current) + 1, FSRS_W[13]) - 1) *
      Math.exp((1 - finite(retrievability)) * FSRS_W[14]);
    return clamp(next, 0.1, 3650);
  }

  function intervalForStability(stability, retentionPct, maxIntervalDays) {
    const retention = clamp(integer(retentionPct, 90), 80, 95) / 100;
    const cap = clamp(integer(maxIntervalDays, 3650), 7, 3650);
    const interval = (finite(stability) / FSRS_FACTOR) * (retention ** (1 / FSRS_DECAY) - 1);
    return clamp(Math.round(interval), 1, cap);
  }

  function applyFsrs(word, rating, now, firstReview, elapsedDays, retentionPct, maxIntervalDays) {
    const grade = clamp(integer(rating), 1, 4);
    const current = Math.max(0.1, finite(word.stability));
    const difficulty = clamp(finite(word.difficulty), 1, 10);
    const retrievability = firstReview
      ? 0
      : (1 + FSRS_FACTOR * Math.max(0, finite(elapsedDays)) / current) ** FSRS_DECAY;
    const nextStability = firstReview
      ? initialStability(grade)
      : grade === 1
        ? lapseStability(current, difficulty, retrievability)
        : successStability(current, difficulty, retrievability, grade);
    const nextDifficultyValue = firstReview
      ? initialDifficulty(grade)
      : nextDifficulty(difficulty, grade);
    const interval = grade === 1 ? 0 : intervalForStability(nextStability, retentionPct, maxIntervalDays);

    word.stability = clamp(nextStability, 0.1, 3650);
    word.difficulty = clamp(nextDifficultyValue, 1, 10);
    word.elapsed_days = clamp(Math.round(finite(elapsedDays)), 0, 3650);
    word.scheduled_days = interval;
    word.interval_days = interval;
    word.box = interval === 0 ? 0 : boxFromInterval(interval);
    word.fsrs_state = grade === 1
      ? firstReview
        ? "learning"
        : "relearning"
      : "review";
    if (grade === 1 && !firstReview) word.lapses = integer(word.lapses) + 1;
    word.last_rating = grade;
    word.due_at = interval === 0 ? now + 10 * 60 : now + interval * DAY;
  }

  function migrateProgress(progress) {
    const p = progress;
    if (!p || typeof p !== "object") return false;
    const oldVersion = integer(p.version, 0);
    let changed = oldVersion !== SCHEMA_VERSION;
    const now = nowTs();

    if (oldVersion < 2) {
      for (const word of Object.values(p.words || {})) {
        const normalized = normalizeWord(word);
        Object.assign(word, normalized);
        if (integer(word.reviews) === 0) {
          word.reviews = integer(word.correct) + integer(word.wrong);
        }
        if (integer(word.interval_days) === 0 && integer(word.box) > 0) {
          word.interval_days = boxInterval(word.box);
          word.due_at = integer(word.last_seen) > 0
            ? integer(word.last_seen) + integer(word.interval_days) * DAY
            : now;
        }
      }
      for (const attempt of [...(p.exams || [])]) {
        const finished = integer(attempt.finished_at);
        if (finished <= 0) continue;
        const date = dateKeyFromTs(finished);
        p.day_exams[date] = integer(p.day_exams[date]) + 1;
        if (integer(attempt.time_spent_sec) > 0) {
          p.day_ms[date] = integer(p.day_ms[date]) + integer(attempt.time_spent_sec) * 1000;
        }
      }
    }

    for (const word of Object.values(p.words || {})) {
      const normalized = normalizeWord(word);
      Object.assign(word, normalized);
      if (integer(word.reviews) === 0 && (integer(word.correct) > 0 || integer(word.wrong) > 0)) {
        word.reviews = integer(word.correct) + integer(word.wrong);
      }
      if (oldVersion < 3) {
        if (finite(word.stability) <= 0 && isActive(word)) {
          const days = integer(word.interval_days) > 0
            ? integer(word.interval_days)
            : boxInterval(word.box);
          word.stability = Math.max(days, 1);
        }
        if (!(finite(word.difficulty) > 0)) {
          word.difficulty = clamp(5 + (2.5 - finite(word.ease_factor, 2.5)) * 1.5, 1, 10);
        }
        if (integer(word.scheduled_days) === 0) {
          word.scheduled_days = integer(word.interval_days);
        }
        if (word.fsrs_state === "new" && isActive(word)) {
          word.fsrs_state = integer(word.interval_days) === 0 ? "relearning" : "review";
        }
        if (integer(word.lapses) === 0 && integer(word.wrong) > 0) {
          word.lapses = Math.min(integer(word.wrong), 3);
        }
        refreshLeech(word);
      }
    }

    p.version = SCHEMA_VERSION;
    if (Array.isArray(p.exams)) p.exams = p.exams.slice(0, 100);
    return changed;
  }

  function ensureProgress(raw) {
    const p = normalizeProgress(raw);
    migrateProgress(p);
    return p;
  }

  function recordRating(progress, unitId, en, rating, responseMs = 0) {
    const p = progress;
    const grade = clamp(integer(rating, 3), 1, 4);
    const correct = grade > 1;
    const now = nowTs();
    const today = todayKey();
    const ms = clamp(integer(responseMs), 0, 600_000);
    const wordKey = key(unitId, en);
    const existing = p.words[wordKey] ? normalizeWord(p.words[wordKey]) : null;
    const wasActive = existing ? isActive(existing) : false;
    const wasLeech = existing ? Boolean(existing.leech) : false;
    const retentionPct = p.prefs.desired_retention_pct;
    const maxIntervalDays = p.prefs.max_interval_days;

    p.days[today] = integer(p.days[today]) + 1;
    if (ms > 0) p.day_ms[today] = integer(p.day_ms[today]) + ms;
    p.stats.answers = integer(p.stats.answers) + 1;
    if (correct) p.stats.correct = integer(p.stats.correct) + 1;

    const entry = existing || defaultWord();
    p.words[wordKey] = entry;
    const firstReview = !wasActive && integer(entry.reviews) === 0 && integer(entry.last_seen) === 0;
    const elapsed = integer(entry.last_seen) > 0
      ? Math.max(0, now - integer(entry.last_seen)) / DAY
      : 0;

    entry.last_seen = now;
    entry.reviews = integer(entry.reviews) + 1;
    if (ms > 0) entry.last_ms = ms;
    if (correct) {
      entry.correct = integer(entry.correct) + 1;
      entry.streak_correct = integer(entry.streak_correct) + 1;
    } else {
      entry.wrong = integer(entry.wrong) + 1;
      entry.streak_correct = 0;
    }
    if (grade === 1) entry.ease_factor = Math.max(1.3, finite(entry.ease_factor, 2.5) - 0.2);
    else if (grade === 2) entry.ease_factor = Math.max(1.3, finite(entry.ease_factor, 2.5) - 0.05);
    else if (grade === 4) entry.ease_factor = Math.min(3.2, finite(entry.ease_factor, 2.5) + 0.05);

    applyFsrs(entry, grade, now, firstReview, elapsed, retentionPct, maxIntervalDays);
    refreshLeech(entry);

    if (!wasActive) {
      p.day_new[today] = integer(p.day_new[today]) + 1;
    } else if (wasLeech) {
      p.day_leech[today] = integer(p.day_leech[today]) + 1;
    } else {
      p.day_reviews[today] = integer(p.day_reviews[today]) + 1;
    }
    return entry;
  }

  function recordAnswer(progress, unitId, en, correct, responseMs = 0) {
    const ms = clamp(integer(responseMs), 0, 600_000);
    const rating = !correct
      ? 1
      : ms > 0 && ms <= 6_000
        ? 4
        : ms > 20_000
          ? 2
          : 3;
    return recordRating(progress, unitId, en, rating, ms);
  }

  function finishSession(progress) {
    progress.stats.sessions = integer(progress.stats.sessions) + 1;
  }

  function flagForReview(progress, unitId, en) {
    const wordKey = key(unitId, en);
    const entry = progress.words[wordKey]
      ? normalizeWord(progress.words[wordKey])
      : defaultWord();
    progress.words[wordKey] = entry;
    entry.due_at = nowTs();
    entry.interval_days = 0;
    entry.scheduled_days = 0;
    if (integer(entry.reviews) > 0 || integer(entry.correct) + integer(entry.wrong) > 0) {
      entry.fsrs_state = "relearning";
      entry.stability = clamp(finite(entry.stability), 0.1, 1.0);
    }
  }

  function addExam(progress, rawAttempt) {
    const p = progress;
    const attempt = rawAttempt && typeof rawAttempt === "object" ? rawAttempt : {};
    const now = nowTs();
    if (!trim(attempt.id)) attempt.id = `exam-${Date.now()}-${p.exams.length}`;
    if (integer(attempt.finished_at) <= 0) attempt.finished_at = now;
    else attempt.finished_at = normalizeTimestamp(attempt.finished_at);
    if (integer(attempt.started_at) <= 0) attempt.started_at = attempt.finished_at;
    else attempt.started_at = normalizeTimestamp(attempt.started_at);
    if (integer(attempt.started_at) > integer(attempt.finished_at)) {
      attempt.started_at = attempt.finished_at;
    }

    const items = Array.isArray(attempt.items) ? attempt.items : [];
    attempt.items = items;
    attempt.total = items.length;
    attempt.correct = items.filter((item) => item && item.graded === true).length;
    attempt.wrong = items.filter((item) => item && item.graded === false).length;
    attempt.skipped = Math.max(0, attempt.total - attempt.correct - attempt.wrong);
    attempt.score_pct = attempt.total === 0
      ? 0
      : Math.round((attempt.correct / attempt.total) * 100);

    const failed = items
      .filter((item) => item && item.graded === false && trim(item.review_en))
      .map((item) => [integer(item.unit_id), trim(item.review_en)]);
    for (const [unitId, en] of failed) flagForReview(p, unitId, en);
    if (failed.length > 0) {
      const today = todayKey();
      p.day_exam_errors[today] = integer(p.day_exam_errors[today]) + failed.length;
    }

    const date = dateKeyFromTs(attempt.finished_at);
    p.day_exams[date] = integer(p.day_exams[date]) + 1;
    p.day_ms[date] = integer(p.day_ms[date]) + Math.max(0, integer(attempt.time_spent_sec)) * 1000;
    p.exams.unshift(attempt);
    p.exams = p.exams.slice(0, 100);
    return attempt;
  }

  function clearExams(progress) {
    progress.exams = [];
  }

  function resetProgress() {
    return defaultProgress();
  }

  function dueCount(progress, now = nowTs()) {
    return Object.values(progress.words || {}).filter(
      (word) => isActive(word) && isDue(word, now)
    ).length;
  }

  function todayJson(progress) {
    const today = todayKey();
    let examAnswers = 0;
    for (const attempt of progress.exams || []) {
      if (dateKeyFromTs(attempt.finished_at) !== today) continue;
      examAnswers += (attempt.items || []).filter((item) => item && item.answered).length;
    }
    return {
      date: today,
      answers: integer(progress.days[today]),
      exam_answers: examAnswers,
      ms: integer(progress.day_ms[today]),
      exams: integer(progress.day_exams[today]),
      new: integer(progress.day_new[today]),
      reviews: integer(progress.day_reviews[today]),
      leech: integer(progress.day_leech[today]),
      exam_errors: integer(progress.day_exam_errors[today]),
      due: dueCount(progress),
    };
  }

  function streak(progress) {
    const days = progress.days || {};
    let cursor = new Date();
    cursor.setHours(12, 0, 0, 0);
    if (!Object.prototype.hasOwnProperty.call(days, dateKey(cursor))) {
      cursor = addDays(cursor, -1);
    }
    let count = 0;
    while (Object.prototype.hasOwnProperty.call(days, dateKey(cursor))) {
      count += 1;
      cursor = addDays(cursor, -1);
    }
    return count;
  }

  function learnedCount(progress) {
    return Object.values(progress.words || {}).filter((word) => integer(word.box) >= 3).length;
  }

  function activityJson(progress) {
    const examAnswers = {};
    const examCount = {};
    for (const attempt of progress.exams || []) {
      const date = dateKeyFromTs(attempt.finished_at);
      examAnswers[date] = integer(examAnswers[date]) +
        (attempt.items || []).filter((item) => item && item.answered).length;
      examCount[date] = integer(examCount[date]) + 1;
    }
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    const start = addDays(today, -29);
    const out = [];
    for (let index = 0; index < 30; index += 1) {
      const date = dateKey(addDays(start, index));
      const practice = integer(progress.days[date]);
      const exams = integer(examAnswers[date]);
      out.push({
        date,
        count: practice + exams,
        practice,
        exam_answers: exams,
        exam_count: integer(examCount[date]),
        ms: integer(progress.day_ms[date]),
      });
    }
    return out;
  }

  function progressView(progress) {
    const p = progress;
    return {
      version: p.version,
      schema_version: SCHEMA_VERSION,
      words: p.words,
      stats: p.stats,
      days: p.days,
      streak: streak(p),
      learned: learnedCount(p),
      activity: activityJson(p),
      exams: p.exams,
      due: dueCount(p),
      today: todayJson(p),
      prefs: p.prefs,
      resolved_mistakes: p.resolved_mistakes,
      audio_done: p.audio_done,
      speaking_done: p.speaking_done,
      speaking_attempts: p.speaking_attempts,
      speaking_last_at: p.speaking_last_at,
      day_new: p.day_new,
      day_reviews: p.day_reviews,
      day_leech: p.day_leech,
      day_exam_errors: p.day_exam_errors,
    };
  }

  function prefsEqual(a, b) {
    const left = normalizePrefs(a);
    const right = normalizePrefs(b);
    return Object.keys(right).every((keyName) => left[keyName] === right[keyName]);
  }

  function mergeProgress(current, incoming) {
    const p = current;
    const other = ensureProgress(incoming);
    p.words = p.words || {};
    for (const [wordKey, incomingWord] of Object.entries(other.words)) {
      const incomingValue = normalizeWord(incomingWord);
      const currentValue = p.words[wordKey];
      if (!currentValue) {
        p.words[wordKey] = incomingValue;
        continue;
      }
      const word = normalizeWord(currentValue);
      p.words[wordKey] = word;
      const incomingLatest = integer(incomingValue.last_seen) >= integer(word.last_seen);
      word.correct = integer(word.correct) + integer(incomingValue.correct);
      word.wrong = integer(word.wrong) + integer(incomingValue.wrong);
      word.reviews = integer(word.reviews) + integer(incomingValue.reviews);
      word.box = Math.max(integer(word.box), integer(incomingValue.box));
      word.interval_days = Math.max(integer(word.interval_days), integer(incomingValue.interval_days));
      word.ease_factor = clamp(
        (finite(word.ease_factor, 2.5) + finite(incomingValue.ease_factor, 2.5)) / 2,
        1.3,
        4.0
      );
      word.due_at = integer(word.due_at) === 0 || integer(incomingValue.due_at) === 0
        ? 0
        : Math.min(integer(word.due_at), integer(incomingValue.due_at));
      word.lapses = Math.max(integer(word.lapses), integer(incomingValue.lapses));
      word.leech = Boolean(word.leech) || Boolean(incomingValue.leech);
      word.scheduled_days = Math.max(integer(word.scheduled_days), integer(incomingValue.scheduled_days));
      word.streak_correct = Math.max(integer(word.streak_correct), integer(incomingValue.streak_correct));
      if (incomingLatest) {
        word.last_seen = incomingValue.last_seen;
        word.last_ms = incomingValue.last_ms;
        word.stability = Math.max(finite(word.stability), finite(incomingValue.stability));
        word.difficulty = incomingValue.difficulty;
        word.fsrs_state = incomingValue.fsrs_state;
        word.elapsed_days = incomingValue.elapsed_days;
        word.last_rating = incomingValue.last_rating;
      }
    }

    p.stats.answers = integer(p.stats.answers) + integer(other.stats.answers);
    p.stats.correct = integer(p.stats.correct) + integer(other.stats.correct);
    p.stats.sessions = integer(p.stats.sessions) + integer(other.stats.sessions);
    for (const mapName of ["days", "day_ms", "day_exams", "day_new", "day_reviews", "day_leech", "day_exam_errors"]) {
      p[mapName] = numberMap(p[mapName]);
      for (const [date, value] of Object.entries(other[mapName])) {
        p[mapName][date] = integer(p[mapName][date]) + integer(value);
      }
    }
    if (prefsEqual(p.prefs, defaultPrefs())) p.prefs = other.prefs;
    for (const id of other.resolved_mistakes) {
      if (!p.resolved_mistakes.includes(id)) p.resolved_mistakes.push(id);
    }
    for (const id of other.audio_done) {
      if (!p.audio_done.includes(id)) p.audio_done.push(id);
    }
    p.speaking_attempts = integer(p.speaking_attempts) + integer(other.speaking_attempts);
    p.speaking_last_at = Math.max(integer(p.speaking_last_at), integer(other.speaking_last_at));
    for (const id of other.speaking_done) {
      if (!p.speaking_done.includes(id)) p.speaking_done.push(id);
    }
    const ids = new Set((p.exams || []).map((attempt) => text(attempt.id)));
    for (const attempt of other.exams) {
      if (!ids.has(text(attempt.id))) {
        p.exams.push(attempt);
        ids.add(text(attempt.id));
      }
    }
    p.exams.sort((a, b) => integer(b.finished_at) - integer(a.finished_at));
    p.exams = p.exams.slice(0, 100);
    p.version = SCHEMA_VERSION;
    return p;
  }

  // ------------------------------------------------------------------
  // Local content
  // ------------------------------------------------------------------

  let dataPromise = null;
  let content = null;
  let examsData = null;
  let audioData = null;

  async function fetchJson(relativePath) {
    const response = await fetch(new URL(relativePath, document.baseURI), { cache: "no-cache" });
    if (!response.ok) throw new Error(`Не удалось загрузить ${relativePath} (${response.status})`);
    return response.json();
  }

  function loadData() {
    if (dataPromise) return dataPromise;
    dataPromise = Promise.all([
      fetchJson("data/units.json"),
      fetchJson("data/exams.json"),
      fetchJson("data/audio.json"),
    ]).then(([unitsFile, exams, audio]) => {
      if (!unitsFile || !Array.isArray(unitsFile.units)) {
        throw new Error("Файл data/units.json не содержит списка юнитов");
      }
      content = { units: unitsFile.units };
      examsData = exams || { questions: [], terms: [] };
      audioData = audio || { items: [] };
      return { content, exams: examsData, audio: audioData };
    });
    return dataPromise;
  }

  function getContent() {
    if (!content) throw new Error("Материалы ещё не загружены");
    return content;
  }

  function getExams() {
    return examsData || { questions: [], terms: [] };
  }

  function getAudio() {
    return audioData || { items: [] };
  }

  function contentSummary() {
    return getContent().units.map((unit) => ({
      id: unit.id,
      title_en: unit.title_en,
      title_ru: unit.title_ru,
      vocab: Array.isArray(unit.vocab) ? unit.vocab.length : 0,
      texts: Array.isArray(unit.texts) ? unit.texts.length : 0,
      tasks: Array.isArray(unit.tasks) ? unit.tasks.length : 0,
      translations: Array.isArray(unit.translation_sentences) ? unit.translation_sentences.length : 0,
      qa: Array.isArray(unit.qa) ? unit.qa.length : 0,
    }));
  }

  function totalVocab() {
    return getContent().units.reduce(
      (sum, unit) => sum + (Array.isArray(unit.vocab) ? unit.vocab.length : 0),
      0
    );
  }

  function unitById(id) {
    return getContent().units.find((unit) => integer(unit.id) === integer(id)) || null;
  }

  // ------------------------------------------------------------------
  // Study: catalog, queue, readiness, mistakes, plan
  // ------------------------------------------------------------------

  function termLookup(exams) {
    const out = new Map();
    const terms = exams && Array.isArray(exams.terms) ? exams.terms : [];
    for (const term of terms) {
      const unitId = integer(term.unit_id);
      const en = text(term.en);
      if (!trim(en)) continue;
      out.set(`${unitId}|${normalize(en)}`, {
        en,
        ru: text(term.ru),
        definition: text(term.definition),
      });
    }
    return out;
  }

  function catalog(terms) {
    const out = [];
    for (const unit of getContent().units) {
      for (const vocab of unit.vocab || []) {
        const info = terms.get(`${integer(unit.id)}|${normalize(vocab.en)}`);
        out.push({
          unit_id: integer(unit.id),
          unit_title: text(unit.title_en),
          en: text(vocab.en),
          ru: text(vocab.ru),
          definition: info ? info.definition : "",
        });
      }
    }
    return out;
  }

  function statFor(progress, word) {
    return progress.words[key(word.unit_id, word.en)] || null;
  }

  function unitErrorPriority(progress) {
    const out = {};
    for (const attempt of (progress.exams || []).slice(0, 30)) {
      for (const item of attempt.items || []) {
        if (item && item.graded === false && integer(item.unit_id) > 0) {
          out[integer(item.unit_id)] = integer(out[integer(item.unit_id)]) + 1;
        }
      }
    }
    return out;
  }

  function mistakeId(attempt, item, index) {
    const itemId = trim(item && item.item_id);
    return itemId ? `exam:${itemId}` : `exam:${text(attempt.id)}:${index}`;
  }

  function unresolvedMistakeCount(progress) {
    const resolved = new Set(progress.resolved_mistakes || []);
    const seen = new Set();
    let count = 0;
    for (const attempt of progress.exams || []) {
      (attempt.items || []).forEach((item, index) => {
        if (!item || item.graded === true) return;
        const id = mistakeId(attempt, item, index);
        if (!seen.has(id) && !resolved.has(id)) {
          seen.add(id);
          count += 1;
        }
      });
    }
    return count;
  }

  function wordJson(word, stat, reason, now) {
    const value = stat || null;
    return {
      unit_id: integer(word.unit_id),
      unit_title: word.unit_title,
      en: word.en,
      ru: word.ru,
      definition: word.definition,
      kind: "word",
      reason,
      state: value ? value.fsrs_state : "new",
      stability: round(value ? value.stability : 0, 3),
      difficulty: round(value ? value.difficulty : 5, 2),
      due_at: value ? integer(value.due_at) : 0,
      reviews: value ? integer(value.reviews) : 0,
      correct: value ? integer(value.correct) : 0,
      wrong: value ? integer(value.wrong) : 0,
      lapses: value ? integer(value.lapses) : 0,
      leech: value ? Boolean(value.leech) : false,
      retrievability: round(value ? retrievabilityAt(value, now) : 0, 3),
    };
  }

  function queueCounts(progress, words, now) {
    const newTotal = words.filter((word) => {
      const stat = statFor(progress, word);
      return !stat || !isActive(stat);
    }).length;
    const dueTotal = words.filter((word) => {
      const stat = statFor(progress, word);
      return Boolean(stat && isActive(stat) && !stat.leech && isDue(stat, now));
    }).length;
    const leechTotal = words.filter((word) => {
      const stat = statFor(progress, word);
      return Boolean(stat && isActive(stat) && stat.leech);
    }).length;
    const day = todayKey();
    const usedNew = integer(progress.day_new[day]);
    const usedReview = integer(progress.day_reviews[day]);
    const usedLeech = integer(progress.day_leech[day]);
    const mistakes = unresolvedMistakeCount(progress);
    return {
      new: newTotal,
      new_remaining: Math.min(newTotal, Math.max(0, integer(progress.prefs.daily_new_limit) - usedNew)),
      due: dueTotal,
      review_remaining: Math.min(dueTotal, Math.max(0, integer(progress.prefs.daily_review_limit) - usedReview)),
      leech: leechTotal,
      leech_remaining: Math.min(leechTotal, Math.max(0, integer(progress.prefs.daily_leech_limit) - usedLeech)),
      mistakes,
      exam_remaining: Math.min(mistakes, integer(progress.prefs.daily_exam_limit)),
      used: {
        new: usedNew,
        review: usedReview,
        leech: usedLeech,
        exam_errors: integer(progress.day_exam_errors[day]),
      },
    };
  }

  function prefsJson(prefs) {
    return {
      daily_new_limit: integer(prefs.daily_new_limit),
      daily_review_limit: integer(prefs.daily_review_limit),
      daily_leech_limit: integer(prefs.daily_leech_limit),
      daily_exam_limit: integer(prefs.daily_exam_limit),
      desired_minutes: integer(prefs.desired_minutes),
      desired_retention_pct: integer(prefs.desired_retention_pct),
      max_interval_days: integer(prefs.max_interval_days),
      exam_date: prefs.exam_date,
    };
  }

  function studyQueue(progress, modeName, requestedLimit) {
    let mode = trim(modeName).toLowerCase();
    if (mode === "exam" || mode === "mistakes") mode = "exam";
    else if (mode !== "new" && mode !== "leech") mode = "review";
    const now = nowTs();
    const terms = termLookup(getExams());
    const words = catalog(terms);
    const priority = unitErrorPriority(progress);
    const counts = queueCounts(progress, words, now);
    const day = todayKey();
    const requested = clamp(integer(requestedLimit, 50), 1, 200);
    let items = [];
    let available = 0;
    let remaining = 0;

    if (mode === "new") {
      const fresh = words.filter((word) => {
        const stat = statFor(progress, word);
        return !stat || !isActive(stat);
      });
      fresh.sort((a, b) => {
        const pa = integer(priority[a.unit_id]);
        const pb = integer(priority[b.unit_id]);
        if (pa !== pb) return pb - pa;
        if (a.unit_id !== b.unit_id) return a.unit_id - b.unit_id;
        return a.en.localeCompare(b.en);
      });
      const used = integer(progress.day_new[day]);
      const cap = Math.min(Math.max(0, integer(progress.prefs.daily_new_limit) - used), requested);
      available = fresh.length;
      remaining = Math.min(available, cap);
      items = fresh.slice(0, cap).map((word) => wordJson(word, null, "new", now));
    } else if (mode === "leech") {
      const leeches = words
        .map((word) => ({ word, stat: statFor(progress, word) }))
        .filter((pair) => pair.stat && isActive(pair.stat) && pair.stat.leech);
      leeches.sort((a, b) =>
        integer(b.stat.lapses) - integer(a.stat.lapses) ||
        integer(b.stat.wrong) - integer(a.stat.wrong) ||
        integer(a.stat.due_at) - integer(b.stat.due_at)
      );
      const used = integer(progress.day_leech[day]);
      const cap = Math.min(Math.max(0, integer(progress.prefs.daily_leech_limit) - used), requested);
      available = leeches.length;
      remaining = Math.min(available, cap);
      items = leeches.slice(0, cap).map((pair) => wordJson(pair.word, pair.stat, "leech", now));
    } else if (mode === "exam") {
      const mistakes = mistakeEntries(progress);
      const byWord = new Map();
      for (const item of mistakes) {
        if (item.resolved) continue;
        const reviewEn = trim(item.review_en);
        const unitId = integer(item.unit_id);
        if (!reviewEn || unitId <= 0) continue;
        const wordKey = key(unitId, reviewEn);
        if (!byWord.has(wordKey)) {
          const word = words.find(
            (candidate) =>
              candidate.unit_id === unitId && normalize(candidate.en) === normalize(reviewEn)
          );
          if (word) {
            const payload = wordJson(word, statFor(progress, word), "exam", now);
            payload.mistake_id = item.id == null ? null : item.id;
            byWord.set(wordKey, payload);
          } else {
            byWord.set(wordKey, {
              unit_id: unitId,
              en: reviewEn,
              ru: "",
              definition: "",
              kind: "word",
              reason: "exam",
              mistake_id: item.id == null ? null : item.id,
            });
          }
        }
        const entry = byWord.get(wordKey);
        if (entry && entry.mistake_id == null) entry.mistake_id = item.id == null ? null : item.id;
      }
      const list = [...byWord.values()].sort(
        (a, b) => integer(a.unit_id) - integer(b.unit_id)
      );
      available = list.length;
      const cap = Math.min(requested, integer(progress.prefs.daily_exam_limit));
      remaining = Math.min(available, cap);
      items = list.slice(0, cap);
    } else {
      const due = words
        .map((word) => ({ word, stat: statFor(progress, word) }))
        .filter((pair) => pair.stat && isActive(pair.stat) && !pair.stat.leech && isDue(pair.stat, now));
      due.sort((a, b) =>
        integer(a.stat.due_at) - integer(b.stat.due_at) ||
        integer(b.stat.lapses) - integer(a.stat.lapses) ||
        integer(b.stat.wrong) - integer(a.stat.wrong) ||
        finite(a.stat.stability) - finite(b.stat.stability)
      );
      const used = integer(progress.day_reviews[day]);
      const cap = Math.min(Math.max(0, integer(progress.prefs.daily_review_limit) - used), requested);
      available = due.length;
      remaining = Math.min(available, cap);
      items = due.slice(0, cap).map((pair) => wordJson(pair.word, pair.stat, "due", now));
    }

    return {
      mode,
      items,
      available,
      remaining,
      requested_limit: requested,
      counts,
      prefs: prefsJson(progress.prefs),
      today: todayJson(progress),
      generated_at: now,
    };
  }

  function examComponent(progress) {
    let weighted = 0;
    let weight = 0;
    let count = 0;
    for (const attempt of progress.exams || []) {
      if (integer(attempt.total) <= 0 || attempt.mode === "diagnostic") continue;
      if (count >= 12) break;
      count += 1;
      const w = 1 / Math.sqrt(count);
      weighted += integer(attempt.score_pct) * w;
      weight += w;
    }
    return weight <= 0 ? [0, 0] : [weighted / weight, count];
  }

  function daysToExam(value) {
    const date = parseDateKey(value);
    if (!date) return null;
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    return dayDiff(today, date);
  }

  function readiness(progress) {
    const now = nowTs();
    const terms = termLookup(getExams());
    const words = catalog(terms);
    const totalVocab = Math.max(1, words.length);
    let active = 0;
    let mastered = 0;
    let correct = 0;
    let wrong = 0;
    let memory = 0;
    for (const word of words) {
      const stat = statFor(progress, word);
      if (!stat || !isActive(stat)) continue;
      active += 1;
      correct += integer(stat.correct);
      wrong += integer(stat.wrong);
      memory += retrievabilityAt(stat, now);
      if (integer(stat.box) >= 3 || finite(stat.stability) >= 8) mastered += 1;
    }
    const coverage = (active / totalVocab) * 100;
    const accuracy = correct + wrong === 0 ? 0 : (correct / (correct + wrong)) * 100;
    const memoryPct = active === 0 ? 0 : (memory / active) * 100;
    const mastery = (mastered / totalVocab) * 100;
    const vocabScore = coverage * 0.45 + accuracy * 0.25 + memoryPct * 0.2 + mastery * 0.1;

    const [examScore, examCount] = examComponent(progress);
    const diagnostic = (progress.exams || []).find(
      (attempt) => attempt.mode === "diagnostic" && integer(attempt.total) > 0
    );
    const diagnosticScore = diagnostic ? integer(diagnostic.score_pct) : 0;

    const today = new Date();
    today.setHours(12, 0, 0, 0);
    const activeDays = Object.keys(progress.days || {}).filter((date) => {
      const parsed = parseDateKey(date);
      return parsed ? dayDiff(parsed, today) <= 14 && dayDiff(parsed, today) >= 0 : false;
    }).length;
    const consistency = Math.min(100, (activeDays / 10) * 70 + streak(progress) * 6);

    const score = clamp(
      diagnostic
        ? vocabScore * 0.38 + examScore * 0.28 + diagnosticScore * 0.22 + consistency * 0.12
        : vocabScore * 0.5 + examScore * 0.35 + consistency * 0.15,
      0,
      100
    );
    const band = score < 35 ? "старт" : score < 55 ? "база" : score < 75 ? "уверенно" : "готовность";

    const unitErrors = {};
    for (const attempt of (progress.exams || []).slice(0, 20)) {
      for (const item of attempt.items || []) {
        if (item && item.graded === false && integer(item.unit_id) > 0) {
          unitErrors[integer(item.unit_id)] = integer(unitErrors[integer(item.unit_id)]) + 1;
        }
      }
    }
    const unitAggs = new Map();
    for (const word of words) {
      const entry = unitAggs.get(word.unit_id) || {
        title: word.unit_title,
        total: 0,
        active: 0,
        correct: 0,
        wrong: 0,
      };
      entry.total += 1;
      const stat = statFor(progress, word);
      if (stat && isActive(stat)) {
        entry.active += 1;
        entry.correct += integer(stat.correct);
        entry.wrong += integer(stat.wrong);
      }
      unitAggs.set(word.unit_id, entry);
    }
    const weakUnits = [...unitAggs.entries()].map(([id, entry]) => {
      const errors = integer(unitErrors[id]);
      const coverageValue = entry.total === 0 ? 0 : (entry.active / entry.total) * 100;
      const accuracyValue = entry.correct + entry.wrong === 0
        ? 0
        : (entry.correct / (entry.correct + entry.wrong)) * 100;
      const penalty = Math.min(errors * 8, 40);
      const unitScore = clamp(coverageValue * 0.55 + accuracyValue * 0.45 - penalty, 0, 100);
      const reason = errors >= 2
        ? "ошибки в экзаменах"
        : entry.active === 0
          ? "не начат"
          : accuracyValue < 60
            ? "низкая точность"
            : "мало повторений";
      return {
        id,
        title: entry.title,
        score: Math.round(unitScore),
        coverage: Math.round(coverageValue),
        accuracy: Math.round(accuracyValue),
        errors,
        reason,
      };
    });
    weakUnits.sort((a, b) => (a.score - b.score) || (b.errors - a.errors));
    const weakUnitsTop = weakUnits.slice(0, 3);

    const typeAggs = new Map();
    for (const attempt of (progress.exams || []).slice(0, 20)) {
      for (const item of attempt.items || []) {
        if (!item) continue;
        const label = trim(item.type_label) || trim(item.kind);
        if (!label) continue;
        const entry = typeAggs.get(label) || [0, 0];
        if (item.graded === true) entry[0] += 1;
        else if (item.graded === false) entry[1] += 1;
        typeAggs.set(label, entry);
      }
    }
    const weakTypes = [...typeAggs.entries()]
      .filter(([, values]) => values[0] + values[1] > 0)
      .map(([label, [right, bad]]) => ({
        label,
        correct: right,
        wrong: bad,
        accuracy: Math.round((right / (right + bad)) * 100),
      }));
    weakTypes.sort((a, b) => (a.accuracy - b.accuracy) || (b.wrong - a.wrong));
    const weakTypesTop = weakTypes.slice(0, 3);

    const daysLeft = daysToExam(progress.prefs.exam_date);
    const recommendation = !diagnostic
      ? "Пройдите диагностику: она покажет реальный уровень и настроит план."
      : score < 50
        ? `Начните с повторения и юнита «${weakUnitsTop[0] ? weakUnitsTop[0].title : "базовые юниты"}». Не увеличивайте дневные лимиты, пока не закрепите базу.`
        : score < 75
          ? `Держите ритм: очередь и leech-колода, затем слабая тема «${weakUnitsTop[0] ? weakUnitsTop[0].title : "слабые темы"}».`
          : "Готовность высокая: поддерживайте повторения, добивайте ошибки и проверяйте себя на полном экзамене.";

    const leeches = words.filter((word) => {
      const stat = statFor(progress, word);
      return Boolean(stat && isActive(stat) && stat.leech);
    }).length;

    return {
      score: Math.round(score),
      band,
      components: [
        { key: "vocab", label: "Словарь", value: Math.round(vocabScore), hint: "покрытие, точность и память" },
        { key: "exam", label: "Экзамены", value: Math.round(examScore), hint: `${examCount} попыток` },
        {
          key: "diagnostic",
          label: "Диагностика",
          value: Math.round(diagnosticScore),
          hint: diagnostic ? "последний результат" : "ещё не пройдена",
        },
        { key: "consistency", label: "Регулярность", value: Math.round(consistency), hint: `${activeDays} активных дней` },
      ],
      weak_units: weakUnitsTop,
      weak_types: weakTypesTop,
      recommendation,
      exam_date: progress.prefs.exam_date,
      days_left: daysLeft,
      diagnostic: diagnostic
        ? {
            attempt_id: diagnostic.id,
            score_pct: integer(diagnostic.score_pct),
            finished_at: integer(diagnostic.finished_at),
            title: diagnostic.title,
          }
        : null,
      stats: {
        total_vocab: totalVocab,
        active_vocab: active,
        mastered,
        accuracy: Math.round(accuracy),
        memory: Math.round(memoryPct),
        streak: streak(progress),
        exams: (progress.exams || []).length,
        due: dueCount(progress),
        leeches,
        mistakes: unresolvedMistakeCount(progress),
      },
      generated_at: now,
    };
  }

  function truncateSentences(value, max) {
    const trimmed = trim(value);
    if (!trimmed) return "";
    const parts = trimmed.match(/[^.!?]*[.!?]+|[^.!?]+$/g) || [];
    let out = "";
    let sentences = 0;
    for (const part of parts) {
      out += part;
      sentences += 1;
      if (sentences >= max || [...out].length >= 340) break;
    }
    return trim(out) || [...trimmed].slice(0, 340).join("");
  }

  function pickOptions(correct, candidates, seed) {
    const unique = [];
    for (const candidate of candidates) {
      if (!trim(candidate) || normalize(candidate) === normalize(correct)) continue;
      if (!unique.some((existing) => normalize(existing) === normalize(candidate))) {
        unique.push(candidate);
      }
    }
    const start = unique.length === 0 ? 0 : seed % unique.length;
    const options = [];
    for (let index = 0; index < Math.min(3, unique.length); index += 1) {
      options.push(unique[(start + index) % unique.length]);
    }
    const insertAt = seed % (options.length + 1);
    options.splice(insertAt, 0, correct);
    return options;
  }

  function mistakeEntries(progress) {
    const terms = termLookup(getExams());
    const words = catalog(terms);
    const seen = new Set();
    const resolved = new Set(progress.resolved_mistakes || []);
    const out = [];
    for (const attempt of progress.exams || []) {
      (attempt.items || []).forEach((item, index) => {
        if (!item || item.graded === true) return;
        const id = mistakeId(attempt, item, index);
        if (seen.has(id)) return;
        seen.add(id);
        if (!trim(item.prompt) && !trim(item.answer)) return;

        const unit = unitById(item.unit_id);
        const unitTitle = unit ? unit.title_en : text(item.section_label);
        const lookupEn = trim(item.review_en) || trim(item.answer);
        const term = terms.get(`${integer(item.unit_id)}|${normalize(lookupEn)}`) || null;
        const sameUnitRu = words.filter((word) => word.unit_id === integer(item.unit_id)).map((word) => word.ru);
        const sameUnitEn = words.filter((word) => word.unit_id === integer(item.unit_id)).map((word) => word.en);
        let seed = 0;
        for (let charIndex = 0; charIndex < id.length; charIndex += 1) {
          seed += id.charCodeAt(charIndex);
        }

        let explanation;
        let example;
        let drill;
        if (term) {
          explanation = trim(item.input)
            ? `Ваш ответ: «${trim(item.input)}». «${term.en}» — ${term.ru}. ${term.definition}`
            : `Задание пропущено. «${term.en}» — ${term.ru}. ${term.definition}`;
          example = trim(term.definition)
            ? `${term.en} — ${term.ru}. ${term.definition}`
            : `${term.en} — ${term.ru}.`;
          const asksForTerm = item.kind === "reverse" || item.kind === "definition";
          if (asksForTerm) {
            const question = trim(term.definition)
              ? `Какой термин подходит к определению: ${term.definition}?`
              : `Какой термин означает «${term.ru}»?`;
            drill = {
              mode: "choice",
              question,
              answer: term.en,
              options: pickOptions(term.en, sameUnitEn, seed),
              hint: "Определение и термин связаны с темой юнита.",
            };
          } else {
            drill = {
              mode: "choice",
              question: `Выберите правильный перевод: «${term.en}»`,
              answer: term.ru,
              options: pickOptions(term.ru, sameUnitRu, seed),
              hint: "Обратите внимание на часть речи и контекст.",
            };
          }
        } else if (item.kind === "abbr" || text(item.type_label).toLowerCase().includes("аббрев")) {
          explanation = `${trim(item.input) ? `Ваш ответ: «${trim(item.input)}».` : "Задание пропущено."} Аббревиатура расшифровывается как «${text(item.answer)}».`;
          example = text(item.answer);
          drill = {
            mode: "self",
            question: `Расшифруйте аббревиатуру «${trim(item.prompt) || text(item.answer)}».`,
            answer: item.answer,
            options: [],
            hint: text(item.note),
          };
        } else {
          explanation = `${trim(item.input) ? `Ваш ответ: «${trim(item.input)}».` : "Задание пропущено."} Сверьтесь с образцом и выделите 2–3 ключевых факта.${trim(item.note) ? ` ${trim(item.note)}` : ""}`;
          example = truncateSentences(item.answer, 2);
          drill = {
            mode: "self",
            question: `Ответьте по ключевым пунктам: ${text(item.prompt)}`,
            answer: item.answer,
            options: [],
            hint: text(item.note),
          };
        }

        out.push({
          id,
          resolved: resolved.has(id),
          attempt_id: attempt.id,
          attempt_title: attempt.title,
          finished_at: integer(attempt.finished_at),
          unit_id: integer(item.unit_id),
          unit_title: unitTitle,
          kind: item.kind,
          type_label: item.type_label,
          prompt: item.prompt,
          input: item.input,
          answer: item.answer,
          answer_label: item.answer_label,
          note: item.note,
          source: item.source,
          review_en: item.review_en,
          tags: Array.isArray(item.tags) ? item.tags : [],
          explanation,
          example,
          drill,
        });
      });
    }
    out.sort((a, b) => (a.resolved === b.resolved ? 0 : a.resolved ? 1 : -1) || b.finished_at - a.finished_at);
    return out;
  }

  function mistakes(progress) {
    const items = mistakeEntries(progress);
    const resolved = items.filter((item) => item.resolved).length;
    return {
      items,
      total: items.length,
      resolved,
      unresolved: items.length - resolved,
    };
  }

  function setMistakeResolved(progress, id, resolved) {
    const value = trim(id);
    if (!value) return;
    const exists = progress.resolved_mistakes.includes(value);
    if (resolved && !exists) progress.resolved_mistakes.push(value);
    else if (!resolved && exists) {
      progress.resolved_mistakes = progress.resolved_mistakes.filter((item) => item !== value);
    }
  }

  function planTask(kind, title, detail, minutes, action, mode, href) {
    return { kind, title, detail, minutes, action, mode, href };
  }

  function plan(progress) {
    const now = nowTs();
    const terms = termLookup(getExams());
    const words = catalog(terms);
    const priority = unitErrorPriority(progress);
    const counts = queueCounts(progress, words, now);
    const readinessView = readiness(progress);
    const score = integer(readinessView.score);
    const weakUnits = Array.isArray(readinessView.weak_units) ? readinessView.weak_units : [];
    const weakTitle = weakUnits[0] ? weakUnits[0].title : "слабая тема";
    const weakId = weakUnits[0] ? integer(weakUnits[0].id, 1) : 1;
    const due = integer(counts.review_remaining);
    const newRemaining = integer(counts.new_remaining);
    const leech = integer(counts.leech_remaining);
    const mistakeCount = integer(counts.mistakes);
    const desired = Math.max(10, integer(progress.prefs.desired_minutes));

    const todayTasks = [];
    if (due > 0) {
      todayTasks.push(planTask(
        "review",
        "Повторить слова",
        `${due} карточек из очереди`,
        Math.min(8 + Math.floor(Math.min(due, 20) / 3), desired),
        "queue",
        "review",
        ""
      ));
    }
    if (newRemaining > 0) {
      todayTasks.push(planTask(
        "new",
        "Новые слова",
        `${newRemaining} слов в пределах дневного лимита`,
        8,
        "queue",
        "new",
        ""
      ));
    }
    if (leech > 0) {
      todayTasks.push(planTask(
        "leech",
        "Leech-колода",
        `${leech} проблемных слов`,
        6,
        "queue",
        "leech",
        ""
      ));
    }
    if (mistakeCount > 0) {
      todayTasks.push(planTask(
        "mistakes",
        "Тетрадь ошибок",
        `${mistakeCount} ошибок с мини-дриллами`,
        8,
        "href",
        "",
        "#/study/mistakes"
      ));
    }
    if (todayTasks.length === 0) {
      todayTasks.push(planTask(
        "audio",
        "Аудирование",
        "Один локальный аудиоматериал и задания",
        8,
        "href",
        "",
        "#/audio"
      ));
      todayTasks.push(planTask(
        "check",
        "Проверка",
        "Диагностика или короткий экзамен",
        20,
        "diagnostic",
        "",
        ""
      ));
    }
    todayTasks.splice(4);

    const days = [];
    const start = new Date();
    start.setHours(12, 0, 0, 0);
    const weekdays = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
    for (let offset = 0; offset < 7; offset += 1) {
      const date = addDays(start, offset);
      const weekday = weekdays[(date.getDay() + 6) % 7];
      let tasks;
      if (offset === 0) {
        tasks = todayTasks.map((task) => ({ ...task }));
      } else {
        tasks = [];
        if (offset === 1 || offset === 4) {
          tasks.push(planTask("review", "Повторение", "Держим интервалы FSRS", 10, "queue", "review", ""));
          tasks.push(planTask(
            "weak",
            `Слабая тема: ${weakTitle}`,
            "Слова и текст юнита",
            10,
            "href",
            "",
            `#/unit/${weakId}/vocab`
          ));
          if (offset === 4 && leech > 0) {
            tasks.push(planTask("leech", "Leech-колода", "Проблемные слова и мини-дриллы", 6, "queue", "leech", ""));
          }
        } else if (offset === 2 || offset === 5) {
          tasks.push(planTask("new", "Новые слова", "Небольшая порция без перегрузки", 8, "queue", "new", ""));
          tasks.push(planTask("audio", "Аудирование", "Слушаем и отвечаем на вопросы", 8, "href", "", "#/audio"));
          if (offset === 5 && mistakeCount > 0) {
            tasks.push(planTask("mistakes", "Тетрадь ошибок", "Разбираем 2–3 ошибки", 8, "href", "", "#/study/mistakes"));
          }
        } else if (offset === 3) {
          if (!readinessView.diagnostic || score < 60) {
            tasks.push(planTask("check", "Диагностика", "20 смешанных заданий с таймером", 22, "diagnostic", "", ""));
          } else {
            tasks.push(planTask("exam", "Мини-экзамен", "Проверяем прогресс на экзаменационном банке", 20, "href", "", "#/exams"));
          }
          tasks.push(planTask("mistakes", "Разбор ошибок", "Объяснение, пример и дрилл", 8, "href", "", "#/study/mistakes"));
        } else {
          tasks.push(planTask("check", "Проверка недели", "Диагностика и обзор готовности", 22, "diagnostic", "", ""));
          tasks.push(planTask("review", "Лёгкое повторение", "Только карточки, без нового", 8, "queue", "review", ""));
        }
      }
      const total = tasks.reduce((sum, task) => sum + integer(task.minutes), 0);
      days.push({
        date: dateKey(date),
        weekday,
        today: offset === 0,
        focus: offset === 0 ? weakTitle : offset === 3 || offset === 6 ? "проверка" : "ритм и слабые темы",
        tasks,
        total_minutes: total,
      });
    }

    return {
      days,
      today: days[0] || null,
      readiness: score,
      weak_units: weakUnits,
      exam_date: progress.prefs.exam_date,
      days_left: daysToExam(progress.prefs.exam_date),
      note: "План пересчитывается после каждого ответа, экзамена и изменения лимитов.",
      generated_at: now,
    };
  }

  // ------------------------------------------------------------------
  // Speaking catalog
  // ------------------------------------------------------------------

  function splitSentences(paragraph) {
    return (text(paragraph).match(/[^.!?]*[.!?]+|[^.!?]+$/g) || [])
      .map((part) => trim(part))
      .filter(Boolean);
  }

  function speakingNormalize(value) {
    return trim(value).split(/\s+/).filter(Boolean).join(" ").toLowerCase();
  }

  function usable(value, minWords) {
    const words = trim(value).split(/\s+/).filter(Boolean).length;
    const chars = [...text(value)].length;
    return words >= minWords && chars >= 20 && chars <= 240 && !text(value).includes("_");
  }

  function speakingCatalog() {
    const prompts = [];
    const seen = new Set();
    for (const unit of getContent().units) {
      for (let textIndex = 0; textIndex < (unit.texts || []).length; textIndex += 1) {
        const textBlock = unit.texts[textIndex];
        let taken = 0;
        let sentenceIndex = 0;
        let stop = false;
        for (const paragraph of textBlock.paragraphs || []) {
          for (const sentence of splitSentences(paragraph)) {
            const ordinal = sentenceIndex;
            sentenceIndex += 1;
            if (taken >= 3) {
              stop = true;
              break;
            }
            if (!usable(sentence, 5)) continue;
            const normalized = speakingNormalize(sentence);
            if (seen.has(normalized)) continue;
            seen.add(normalized);
            prompts.push({
              id: `u${integer(unit.id)}-t${textIndex}-s${ordinal}`,
              unit_id: integer(unit.id),
              unit_title_en: unit.title_en,
              unit_title_ru: unit.title_ru,
              kind: "sentence",
              text: sentence,
              context: textBlock.title,
              text_letter: textBlock.letter,
              task_num: null,
            });
            taken += 1;
          }
          if (stop || taken >= 3) break;
        }
      }

      let taken = 0;
      let stop = false;
      for (const task of unit.tasks || []) {
        const body = task.body || [];
        for (let questionIndex = 0; questionIndex < body.length; questionIndex += 1) {
          if (taken >= 6) {
            stop = true;
            break;
          }
          const question = trim(body[questionIndex]);
          if (!question.endsWith("?") || !usable(question, 3)) continue;
          const normalized = speakingNormalize(question);
          if (seen.has(normalized)) continue;
          seen.add(normalized);
          prompts.push({
            id: `u${integer(unit.id)}-q${integer(task.num)}-${questionIndex}`,
            unit_id: integer(unit.id),
            unit_title_en: unit.title_en,
            unit_title_ru: unit.title_ru,
            kind: "question",
            text: question,
            context: trim(task.title) || "Вопрос по теме юнита",
            text_letter: null,
            task_num: integer(task.num),
          });
          taken += 1;
        }
        if (stop || taken >= 6) break;
      }
    }
    return prompts;
  }

  function speakingContains(id) {
    return speakingCatalog().some((prompt) => prompt.id === id);
  }

  function speakingView(progress) {
    const prompts = speakingCatalog();
    const done = new Set(progress.speaking_done || []);
    const items = prompts.map((prompt) => ({
      id: prompt.id,
      unit_id: prompt.unit_id,
      unit_title_en: prompt.unit_title_en,
      unit_title_ru: prompt.unit_title_ru,
      kind: prompt.kind,
      text: prompt.text,
      context: prompt.context,
      text_letter: prompt.text_letter,
      task_num: prompt.task_num,
      done: done.has(prompt.id),
    }));
    const completed = items.filter((item) => item.done).length;
    const sentences = prompts.filter((prompt) => prompt.kind === "sentence").length;
    const questions = prompts.length - sentences;
    return {
      prompts: items,
      done: progress.speaking_done,
      total: prompts.length,
      completed,
      attempts: progress.speaking_attempts,
      last_at: progress.speaking_last_at,
      units: getContent().units.length,
      sentences,
      questions,
    };
  }

  Object.assign(C, {
    SCHEMA_VERSION,
    clamp,
    integer,
    text,
    trim,
    round,
    dateKey,
    parseDateKey,
    addDays,
    nowTs,
    todayKey,
    dateKeyFromTs,
    key,
    normalize,
    defaultPrefs,
    defaultWord,
    defaultProgress,
    normalizeWord,
    normalizePrefs,
    normalizeProgress,
    migrateProgress,
    ensureProgress,
    isActive,
    isDue,
    retrievabilityAt,
    refreshLeech,
    recordRating,
    recordAnswer,
    finishSession,
    flagForReview,
    addExam,
    clearExams,
    resetProgress,
    dueCount,
    todayJson,
    streak,
    learnedCount,
    activityJson,
    progressView,
    mergeProgress,
    loadData,
    getContent,
    getExams,
    getAudio,
    contentSummary,
    totalVocab,
    unitById,
    termLookup,
    catalog,
    statFor,
    unitErrorPriority,
    mistakeId,
    unresolvedMistakeCount,
    wordJson,
    queueCounts,
    prefsJson,
    studyQueue,
    readiness,
    daysToExam,
    mistakes,
    setMistakeResolved,
    plan,
    speakingCatalog,
    speakingContains,
    speakingView,
    splitSentences,
    usable,
  });
})();
