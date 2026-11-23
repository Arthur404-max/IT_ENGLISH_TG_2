/* IT English Lab — exams: exam 1, exam 2 and the final all-units check */
(() => {
  "use strict";
  const IT = window.IT;
  const { S, esc, icons: I } = IT;

  let contentPromise = null;
  const CONFIG_KEY = "itelab.examConfig.v1";
  const DRAFT_KEY = "itelab.examDraft.v1";
  const ALL_UNITS = Array.from({ length: 15 }, (_, i) => i + 1);
  const ALL_TYPES = ["question", "term", "definition", "reverse", "abbr", "text"];
  const TYPE_LABELS = {
    question: "Вопрос",
    term: "Перевод термина",
    definition: "Определение",
    reverse: "Определение → термин",
    abbr: "Аббревиатура",
    text: "Текст",
  };

  const slug = (value) =>
    String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9а-яё]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60);

  const rawItemId = (kind, raw) => {
    if (kind === "question") return `q:${raw.id ?? slug(raw.question)}`;
    if (kind === "term" || kind === "definition" || kind === "reverse") return `term:${raw.id ?? slug(raw.en)}`;
    if (kind === "abbr") return `abbr:${raw.id ?? slug(raw.abbr)}`;
    if (kind === "text") return `text:${raw.id ?? slug(raw.title)}`;
    return `${kind}:${slug(raw.id ?? raw.prompt ?? raw.en)}`;
  };

  const recentItemIds = () =>
    new Set(
      (S.progress.exams || [])
        .slice(0, 5)
        .flatMap((attempt) => (attempt.items || []).map((item) => item.item_id))
        .filter(Boolean)
    );

  const preferFresh = (pool, kind, take) => {
    const recent = recentItemIds();
    const fresh = (pool || []).filter((raw) => !recent.has(rawItemId(kind, raw)));
    return fresh.length >= take ? fresh : pool || [];
  };

  const baseItem = (kind, raw, unitId) => ({
    item_id: rawItemId(kind, raw),
    kind,
    unit_id: unitId,
    tags: [...new Set([...(raw.tags || []), `unit-${unitId}`, kind])],
    time_ms: 0,
    flagged: false,
    review_en: "",
  });


  const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value) || 0));

  const defaultCustom = () => ({
    units: [...ALL_UNITS],
    types: [...ALL_TYPES],
    count: 20,
    timer: 30,
  });

  S.examConfig = {
    ...S.examConfig,
    viewMode: "practice",
    custom: defaultCustom(),
  };

  try {
    const saved = JSON.parse(localStorage.getItem(CONFIG_KEY) || "null");
    if (saved && typeof saved === "object") {
      S.examConfig = {
        ...S.examConfig,
        ...saved,
        custom: { ...defaultCustom(), ...(saved.custom || {}) },
      };
    }
  } catch (_) {
    /* локальные настройки могут быть повреждены — используем значения по умолчанию */
  }

  const saveConfig = () => {
    try {
      localStorage.setItem(CONFIG_KEY, JSON.stringify(S.examConfig));
    } catch (_) {
      /* приватный режим браузера может запрещать localStorage */
    }
  };

  const readDraft = () => {
    try {
      const draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null");
      return draft && Array.isArray(draft.items) ? draft : null;
    } catch (_) {
      return null;
    }
  };

  const writeDraft = () => {
    const exam = S.exam;
    if (!exam || exam.fromHistory) return;
    if (exam.finished && !exam.reviewStage) return;
    try {
      const items = (exam.items || []).map(({ audioUrl, ...item }) => item);
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...exam, items }));
    } catch (_) {
      /* сохранить черновик не удалось — не мешаем экзамену */
    }
  };

  const clearDraft = () => {
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch (_) {
      /* игнорируем */
    }
  };

  const loadContent = async () => {
    if (S.examContent) return S.examContent;
    if (!contentPromise) {
      contentPromise = IT.api("/api/exams")
        .then((data) => {
          S.examContent = data;
          return data;
        })
        .finally(() => {
          contentPromise = null;
        });
    }
    return contentPromise;
  };

  const unitLabel = (id) => {
    const unit = IT.unitById(id);
    return unit ? `Unit ${String(id).padStart(2, "0")} · ${unit.title_ru}` : `Unit ${String(id).padStart(2, "0")}`;
  };

  const sourceLabel = (item) => item.source || unitLabel(item.unit_id);

  const sourceLink = (item) => {
    const tab = item.source_tab === "vocab" ? "vocab" : "text";
    return `<a class="exam-source-link" href="#/unit/${item.unit_id}/${tab}">${I.book} ${esc(sourceLabel(item))}</a>`;
  };

  const formatDate = (stamp) => {
    const value = Number(stamp) || 0;
    const date = new Date(value > 0 && value < 10_000_000_000 ? value * 1000 : value);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const countOptions = (values, current, unit) => {
    const one = unit === "word" ? "слово" : "вопрос";
    const few = unit === "word" ? "слова" : "вопроса";
    const many = unit === "word" ? "слов" : "вопросов";
    return values
      .map((v) => `<option value="${v}" ${Number(v) === Number(current) ? "selected" : ""}>${v} ${IT.plural(v, one, few, many)}</option>`)
      .join("");
  };

  const timerOptions = (values, current) =>
    values
      .map(
        (v) =>
          `<option value="${v}" ${Number(v) === Number(current) ? "selected" : ""}>${
            v === 0 ? "Без таймера" : `${v} минут`
          }</option>`
      )
      .join("");

  const clean = (value) =>
    IT.norm(value)
      .replace(/-/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  const matches = (input, variants) => {
    const target = clean(input);
    if (!target) return false;
    return (variants || [])
      .map((v) => clean(v))
      .filter(Boolean)
      .some((v) => {
        if (v === target) return true;
        const noArticle = v.replace(/^(a|an|the) /, "");
        return target === noArticle;
      });
  };

  const pickDiverse = (items, count) => {
    const pool = [...(items || [])];
    if (!pool.length || count <= 0) return [];
    const groups = new Map();
    for (const item of pool) {
      const key = item.unit_id || 0;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(item);
    }
    const picked = [];
    const unitKeys = IT.shuffle([...groups.keys()]);
    for (const key of unitKeys) {
      if (picked.length >= count) break;
      picked.push(IT.shuffle(groups.get(key))[0]);
    }
    const rest = IT.shuffle(pool.filter((item) => !picked.includes(item)));
    while (picked.length < count && rest.length) picked.push(rest.pop());
    return picked.slice(0, count);
  };

  const abbreviationAliases = (termEn) => {
    const target = clean(termEn);
    return (S.examContent?.abbreviations || [])
      .filter((a) => clean(a.full) === target)
      .flatMap((a) => [a.abbr, ...(a.accept || [])]);
  };

  const questionItem = (q, sectionLabel) => ({
    ...baseItem("question", q, q.unit_id),
    kind: "question",
    section: "questions",
    sectionLabel,
    unit_id: q.unit_id,
    prompt: q.question,
    answer: q.answer,
    source: q.source || "",
    source_tab: q.source_tab || "text",
    note: q.note || "",
    auto: false,
    input: "",
    revealed: false,
    graded: null,
    answered: false,
    typeLabel: "Вопрос по теме",
    promptLabel: "Ответьте на вопрос по-английски",
    placeholder: "Напишите ответ по-английски. Можно отвечать устно, затем открыть образец и оценить себя.",
    rows: 5,
    answerLabel: "Образец ответа",
  });

  const termItem = (term) => ({
    ...baseItem("term", term, term.unit_id),
    kind: "term",
    section: "terms",
    sectionLabel: "Часть 1 · Терминология",
    unit_id: term.unit_id,
    prompt: term.ru,
    answer: term.en,
    source: term.source || "",
    source_tab: term.source_tab || "vocab",
    accept: [term.en, ...abbreviationAliases(term.en)],
    auto: true,
    input: "",
    revealed: false,
    graded: null,
    answered: false,
    review_en: term.en,
    typeLabel: "Перевод термина",
    promptLabel: "Напишите термин по-английски",
    placeholder: "Например: central processing unit",
    answerLabel: "Правильный ответ",
  });

  const definitionItem = (term) => ({
    ...baseItem("definition", term, term.unit_id),
    kind: "definition",
    section: "terms",
    sectionLabel: "Часть 1 · Терминология",
    unit_id: term.unit_id,
    prompt: term.en,
    answer: term.definition,
    source: term.source || "",
    source_tab: term.source_tab || "vocab",
    auto: false,
    input: "",
    revealed: false,
    graded: null,
    answered: false,
    typeLabel: "Определение термина",
    promptLabel: "Дайте определение на английском (1–2 предложения)",
    placeholder: "Write a short definition in English...",
    rows: 3,
    answerLabel: "Образец определения",
  });

  const reverseItem = (term) => ({
    ...baseItem("reverse", term, term.unit_id),
    kind: "reverse",
    section: "terms",
    sectionLabel: "Часть 1 · Терминология",
    unit_id: term.unit_id,
    prompt: term.definition || term.en,
    answer: term.en,
    source: term.source || "",
    source_tab: term.source_tab || "vocab",
    accept: [term.en, ...abbreviationAliases(term.en)],
    auto: true,
    input: "",
    revealed: false,
    graded: null,
    answered: false,
    review_en: term.en,
    typeLabel: "Определение → термин",
    promptLabel: "Определите термин по описанию и напишите его по-английски",
    placeholder: "Например: load balancer",
    answerLabel: "Правильный термин",
  });

  const abbreviationItem = (abbr) => ({
    ...baseItem("abbr", abbr, abbr.unit_id),
    kind: "abbr",
    section: "terms",
    sectionLabel: "Часть 1 · Терминология",
    unit_id: abbr.unit_id,
    prompt: abbr.abbr,
    answer: abbr.full,
    source: abbr.source || "",
    source_tab: abbr.source_tab || "vocab",
    accept: [abbr.full, ...(abbr.accept || [])],
    auto: true,
    input: "",
    revealed: false,
    graded: null,
    answered: false,
    typeLabel: "Расшифровка аббревиатуры",
    promptLabel: "Расшифруйте аббревиатуру по-английски",
    placeholder: "Например: central processing unit",
    answerLabel: "Правильная расшифровка",
  });

  const textItem = (text) => ({
    ...baseItem("text", text, text.unit_id),
    kind: "text",
    section: "text",
    sectionLabel: "Часть 2 · Перевод текста",
    unit_id: text.unit_id,
    prompt: text.en,
    answer: text.ru,
    title: text.title,
    source: text.source || "",
    source_tab: text.source_tab || "text",
    auto: false,
    input: "",
    revealed: false,
    graded: null,
    answered: false,
    typeLabel: "Перевод текста",
    promptLabel: "Переведите текст на русский язык",
    placeholder: "Введите перевод...",
    rows: 8,
    answerLabel: "Образец перевода",
  });

  const examMeta = (mode) => {
    if (mode === "exam1") {
      return {
        title: "Экзамен 1",
        subtitle: "Юниты 1–8 · ответы на вопросы по темам",
        instruction: "Ответьте на вопросы по пройденным темам. Сверьтесь с образцом и оцените себя.",
      };
    }
    if (mode === "exam2") {
      return {
        title: "Экзамен 2",
        subtitle: "Все юниты · термины, перевод текста и вопросы",
        instruction: "Билет по всем юнитам: 20 терминов, перевод короткого текста и 10 вопросов.",
      };
    }
    return {
      title: "Проверка знаний всех юнитов",
      subtitle: "Итоговая проверка после Unit 15",
      instruction: "Выберите количество вопросов, ответьте на них и сверьтесь с образцами.",
    };
  };

  const buildItems = (mode, data, limit) => {
    const cfg = S.examConfig || {};
    const allUnitIds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
    if (mode === "exam1") {
      const qLimit = Math.max(1, Math.min(Number(limit) || Number(cfg.exam1Count) || 10, 39));
      const questions = pickDiverse(
        preferFresh(
          (data.questions || []).filter((q) => q.unit_id >= 1 && q.unit_id <= 8),
          "question",
          qLimit
        ),
        qLimit
      );
      return questions.map((q) => questionItem(q, "Вопросы по юнитам 1–8"));
    }

    if (mode === "exam2") {
      const terms = pickDiverse(preferFresh(data.terms || [], "term", 14), 14);
      const translate = terms.slice(0, 8);
      const definitions = terms.slice(8, 11);
      const reversed = terms.slice(11, 14);
      const abbreviations = pickDiverse(preferFresh(data.abbreviations || [], "abbr", 6), 6);
      const questions = pickDiverse(preferFresh(data.questions || [], "question", 10), 10);
      const text = IT.shuffle(data.texts || [])[0];
      return [
        ...translate.map(termItem),
        ...definitions.map(definitionItem),
        ...reversed.map(reverseItem),
        ...abbreviations.map(abbreviationItem),
        ...(text ? [textItem(text)] : []),
        ...questions.map((q) => questionItem(q, "Часть 3 · Вопросы по темам")),
      ];
    }

    const qLimit = Math.max(1, Math.min(Number(limit) || Number(cfg.finalCount) || 20, 60));
    const questions = pickDiverse(
      preferFresh(
        (data.questions || []).filter((q) => allUnitIds.includes(q.unit_id)),
        "question",
        qLimit
      ),
      qLimit
    );
    return questions.map((q) => questionItem(q, "Вопросы по всем юнитам"));
  };

  const buildCustomItems = (data, custom = {}) => {
    const units = [...new Set((custom.units || ALL_UNITS).map(Number))].filter((id) => ALL_UNITS.includes(id));
    const types = [...new Set(custom.types || ALL_TYPES)].filter((type) => ALL_TYPES.includes(type));
    if (!units.length || !types.length) return [];
    const total = clamp(custom.count || 20, 1, 60);
    const pools = {
      question: (data.questions || []).filter((item) => units.includes(item.unit_id)),
      term: (data.terms || []).filter((item) => units.includes(item.unit_id)),
      definition: (data.terms || []).filter((item) => units.includes(item.unit_id)),
      reverse: (data.terms || []).filter((item) => units.includes(item.unit_id)),
      abbr: (data.abbreviations || []).filter((item) => units.includes(item.unit_id)),
      text: (data.texts || []).filter((item) => units.includes(item.unit_id)),
    };
    const labels = {
      question: "Свой экзамен · Вопросы",
      term: "Свой экзамен · Терминология",
      definition: "Свой экзамен · Терминология",
      reverse: "Свой экзамен · Определение → термин",
      abbr: "Свой экзамен · Терминология",
      text: "Свой экзамен · Текст",
    };
    const make = {
      question: (item) => questionItem(item, labels.question),
      term: (item) => termItem(item),
      definition: (item) => definitionItem(item),
      reverse: (item) => reverseItem(item),
      abbr: (item) => abbreviationItem(item),
      text: (item) => textItem(item),
    };
    const keyOf = (type, item) =>
      `${type}|${item.unit_id}|${item.en || item.abbr || item.question || item.title || item.ru || ""}`;
    const picked = [];
    const used = new Set();
    const base = Math.floor(total / types.length);
    const extra = total % types.length;

    types.forEach((type, index) => {
      const target = base + (index < extra ? 1 : 0);
      const pool = IT.shuffle(preferFresh(pools[type] || [], type, target));
      const take = type === "text" ? Math.min(target, 1, pool.length) : Math.min(target, pool.length);
      pickDiverse(pool, take).forEach((item) => {
        const key = keyOf(type, item);
        if (used.has(key) || picked.length >= total) return;
        used.add(key);
        picked.push(make[type](item));
      });
    });

    if (picked.length < total) {
      const remaining = [];
      types.forEach((type) => {
        (pools[type] || []).forEach((item) => {
          const key = keyOf(type, item);
          if (!used.has(key)) remaining.push({ type, item, key });
        });
      });
      IT.shuffle(remaining).forEach(({ type, item, key }) => {
        if (picked.length >= total || used.has(key)) return;
        used.add(key);
        picked.push(make[type](item));
      });
    }

    return picked.slice(0, total);
  };

  const buildDiagnosticItems = (data) => {
    const terms = pickDiverse(preferFresh(data.terms || [], "term", 9), 9);
    const abbreviations = pickDiverse(preferFresh(data.abbreviations || [], "abbr", 4), 4);
    const questions = pickDiverse(preferFresh(data.questions || [], "question", 6), 6);
    const text = IT.shuffle(data.texts || [])[0];
    const items = [
      ...terms.slice(0, 4).map(termItem),
      ...terms.slice(4, 6).map(definitionItem),
      ...terms.slice(6, 9).map(reverseItem),
      ...abbreviations.map(abbreviationItem),
      ...(text ? [textItem(text)] : []),
      ...questions.map((q) => questionItem(q, "Диагностика · Вопросы по темам")),
    ];
    if (items.length < 20) {
      const extraTerms = pickDiverse(preferFresh(data.terms || [], "term", 20), 20).filter(
        (term) => !terms.some((used) => used.id === term.id)
      );
      for (const term of extraTerms) {
        if (items.length >= 20) break;
        items.push(termItem(term));
      }
    }
    return items.slice(0, 20);
  };

  const launchExam = (mode, items, meta, timerMinutes, limit, forcedViewMode = "") => {
    if (!items.length) {
      IT.toast("В экзаменационном банке нет подходящих заданий", "error");
      return;
    }
    IT.stopExamTimer();
    stopRecording(true);
    const viewMode = forcedViewMode === "exam" || (!forcedViewMode && S.examConfig.viewMode === "exam") ? "exam" : "practice";
    const totalSec = Math.max(0, Number(timerMinutes) || 0) * 60;
    S.exam = {
      mode,
      title: meta.title,
      subtitle: meta.subtitle,
      instruction: meta.instruction,
      limit: Number(limit) || items.length,
      timerMinutes: Math.max(0, Number(timerMinutes) || 0),
      totalSec,
      remainingSec: totalSec,
      deadlineAt: totalSec ? Date.now() + totalSec * 1000 : null,
      startedAt: Date.now(),
      finishedAt: null,
      timeSpentSec: 0,
      finished: false,
      timeout: false,
      index: 0,
      items,
      trackedIndex: 0,
      itemEnteredAt: Date.now(),
      itemTimes: {},
      precheck: false,
      lastWarnMinute: null,
      viewMode,
      reviewStage: false,
      reviewDone: false,
      historySaved: false,
      fromHistory: false,
    };
    saveConfig();
    writeDraft();
    if (location.hash === "#/exam") {
      IT.views.exam();
    } else {
      location.hash = "#/exam";
    }
  };

  const startExam = async (mode) => {
    const data = await loadContent();
    const cfg = S.examConfig || {};
    if (mode === "custom") {
      const custom = cfg.custom || defaultCustom();
      const items = buildCustomItems(data, custom);
      if (!items.length) {
        IT.toast("Выберите хотя бы один юнит и тип задания", "error");
        return;
      }
      const units = [...new Set((custom.units || ALL_UNITS).map(Number))];
      const types = [...new Set(custom.types || ALL_TYPES)];
      launchExam(
        "custom",
        items,
        {
          title: "Свой экзамен",
          subtitle: `${units.length} ${IT.plural(units.length, "юнит", "юнита", "юнитов")} · ${types.length} ${IT.plural(types.length, "раздел", "раздела", "разделов")}`,
          instruction: "Экзамен собран по выбранным юнитам и типам заданий.",
        },
        Number(custom.timer) || 0,
        items.length
      );
      return;
    }
    const meta = examMeta(mode);
    let limit = 0;
    let timerMinutes = 0;
    if (mode === "exam1") {
      limit = Number(cfg.exam1Count) || 10;
      timerMinutes = Number(cfg.exam1Timer) || 0;
    } else if (mode === "exam2") {
      limit = 10;
      timerMinutes = Number(cfg.exam2Timer) || 0;
    } else {
      limit = Number(cfg.finalCount) || 20;
      timerMinutes = Number(cfg.finalTimer) || 0;
    }
    launchExam(mode, buildItems(mode, data, limit), meta, timerMinutes, limit);
  };

  const startDiagnostic = async () => {
    try {
      const data = await loadContent();
      const items = buildDiagnosticItems(data);
      launchExam(
        "diagnostic",
        items,
        {
          title: "Диагностика",
          subtitle: "20 смешанных заданий · 25 минут · уровень и слабые темы",
          instruction:
            "Диагностика идёт в режиме экзамена: ответы и образцы откроются после завершения. Результат обновит readiness и недельный план.",
        },
        25,
        20,
        "exam"
      );
    } catch (e) {
      IT.toast(e && e.message ? e.message : "Не удалось начать диагностику", "error");
    }
  };

  const startFromItems = (items, title, subtitle) => {
    const cleanItems = items.map((item) => ({
      ...item,
      input: "",
      revealed: false,
      graded: null,
      answered: false,
      audioUrl: "",
    }));
    launchExam(
      "mistakes",
      cleanItems,
      {
        title,
        subtitle,
        instruction: "Повторение по заданиям, которые не были зачтены.",
      },
      0,
      cleanItems.length
    );
  };

  const syncRemaining = (exam) => {
    if (!exam) return 0;
    if (exam.timerMinutes && exam.deadlineAt) {
      exam.remainingSec = Math.max(0, Math.ceil((exam.deadlineAt - Date.now()) / 1000));
    }
    return Number(exam.remainingSec) || 0;
  };

  const scoreState = (exam) => {
    const items = exam.items || [];
    const correct = items.filter((item) => item.graded === true).length;
    const wrong = items.filter((item) => item.graded === false).length;
    const answered = items.filter((item) => item.answered).length;
    const skipped = items.length - answered;
    const pct = items.length ? Math.round((correct / items.length) * 100) : 0;
    return { correct, wrong, answered, skipped, total: items.length, pct };
  };

  const attemptFromExam = (exam) => ({
    id: exam.historyId || "",
    mode: exam.mode,
    title: exam.title,
    subtitle: exam.subtitle,
    view_mode: exam.viewMode,
    started_at: Number(exam.startedAt) || Date.now(),
    finished_at: Number(exam.finishedAt) || Date.now(),
    time_spent_sec: Math.max(0, Math.round(Number(exam.timeSpentSec) || 0)),
    timeout: Boolean(exam.timeout),
    items: (exam.items || []).map((item, index) => ({
      item_id: item.item_id || "",
      kind: item.kind,
      section: item.section,
      section_label: item.sectionLabel,
      type_label: item.typeLabel,
      unit_id: item.unit_id,
      prompt: item.prompt,
      answer: item.answer,
      input: item.input || "",
      answer_label: item.answerLabel,
      note: item.note || "",
      source: item.source || "",
      source_tab: item.source_tab || "",
      auto: Boolean(item.auto),
      answered: Boolean(item.answered),
      graded: item.graded === true ? true : item.graded === false ? false : null,
      time_ms: Math.max(0, Math.round(Number(item.time_ms) || 0)),
      review_en: item.review_en || "",
      flagged: Boolean(item.flagged),
      tags: item.tags || [],
    })),
  });

  const saveHistory = async (exam) => {
    if (!exam || exam.fromHistory || exam.historySaved) return;
    exam.historySaved = true;
    try {
      const res = await IT.api("/api/exam/history", {
        method: "POST",
        body: attemptFromExam(exam),
      });
      if (res && res.attempt) {
        exam.historyId = res.attempt.id;
        S.progress.exams = [res.attempt, ...(S.progress.exams || [])].slice(0, 100);
      }
      if (res && res.today) S.progress.today = res.today;
      if (res && typeof res.due === "number") S.progress.due = res.due;
      IT.hydrateSidebar();
    } catch (e) {
      exam.historySaved = false;
      console.warn("exam history", e);
      IT.toast("Не удалось сохранить историю экзамена", "error");
    }
  };

  const finish = (timeout = false) => {
    const exam = S.exam;
    if (!exam || exam.finished) return;
    commitCurrentAnswer();
    accumulateItemTime(exam);
    exam.precheck = false;
    IT.stopExamTimer();
    stopRecording(true);
    syncRemaining(exam);
    exam.finished = true;
    exam.timeout = Boolean(timeout);
    exam.finishedAt = Date.now();
    exam.timeSpentSec = exam.timerMinutes
      ? Math.max(0, exam.totalSec - (exam.remainingSec || 0))
      : Math.max(0, Math.round((exam.finishedAt - exam.startedAt) / 1000));
    exam.reviewStage = exam.viewMode === "exam";
    exam.reviewDone = exam.viewMode !== "exam";
    if (exam.viewMode === "exam") {
      writeDraft();
    } else {
      clearDraft();
      saveHistory(exam);
    }
    IT.views.exam();
  };

  const completeReview = () => {
    const exam = S.exam;
    if (!exam || !exam.reviewStage) return;
    const pending = exam.items.filter((item) => item.answered && !item.auto && item.graded == null);
    if (pending.length) {
      IT.toast(
        `Оцените открытые ответы: осталось ${pending.length} ${IT.plural(pending.length, "задание", "задания", "заданий")}`,
        "error"
      );
      const first = IT.$(".exam-review-grade-pending");
      if (first) first.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    exam.reviewStage = false;
    exam.reviewDone = true;
    clearDraft();
    saveHistory(exam);
    IT.views.exam();
  };

  const exitExam = () => {
    const exam = S.exam;
    const go = () => {
      IT.stopExamTimer();
      stopRecording(true);
      if (exam && (!exam.finished || exam.reviewStage)) writeDraft();
      S.exam = null;
      S.examFilter = "all";
      if (location.hash === "#/exams") IT.views.exams();
      else location.hash = "#/exams";
    };
    if (exam && !exam.finished) {
      IT.confirm({
        title: "Выйти из экзамена?",
        text: "Черновик сохранится на этом компьютере. Продолжить можно будет на странице «Экзамены».",
        label: "Выйти",
        danger: true,
        onConfirm: go,
      });
    } else {
      go();
    }
  };

  const paintTimer = () => {
    const el = IT.$("#exam-timer");
    const exam = S.exam;
    if (!el || !exam) return;
    const remaining = syncRemaining(exam);
    const total = Math.max(1, Number(exam.totalSec) || 1);
    const time = IT.$(".timer-time", el);
    if (time) time.textContent = IT.formatTime(remaining);
    const fill = IT.$(".exam-timer-bar i", el);
    if (fill) fill.style.width = `${Math.max(0, Math.min(100, (remaining / total) * 100))}%`;
    el.classList.toggle("warn", remaining <= 300 && remaining > 60);
    el.classList.toggle("danger", remaining <= 60);
    if (remaining > 0 && remaining <= 300) {
      const minute = Math.ceil(remaining / 60);
      if ((minute === 5 || minute <= 1) && exam.lastWarnMinute !== minute) {
        exam.lastWarnMinute = minute;
        IT.announce(minute <= 1 ? "Осталась одна минута" : `Осталось ${minute} минут`);
      }
    }
  };

  IT.formatTime = (sec) => {
    const value = Math.max(0, Math.round(Number(sec) || 0));
    const h = Math.floor(value / 3600);
    const m = Math.floor((value % 3600) / 60);
    const s = value % 60;
    if (h) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  IT.paintExamTimer = paintTimer;

  const tickExamTimer = () => {
    const current = S.exam;
    if (!current || current.finished) {
      IT.stopExamTimer();
      return;
    }
    syncRemaining(current);
    paintTimer();
    if (current.remainingSec <= 0) {
      IT.stopExamTimer();
      IT.toast("Время вышло", "error");
      finish(true);
    }
  };

  IT.startExamTimer = () => {
    IT.stopExamTimer();
    const exam = S.exam;
    if (!exam || exam.finished || !exam.timerMinutes) return;
    if (!exam.deadlineAt) {
      const remaining = Number(exam.remainingSec != null ? exam.remainingSec : exam.totalSec) || 0;
      exam.deadlineAt = Date.now() + remaining * 1000;
    }
    S.examTimer = setInterval(tickExamTimer, 1000);
    tickExamTimer();
  };

  const syncTimerFromClock = () => {
    const exam = S.exam;
    if (!exam || exam.finished || !exam.timerMinutes) return;
    syncRemaining(exam);
    paintTimer();
    if (exam.remainingSec <= 0) {
      IT.stopExamTimer();
      finish(true);
    }
  };

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) syncTimerFromClock();
  });
  window.addEventListener("focus", syncTimerFromClock);

  IT.stopExamTimer = () => {
    if (S.examTimer) clearInterval(S.examTimer);
    S.examTimer = null;
  };

  const renderLoading = (label = "Загружаем экзаменационные материалы…") => {
    IT.setView(`
      <div class="empty exam-loading">
        <b>${esc(label)}</b>
        <span class="muted small">Это займёт мгновение.</span>
      </div>`);
  };

  const renderExams = () => {
    IT.stopExamTimer();
    stopRecording(true);
    if (!S.examContent) {
      renderLoading();
      loadContent().then(renderExams).catch((e) => IT.showError(e));
      return;
    }
    const data = S.examContent;
    const cfg = S.examConfig || {};
    const qCount = (data.questions || []).length;
    const termCount = (data.terms || []).length;
    const abbrCount = (data.abbreviations || []).length;
    const textCount = (data.texts || []).length;
    const custom = { ...defaultCustom(), ...(cfg.custom || {}) };
    const selectedUnits = (custom.units || ALL_UNITS).map(Number);
    const selectedTypes = custom.types || ALL_TYPES;
    const draft = readDraft();
    const attempts = (S.progress.exams || []).slice(0, 10);
    const latestDiagnostic = (S.progress.exams || []).find((attempt) => attempt.mode === "diagnostic");
    const best = attempts.length ? Math.max(...attempts.map((a) => Number(a.score_pct) || 0)) : 0;
    const average = attempts.length
      ? Math.round(attempts.reduce((sum, a) => sum + (Number(a.score_pct) || 0), 0) / attempts.length)
      : 0;
    const typeOptions = [
      ["question", "Вопросы"],
      ["term", "Перевод терминов"],
      ["definition", "Определения"],
      ["reverse", "Определение → термин"],
      ["abbr", "Аббревиатуры"],
      ["text", "Текст"],
    ];
    const unitChecks = ALL_UNITS.map((id) => {
      const unit = IT.unitById(id);
      return `<label class="exam-check">
        <input type="checkbox" data-change="custom-unit" value="${id}" ${selectedUnits.includes(id) ? "checked" : ""}>
        <span><b>${String(id).padStart(2, "0")}</b> ${esc(unit ? unit.title_ru : `Unit ${id}`)}</span>
      </label>`;
    }).join("");
    const typeChecks = typeOptions
      .map(
        ([type, label]) => `<label class="exam-check">
          <input type="checkbox" data-change="custom-type" value="${type}" ${selectedTypes.includes(type) ? "checked" : ""}>
          <span>${label}</span>
        </label>`
      )
      .join("");
    const historyRows = attempts
      .map((attempt) => {
        const pct = Number(attempt.score_pct) || 0;
        const modeLabel = attempt.view_mode === "exam" ? "Экзамен" : "Тренировка";
        return `<button class="exam-history-row" type="button" data-action="exam-history-open" data-id="${esc(attempt.id || "")}">
          <span class="exam-history-date">${formatDate(attempt.finished_at)}</span>
          <span class="exam-history-title"><b>${esc(attempt.title || "Экзамен")}</b><span>${esc(modeLabel)} · ${attempt.correct || 0} из ${attempt.total || 0}</span></span>
          <span class="exam-history-score">${pct}%</span>
          <span class="exam-history-open">${I.arrow}</span>
        </button>`;
      })
      .join("");
    const draftAwaitingReview = Boolean(draft && draft.finished && draft.reviewStage);
    const draftBanner = draft
      ? `<section class="exam-draft-banner">
          <div>
            <div class="eyebrow">${draftAwaitingReview ? "Экзамен ждёт проверки" : "Незавершённая попытка"}</div>
            <b>${esc(draft.title || "Экзамен")}</b>
            <span>${
              draftAwaitingReview
                ? `${esc(draft.subtitle || "")} · завершён ${formatDate(draft.finishedAt)} · ${(draft.items || []).length} из ${(draft.items || []).length}`
                : `${esc(draft.subtitle || "")} · начато ${formatDate(draft.startedAt)} · ${draft.index + 1} из ${(draft.items || []).length}`
            }</span>
          </div>
          <div class="exam-draft-actions">
            <button class="btn btn-primary btn-sm" type="button" data-action="exam-resume">${draftAwaitingReview ? "Проверить ответы" : "Продолжить"} ${I.arrow}</button>
            <button class="text-btn" type="button" data-action="exam-discard-draft">Удалить черновик</button>
          </div>
        </section>`
      : "";

    IT.setView(`
      <div class="page-head">
        <div class="left">
          <div class="eyebrow">Итоговая проверка</div>
          <h1 class="display" style="font-size:clamp(38px,4.7vw,58px);margin-top:14px">Экзамены</h1>
          <p class="lead" style="margin-top:10px">Два экзамена по программе, итоговая проверка всех юнитов и конструктор собственного билета. Базовый режим работает без ИИ.</p>
        </div>
        <div class="exam-bank-stats">
          <span><b>${qCount}</b> ${IT.plural(qCount, "вопрос", "вопроса", "вопросов")}</span>
          <span><b>${termCount}</b> ${IT.plural(termCount, "термин", "термина", "терминов")}</span>
          <span><b>${abbrCount}</b> ${IT.plural(abbrCount, "аббревиатура", "аббревиатуры", "аббревиатур")}</span>
          <span><b>${textCount}</b> ${IT.plural(textCount, "текст", "текста", "текстов")}</span>
        </div>
      </div>

      ${draftBanner}

      <section class="exam-mode-bar" aria-label="Режим проверки">
        <div>
          <b>Режим проверки</b>
          <span>${cfg.viewMode === "exam" ? "Ответы и образцы откроются после завершения. Таймер остановится на проверке." : "Образец показывается сразу после ответа. Подходит для тренировки."}</span>
        </div>
        <div class="exam-switch" role="group" aria-label="Выберите режим проверки">
          <button class="${cfg.viewMode === "exam" ? "" : "active"}" type="button" data-action="exam-set-view" data-view="practice">Тренировка</button>
          <button class="${cfg.viewMode === "exam" ? "active" : ""}" type="button" data-action="exam-set-view" data-view="exam">Экзамен</button>
        </div>
      </section>

      <section class="exam-diagnostic-card">
        <div class="exam-diagnostic-copy">
          <span class="eyebrow">READINESS · START HERE</span>
          <h2>Диагностика за 25 минут</h2>
          <p>20 смешанных заданий: термины, определения, аббревиатуры, текст и вопросы. После проверки обновятся readiness score, слабые темы и недельный план.</p>
          <div class="exam-diagnostic-meta">
            <span>${I.target} 20 заданий</span>
            <span>${I.clock} 25 минут</span>
            <span>${I.chart} ${latestDiagnostic ? `${Number(latestDiagnostic.score_pct) || 0}% в прошлый раз` : "ещё не пройдена"}</span>
          </div>
        </div>
        <div class="exam-diagnostic-actions">
          <button class="btn btn-primary" type="button" data-action="start-diagnostic">${I.play} Начать диагностику</button>
          <a class="btn btn-ghost" href="#/study">${I.brain} Центр учёбы</a>
        </div>
      </section>

      <div class="exam-grid">
        <section class="exam-card exam-card-1">
          <div class="exam-card-top">
            <span class="badge accent">Экзамен 1</span>
            <span class="exam-card-num">01</span>
          </div>
          <h2>Вопросы по юнитам 1–8</h2>
          <p class="exam-card-desc">Только ответы на вопросы по темам первого блока. Каждый вопрос проверяется по образцу ответа уровня B1.</p>
          <div class="exam-card-list">
            <span>${I.tasks} Юниты 1–8</span>
            <span>${I.check} Самопроверка по образцам</span>
            <span>${I.brain} Без обязательного ИИ</span>
          </div>
          <div class="exam-config-row">
            <label class="exam-field">
              <span>Вопросов</span>
              <select class="select" data-change="exam1-count">${countOptions([5, 10, 15, 20, 30, 39], cfg.exam1Count || 10)}</select>
            </label>
            <label class="exam-field">
              <span>Время</span>
              <select class="select" data-change="exam1-timer">${timerOptions([0, 10, 20, 30, 45, 60], cfg.exam1Timer ?? 20)}</select>
            </label>
          </div>
          <button class="btn btn-primary btn-block" type="button" data-action="start-exam" data-mode="exam1">Начать экзамен ${I.arrow}</button>
        </section>

        <section class="exam-card exam-card-2">
          <div class="exam-card-top">
            <span class="badge ok">Экзамен 2</span>
            <span class="exam-card-num">02</span>
          </div>
          <h2>Билет по всем юнитам</h2>
          <p class="exam-card-desc">Полный экзаменационный блок: терминология, перевод короткого текста и вопросы по всем темам.</p>
          <div class="exam-card-list">
            <span>${I.layers} 20 терминов: 8 переводов, 6 определений, 6 аббревиатур</span>
            <span>${I.text} 1 короткий текст + 10 вопросов</span>
            <span>${I.check} Критерии: содержание, полнота, грамматика, терминология</span>
          </div>
          <div class="exam-config-row">
            <label class="exam-field">
              <span>Время</span>
              <select class="select" data-change="exam2-timer">${timerOptions([0, 30, 45, 60, 90], cfg.exam2Timer ?? 60)}</select>
            </label>
          </div>
          <button class="btn btn-primary btn-block" type="button" data-action="start-exam" data-mode="exam2">Начать экзамен ${I.arrow}</button>
        </section>

        <section class="exam-card exam-card-final">
          <div class="exam-card-top">
            <span class="badge">После Unit 15</span>
            <span class="exam-card-num">03</span>
          </div>
          <h2>Проверка знаний всех юнитов</h2>
          <p class="exam-card-desc">Отдельный блок после последнего юнита: только вопросы, количество выбираете сами. Подходит для финального повторения перед экзаменом.</p>
          <div class="exam-card-list">
            <span>${I.tasks} Вопросы по всем 15 юнитам</span>
            <span>${I.target} От 10 до 60 вопросов</span>
            <span>${I.check} Таймер можно отключить</span>
          </div>
          <div class="exam-config-row">
            <label class="exam-field">
              <span>Вопросов</span>
              <select class="select" data-change="final-count">${countOptions([10, 20, 30, 40, 60], cfg.finalCount || 20)}</select>
            </label>
            <label class="exam-field">
              <span>Время</span>
              <select class="select" data-change="final-timer">${timerOptions([0, 15, 30, 45, 60], cfg.finalTimer ?? 0)}</select>
            </label>
          </div>
          <button class="btn btn-block" type="button" data-action="start-exam" data-mode="final">Начать проверку ${I.arrow}</button>
        </section>
      </div>

      <section class="exam-card exam-card-custom">
        <div class="exam-card-top">
          <span class="badge ok">Свой экзамен</span>
          <span class="exam-card-num">04</span>
        </div>
        <h2>Соберите билет под себя</h2>
        <p class="exam-card-desc">Выберите юниты и типы заданий. Перед стартом можно изменить количество заданий и время.</p>
        <div class="exam-custom-block">
          <div class="exam-custom-head"><b>Юниты</b><span><button class="text-btn" type="button" data-action="custom-units-all">Все</button><button class="text-btn" type="button" data-action="custom-units-none">Сбросить</button></span></div>
          <div class="exam-check-grid">${unitChecks}</div>
        </div>
        <div class="exam-custom-block">
          <div class="exam-custom-head"><b>Типы заданий</b><span><button class="text-btn" type="button" data-action="custom-types-all">Все</button><button class="text-btn" type="button" data-action="custom-types-none">Сбросить</button></span></div>
          <div class="exam-check-grid exam-check-grid-types">${typeChecks}</div>
        </div>
        <div class="exam-config-row exam-config-row-custom">
          <label class="exam-field">
            <span>Всего заданий</span>
            <select class="select" data-change="custom-count">${countOptions([10, 15, 20, 30, 40, 60], custom.count || 20)}</select>
          </label>
          <label class="exam-field">
            <span>Время</span>
            <select class="select" data-change="custom-timer">${timerOptions([0, 15, 30, 45, 60, 90], custom.timer ?? 30)}</select>
          </label>
        </div>
        <button class="btn btn-primary btn-block" type="button" data-action="start-exam" data-mode="custom">Собрать и начать ${I.arrow}</button>
      </section>

      <section class="exam-history-section">
        <div class="section-head">
          <div>
            <div class="eyebrow">Сохранено на компьютере</div>
            <h2 class="section-title" style="font-size:28px;margin-top:9px">История экзаменов</h2>
            <p class="muted small">Последние 10 попыток. Нажмите на попытку, чтобы открыть разбор.</p>
          </div>
          <div class="exam-history-summary">
            <span><b>${attempts.length}</b> ${IT.plural(attempts.length, "попытка", "попытки", "попыток")}</span>
            <span><b>${average}%</b> средний</span>
            <span><b>${best}%</b> лучший</span>
          </div>
        </div>
        ${historyRows ? `<div class="exam-history-list">${historyRows}</div>` : `<div class="exam-history-empty">Пока нет завершённых экзаменов. Результат появится здесь после первой попытки.</div>`}
        ${historyRows ? `<button class="text-btn exam-history-clear" type="button" data-action="exam-history-clear">${I.trash} Очистить историю</button>` : ""}
      </section>

      <section class="exam-rubric">
        <div class="eyebrow">Как оценивается ответ</div>
        <h2 class="section-title" style="font-size:26px;margin-top:10px">Критерии экзамена</h2>
        <div class="exam-rubric-grid">
          <div><b>Содержание</b><span>Ответ соответствует вопросу и раскрывает главную мысль.</span></div>
          <div><b>Полнота темы</b><span>Названы основные понятия, примеры и функции.</span></div>
          <div><b>Материал курса</b><span>Ответ опирается на тексты и темы пройденных юнитов.</span></div>
          <div><b>Грамматика</b><span>Предложения понятны, времена и структура в целом верные.</span></div>
          <div><b>Фонетика</b><span>Для устного ответа: термины произносятся разборчиво.</span></div>
          <div><b>Терминология</b><span>IT-термины употреблены точно и по смыслу.</span></div>
        </div>
        <p class="exam-rubric-note">В приложении ответы проверяются по образцам: переводы терминов и аббревиатуры — автоматически, определения, текст и вопросы — через показ образца и честную самооценку.</p>
      </section>`);
  };

  let mediaRecorder = null;
  let mediaStream = null;
  let mediaChunks = [];
  let recordingItem = null;
  let recordingIndex = -1;
  let recordingDiscard = false;

  const micAvailable = () =>
    Boolean(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);

  const isRecording = (exam, item) =>
    Boolean(mediaRecorder && mediaRecorder.state === "recording" && recordingItem === item && recordingIndex === exam.index);

  const stopRecording = (discard = false) => {
    const recorder = mediaRecorder;
    if (!recorder) return;
    recordingDiscard = discard;
    try {
      recorder.stop();
    } catch (_) {
      mediaRecorder = null;
    }
  };

  const onRecorderStop = () => {
    const item = recordingItem;
    const chunks = mediaChunks;
    const discard = recordingDiscard;
    mediaRecorder = null;
    recordingDiscard = false;
    mediaChunks = [];
    recordingItem = null;
    recordingIndex = -1;
    if (mediaStream) {
      mediaStream.getTracks().forEach((track) => track.stop());
      mediaStream = null;
    }
    if (!discard && item && chunks.length) {
      if (item.audioUrl) URL.revokeObjectURL(item.audioUrl);
      item.audioUrl = URL.createObjectURL(new Blob(chunks, { type: "audio/webm" }));
      IT.toast("Запись готова — прослушайте себя");
    }
    if (S.exam && location.hash === "#/exam") IT.views.exam();
  };

  const startRecording = async () => {
    const exam = S.exam;
    const item = exam && exam.items[exam.index];
    if (!item || item.auto || exam.finished) return;
    if (!micAvailable()) {
      IT.toast("Микрофон недоступен: нужен браузер с поддержкой записи", "error");
      return;
    }
    stopRecording(true);
    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaChunks = [];
      recordingItem = item;
      recordingIndex = exam.index;
      recordingDiscard = false;
      const recorder = new MediaRecorder(mediaStream);
      mediaRecorder = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size) mediaChunks.push(event.data);
      };
      recorder.onstop = onRecorderStop;
      recorder.onerror = () => {
        IT.toast("Ошибка записи. Проверьте доступ к микрофону.", "error");
        stopRecording(true);
      };
      recorder.start();
      setTimeout(() => {
        if (mediaRecorder === recorder) stopRecording(false);
      }, 120000);
      IT.views.exam();
    } catch (e) {
      if (mediaStream) {
        mediaStream.getTracks().forEach((track) => track.stop());
        mediaStream = null;
      }
      mediaRecorder = null;
      IT.toast("Не удалось включить микрофон. Разрешите доступ в браузере.", "error");
    }
  };

  const audioControls = (exam, item) => {
    if (!item || item.auto) return "";
    const active = isRecording(exam, item);
    const recordLabel = active ? "Остановить запись" : "Записать ответ";
    const button = micAvailable()
      ? `<button class="btn btn-sm exam-record-btn ${active ? "recording" : ""}" type="button" data-action="exam-record">${I.speaker} ${recordLabel}</button>`
      : `<span class="exam-audio-hint">Микрофон не поддерживается этим браузером.</span>`;
    const player = item.audioUrl
      ? `<audio class="exam-audio" controls preload="metadata" src="${esc(item.audioUrl)}"></audio>
         <button class="text-btn exam-delete-audio" type="button" data-action="exam-delete-audio">Удалить запись</button>`
      : "";
    return `<div class="exam-audio-row">${button}${player}</div>
      <p class="exam-audio-note">Запись остаётся на этом компьютере и не попадает в историю экзаменов.</p>`;
  };

  const sampleAudio = (item) => {
    if (!item || !item.answer) return "";
    return `<button class="text-btn" type="button" data-action="speak" data-text="${esc(item.answer)}" data-lang="en-US">${I.speaker} Прослушать образец</button>`;
  };

  const stopExamAudio = () => stopRecording(true);
  IT.stopExamAudio = stopExamAudio;

  const accumulateItemTime = (exam) => {
    if (!exam || !exam.itemEnteredAt || !Number.isInteger(exam.trackedIndex)) return;
    const now = Date.now();
    const elapsed = Math.max(0, Math.min(30 * 60 * 1000, now - exam.itemEnteredAt));
    if (!exam.itemTimes) exam.itemTimes = {};
    exam.itemTimes[exam.trackedIndex] = (Number(exam.itemTimes[exam.trackedIndex]) || 0) + elapsed;
    const item = exam.items && exam.items[exam.trackedIndex];
    if (item) item.time_ms = exam.itemTimes[exam.trackedIndex];
    exam.itemEnteredAt = now;
  };

  const trackItem = (exam, index) => {
    accumulateItemTime(exam);
    exam.index = Math.max(0, Math.min(Number(index) || 0, (exam.items || []).length - 1));
    exam.trackedIndex = exam.index;
    exam.itemEnteredAt = Date.now();
    exam.precheck = false;
  };

  const captureInput = () => {
    const exam = S.exam;
    if (!exam || exam.finished) return;
    const item = exam.items[exam.index];
    const field = IT.$("[data-input='exam-answer']");
    if (item && field) item.input = field.value;
  };

  const commitCurrentAnswer = () => {
    captureInput();
    const exam = S.exam;
    if (!exam || exam.finished) return;
    const item = exam.items[exam.index];
    if (!item || item.answered || !String(item.input || "").trim()) return;
    item.answered = true;
    item.revealed = true;
    if (item.auto) item.graded = matches(item.input, item.accept || [item.answer]);
  };

  const saveAndNext = () => {
    const exam = S.exam;
    if (!exam || exam.finished) return;
    captureInput();
    const item = exam.items[exam.index];
    if (!item) return;
    if (!String(item.input || "").trim()) {
      IT.toast("Введите ответ или нажмите «Пропустить»", "error");
      const field = IT.$("[data-input='exam-answer']");
      if (field) field.focus();
      return;
    }
    item.answered = true;
    item.revealed = true;
    if (item.auto) item.graded = matches(item.input, item.accept || [item.answer]);
    stopRecording(false);
    if (exam.index >= exam.items.length - 1) {
      requestPrecheck();
      return;
    }
    trackItem(exam, exam.index + 1);
    writeDraft();
    renderRunner();
  };

  const requestPrecheck = () => {
    const exam = S.exam;
    if (!exam || exam.finished) return;
    captureInput();
    accumulateItemTime(exam);
    exam.itemEnteredAt = 0;
    exam.precheck = true;
    writeDraft();
    renderRunner();
  };

  const precheckBack = () => {
    const exam = S.exam;
    if (!exam || exam.finished) return;
    exam.precheck = false;
    exam.trackedIndex = exam.index;
    exam.itemEnteredAt = Date.now();
    writeDraft();
    renderRunner();
  };

  const goTo = (index) => {
    const exam = S.exam;
    if (!exam || exam.finished) return;
    const next = Number(index);
    if (!Number.isFinite(next) || next < 0 || next >= exam.items.length) return;
    captureInput();
    stopRecording(true);
    trackItem(exam, next);
    writeDraft();
    renderRunner();
  };

  const toggleFlag = () => {
    const exam = S.exam;
    if (!exam || exam.finished) return;
    const item = exam.items[exam.index];
    if (!item) return;
    item.flagged = !item.flagged;
    writeDraft();
    renderRunner();
    IT.toast(item.flagged ? "Вопрос отмечен флажком" : "Флажок снят");
  };

  const examMapHtml = (exam) => {
    const items = exam.items || [];
    const buttons = items
      .map((item, index) => {
        const classes = [
          index === exam.index ? "current" : "",
          item.answered ? "answered" : "",
          item.flagged ? "flagged" : "",
          item.graded === true ? "ok" : item.graded === false ? "bad" : "",
        ]
          .filter(Boolean)
          .join(" ");
        const status = item.flagged ? "с флажком" : item.answered ? "отвечен" : "без ответа";
        return `<button class="exam-map-btn ${classes}" type="button" data-action="exam-goto" data-index="${index}" aria-label="Вопрос ${index + 1}: ${esc(item.typeLabel || "задание")}, ${status}" ${index === exam.index ? 'aria-current="step"' : ""}>${index + 1}${item.flagged ? '<i aria-hidden="true">⚑</i>' : ""}</button>`;
      })
      .join("");
    const answered = items.filter((item) => item.answered).length;
    const flagged = items.filter((item) => item.flagged).length;
    return `<aside class="exam-map-panel" aria-label="Карта экзамена">
      <div class="exam-map-head"><b>Карта вопросов</b><span>${answered} / ${items.length}</span></div>
      <div class="exam-map">${buttons}</div>
      <div class="exam-map-legend">
        <span><i class="dot answered"></i> отвечен</span>
        <span><i class="dot current"></i> текущий</span>
        <span><i class="dot flagged">⚑</i> флажок</span>
      </div>
      ${flagged ? `<div class="exam-map-note">${flagged} ${IT.plural(flagged, "вопрос", "вопроса", "вопросов")} с флажком</div>` : ""}
    </aside>`;
  };

  const precheckTimer = (exam) => {
    if (!exam.timerMinutes) return "";
    syncRemaining(exam);
    return `<div class="exam-timer" id="exam-timer" role="timer" aria-live="off">
      <div class="exam-timer-top"><span class="mono-label">Осталось</span><b class="timer-time">${IT.formatTime(exam.remainingSec)}</b></div>
      <div class="exam-timer-bar"><i style="width:${Math.max(0, Math.min(100, ((exam.remainingSec || 0) / Math.max(1, exam.totalSec)) * 100))}%"></i></div>
    </div>`;
  };

  const renderPrecheck = () => {
    const exam = S.exam;
    if (!exam) return;
    const items = exam.items || [];
    const unanswered = items
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => !item.answered && !String(item.input || "").trim());
    const flagged = items
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => item.flagged);
    const score = scoreState(exam);
    const unansweredList = unanswered.length
      ? `<div class="precheck-list">${unanswered
          .map(
            ({ item, index }) =>
              `<button class="precheck-row" type="button" data-action="exam-goto" data-index="${index}"><span>${index + 1}</span><b>${esc(item.typeLabel || "Задание")}</b><small>${esc(String(item.prompt || "").slice(0, 80))}${String(item.prompt || "").length > 80 ? "…" : ""}</small></button>`
          )
          .join("")}</div>`
      : `<div class="precheck-good">${I.check} Все задания заполнены. Можно завершать.</div>`;
    const flaggedList = flagged.length
      ? `<div class="precheck-list">${flagged
          .map(
            ({ item, index }) =>
              `<button class="precheck-row" type="button" data-action="exam-goto" data-index="${index}"><span>⚑</span><b>${esc(item.typeLabel || "Задание")}</b><small>${esc(String(item.prompt || "").slice(0, 80))}</small></button>`
          )
          .join("")}</div>`
      : "";
    IT.setView(`
      <div class="exam-run-head">
        <button class="back-link" type="button" data-action="exam-precheck-back">${I.back} К вопросам</button>
        <div class="exam-run-title"><div class="eyebrow">${esc(exam.title)}</div><div class="exam-run-subtitle">Проверка перед завершением</div></div>
        <div class="exam-run-right"><span class="badge accent">${I.clock} ${IT.formatTime(exam.remainingSec || 0)}</span></div>
      </div>
      <div class="precheck-layout">
        <section class="precheck-card">
          <div class="eyebrow">Экзамен ${exam.viewMode === "exam" ? "· режим проверки" : "· тренировка"}</div>
          <h1>Всё проверили?</h1>
          <p class="lead">После завершения изменить ответы будет нельзя. ${exam.viewMode === "exam" ? "Открытые ответы можно будет оценить на экране проверки." : "Результат и разбор появятся сразу."}</p>
          <div class="precheck-stats">
            <div><b>${score.answered}</b><span>отвечено</span></div>
            <div><b>${unanswered.length}</b><span>без ответа</span></div>
            <div><b>${flagged.length}</b><span>с флажком</span></div>
          </div>
          <div class="precheck-section"><h2>Пропущенные задания</h2>${unansweredList}</div>
          ${flagged.length ? `<div class="precheck-section"><h2>Отмеченные вопросы</h2>${flaggedList}</div>` : ""}
          <div class="precheck-actions">
            <button class="btn" type="button" data-action="exam-precheck-back">${I.back} Вернуться</button>
            <button class="btn btn-primary" type="button" data-action="exam-precheck-finish">Завершить экзамен ${I.arrow}</button>
          </div>
        </section>
        ${examMapHtml(exam)}
      </div>
      ${precheckTimer(exam)}`);
    if (!S.examTimer && exam.timerMinutes) IT.startExamTimer();
    else paintTimer();
  };

  const renderRunner = () => {
    const exam = S.exam;
    if (!exam) {
      IT.setView('<div class="empty"><b>Экзамен не запущен</b><a class="btn" href="#/exams">К экзаменам</a></div>');
      return;
    }
    if (exam.finished) {
      renderResult();
      return;
    }
    if (exam.precheck) {
      renderPrecheck();
      return;
    }
    if (!Number.isInteger(exam.trackedIndex)) {
      exam.trackedIndex = exam.index;
      exam.itemEnteredAt = Date.now();
    } else if (exam.trackedIndex !== exam.index) {
      accumulateItemTime(exam);
      exam.trackedIndex = exam.index;
      exam.itemEnteredAt = Date.now();
    }
    const item = exam.items[exam.index];
    if (!item) {
      finish(false);
      return;
    }
    const examMode = exam.viewMode === "exam";
    const sectionItems = exam.items.filter((x) => x.section === item.section);
    const sectionIndex = sectionItems.indexOf(item) + 1;
    const progress = Math.round((exam.index / exam.items.length) * 100);
    const last = exam.index === exam.items.length - 1;
    const isAuto = Boolean(item.auto);
    const unit = unitLabel(item.unit_id);
    const answerText = esc(item.input || "");
    const canEdit = !item.revealed && !item.answered;
    const timer = exam.timerMinutes
      ? `<div class="exam-timer" id="exam-timer" role="timer" aria-live="off">
          <div class="exam-timer-top"><span class="mono-label">Осталось</span><b class="timer-time">${IT.formatTime(exam.remainingSec)}</b></div>
          <div class="exam-timer-bar"><i style="width:${Math.max(0, Math.min(100, ((exam.remainingSec || 0) / Math.max(1, exam.totalSec)) * 100))}%"></i></div>
        </div>`
      : "";

    let prompt = "";
    if (item.kind === "text") {
      prompt = `<div class="exam-text-title">${esc(item.title || "Текст")}</div>
        <div class="exam-text-passage">${esc(item.prompt)}</div>
        <div class="exam-prompt-actions">
          <button class="text-btn" type="button" data-action="speak" data-text="${esc(item.prompt)}" data-lang="en-US">${I.speaker} Прослушать</button>
        </div>`;
    } else if (item.kind === "term" || item.kind === "abbr") {
      prompt = `<div class="exam-term-prompt">${esc(item.prompt)}</div>`;
    } else {
      prompt = `<div class="exam-question">${esc(item.prompt)}</div>
        ${item.note ? `<p class="exam-note">${esc(item.note)}</p>` : ""}
        ${item.kind === "question" ? `<div class="exam-prompt-actions"><button class="text-btn" type="button" data-action="speak" data-text="${esc(item.prompt)}" data-lang="en-US">${I.speaker} Прослушать</button></div>` : ""}`;
    }

    let answerBlock = "";
    if (canEdit) {
      if (isAuto) {
        if (examMode) {
          answerBlock = `
            <div class="exam-answer-row">
              <input class="input exam-input" type="text" data-input="exam-answer" value="${answerText}" placeholder="${esc(item.placeholder)}" autocomplete="off" spellcheck="false" aria-label="Ответ на задание">
              <button class="btn btn-primary" type="button" data-action="exam-save-next">${last ? "Сохранить и завершить" : "Сохранить и дальше"}</button>
            </div>
            <p class="exam-input-hint"><span class="exam-lock-hint">${I.lock} Проверка будет видна после завершения.</span> Enter — сохранить и перейти дальше.</p>`;
        } else {
          answerBlock = `
            <div class="exam-answer-row">
              <input class="input exam-input" type="text" data-input="exam-answer" value="${answerText}" placeholder="${esc(item.placeholder)}" autocomplete="off" spellcheck="false" aria-label="Ответ на задание">
              <button class="btn btn-primary" type="button" data-action="exam-check">Проверить</button>
            </div>
            <p class="exam-input-hint">Enter или Ctrl+Enter — проверить.</p>`;
        }
      } else if (examMode) {
        answerBlock = `
          <textarea class="input exam-textarea" data-input="exam-answer" rows="${item.rows || 4}" placeholder="${esc(item.placeholder)}" aria-label="Ваш ответ">${answerText}</textarea>
          <div class="exam-answer-actions">
            <button class="btn btn-primary" type="button" data-action="exam-save-next">${last ? "Сохранить и завершить" : "Сохранить и дальше"}</button>
          </div>
          <p class="exam-input-hint"><span class="exam-lock-hint">${I.lock} Образец откроется после завершения.</span> Ответ можно будет проверить в конце экзамена.</p>
          ${audioControls(exam, item)}`;
      } else {
        answerBlock = `
          <textarea class="input exam-textarea" data-input="exam-answer" rows="${item.rows || 4}" placeholder="${esc(item.placeholder)}" aria-label="Ваш ответ">${answerText}</textarea>
          <div class="exam-answer-actions">
            <button class="btn btn-primary" type="button" data-action="exam-reveal">Показать образец</button>
          </div>
          <p class="exam-input-hint">Сначала ответьте самостоятельно, затем сверьтесь с образцом и оцените себя.</p>
          ${audioControls(exam, item)}`;
      }
    } else {
      const stateClass = item.graded === true ? "ok" : item.graded === false ? "bad" : "skip";
      const stateLabel = item.graded === true ? "Зачтено" : item.graded === false ? "Не зачтено" : "Без оценки";
      answerBlock = `
        <div class="exam-feedback ${stateClass}">
          <div class="exam-feedback-top"><b>${stateLabel}</b>${item.graded === true ? I.check : item.graded === false ? I.x : I.info}</div>
          <div class="exam-source-line">${I.book} ${esc(sourceLabel(item))}</div>
          <div class="exam-answer-label">${esc(item.answerLabel)}</div>
          <div class="exam-reference">${esc(item.answer).replace(/\n/g, "<br>")}</div>
          ${sampleAudio(item)}
          ${item.input ? `<div class="exam-answer-label" style="margin-top:14px">Ваш ответ</div><div class="exam-user-answer">${esc(item.input).replace(/\n/g, "<br>")}</div>` : ""}
          ${item.audioUrl ? `<div class="exam-audio-row"><audio class="exam-audio" controls src="${esc(item.audioUrl)}"></audio></div>` : ""}
          ${item.graded === null ? `<div class="exam-grade-row"><button class="btn btn-primary btn-sm" type="button" data-action="exam-grade" data-correct="1">Зачесть</button><button class="btn btn-danger btn-sm" type="button" data-action="exam-grade" data-correct="0">Не зачесть</button></div>` : ""}
          <div class="exam-next-row">
            <button class="btn btn-primary" type="button" data-action="exam-next">${last ? "Завершить" : "Дальше"} ${I.arrow}</button>
          </div>
        </div>`;
    }

    IT.setView(`
      <div class="exam-run-head">
        <button class="back-link" type="button" data-action="exam-exit">${I.back} Выйти</button>
        <div class="exam-run-title">
          <div class="eyebrow">${esc(exam.title)}</div>
          <div class="exam-run-subtitle">${esc(exam.subtitle)}</div>
        </div>
        <div class="exam-run-right">
          ${examMode ? `<span class="badge accent exam-mode-badge">${I.lock} Экзамен</span>` : `<span class="badge exam-mode-badge">Тренировка</span>`}
          <div class="exam-run-count">${exam.index + 1} <span>/ ${exam.items.length}</span></div>
        </div>
      </div>
      <div class="exam-overall-progress"><i style="width:${progress}%"></i></div>

      <div class="exam-run-layout">
        ${examMapHtml(exam)}
        <div class="exam-run-main">
          <section class="exam-run-card">
            <div class="exam-run-meta">
              <span class="badge accent">${esc(item.sectionLabel)}</span>
              <span class="exam-section-progress">${sectionIndex} / ${sectionItems.length}</span>
              <span class="exam-unit-label">${esc(unit)}</span>
              <button class="exam-flag-btn ${item.flagged ? "active" : ""}" type="button" data-action="exam-flag" aria-pressed="${item.flagged ? "true" : "false"}" title="Отметить вопрос флажком">${I.flag} ${item.flagged ? "С флажком" : "Флажок"}</button>
            </div>
            <div class="exam-type-label">${esc(item.typeLabel)}</div>
            <div class="exam-prompt-label">${esc(item.promptLabel)}</div>
            <div class="exam-source-line">${I.book} ${esc(sourceLabel(item))}</div>
            ${prompt}
            ${answerBlock}
          </section>

          <div class="exam-run-footer">
            <button class="text-btn" type="button" data-action="exam-prev" ${exam.index === 0 ? "disabled" : ""}>${I.back} Назад</button>
            <button class="text-btn" type="button" data-action="exam-skip">Пропустить ${I.arrow}</button>
            <button class="text-btn" type="button" data-action="exam-finish">Завершить экзамен</button>
          </div>
        </div>
      </div>
      ${timer}`);

    if (!S.examTimer && exam.timerMinutes) IT.startExamTimer();
    else paintTimer();
    if (canEdit && !isAuto) {
      setTimeout(() => {
        const el = IT.$("[data-input='exam-answer']");
        if (el) el.focus();
      }, 30);
    }
  };

  const gradeWord = (pct) => {
    if (pct >= 90) return "Отлично";
    if (pct >= 75) return "Хорошо";
    if (pct >= 60) return "Удовлетворительно";
    return "Нужно повторить";
  };

  const itemDefaults = (kind) => {
    if (kind === "question") {
      return {
        promptLabel: "Ответьте на вопрос по-английски",
        placeholder: "Напишите ответ по-английски. Можно отвечать устно, затем открыть образец и оценить себя.",
        rows: 5,
      };
    }
    if (kind === "term" || kind === "abbr") {
      return {
        promptLabel: kind === "abbr" ? "Расшифруйте аббревиатуру по-английски" : "Напишите термин по-английски",
        placeholder: "Например: central processing unit",
        rows: 4,
      };
    }
    if (kind === "definition") {
      return {
        promptLabel: "Дайте определение на английском (1–2 предложения)",
        placeholder: "Write a short definition in English...",
        rows: 3,
      };
    }
    if (kind === "reverse") {
      return {
        promptLabel: "Определите термин по описанию",
        placeholder: "Например: load balancer",
        rows: 2,
      };
    }
    if (kind === "text") {
      return { promptLabel: "Переведите текст на русский язык", placeholder: "Введите перевод...", rows: 8 };
    }
    return { promptLabel: "Задание", placeholder: "", rows: 4 };
  };

  const normalizeItem = (item) => {
    const defaults = itemDefaults(item.kind);
    return {
      ...item,
      sectionLabel: item.sectionLabel || item.section_label || item.section || "Задания",
      typeLabel: item.typeLabel || item.type_label || "Задание",
      answerLabel: item.answerLabel || item.answer_label || "Образец ответа",
      promptLabel: item.promptLabel || defaults.promptLabel,
      placeholder: item.placeholder || defaults.placeholder,
      rows: Number(item.rows) || defaults.rows,
      source: item.source || "",
      source_tab: item.source_tab || item.sourceTab || "",
      answered: Boolean(item.answered),
      graded: item.graded === true ? true : item.graded === false ? false : null,
      input: item.input || "",
      item_id: item.item_id || "",
      time_ms: Math.max(0, Number(item.time_ms) || 0),
      review_en: item.review_en || "",
      flagged: Boolean(item.flagged),
      tags: item.tags || [],
    };
  };

  const loadHistoryAttempt = (id) => {
    const attempt = (S.progress.exams || []).find((item) => item.id === id);
    if (!attempt) {
      IT.toast("Попытка не найдена", "error");
      return;
    }
    S.exam = {
      ...attempt,
      title: attempt.title || "Экзамен",
      subtitle: attempt.subtitle || "",
      viewMode: attempt.view_mode === "exam" ? "exam" : "practice",
      startedAt: attempt.started_at,
      finishedAt: attempt.finished_at,
      timeSpentSec: Number(attempt.time_spent_sec) || 0,
      finished: true,
      reviewStage: false,
      reviewDone: true,
      historySaved: true,
      fromHistory: true,
      items: (attempt.items || []).map(normalizeItem),
    };
    S.examFilter = "all";
    if (location.hash === "#/exam") IT.views.exam();
    else location.hash = "#/exam";
  };

  const resumeDraft = () => {
    const draft = readDraft();
    if (!draft || !Array.isArray(draft.items) || !draft.items.length) {
      IT.toast("Черновик не найден", "error");
      return;
    }
    const items = draft.items.map(normalizeItem);
    const exam = {
      ...draft,
      items,
      viewMode: draft.viewMode === "exam" ? "exam" : "practice",
      index: Math.max(0, Math.min(Number(draft.index) || 0, items.length - 1)),
      finished: Boolean(draft.finished),
      reviewStage: Boolean(draft.reviewStage),
      reviewDone: Boolean(draft.reviewDone),
      precheck: Boolean(draft.precheck) && !draft.finished,
      trackedIndex: Number.isInteger(draft.trackedIndex) ? draft.trackedIndex : Math.max(0, Math.min(Number(draft.index) || 0, items.length - 1)),
      itemEnteredAt: draft.precheck ? 0 : Date.now(),
      itemTimes: draft.itemTimes || {},
      lastWarnMinute: null,
      historySaved: false,
      fromHistory: false,
    };
    if (!exam.finished && exam.timerMinutes && exam.deadlineAt && exam.deadlineAt <= Date.now()) {
      exam.remainingSec = 0;
      S.exam = exam;
      finish(true);
      return;
    }
    S.exam = exam;
    S.examFilter = "all";
    writeDraft();
    if (location.hash === "#/exam") IT.views.exam();
    else location.hash = "#/exam";
  };

  const discardDraft = () => {
    IT.confirm({
      title: "Удалить черновик?",
      text: "Незавершённая попытка будет удалена. История завершённых экзаменов останется.",
      label: "Удалить",
      danger: true,
      onConfirm: () => {
        clearDraft();
        renderExams();
      },
    });
  };

  const printExam = (withAnswers = false) => {
    const exam = S.exam;
    if (!exam) return;
    const rows = (exam.items || [])
      .map((item, index) => {
        const prompt = esc(item.prompt).replace(/\n/g, "<br>");
        const reference = withAnswers
          ? `<div class="key-answer"><b>${esc(item.answerLabel || "Образец")}:</b> ${esc(item.answer).replace(/\n/g, "<br>")}</div>`
          : `<div class="answer-lines"><i></i><i></i><i></i></div>`;
        return `<article class="ticket-item">
          <div class="ticket-meta">${String(index + 1).padStart(2, "0")} · ${esc(item.typeLabel)} · ${esc(item.source || unitLabel(item.unit_id))}</div>
          <div class="ticket-prompt">${prompt}</div>
          ${reference}
        </article>`;
      })
      .join("");
    const win = window.open("", "_blank");
    if (!win) {
      IT.toast("Браузер заблокировал окно печати. Разрешите всплывающие окна.", "error");
      return;
    }
    win.document.write(`<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><title>${esc(exam.title)} — IT English Lab</title>
<style>
  @page { margin: 16mm; }
  body { font: 12pt/1.55 Georgia, serif; color: #111; margin: 0; }
  h1 { font-size: 22pt; margin: 0 0 4mm; }
  .head { border-bottom: 2px solid #111; padding-bottom: 5mm; margin-bottom: 7mm; }
  .meta { color: #555; font-size: 10pt; }
  .ticket-item { break-inside: avoid; margin: 0 0 7mm; }
  .ticket-meta { font: 9pt/1.4 Consolas, monospace; color: #555; margin-bottom: 2mm; }
  .ticket-prompt { font-size: 12.5pt; }
  .answer-lines i { display: block; border-bottom: 1px solid #bbb; height: 8mm; }
  .key-answer { margin-top: 3mm; padding: 3mm; background: #f2f2f2; }
  .key-title { margin-top: 10mm; border-top: 2px solid #111; padding-top: 5mm; }
  @media print { .no-print { display: none; } }
</style></head><body>
  <div class="head">
    <h1>${esc(exam.title)}</h1>
    <div class="meta">${esc(exam.subtitle || "")} · ${esc(formatDate(exam.finishedAt || exam.startedAt))} · ${exam.items.length} ${esc(IT.plural(exam.items.length, "задание", "задания", "заданий"))}${withAnswers ? " · с ответами" : ""}</div>
  </div>
  ${rows}
  ${withAnswers ? `<div class="key-title meta">Ключ к билету · IT English Lab</div>` : ""}
</body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 300);
  };

  const reviewCard = (item, index, grading = false) => {
    const state = item.graded === true ? "ok" : item.graded === false ? "bad" : "skip";
    const label = item.graded === true ? "Зачтено" : item.graded === false ? "Не зачтено" : "Без оценки";
    const icon = item.graded === true ? I.check : item.graded === false ? I.x : I.info;
    const needsGrade = grading && item.answered && !item.auto && item.graded == null;
    const answerLang = item.kind === "text" ? "ru-RU" : "en-US";
    const audio = item.audioUrl
      ? `<div class="exam-answer-label" style="margin-top:12px">Ваша запись</div><div class="exam-audio-row"><audio class="exam-audio" controls src="${esc(item.audioUrl)}"></audio></div>`
      : "";
    const promptText = String(item.prompt || "");
    const promptPreview = promptText.replace(/\s+/g, " ").slice(0, 110);
    return `<details class="exam-review-item ${state}" ${needsGrade ? "open" : ""}>
      <summary>
        <span class="exam-review-num">${String(index + 1).padStart(2, "0")}</span>
        <span class="exam-review-main"><b>${esc(item.typeLabel)}</b><span>${esc(promptPreview)}${promptText.length > 110 ? "…" : ""}${Number(item.time_ms) ? ` · ${Math.round(Number(item.time_ms) / 1000)} с` : ""}</span></span>
        <span class="exam-review-status">${needsGrade ? I.info + " Оценить" : icon + " " + label}</span>
      </summary>
      <div class="exam-review-body">
        <div class="exam-review-source">${sourceLink(item)}</div>
        ${
          Array.isArray(item.tags) && item.tags.length
            ? `<div class="exam-tags" aria-label="Теги задания">${item.tags
                .slice(0, 6)
                .map((tag) => `<span>${esc(tag)}</span>`)
                .join("")}</div>`
            : ""
        }
        <div class="exam-answer-label">Задание</div>
        <div class="exam-review-prompt">${esc(item.prompt).replace(/\n/g, "<br>")}</div>
        <div class="exam-answer-label" style="margin-top:12px">${esc(item.answerLabel)}</div>
        <div class="exam-reference">${esc(item.answer).replace(/\n/g, "<br>")}</div>
        <button class="text-btn" type="button" data-action="speak" data-text="${esc(item.answer)}" data-lang="${answerLang}">${I.speaker} Прослушать образец</button>
        <div class="exam-answer-label" style="margin-top:12px">Ваш ответ</div>
        <div class="exam-user-answer">${item.answered && item.input ? esc(item.input).replace(/\n/g, "<br>") : '<span class="muted">Без ответа</span>'}</div>
        ${item.graded === false && IT.aiOn() ? `<button class="btn btn-sm btn-teal" type="button" data-action="exam-explain" data-index="${index}">${I.spark} Объяснить ошибку с ИИ</button><p class="muted tiny">Необязательно: объяснение не влияет на оценку экзамена.</p>` : ""}
        ${item.note ? `<p class="exam-note">${esc(item.note)}</p>` : ""}
        ${audio}
        ${needsGrade ? `<div class="exam-grade-row exam-review-grade-pending"><button class="btn btn-primary btn-sm" type="button" data-action="exam-review-grade" data-index="${index}" data-correct="1">Зачесть</button><button class="btn btn-danger btn-sm" type="button" data-action="exam-review-grade" data-index="${index}" data-correct="0">Не зачесть</button></div>` : ""}
      </div>
    </details>`;
  };

  const renderReviewStage = () => {
    const exam = S.exam;
    if (!exam) return;
    IT.stopExamTimer();
    const score = scoreState(exam);
    const pending = exam.items.filter((item) => item.answered && !item.auto && item.graded == null);
    const autoChecked = exam.items.filter((item) => item.auto && item.answered).length;
    const review = exam.items.map((item, index) => reviewCard(item, index, true)).join("");
    IT.setView(`
      <div class="exam-result-hero exam-review-hero">
        <div>
          <div class="eyebrow">Экзамен завершён · ${esc(exam.title)}</div>
          <h1 class="display" style="font-size:clamp(34px,4.6vw,58px);margin-top:14px">Проверка ответов</h1>
          <p class="lead" style="margin-top:8px">Время остановлено. Автоматические задания уже проверены, открытые ответы оцените по образцу.</p>
          ${exam.timeout ? '<p class="exam-timeout">Время вышло — ответы сохранены автоматически.</p>' : ""}
        </div>
        <div class="exam-review-counter">
          <b>${pending.length}</b>
          <span>${IT.plural(pending.length, "ответ", "ответа", "ответов")} ждёт оценки</span>
        </div>
      </div>

      <div class="exam-result-stats">
        <div><b>${score.correct}</b><span>зачтено</span></div>
        <div><b>${score.wrong}</b><span>не зачтено</span></div>
        <div><b>${score.skipped}</b><span>без ответа</span></div>
        <div><b>${autoChecked}</b><span>авто-проверено</span></div>
        <div><b>${IT.formatTime(exam.timeSpentSec)}</b><span>время</span></div>
      </div>

      <div class="section-head" style="margin-top:30px">
        <div><h2 class="section-title" style="font-size:28px">Ответы и образцы</h2><p class="muted small">Откройте задание, сравните свой ответ с образцом и поставьте оценку. Без оценки останутся только пропущенные задания.</p></div>
      </div>
      <div class="exam-review">${review}</div>

      <div class="exam-review-finish-bar">
        <span>${pending.length ? `Осталось оценить: ${pending.length}` : "Все открытые ответы оценены"}</span>
        <button class="btn btn-primary" type="button" data-action="exam-review-finish" ${pending.length ? "disabled" : ""}>Завершить проверку ${I.arrow}</button>
      </div>`);
  };

  const renderResult = () => {
    const exam = S.exam;
    if (!exam) return;
    IT.stopExamTimer();
    if (exam.reviewStage) {
      renderReviewStage();
      return;
    }
    const score = scoreState(exam);
    const filter = S.examFilter === "errors" ? "errors" : "all";
    const wrongItems = exam.items.filter((item) => item.graded !== true);
    const visibleItems = filter === "errors" ? wrongItems : exam.items;
    const sections = [...new Set(exam.items.map((item) => item.section))];
    const sectionRows = sections
      .map((section) => {
        const items = exam.items.filter((item) => item.section === section);
        const correct = items.filter((item) => item.graded === true).length;
        const answered = items.filter((item) => item.answered).length;
        return `<div class="exam-result-section">
          <div><b>${esc(items[0]?.sectionLabel || section)}</b><span>${answered} из ${items.length} отвечено</span></div>
          <span class="exam-result-section-score">${correct} / ${items.length}</span>
        </div>`;
      })
      .join("");
    const review = visibleItems
      .map((item) => {
        const originalIndex = exam.items.indexOf(item);
        return reviewCard(item, originalIndex, false);
      })
      .join("");
    const historyNote = exam.fromHistory
      ? `<p class="exam-history-note">Сохранённая попытка от ${formatDate(exam.finishedAt)}. Разбор доступен без повторного прохождения.</p>`
      : "";

    IT.setView(`
      <div class="exam-result-hero">
        <div>
          <div class="eyebrow">Результат · ${esc(exam.title)}</div>
          <h1 class="display" style="font-size:clamp(38px,5vw,62px);margin-top:14px">${score.pct}<em>%</em></h1>
          <p class="lead" style="margin-top:8px">Зачтено: ${score.correct} из ${score.total}. ${gradeWord(score.pct)}.</p>
          ${exam.timeout ? '<p class="exam-timeout">Время вышло — экзамен завершён автоматически.</p>' : ""}
          ${historyNote}
        </div>
        <div class="exam-result-dial">
          <div class="dial" style="--p:${score.pct}%"><b>${score.pct}%</b></div>
          <span>${gradeWord(score.pct)}</span>
        </div>
      </div>

      <div class="exam-result-stats">
        <div><b>${score.correct}</b><span>зачтено</span></div>
        <div><b>${score.wrong}</b><span>не зачтено</span></div>
        <div><b>${score.skipped}</b><span>без ответа</span></div>
        <div><b>${IT.formatTime(exam.timeSpentSec)}</b><span>время</span></div>
      </div>

      <div class="exam-result-grid">
        <section class="exam-result-panel">
          <div class="eyebrow">По разделам</div>
          <h2 class="section-title" style="font-size:24px;margin-top:9px">Разбивка</h2>
          <div class="exam-result-sections">${sectionRows}</div>
          <p class="exam-rubric-note">Процент — ориентир. На устном экзамене также важны фонетика, беглость и полнота раскрытия темы.</p>
        </section>
        <section class="exam-result-panel">
          <div class="eyebrow">Что дальше</div>
          <h2 class="section-title" style="font-size:24px;margin-top:9px">Повторите слабые места</h2>
          <p class="muted small" style="line-height:1.65">Откройте разбор: там есть задание, ваш ответ, источник и образец. Вернитесь в юнит или запустите повторение только незачтенных заданий.</p>
          <div class="exam-result-actions">
            ${wrongItems.length ? `<button class="btn btn-primary" type="button" data-action="exam-retry-mistakes">Повторить ошибки ${I.refresh}</button>` : ""}
            <button class="btn" type="button" data-action="exam-print" data-with-answers="0">Печать билета</button>
            <button class="btn" type="button" data-action="exam-print" data-with-answers="1">Печать с ответами</button>
            <button class="btn" type="button" data-action="exam-restart">Пройти ещё раз ${I.refresh}</button>
            <a class="btn" href="#/exams" data-action="exam-exit">К экзаменам ${I.arrow}</a>
          </div>
        </section>
      </div>

      <div class="section-head" style="margin-top:30px">
        <div><h2 class="section-title" style="font-size:28px">Разбор ответов</h2><p class="muted small">Нажмите на задание, чтобы увидеть образец, свой ответ и источник.</p></div>
        <div class="exam-filter" role="group" aria-label="Фильтр разбора">
          <button class="${filter === "all" ? "active" : ""}" type="button" data-action="exam-filter" data-filter="all">Все · ${exam.items.length}</button>
          <button class="${filter === "errors" ? "active" : ""}" type="button" data-action="exam-filter" data-filter="errors">Только ошибки · ${wrongItems.length}</button>
        </div>
      </div>
      <div class="exam-review">${review || '<div class="exam-history-empty">Ошибок нет — отличная работа.</div>'}</div>`);
  };

  IT.views = IT.views || {};
  IT.views.exams = renderExams;
  IT.views.exam = () => {
    const exam = S.exam;
    if (!exam) {
      IT.setView('<div class="empty"><b>Экзамен не выбран</b><a class="btn" href="#/exams">Перейти к экзаменам</a></div>');
      return;
    }
    if (exam.finished) {
      renderResult();
      return;
    }
    renderRunner();
  };

  const setViewMode = (mode) => {
    S.examConfig.viewMode = mode === "exam" ? "exam" : "practice";
    saveConfig();
    renderExams();
  };

  const updateCustom = (patch) => {
    S.examConfig.custom = { ...defaultCustom(), ...(S.examConfig.custom || {}), ...patch };
    saveConfig();
  };

  const customUnitsAll = () => {
    updateCustom({ units: [...ALL_UNITS] });
    renderExams();
  };

  const customUnitsNone = () => {
    updateCustom({ units: [] });
    renderExams();
  };

  const customTypesAll = () => {
    updateCustom({ types: [...ALL_TYPES] });
    renderExams();
  };

  const customTypesNone = () => {
    updateCustom({ types: [] });
    renderExams();
  };

  const clearHistory = () => {
    IT.confirm({
      title: "Очистить историю экзаменов?",
      text: "Будут удалены все сохранённые попытки и их разбор. Прогресс тренажёра останется.",
      label: "Очистить",
      danger: true,
      onConfirm: async () => {
        try {
          await IT.api("/api/exam/history", { method: "DELETE" });
          S.progress.exams = [];
          IT.toast("История экзаменов очищена");
          renderExams();
        } catch (e) {
          IT.toast(e.message || "Не удалось очистить историю", "error");
        }
      },
    });
  };

  IT.examActions = {
    start: (mode) =>
      startExam(mode).catch((e) => {
        console.error(e);
        IT.toast(e && e.message ? e.message : "Не удалось начать экзамен", "error");
      }),
    startDiagnostic,
    check: () => {
      const exam = S.exam;
      if (!exam || exam.finished) return;
      captureInput();
      const item = exam.items[exam.index];
      if (!item || item.answered || !item.auto) return;
      const ok = matches(item.input, item.accept || [item.answer]);
      item.graded = ok;
      item.answered = true;
      item.revealed = true;
      stopRecording(false);
      renderRunner();
    },
    saveNext: saveAndNext,
    reveal: () => {
      const exam = S.exam;
      if (!exam || exam.finished) return;
      captureInput();
      const item = exam.items[exam.index];
      if (!item || item.answered) return;
      item.revealed = true;
      stopRecording(false);
      renderRunner();
    },
    grade: (ok) => {
      const exam = S.exam;
      if (!exam || exam.finished) return;
      const item = exam.items[exam.index];
      if (!item || item.answered) return;
      item.graded = Boolean(ok);
      item.answered = true;
      item.revealed = true;
      stopRecording(false);
      renderRunner();
    },
    next: () => {
      const exam = S.exam;
      if (!exam || exam.finished) return;
      stopRecording(true);
      if (exam.index >= exam.items.length - 1) {
        requestPrecheck();
        return;
      }
      captureInput();
      trackItem(exam, exam.index + 1);
      writeDraft();
      renderRunner();
    },
    prev: () => {
      const exam = S.exam;
      if (!exam || exam.finished || exam.index <= 0) return;
      captureInput();
      stopRecording(true);
      trackItem(exam, exam.index - 1);
      writeDraft();
      renderRunner();
    },
    goTo,
    toggleFlag,
    precheck: requestPrecheck,
    precheckBack,
    precheckFinish: () => finish(false),
    skip: () => {
      const exam = S.exam;
      if (!exam || exam.finished) return;
      stopRecording(true);
      const item = exam.items[exam.index];
      if (!item) return;
      if (!item.answered) {
        item.graded = null;
        item.input = "";
      }
      if (exam.index >= exam.items.length - 1) {
        requestPrecheck();
        return;
      }
      trackItem(exam, exam.index + 1);
      writeDraft();
      renderRunner();
    },
    finish: (timeout = false) => {
      if (timeout) {
        finish(true);
        return;
      }
      requestPrecheck();
    },
    exit: exitExam,
    restart: () => {
      const current = S.exam;
      const mode = current?.mode || "exam1";
      S.exam = null;
      S.examFilter = "all";
      if (mode === "diagnostic") {
        startDiagnostic();
        return;
      }
      if (mode === "mistakes" && current) {
        startFromItems(
          current.items,
          "Повторение ошибок",
          `${current.items.length} ${IT.plural(current.items.length, "задание", "задания", "заданий")}`
        );
        return;
      }
      IT.examActions.start(mode);
    },
    retryMistakes: () => {
      const exam = S.exam;
      if (!exam) return;
      const wrong = exam.items.filter((item) => item.graded !== true);
      if (!wrong.length) {
        IT.toast("Ошибок нет — можно переходить к следующему экзамену");
        return;
      }
      startFromItems(
        wrong,
        "Повторение ошибок",
        `${wrong.length} ${IT.plural(wrong.length, "задание", "задания", "заданий")} из попытки «${exam.title}»`
      );
    },
    reviewGrade: (index, ok) => {
      const exam = S.exam;
      const item = exam && exam.items[index];
      if (!exam || !item || item.auto || !item.answered) return;
      item.graded = Boolean(ok);
      writeDraft();
      renderResult();
    },
    reviewFinish: completeReview,
    setViewMode,
    filter: (filter) => {
      S.examFilter = filter === "errors" ? "errors" : "all";
      renderResult();
    },
    historyOpen: loadHistoryAttempt,
    historyClear: clearHistory,
    resumeDraft,
    discardDraft,
    record: () => {
      const exam = S.exam;
      const item = exam && exam.items[exam.index];
      if (!exam || !item || exam.finished) return;
      if (isRecording(exam, item)) stopRecording(false);
      else startRecording();
    },
    deleteAudio: () => {
      const exam = S.exam;
      const item = exam && exam.items[exam.index];
      if (!item) return;
      if (item.audioUrl) URL.revokeObjectURL(item.audioUrl);
      item.audioUrl = "";
      if (exam.finished) renderResult();
      else renderRunner();
    },
    print: (withAnswers) => printExam(Boolean(withAnswers)),
    customUnitsAll,
    customUnitsNone,
    customTypesAll,
    customTypesNone,
    setCustom: updateCustom,
    saveConfig,
  };

  IT.saveExamDraft = () => writeDraft();

  IT.finalCheckCallout = () => {
    const cfg = S.examConfig || {};
    return `<section class="exam-final-callout">
      <div class="exam-final-copy">
        <div class="eyebrow">После Unit 15</div>
        <h2>Проверка знаний всех юнитов</h2>
        <p>Выберите количество вопросов и начните итоговую проверку. Это отдельный блок после всего курса: только вопросы по всем 15 юнитам и разбор ответов.</p>
        <div class="exam-final-tags"><span>60 вопросов в банке</span><span>самопроверка по образцам</span><span>таймер по желанию</span></div>
      </div>
      <div class="exam-final-controls">
        <label class="exam-field"><span>Вопросов</span><select class="select" data-change="final-count">${countOptions([10, 20, 30, 40, 60], cfg.finalCount || 20)}</select></label>
        <label class="exam-field"><span>Время</span><select class="select" data-change="final-timer">${timerOptions([0, 15, 30, 45, 60], cfg.finalTimer ?? 0)}</select></label>
        <button class="btn btn-primary" type="button" data-action="start-exam" data-mode="final">Начать проверку ${I.arrow}</button>
      </div>
    </section>`;
  };
})();
