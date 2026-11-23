/* IT English Lab — trainer and practice sessions */
(() => {
  "use strict";
  const IT = window.IT;
  const { S, esc, icons: I } = IT;

  const MODES = {
    flash: { label: "Карточки", icon: I.cards, desc: "Вспомните перевод и оцените себя" },
    choice: { label: "Выбор варианта", icon: I.target, desc: "Четыре варианта, один правильный" },
    typing: { label: "Набор перевода", icon: I.text, desc: "Напишите слово по памяти" },
    cloze: { label: "Контекст", icon: I.layers, desc: "Вставьте слово в предложение из текста" },
    mixed: { label: "Смешанная", icon: I.layers, desc: "Карточки, выбор, набор и контекст вместе" },
    translation: { label: "Перевод фраз", icon: I.spark, desc: "Свободный перевод с самопроверкой" },
  };
  IT.modeLabel = (m) => (MODES[m] ? MODES[m].label : m);

  const speaker = (text, lang = "en-US") =>
    `<button class="icon-btn" type="button" title="Произнести" data-action="speak" data-text="${esc(text)}" data-lang="${lang}">${I.speaker}</button>`;

  const accepted = (input, answer) => {
    const target = IT.norm(input);
    if (!target) return false;
    const raw = String(answer || "");
    const variants = new Set();
    const add = (v) => {
      const n = IT.norm(v);
      if (n) variants.add(n);
    };
    add(raw);
    raw.split(/[;,/]/).forEach(add);
    add(raw.replace(/\([^)]*\)/g, " "));
    add(raw.replace(/\s*\([^)]*\)\s*/g, " "));
    const noParen = raw.replace(/\([^)]*\)/g, " ").split(/[;,/]/);
    noParen.forEach(add);
    const withArticles = [...variants];
    withArticles.forEach((v) => add(v.replace(/^(a|an|the)\s+/, "")));
    return variants.has(target);
  };
  IT.acceptedAnswer = accepted;
  const acceptedAny = (input, answers) => (answers || []).some((answer) => accepted(input, answer));

  const escapeRe = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pluralToken = (token) => {
    if (/[^aeiou]y$/i.test(token)) return token.slice(0, -1) + "ies";
    if (/(s|x|z|ch|sh)$/i.test(token)) return token + "es";
    return token + "s";
  };
  const clozeForms = (word) => {
    const raw = String(word || "").normalize("NFKC").trim();
    if (!raw) return [];
    const forms = new Set([raw]);
    const add = (value) => {
      const text = String(value || "").trim();
      if (text) forms.add(text);
    };
    const base = raw.replace(/^to\s+/i, "");
    const parts = base.split(/\s+/).filter(Boolean);
    if (!parts.length) return [];
    const last = parts[parts.length - 1];
    add([...parts.slice(0, -1), pluralToken(last)].join(" "));
    add(base);
    add(pluralToken(base));
    if (!/\s/.test(base)) {
      add(`${base}ed`);
      add(`${base.replace(/e$/i, "")}ing`);
    }
    return [...forms];
  };
  const clozeRegex = (word) => {
    const forms = clozeForms(word)
      .map((form) => form.split(/\s+/).filter(Boolean).map(escapeRe).join("\\s+"))
      .filter(Boolean)
      .sort((a, b) => b.length - a.length);
    if (!forms.length) return null;
    try {
      return new RegExp(`(?<![\\p{L}\\p{N}'’\\-])(${forms.join("|")})(?![\\p{L}\\p{N}'’\\-])`, "iu");
    } catch (_) {
      return null;
    }
  };
  const clozeSentences = (text) =>
    String(text || "")
      .replace(/\s+/g, " ")
      .trim()
      .split(/(?<=[.!?])\s+/u)
      .map((sentence) => sentence.trim())
      .filter((sentence) => sentence.length >= 24 && sentence.length <= 700);
  const buildClozeIndex = (unit) => {
    const index = new Map();
    if (!unit || !Array.isArray(unit.texts)) return index;
    const sentences = [];
    for (const text of unit.texts) {
      for (const paragraph of text.paragraphs || []) {
        for (const sentence of clozeSentences(paragraph)) {
          sentences.push({ sentence, letter: text.letter || "", title: text.title || "" });
        }
      }
    }
    for (const vocab of unit.vocab || []) {
      const re = clozeRegex(vocab.en);
      if (!re) continue;
      for (const source of sentences) {
        const match = source.sentence.match(re);
        if (!match) continue;
        const rest = source.sentence.slice(match.index + match[0].length);
        if (rest.match(re)) continue;
        const answers = [...new Set([match[0], vocab.en, vocab.en.replace(/^to\s+/i, "")].filter(Boolean))];
        index.set(IT.norm(vocab.en), {
          sentence: `${source.sentence.slice(0, match.index)}_____${rest}`,
          full: source.sentence,
          answer: match[0],
          answers,
          lemma: vocab.en,
          ru: vocab.ru,
          clozeSource: source.letter ? `Text ${source.letter}` : "",
          clozeTitle: source.title,
        });
        break;
      }
    }
    return index;
  };

  const buildItems = (unit, mode, limit) => {
    if (mode === "translation") {
      return IT.shuffle(unit.translation_sentences.map((ru) => ({ kind: "sentence", ru, en: "", unitId: unit.id, unitTitle: unit.title_en, unitRu: unit.title_ru }))).slice(0, limit);
    }
    let words = unit.vocab.map((v) => ({
      kind: "word",
      en: v.en,
      ru: v.ru,
      unitId: unit.id,
      unitTitle: unit.title_en,
      unitRu: unit.title_ru,
    }));
    if (mode === "cloze" || mode === "mixed") {
      const cloze = buildClozeIndex(unit);
      words = words
        .map((word) => {
          const item = cloze.get(IT.norm(word.en));
          return item ? { ...word, cloze: item } : word;
        })
        .filter((word) => mode !== "cloze" || word.cloze);
    }
    const now = Date.now() / 1000;
    const ranked = words
      .map((w) => {
        const st = IT.wordStat(unit.id, w.en);
        return {
          w,
          due: IT.isDue(st, now) ? 0 : 1,
          dueAt: Number(st.due_at) || 0,
          box: Number(st.box) || 0,
          last: st.last_seen || 0,
          r: Math.random(),
        };
      })
      .sort((a, b) => a.due - b.due || a.dueAt - b.dueAt || a.box - b.box || a.last - b.last || a.r - b.r);
    let items = ranked.slice(0, Math.min(limit, ranked.length)).map((x) => x.w);
    items = IT.shuffle(items);
    if (mode === "mixed") {
      const variants = ["flash", "choice", "typing"];
      items.forEach((item, i) => {
        item.variant = item.cloze && i % 4 === 3 ? "cloze" : variants[i % variants.length];
      });
      items = IT.shuffle(items);
    }
    return items;
  };

  const prepareQuestion = () => {
    const p = S.practice;
    if (!p) return;
    p.answered = false;
    p.selected = null;
    p.input = "";
    p.feedback = null;
    p.schedule = null;
    p.revealed = false;
    p.checking = false;
    p.checkResult = null;
    const item = p.items[p.index];
    if (!item) {
      p.finished = true;
      return;
    }
    let type = p.mode === "mixed" ? item.variant || "flash" : p.mode;
    if (item.kind === "sentence") type = "translation";
    p.current = { ...item, ...(type === "cloze" && item.cloze ? item.cloze : {}), type };
    if (type === "cloze") {
      p.current.answer = p.current.answer || item.en;
      p.current.answerLang = "en-US";
      p.current.promptKind = "cloze";
    }
    if (type === "flash" || type === "typing" || type === "choice") {
      const dir = p.direction || "ru-en";
      if (dir === "definition-en" && item.definition) {
        p.current.prompt = item.definition;
        p.current.answer = item.en;
        p.current.promptLang = "en-US";
        p.current.answerLang = "en-US";
        p.current.promptKind = "definition";
      } else {
        p.current.prompt = dir === "ru-en" ? item.ru : item.en;
        p.current.answer = dir === "ru-en" ? item.en : item.ru;
        p.current.promptLang = dir === "ru-en" ? "ru-RU" : "en-US";
        p.current.answerLang = dir === "ru-en" ? "en-US" : "ru-RU";
      }
    }
    if (type === "choice") {
      const dir = p.direction || "ru-en";
      const pool = IT.uniqueBy(
        p.vocab.map((v) => (dir === "ru-en" ? v.en : v.ru)).filter((x) => IT.norm(x) !== IT.norm(p.current.answer)),
        (x) => IT.norm(x)
      );
      const options = IT.shuffle([p.current.answer, ...IT.shuffle(pool).slice(0, 3)]);
      p.current.options = options;
      p.current.correctIndex = options.findIndex((x) => IT.norm(x) === IT.norm(p.current.answer));
    }
    p.questionStartedAt = Date.now();
    p.responseMs = 0;
  };
  IT.prepareQuestion = prepareQuestion;

  const startPractice = async (unitId, mode) => {
    const id = Number(unitId);
    const limit = Number(S.practiceConfig.limit) || 10;
    try {
      const unit = await IT.ensureUnit(id);
      const items = buildItems(unit, mode, limit);
      if (!items.length) {
        IT.toast(
          mode === "translation"
            ? "В этом юните нет фраз для перевода"
            : mode === "cloze"
              ? "В этом юните не нашлось предложений с пропущенными словами"
              : "В юните нет слов для тренировки",
          "error"
        );
        return;
      }
      S.practice = {
        unitId: id,
        unitTitle: unit.title_en,
        unitRu: unit.title_ru,
        mode,
        direction: S.practiceConfig.direction || "ru-en",
        limit,
        planned: items.length,
        attempted: 0,
        requeued: [],
        review: false,
        items,
        vocab: unit.vocab,
        index: 0,
        correct: 0,
        wrong: 0,
        missed: [],
        current: null,
        answered: false,
        selected: null,
        input: "",
        feedback: null,
        revealed: false,
        checking: false,
        finished: false,
        startedAt: Date.now(),
        questionStartedAt: Date.now(),
      };
      prepareQuestion();
      if (location.hash === "#/practice") IT.views.practice();
      else location.hash = "#/practice";
    } catch (e) {
      IT.toast(e.message, "error");
    }
  };
  IT.startPractice = startPractice;

  const queueLabel = (kind) =>
    ({
      review: "Умная очередь",
      new: "Новые слова",
      leech: "Leech-колода",
      exam: "Работа над ошибками",
    }[kind] || "Очередь");

  const openQueueSession = (items, kind, meta) => {
    const first = items[0];
    const hasDefinition = items.some((item) => item.definition);
    const leechMode = kind === "leech";
    const direction = leechMode
      ? hasDefinition
        ? "definition-en"
        : "en-ru"
      : kind === "exam"
        ? "en-ru"
        : S.practiceConfig.direction || "ru-en";
    const clozeEligible = kind === "review" || kind === "leech";
    const withCloze = clozeEligible ? items.filter((item) => item.cloze) : [];
    const fallback = leechMode || kind === "exam" ? "typing" : "flash";
    const allCloze = clozeEligible && withCloze.length === items.length;
    const mode = allCloze ? "cloze" : withCloze.length ? "mixed" : fallback;
    if (mode === "mixed") {
      items.forEach((item) => {
        item.variant = item.cloze ? "cloze" : fallback;
      });
    }
    S.practice = {
      unitId: first ? first.unitId : 1,
      unitTitle: queueLabel(kind),
      unitRu: "FSRS · дневные лимиты",
      mode,
      direction,
      limit: items.length,
      planned: items.length,
      attempted: 0,
      requeued: [],
      review: true,
      queueKind: kind,
      queueMeta: meta || null,
      items,
      vocab: items,
      index: 0,
      correct: 0,
      wrong: 0,
      missed: [],
      current: null,
      answered: false,
      selected: null,
      input: "",
      feedback: null,
      revealed: false,
      checking: false,
      finished: false,
      startedAt: Date.now(),
      questionStartedAt: Date.now(),
    };
    prepareQuestion();
    if (location.hash === "#/practice") IT.views.practice();
    else location.hash = "#/practice";
  };

  const startQueue = async (kind = "review") => {
    const normalized = ["new", "leech", "exam", "review"].includes(String(kind)) ? String(kind) : "review";
    IT.toast(`Собираем очередь: ${queueLabel(normalized).toLowerCase()}…`);
    try {
      const res = await IT.api(`/api/study/queue?kind=${encodeURIComponent(normalized)}`);
      const raw = Array.isArray(res && res.items) ? res.items : [];
      if (!raw.length) {
        const reason =
          normalized === "new"
            ? "Дневной лимит новых слов исчерпан — вернитесь завтра или измените лимиты в центре учёбы."
            : normalized === "leech"
              ? "Leech-колода пуста: проблемных слов пока нет."
              : normalized === "exam"
                ? "Ошибок экзамена пока нет — сначала пройдите экзамен."
                : "Очередь пуста. Можно добавить новые слова или пройти обычную тренировку.";
        IT.toast(reason);
        return;
      }
      const items = raw.map((item) => ({
        kind: "word",
        en: item.en || "",
        ru: item.ru || "",
        definition: item.definition || "",
        unitId: Number(item.unit_id) || 1,
        unitTitle: item.unit_title || "",
        unitRu: item.unit_title || "",
        leech: Boolean(item.leech),
        lapses: Number(item.lapses) || 0,
        reason: item.reason || "",
        mistakeId: item.mistake_id || "",
        stability: Number(item.stability) || 0,
        retrievability: Number(item.retrievability) || 0,
        due_at: Number(item.due_at) || 0,
      }));
      if (normalized === "review" || normalized === "leech") {
        const unitIds = [...new Set(items.map((item) => item.unitId))];
        const units = await Promise.allSettled(unitIds.map((id) => IT.ensureUnit(id)));
        const indexes = new Map();
        units.forEach((result) => {
          if (result.status !== "fulfilled" || !result.value) return;
          indexes.set(Number(result.value.id), buildClozeIndex(result.value));
        });
        items.forEach((item) => {
          const index = indexes.get(item.unitId);
          if (index) item.cloze = index.get(IT.norm(item.en)) || null;
        });
      }
      S.study = { ...(S.study || {}), queue: res };
      openQueueSession(items, normalized, res);
    } catch (e) {
      IT.toast(e.message, "error");
    }
  };
  IT.startQueue = startQueue;

  const startReview = async () => startQueue("review");
  IT.startReview = startReview;

  const recordWord = (correct) => {
    const p = S.practice;
    if (!p || p.answered) return;
    p.answered = true;
    p.attempted = (p.attempted || 0) + 1;
    const elapsed = Math.max(0, Math.min(600_000, Date.now() - (p.questionStartedAt || Date.now())));
    p.responseMs = elapsed;
    if (correct) p.correct++;
    else {
      p.wrong++;
      p.missed.push({ en: p.current.en, ru: p.current.ru, unitId: p.current.unitId || p.unitId });
    }
    const unitId = Number(p.current.unitId || p.unitId);
    const mistakeId = p.current.mistakeId || "";
    if (p.current.kind === "word" && p.current.en) {
      const answeredWord = p.current.en;
      IT.api("/api/answer", {
        method: "POST",
        body: { unit_id: unitId, en: answeredWord, correct, response_ms: elapsed },
      })
        .then((res) => {
          if (!res) return;
          S.progress.words[IT.wordKey(unitId, answeredWord)] = res.word;
          p.schedule = res.word;
          S.progress.learned = res.learned;
          S.progress.streak = res.streak;
          S.progress.stats = res.stats;
          if (res.today) S.progress.today = res.today;
          if (typeof res.due === "number") S.progress.due = res.due;
          IT.hydrateSidebar();
          if (location.hash === "#/practice") IT.views.practice();
        })
        .catch((e) => {
          console.warn("progress", e);
          IT.toast(`Не удалось сохранить ответ: ${e.message}`, "error");
        });
      if (correct && mistakeId) {
        IT.api("/api/mistakes/resolve", { method: "POST", body: { id: mistakeId, resolved: true } })
          .then(() => {
            if (S.study && S.study.mistakes) {
              const found = (S.study.mistakes.items || []).find((item) => item.id === mistakeId);
              if (found) found.resolved = true;
            }
          })
          .catch(() => {});
      }
      if (!correct && p.current.kind === "word") {
        const requeueKey = `${unitId}|${answeredWord}|${p.current.type || ""}`;
        const source = p.items[p.index];
        const cap = (p.planned || p.items.length) + Math.ceil((p.planned || p.items.length) / 2);
        if (source && !p.requeued.includes(requeueKey) && p.items.length < cap) {
          p.requeued.push(requeueKey);
          p.items.push({ ...source, requeued: true });
        }
      }
    }
    IT.views.practice();
  };

  const reveal = () => {
    const p = S.practice;
    if (!p || p.answered) return;
    p.revealed = true;
    IT.views.practice();
  };

  const grade = (correct) => {
    const p = S.practice;
    if (!p || p.answered) return;
    if (!correct && !p.revealed) p.revealed = true;
    recordWord(!!correct);
  };

  const choose = (index) => {
    const p = S.practice;
    if (!p || p.answered) return;
    p.selected = Number(index);
    const ok = p.selected === p.current.correctIndex;
    p.feedback = {
      kind: ok ? "ok" : "bad",
      html: ok
        ? `<b>Верно.</b> ${esc(p.current.answer)}`
        : `<b>Не то.</b> Правильный ответ: <b>${esc(p.current.answer)}</b>`,
    };
    recordWord(ok);
  };

  const submitTyping = (value) => {
    const p = S.practice;
    if (!p || p.answered) return;
    const input = String(value || "").trim();
    if (!input) {
      IT.toast("Введите ответ", "error");
      return;
    }
    p.input = input;
    const answers = p.current.type === "cloze" ? [p.current.answer, ...(p.current.answers || [])] : [p.current.answer];
    const ok = acceptedAny(input, answers);
    const detail =
      p.current.type === "cloze" && p.current.full
        ? `<div class="cloze-full">${esc(p.current.full)}</div><div class="cloze-hint">${esc(p.current.ru || "")}</div>`
        : "";
    p.feedback = {
      kind: ok ? "ok" : "bad",
      html: ok
        ? `<b>Верно.</b> ${esc(p.current.answer)}${detail}`
        : `<b>Пока нет.</b> Правильный ответ: <b>${esc(p.current.answer)}</b>${detail}`,
    };
    recordWord(ok);
  };

  const sentenceGrade = (correct) => {
    const p = S.practice;
    if (!p || p.answered) return;
    p.answered = true;
    p.attempted = (p.attempted || 0) + 1;
    if (correct) p.correct++;
    else {
      p.wrong++;
      p.missed.push({ en: "", ru: p.current.ru });
    }
    p.feedback = {
      kind: correct ? "ok" : "bad",
      html: correct ? "<b>Зачтено.</b> Двигайтесь дальше." : "<b>Не зачтено.</b> Вернитесь к этой фразе позже.",
    };
    IT.views.practice();
  };

  const checkTranslation = async () => {
    const p = S.practice;
    if (!p || p.answered || p.checking) return;
    const text = String(p.input || "").trim();
    if (!text) {
      IT.toast("Сначала напишите перевод", "error");
      return;
    }
    if (!IT.aiOn()) {
      IT.toast("ИИ не подключён — можно проверить себя вручную", "error");
      return;
    }
    p.checking = true;
    p.feedback = null;
    IT.views.practice();
    try {
      const res = await IT.api("/api/ai/check", {
        method: "POST",
        body: { unit_id: p.unitId, sentence_ru: p.current.ru, answer_en: text },
      });
      const r = (res && res.result) || {};
      const rawScore = r.score;
      const hasScore =
        rawScore !== null &&
        rawScore !== undefined &&
        rawScore !== "" &&
        Number.isFinite(Number(rawScore));
      const score = hasScore ? Number(rawScore) : null;
      const correct = hasScore ? score >= 70 : null;
      p.checking = false;
      p.checkResult = r;
      p.answered = correct !== null;
      if (correct !== null) p.attempted = (p.attempted || 0) + 1;
      if (correct === true) p.correct++;
      if (correct === false) {
        p.wrong++;
        p.missed.push({ en: "", ru: p.current.ru });
      }
      const tips = Array.isArray(r.tips) ? r.tips.filter(Boolean) : [];
      p.feedback = {
        kind: correct === true ? "ok" : correct === false ? "bad" : "info",
        html: `${hasScore ? `<span class="score-badge">${Math.round(score)}/100</span>` : ""}
          <b>${esc(r.verdict || (hasScore ? "Проверка завершена" : "Модель не дала оценку"))}</b>
          ${r.corrected ? `<span class="corrected">${esc(r.corrected)}</span>` : ""}
          ${r.explanation ? `<div style="margin-top:7px">${esc(r.explanation)}</div>` : ""}
          ${tips.length ? `<ul>${tips.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>` : ""}`,
      };
      if (!hasScore) p.answered = false;
      IT.views.practice();
    } catch (e) {
      p.checking = false;
      p.answered = false;
      p.feedback = { kind: "bad", html: `<b>Не удалось проверить.</b> ${esc(e.message)}` };
      IT.views.practice();
    }
  };

  const nextQuestion = () => {
    const p = S.practice;
    if (!p || !p.answered) return;
    if (p.index + 1 >= p.items.length) {
      p.finished = true;
      p.current = null;
      const total = p.attempted || p.items.length;
      IT.api("/api/session", { method: "POST", body: { correct: p.correct, total } })
        .then((res) => {
          if (res && res.stats) {
            S.progress.stats = res.stats;
            IT.hydrateSidebar();
          }
        })
        .catch((e) => {
          console.warn("session", e);
          IT.toast(`Не удалось сохранить сессию: ${e.message}`, "error");
        });
      S.progress.stats.sessions = (S.progress.stats.sessions || 0) + 1;
      IT.views.practice();
      return;
    }
    p.index++;
    prepareQuestion();
    IT.views.practice();
  };

  const restart = () => {
    const p = S.practice;
    if (!p) return;
    if (p.queueKind) startQueue(p.queueKind);
    else if (p.review) startReview();
    else startPractice(p.unitId, p.mode);
  };

  const questionPrompt = (p) => {
    const q = p.current;
    if (q.type === "cloze") {
      const sentence = esc(q.sentence || "").replace(/_{2,}/g, '<span class="cloze-gap">_____</span>');
      const source = [q.clozeSource, q.clozeTitle].filter(Boolean).join(" · ");
      return `<div class="cloze-sentence">${sentence}</div>
        <div class="prompt-hint">Вставьте пропущенное слово${source ? ` · ${esc(source)}` : ""}</div>`;
    }
    if (q.type === "translation") {
      return `<div class="prompt-sentence">${esc(q.ru)}</div><div class="prompt-hint">Переведите на английский, затем сверьтесь с образцом и оцените себя по смыслу, грамматике и лексике.</div>`;
    }
    const dirLabel =
      q.promptKind === "definition"
        ? "DEF → EN"
        : p.direction === "ru-en"
          ? "RU → EN"
          : "EN → RU";
    const hint =
      q.promptKind === "definition"
        ? "Определение → термин"
        : q.type === "flash"
          ? "Вспомните перевод"
          : q.type === "choice"
            ? "Выберите правильный вариант"
            : "Напишите перевод";
    return `<div class="prompt-word">${esc(q.prompt)}</div>
      <div class="prompt-hint">${hint} · ${dirLabel}${q.leech ? ` · leech${q.lapses ? ` (${q.lapses} забываний)` : ""}` : ""}</div>
      ${q.promptLang === "en-US" ? speaker(q.prompt) : ""}`;
  };

  const renderFeedback = (p) => {
    if (!p.feedback) return "";
    return `<div class="feedback ${p.feedback.kind || "info"}">${p.feedback.html}</div>`;
  };

  const scheduleNote = (p) => {
    const s = p.schedule;
    if (!s) return "";
    const days = Number(s.interval_days) || 0;
    const when = days > 0 ? `через ${days} ${IT.plural(days, "день", "дня", "дней")}` : "сегодня, примерно через 10 минут";
    const leech = s.leech ? ` · leech: ${Number(s.lapses) || 0} забываний` : "";
    return `<div class="schedule-note">Следующее повторение: <b>${when}</b>${leech}</div>`;
  };

  const renderFlash = (p) => {
    const q = p.current;
    return `
      <div class="session-prompt">
        ${questionPrompt(p)}
        <div class="flash-reveal">${p.revealed || p.answered ? `<div class="answer-word">${esc(q.answer)}</div><div class="answer-sub">${q.answerLang === "en-US" ? "English" : "Русский"}</div>` : ""}</div>
      </div>
      <div class="session-actions">
        ${
          p.answered
            ? `<button class="btn btn-primary" type="button" data-action="next-question">Дальше ${I.arrow}</button>`
            : p.revealed
              ? `<button class="btn btn-danger" type="button" data-action="grade" data-correct="0">Не знаю</button>
                 <button class="btn btn-primary" type="button" data-action="grade" data-correct="1">Знаю</button>`
              : `<button class="btn" type="button" data-action="reveal">Показать перевод</button>
                 <button class="btn btn-primary" type="button" data-action="grade" data-correct="1">Я знаю</button>`
        }
      </div>
      ${p.answered && q.answerLang === "en-US" ? `<div style="text-align:center;margin-top:12px">${speaker(q.answer)}</div>` : ""}
      ${p.answered ? scheduleNote(p) : ""}`;
  };

  const renderChoice = (p) => {
    const q = p.current;
    return `
      <div class="session-prompt" style="padding-bottom:20px">${questionPrompt(p)}</div>
      <div class="choice-list">
        ${q.options
          .map((opt, i) => {
            let cls = "choice";
            if (p.answered) {
              if (i === q.correctIndex) cls += " correct";
              else if (i === p.selected) cls += " wrong";
            }
            return `<button class="${cls}" type="button" data-action="mcq" data-index="${i}" ${p.answered ? "disabled" : ""}>
              <span class="key">${String.fromCharCode(65 + i)}</span><span>${esc(opt)}</span>
            </button>`;
          })
          .join("")}
      </div>
      ${renderFeedback(p)}
      ${p.answered ? scheduleNote(p) : ""}
      ${p.answered ? `<div class="session-actions" style="margin-top:14px"><button class="btn btn-primary" type="button" data-action="next-question">Дальше ${I.arrow}</button></div>` : ""}`;
  };

  const renderTyping = (p) => {
    const q = p.current;
    return `
      <div class="session-prompt" style="padding-bottom:18px">${questionPrompt(p)}</div>
      ${
        p.answered
          ? `<div class="feedback ${p.feedback ? p.feedback.kind : "info"}">${p.feedback ? p.feedback.html : `Правильный ответ: <b>${esc(q.answer)}</b>`}</div>
             ${scheduleNote(p)}
             <div class="session-actions" style="margin-top:14px"><button class="btn btn-primary" type="button" data-action="next-question">Дальше ${I.arrow}</button></div>`
          : `<form class="typing-form" data-form="typing">
               <input class="input" data-practice-input data-input="practice-input" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${p.current.type === "cloze" ? "Введите пропущенное слово…" : "Введите ответ…"}" value="${esc(p.input || "")}">
               <button class="btn btn-primary" type="submit">Проверить</button>
             </form>`
      }`;
  };

  const renderTranslation = (p) => {
    const q = p.current;
    const selfButtons = !p.answered
      ? `<div class="session-actions" style="margin-top:12px">
           <button class="btn" type="button" data-action="sentence-grade" data-correct="1">Зачесть себе</button>
           <button class="btn btn-danger" type="button" data-action="sentence-grade" data-correct="0">Не зачтено</button>
         </div>`
      : `<div class="session-actions" style="margin-top:14px"><button class="btn btn-primary" type="button" data-action="next-question">Дальше ${I.arrow}</button></div>`;
    return `
      <div class="session-prompt" style="padding-bottom:16px">${questionPrompt(p)}</div>
      ${
        p.answered
          ? renderFeedback(p) + selfButtons
          : `<textarea class="textarea" data-practice-input data-input="practice-input" placeholder="Your translation in English…" spellcheck="false">${esc(p.input || "")}</textarea>
             <div class="session-actions" style="margin-top:12px">
               <button class="btn btn-primary" type="button" data-action="check-translation" ${p.checking ? "disabled" : ""}>${p.checking ? '<span class="spin"></span> Проверяю…' : `${I.spark} Проверить с ИИ`}</button>
             </div>
             ${renderFeedback(p)}
             ${selfButtons}`
      }`;
  };

  const renderPractice = () => {
    const p = S.practice;
    if (!p) {
      IT.views.trainer();
      return;
    }
    if (p.finished) {
      const total = p.attempted || p.planned || p.items.length;
      const acc = total ? Math.round((p.correct / total) * 100) : 0;
      const next = p.unitId < 15 ? p.unitId + 1 : 1;
      IT.setView(`
        <div class="session">
          <div class="session-top">
            <a class="back-link" href="${p.queueKind ? "#/study" : p.review ? "#/home" : `#/unit/${p.unitId}/practice`}">${I.back} ${p.queueKind ? "В центр учёбы" : p.review ? "На главную" : "К юниту"}</a>
            <span class="badge accent">${p.queueKind ? esc(queueLabel(p.queueKind)) : p.review ? "Повторение" : `Unit ${p.unitId}`} · ${esc(IT.modeLabel(p.mode))}</span>
          </div>
          <div class="session-card result-card">
            <div class="result-ring" style="--p:${acc}%"><b>${acc}%</b></div>
            <h2>${acc >= 85 ? "Отличная работа" : acc >= 60 ? "Хороший прогресс" : "Нужно повторить"}</h2>
            <p class="lead">${p.correct} правильных из ${total}. ${p.wrong ? "Ошибочные карточки вернутся в очередь повторения." : "Все ответы верные — можно двигаться дальше."}</p>
            <div class="result-stats">
              <div class="result-stat"><b style="color:var(--ok)">${p.correct}</b><span>верно</span></div>
              <div class="result-stat"><b style="color:var(--danger)">${p.wrong}</b><span>ошибок</span></div>
              <div class="result-stat"><b>${Math.max(1, Math.round((Date.now() - p.startedAt) / 60000))}</b><span>минут</span></div>
            </div>
            ${p.missed.length ? `<div class="missed"><h3>Повторить</h3>${p.missed.slice(0, 8).map((m) => `<div class="missed-row"><span>${esc(m.en || "Фраза")}</span><span>${esc(m.ru || "")}</span></div>`).join("")}</div>` : ""}
            <div class="session-actions">
              <button class="btn" type="button" data-action="restart-practice">${I.refresh} Ещё раз</button>
              ${
                p.review
                  ? `<a class="btn" href="#/study">К центру учёбы ${I.arrow}</a><a class="btn btn-primary" href="#/home">На главную</a>`
                  : `<a class="btn" href="#/unit/${next}/practice">Следующий юнит ${I.arrow}</a><a class="btn btn-primary" href="#/unit/${p.unitId}/vocab">К словарю</a>`
              }
            </div>
          </div>
        </div>`);
      return;
    }
    if (!p.current) prepareQuestion();
    const q = p.current;
    const type = q.type;
    const bar = p.items
      .map((_, i) => `<i class="${i < p.index || p.finished ? "done" : i === p.index ? "now" : ""}"></i>`)
      .join("");
    const body =
      type === "flash" ? renderFlash(p) : type === "choice" ? renderChoice(p) : type === "typing" || type === "cloze" ? renderTyping(p) : renderTranslation(p);
    IT.setView(`
      <div class="session">
        <div class="session-top">
          <a class="back-link" href="${p.review ? "#/home" : `#/unit/${p.unitId}/practice`}">${I.back} ${p.review ? "Выйти" : "Выйти"}</a>
          <div class="session-info">
            <span class="badge">${p.review ? "Повторение" : `Unit ${p.unitId}`}</span>
            <span class="badge accent">${esc(IT.modeLabel(type === "translation" ? "translation" : p.mode))}</span>
            <span class="session-count">${p.index + 1} / ${p.items.length}</span>
          </div>
        </div>
        <div class="session-bar">${bar}</div>
        <div class="session-card">
          <div class="session-label"><span>${esc(p.review ? "Сегодня к повторению" : p.unitTitle)}</span>${p.mode === "mixed" ? `<span class="badge">${esc(IT.modeLabel(type))}</span>` : ""}</div>
          ${body}
          <div class="session-foot">
            <span>${esc(p.review ? "Интервальные повторения" : p.unitRu)}</span>
            <span class="score"><b>${p.correct} верно</b><i>${p.wrong} ошибок</i></span>
          </div>
        </div>
      </div>`);
    if (!p.answered && (type === "typing" || type === "cloze" || type === "translation")) {
      setTimeout(() => {
        const input = IT.$("[data-practice-input]");
        if (input) {
          input.focus();
          if (input.setSelectionRange) input.setSelectionRange(input.value.length, input.value.length);
        }
      }, 40);
    }
  };

  const modeCards = (unit) => {
    const trCount = Array.isArray(unit.translation_sentences)
      ? unit.translation_sentences.length
      : Number(unit.translations || 0);
    const hasTr = trCount > 0;
    const clozeCount = Array.isArray(unit.texts) ? buildClozeIndex(unit).size : 0;
    const hasCloze = !Array.isArray(unit.texts) || clozeCount > 0;
    return `
      <div class="practice-modes">
        <button class="mode-card" type="button" data-action="start-practice" data-mode="flash" data-unit="${unit.id}">
          <span class="mode-icon">${I.cards}</span><b>Карточки</b><span>Вспомните слово и честно оцените себя.</span><span class="mode-go">Начать ${I.arrow}</span>
        </button>
        <button class="mode-card" type="button" data-action="start-practice" data-mode="choice" data-unit="${unit.id}">
          <span class="mode-icon">${I.target}</span><b>Выбор варианта</b><span>Проверьте узнавание лексики за пару минут.</span><span class="mode-go">Начать ${I.arrow}</span>
        </button>
        <button class="mode-card" type="button" data-action="start-practice" data-mode="typing" data-unit="${unit.id}">
          <span class="mode-icon">${I.text}</span><b>Набор перевода</b><span>Активное владение: напишите English по памяти.</span><span class="mode-go">Начать ${I.arrow}</span>
        </button>
        <button class="mode-card" type="button" data-action="start-practice" data-mode="mixed" data-unit="${unit.id}">
          <span class="mode-icon">${I.layers}</span><b>Смешанная</b><span>Карточки, выбор, набор и контекст в одной сессии.</span><span class="mode-go">Начать ${I.arrow}</span>
        </button>
        <button class="mode-card" type="button" data-action="start-practice" data-mode="cloze" data-unit="${unit.id}" ${hasCloze ? "" : 'disabled style="opacity:.45"'}>
          <span class="mode-icon">${I.book}</span><b>Контекст (cloze) ${clozeCount ? `<span class="badge accent">${clozeCount}</span>` : ""}</b><span>${hasCloze ? "Вставьте пропущенное слово в предложение из текста." : "В этом юните нет подходящих предложений."}</span><span class="mode-go">${hasCloze ? "Начать" : "Нет примеров"} ${I.arrow}</span>
        </button>
        <button class="mode-card" type="button" data-action="start-practice" data-mode="translation" data-unit="${unit.id}" ${hasTr ? "" : 'disabled style="opacity:.45"'}>
          <span class="mode-icon">${I.spark}</span><b>Перевод фраз ${hasTr ? `<span class="badge accent">${trCount}</span>` : ""}</b><span>${hasTr ? "Свободный перевод с самопроверкой по образцу." : "В юните нет фраз для перевода."}</span><span class="mode-go">${hasTr ? "Начать" : "Нет фраз"} ${I.arrow}</span>
        </button>
      </div>`;
  };

  const configBar = () => {
    const cfg = S.practiceConfig || { limit: 10, direction: "ru-en" };
    return `
      <div class="practice-config">
        <div class="config-field">
          <label for="practice-limit-select">Длина сессии</label>
          <select id="practice-limit-select" class="select" data-change="practice-limit">
            ${[5, 10, 15, 20, 30].map((n) => `<option value="${n}" ${n === cfg.limit ? "selected" : ""}>${n} вопросов</option>`).join("")}
          </select>
        </div>
        <div class="config-field">
          <label>Направление</label>
          <div class="seg">
            <button type="button" class="${cfg.direction === "ru-en" ? "active" : ""}" data-action="set-direction" data-direction="ru-en">RU → EN</button>
            <button type="button" class="${cfg.direction === "en-ru" ? "active" : ""}" data-action="set-direction" data-direction="en-ru">EN → RU</button>
          </div>
        </div>
        <div class="config-field" style="margin-left:auto">
          <label>ИИ</label>
          <span class="muted tiny">${IT.aiOn() ? esc(IT.aiLabel()) : "не подключён — карточки работают"}</span>
        </div>
      </div>`;
  };

  const renderTrainer = () => {
    const units = S.units || [];
    if (!units.length) return;
    let unit = S.trainerUnit ? IT.unitById(S.trainerUnit) : null;
    if (!unit) {
      unit = units.find((u) => IT.unitStats(u.id, u.vocab).pct < 100) || units[0];
      S.trainerUnit = unit.id;
    }
    const st = IT.unitStats(unit.id, unit.vocab);
    const due = Number(S.progress.due) || 0;
    const today = IT.today();
    const goals = IT.GOALS;
    const minutes = Math.round(today.ms / 60000);
    const cardsPct = Math.min(100, Math.round((today.answers / goals.cards) * 100));
    IT.setView(`
      <div class="page-head">
        <div class="left">
          <div class="eyebrow">Тренажёр · интервальное повторение</div>
          <h1 class="display" style="font-size:clamp(38px,4.7vw,58px);margin-top:14px">Практика</h1>
          <p class="lead" style="margin-top:10px">Слова, которые вы знаете хуже, появляются чаще. Начните с 10 вопросов — это занимает около трёх минут.</p>
        </div>
        <div style="text-align:right"><div class="dial" style="--p:${st.pct}%"><b>${st.pct}%</b></div><div class="muted tiny" style="margin-top:6px">юнит ${unit.id}</div></div>
      </div>
      <div class="daily-plan">
        <section class="plan-card review-card">
          <div class="plan-icon">${I.calendar}</div>
          <div class="plan-body">
            <div class="eyebrow">Сегодня к повторению</div>
            <h2>${due ? `${due} ${IT.plural(due, "карточка", "карточки", "карточек")}` : "Очередь пуста"}</h2>
            <p>${due ? "Карточки, которые созрели по интервальному расписанию." : "Возвращайтесь позже или начните новую тренировку."}</p>
          </div>
          <button class="btn btn-primary" type="button" data-action="start-review" ${due ? "" : "disabled"}>${due ? "Повторить" : "На сегодня всё"}</button>
        </section>
        <section class="plan-card goals-card">
          <div class="plan-body" style="width:100%">
            <div class="eyebrow">Цель дня</div>
            <div class="goal-row"><span>Карточки</span><b>${today.answers} / ${goals.cards}</b></div>
            <div class="goal-bar"><i style="width:${cardsPct}%"></i></div>
            <div class="goal-chips">
              <span class="${minutes >= goals.minutes ? "ok" : ""}">${I.clock} ${minutes} / ${goals.minutes} мин</span>
              <span class="${today.exams >= goals.exams ? "ok" : ""}">${I.target} ${today.exams} / ${goals.exams} экз.</span>
              <a href="#/analytics">${I.chart} Аналитика</a>
            </div>
          </div>
        </section>
      </div>
      <div class="trainer-grid">
        <aside class="trainer-side">
          <h2>Выберите юнит</h2>
          <div class="unit-picker">
            ${units
              .map((u) => {
                const us = IT.unitStats(u.id, u.vocab);
                return `<button class="unit-pick ${u.id === unit.id ? "active" : ""}" type="button" data-action="pick-unit" data-unit="${u.id}">
                  <span class="n">${String(u.id).padStart(2, "0")}</span><span>${esc(u.title_ru)}</span><span class="p">${us.pct}%</span>
                </button>`;
              })
              .join("")}
          </div>
          <div class="divider" style="margin:16px 0"></div>
          <div class="muted tiny" style="line-height:1.6">Карточки и упражнения работают без интернета. Прогресс сохраняется в этом браузере; его можно экспортировать в JSON.</div>
        </aside>
        <div class="trainer-main">
          <div class="trainer-unit-head">
            <div><h2>${esc(unit.title_en)}</h2><div class="muted">${esc(unit.title_ru)} · ${unit.vocab} ${IT.plural(unit.vocab, "термин", "термина", "терминов")}</div></div>
            <a class="btn btn-sm" href="#/unit/${unit.id}/vocab">Словарь ${I.arrow}</a>
          </div>
          <div class="trainer-card">
            ${modeCards(unit)}
            ${configBar()}
          </div>
        </div>
      </div>`);
  };

  IT.views = IT.views || {};
  IT.views.trainer = renderTrainer;
  IT.views.practice = renderPractice;
  IT.practiceActions = {
    start: startPractice,
    review: startReview,
    reveal,
    grade,
    choose,
    typing: submitTyping,
    checkTranslation,
    sentenceGrade,
    next: nextQuestion,
    restart,
  };
})();
