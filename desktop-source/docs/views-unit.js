/* IT English Lab — unit page */
(() => {
  "use strict";
  const IT = window.IT;
  const { S, esc, icons: I } = IT;

  const statusOf = (unitId, en) => {
    const st = IT.wordStat(unitId, en);
    if (st.wrong > st.correct && st.wrong > 0 && st.box < 3) return { cls: "weak", label: "Слабое" };
    if (st.box >= 3) return { cls: "learn", label: "Знаю" };
    if (st.box > 0 || st.correct + st.wrong > 0) return { cls: "mid", label: "Учится" };
    return { cls: "", label: "Новое" };
  };

  const renderVocab = (unit) => {
    const q = (S.vocabQuery || "").toLowerCase();
    const rows = unit.vocab
      .map((v) => {
        const st = statusOf(unit.id, v.en);
        const search = `${v.en} ${v.ru}`.toLowerCase();
        return `
          <div class="vocab-row" data-vocab-row data-search="${esc(search)}" style="${q && !search.includes(q) ? "display:none" : ""}">
            <div class="vocab-en">${esc(v.en)}</div>
            <div class="vocab-ru">${esc(v.ru)}</div>
            <div class="vocab-actions">
              <span class="status-dot ${st.cls}" title="${st.label}"></span>
              <span class="status-label">${st.label}</span>
              <button class="icon-btn" type="button" title="Произнести" data-action="speak" data-text="${esc(v.en)}" data-lang="en-US">${I.speaker}</button>
            </div>
          </div>`;
      })
      .join("");
    return `
      <div class="vocab-toolbar">
        <div class="search-wrap">${I.search}<input type="search" placeholder="Найти слово или перевод…" data-input="vocab-search" value="${esc(S.vocabQuery || "")}" aria-label="Поиск по словарю"></div>
        <div style="display:flex;gap:8px;align-items:center">
          <span class="muted tiny">${unit.vocab.length} ${IT.plural(unit.vocab.length, "термин", "термина", "терминов")}</span>
          <a class="btn btn-sm btn-primary" href="#/unit/${unit.id}/practice">${I.play} Тренировать</a>
        </div>
      </div>
      <div class="vocab-list">${rows || '<div class="empty">В этом юните нет словаря.</div>'}</div>
      <p class="muted tiny" style="margin-top:13px">Нажмите на динамик, чтобы услышать произношение. Озвучивание работает офлайн через голоса браузера; слова и переводы доступны без сети.</p>`;
  };

  const COMPREHENSION = {
    1: [
      ["What is a multicore processor?", "An integrated circuit with two or more independent cores connected to improve performance and reduce power consumption."],
      ["What is the heart of each processor?", "The execution engine, also known as the core; it processes instructions and data."],
      ["Why are multicore processors useful?", "They process several tasks at the same time more efficiently, for example in parallel processing and multithreading."],
    ],
    2: [
      ["What does OSI stand for?", "Open System Interconnection."],
      ["When was the OSI model adopted?", "In 1984, by the International Organization for Standardization."],
      ["What is the OSI model used for?", "As a guideline describing how data moves through a network and for troubleshooting network problems."],
    ],
    3: [
      ["What is a search engine?", "A software program that finds websites or web pages and returns results for a user query."],
      ["What does a search engine return?", "Related results according to the user's search query."],
      ["Why do search engines differ?", "Each engine has its own abilities and features."],
    ],
    4: [
      ["What are the four main parts of a virus?", "A misdirection routine, a reproduction routine, a trigger, and a payload."],
      ["What does the trigger do?", "It activates the payload at a particular time or when a particular event happens."],
      ["What can a payload be?", "A harmless joke or something very destructive."],
    ],
    5: [
      ["What is an artificial neural network?", "A type of AI designed to mimic how the human brain processes information."],
      ["What are nodes in an ANN?", "Interconnected neurons that receive input and produce output."],
      ["What is a weight?", "A positive or negative number representing the connection between two units."],
    ],
  };

  const COMPREHENSION_BY_TITLE = {
    "multicore processors": COMPREHENSION[1],
    "the osi model": COMPREHENSION[2],
    "how search engines work": COMPREHENSION[3],
    "the parts of a virus": COMPREHENSION[4],
    "artificial neural networks": COMPREHENSION[5],
  };

  const comprehensionFor = (text) => {
    const title = String(text.title || "").trim().toLowerCase();
    const known = COMPREHENSION_BY_TITLE[title] || COMPREHENSION[text.id];
    if (known) return known;
    const paragraphs = (text.paragraphs || []).filter((p) => String(p || "").trim());
    const first = String(paragraphs[0] || "").split(/(?<=[.!?])\s+/)[0] || "";
    const last = String(paragraphs[paragraphs.length - 1] || "").split(/(?<=[.!?])\s+/)[0] || "";
    return [
      ["What is the main topic of this text?", text.title || "The text is about the topic of this unit."],
      ["What is the main idea of the first paragraph?", first || "Retell the first paragraph in your own words."],
      ["Which detail at the end of the text supports the main idea?", last || "Use the last paragraph to support your answer."],
    ];
  };

  const shadowingHtml = (unit, text) => {
    const id = `${unit.id}:${text.id || text.letter}`;
    const open = Boolean(S.shadowTranscript && S.shadowTranscript[id]);
    const questions = comprehensionFor(text);
    return `<div class="shadowing">
      <div class="shadowing-head">
        <div>
          <div class="eyebrow">Аудирование · shadowing</div>
          <b>Слушайте и повторяйте вслух</b>
          <p>Сначала прослушайте текст в медленном темпе, затем повторяйте фразы за диктором. Транскрипт можно скрыть и проверить понимание на слух.</p>
        </div>
        <div class="shadow-actions">
          <button class="btn btn-sm" type="button" data-action="speak-text" data-unit="${unit.id}" data-letter="${esc(text.letter)}">${I.speaker} Обычный темп</button>
          <button class="btn btn-sm btn-primary" type="button" data-action="speak-text" data-unit="${unit.id}" data-letter="${esc(text.letter)}" data-rate="0.75">${I.headphones} 0.75×</button>
          <button class="btn btn-sm" type="button" data-action="toggle-transcript" data-transcript="${esc(id)}" aria-expanded="${open ? "true" : "false"}" aria-controls="transcript-${esc(id)}">${open ? "Скрыть транскрипт" : "Показать транскрипт"}</button>
        </div>
      </div>
      <div class="shadow-transcript ${open ? "" : "is-hidden"}" id="transcript-${esc(id)}" data-transcript-box="${esc(id)}">
        ${(text.paragraphs || []).map((p) => `<p>${esc(p)}</p>`).join("")}
      </div>
      ${
        questions.length
          ? `<div class="comprehension"><div class="eyebrow">Вопросы на понимание</div><ol>${questions
              .map(
                ([question, answer]) =>
                  `<li><details><summary>${esc(question)}</summary><p>${esc(answer)}</p></details></li>`
              )
              .join("")}</ol><p class="muted tiny">Сначала ответьте вслух, затем откройте подсказку.</p></div>`
          : ""
      }
    </div>`;
  };

  const renderText = (unit) => {
    if (!unit.texts.length) return '<div class="empty"><b>Текст не найден</b>В этом юните нет текста для чтения.</div>';
    return `
      <div class="reader">
        ${unit.texts
          .map(
            (t) => `
          <section class="text-section">
            <div class="text-head">
              <div class="text-badge">${esc(t.letter)}</div>
              <h2>${esc(t.title)}</h2>
              <span class="reading-meta">${IT.readingMinutes([t])} мин чтения · ${(t.paragraphs || []).join(" ").split(/\s+/).filter(Boolean).length} ${IT.plural((t.paragraphs || []).join(" ").split(/\s+/).filter(Boolean).length, "слово", "слова", "слов")}</span>
              <button class="icon-btn" type="button" title="Озвучить текст" data-action="speak-text" data-unit="${unit.id}" data-letter="${esc(t.letter)}">${I.speaker}</button>
            </div>
            <div class="reader-text">${(t.paragraphs || []).map((p) => `<p>${esc(p)}</p>`).join("")}</div>
            ${shadowingHtml(unit, t)}
          </section>`
          )
          .join("")}
        <div class="panel" style="padding:18px;display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap">
          <div><b style="font-size:13px">Как работать с текстом</b><div class="muted tiny" style="margin-top:3px">Прочитайте вслух, выделите главную мысль и перескажите текст в 3–4 предложениях. Затем проверьте понимание в заданиях юнита.</div></div>
          <a class="btn btn-sm" href="#/unit/${unit.id}/tasks">Задания ${I.arrow}</a>
        </div>
      </div>`;
  };

  const taskBody = (unit, task) => {
    return (task.body || [])
      .map((line) => {
        const isRu = /[А-Яа-яЁё]/.test(line) && line.length > 22;
        return `<li class="${isRu ? "ru-line" : ""}">${esc(line)}${isRu ? ` <button class="text-btn" style="font-size:10px;white-space:nowrap" type="button" data-action="ask-ai" data-unit="${unit.id}" data-prompt="Помоги перевести на английский фразу из материала: «${esc(line)}». Объясни лексику и дай естественный вариант.">спросить ИИ</button>` : ""}</li>`;
      })
      .join("");
  };

  const qaParagraphs = (text) =>
    String(text || "")
      .split(/\n{2,}/)
      .filter((p) => p.trim())
      .map((p) => `<p>${esc(p)}</p>`)
      .join("");

  const renderQa = (unit) => {
    const items = unit.qa || [];
    if (!items.length) {
      return '<div class="empty"><b>Вопросов пока нет</b>Для этого юнита экзаменационные вопросы ещё не добавлены.</div>';
    }
    return `
      <section class="qa-hero">
        <div class="qa-hero-copy">
          <div class="eyebrow">Экзамен · Unit ${String(unit.id).padStart(2, "0")}</div>
          <h2 class="section-title">Вопросы и ответы</h2>
          <p class="muted small">Короткие ответы уровня A2–B1 (до 250 символов) строго по учебнику ESSENTIAL ENGLISH FOR EXAMS. Под вопросом — английский ответ и русский перевод.</p>
        </div>
        <div class="qa-hero-stat"><b>${items.length}</b><span>${IT.plural(items.length, "вопрос", "вопроса", "вопросов")}</span></div>
        <nav class="qa-index" aria-label="Вопросы этого юнита">
          ${items.map((q) => `<button class="qa-chip" type="button" data-action="qa-jump" data-target="qa-q-${q.num}" title="Перейти к вопросу ${q.num}">${q.num}</button>`).join("")}
        </nav>
      </section>
      <div class="qa-list">
        ${items
          .map(
            (q) => `
          <article class="qa-card" id="qa-q-${q.num}">
            <div class="qa-num" aria-hidden="true">${String(q.num).padStart(2, "0")}</div>
            <div class="qa-body">
              <h3 class="qa-question">${esc(q.question_en)}</h3>
              ${q.question_ru ? `<p class="qa-question-ru">${esc(q.question_ru)}</p>` : ""}
              <div class="qa-answers">
                <div class="qa-answer qa-answer-en">
                  <div class="qa-label"><span>Answer</span><em>English</em></div>
                  ${qaParagraphs(q.answer_en)}
                </div>
                <div class="qa-answer qa-answer-ru">
                  <div class="qa-label"><span>Перевод</span><em>Русский</em></div>
                  ${qaParagraphs(q.answer_ru)}
                </div>
              </div>
              <div class="qa-actions">
                <button class="btn btn-sm" type="button" data-action="speak" data-lang="en-US" data-text="${esc(q.answer_en)}">${I.speaker} Озвучить ответ</button>
                <button class="btn btn-sm btn-teal" type="button" data-action="ask-ai" data-unit="${unit.id}" data-prompt="Помоги подготовить устный ответ на экзаменационный вопрос: «${esc(q.question_en)}». Дай план из 3–4 пунктов, проверь мой ответ и укажи, каких деталей не хватает.">${I.spark} Разобрать с ИИ</button>
              </div>
            </div>
          </article>`
          )
          .join("")}
      </div>
      <p class="muted tiny" style="margin-top:14px">Ответы составлены по учебнику. Если тема в учебнике не раскрыта, ответ прямо говорит об этом.</p>`;
  };

  const renderTasks = (unit) => {
    if (!unit.tasks.length) return '<div class="empty"><b>Заданий нет</b></div>';
    return `
      <div class="panel" style="padding:18px;margin-bottom:14px;display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap">
        <div>
          <b style="font-size:13px">Задания курса</b>
          <div class="muted tiny" style="margin-top:3px">${unit.tasks.length} ${IT.plural(unit.tasks.length, "задание", "задания", "заданий")}${unit.translation_sentences.length ? ` · ${unit.translation_sentences.length} ${IT.plural(unit.translation_sentences.length, "фраза", "фразы", "фраз")} для перевода` : ""}. Открывайте по одному и выполняйте письменно или с ИИ.</div>
        </div>
        ${unit.translation_sentences.length ? `<a class="btn btn-sm btn-teal" href="#/unit/${unit.id}/practice">${I.spark} Тренажёр перевода</a>` : ""}
      </div>
      <div class="tasks">
        ${unit.tasks
          .map(
            (t, i) => `
          <details class="task-card" ${i === 0 ? "open" : ""}>
            <summary>
              <span class="task-num">${String(t.num).padStart(2, "0")}</span>
              <b>${esc(t.title || "Задание")}</b>
              <span class="chev">${I.chev}</span>
            </summary>
            <div class="task-body">
              <ol>${taskBody(unit, t) || "<li>Задание без текста.</li>"}</ol>
              <div class="task-actions">
                <button class="btn btn-sm" type="button" data-action="ask-ai" data-unit="${unit.id}" data-prompt="Помоги выполнить задание «${esc(t.title)}» из юнита ${unit.id}. Задавай мне наводящие вопросы, не давай готовый ответ сразу.">${I.spark} Разобрать с ИИ</button>
              </div>
            </div>
          </details>`
          )
          .join("")}
      </div>`;
  };

  const renderPracticeTab = (unit) => {
    const st = IT.unitStats(unit.id, unit.vocab.length);
    const cfg = S.practiceConfig || { limit: 10, direction: "ru-en" };
    const hasTranslations = unit.translation_sentences.length > 0;
    return `
      <div class="panel" style="padding:22px;margin-bottom:16px;display:flex;align-items:center;justify-content:space-between;gap:18px;flex-wrap:wrap">
        <div>
          <div class="eyebrow">Практика юнита ${unit.id}</div>
          <h2 class="section-title" style="font-size:28px;margin-top:10px">Закреплено ${st.learned} из ${unit.vocab.length}</h2>
          <p class="muted small" style="margin-top:5px">Карточки и упражнения работают без ИИ. Проверка свободного перевода — с подключённой моделью.</p>
        </div>
        <div class="dial" style="--p:${st.pct}%"><b>${st.pct}%</b></div>
      </div>
      <div class="practice-modes">
        <button class="mode-card" type="button" data-action="start-practice" data-mode="flash" data-unit="${unit.id}">
          <span class="mode-icon">${I.cards}</span>
          <b>Карточки</b>
          <span>Посмотрите слово, вспомните перевод и честно оцените себя. Слабые слова будут возвращаться чаще.</span>
          <span class="mode-go">Начать ${I.arrow}</span>
        </button>
        <button class="mode-card" type="button" data-action="start-practice" data-mode="choice" data-unit="${unit.id}">
          <span class="mode-icon">${I.target}</span>
          <b>Выбор варианта</b>
          <span>Четыре варианта, один правильный. Быстрый способ проверить узнавание лексики.</span>
          <span class="mode-go">Начать ${I.arrow}</span>
        </button>
        <button class="mode-card" type="button" data-action="start-practice" data-mode="typing" data-unit="${unit.id}">
          <span class="mode-icon">${I.text}</span>
          <b>Набор перевода</b>
          <span>Напишите английский термин по русскому переводу. Тренирует активное владение, а не узнавание.</span>
          <span class="mode-go">Начать ${I.arrow}</span>
        </button>
        <button class="mode-card" type="button" data-action="start-practice" data-mode="mixed" data-unit="${unit.id}">
          <span class="mode-icon">${I.layers}</span>
          <b>Смешанная тренировка</b>
          <span>Карточки, выбор и набор в одной сессии. Самый полезный режим для повторения.</span>
          <span class="mode-go">Начать ${I.arrow}</span>
        </button>
        <button class="mode-card" type="button" data-action="start-practice" data-mode="translation" data-unit="${unit.id}" ${hasTranslations ? "" : 'disabled style="opacity:.45"'}>
          <span class="mode-icon">${I.spark}</span>
          <b>Перевод фраз ${hasTranslations ? `<span class="badge accent" style="margin-left:4px">${unit.translation_sentences.length}</span>` : ""}</b>
          <span>${hasTranslations ? "Переведите фразы из заданий курса, сверьтесь с образцом и оцените себя по смыслу и грамматике." : "В этом юните нет фраз для перевода."}</span>
          <span class="mode-go">${hasTranslations ? "Начать" : "Нет фраз"} ${I.arrow}</span>
        </button>
      </div>
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
          <label>Без ИИ</label>
          <span class="muted tiny">Карточки и упражнения доступны всегда</span>
        </div>
      </div>`;
  };

  const renderUnit = () => {
    const unit = S.unit;
    if (!unit) {
      IT.setView('<div class="empty"><b>Юнит не загружен</b><a class="btn" href="#/textbook">К содержанию</a></div>');
      return;
    }
    const st = IT.unitStats(unit.id, unit.vocab.length);
    const tab = S.unitTab || "vocab";
    const tabs = [
      ["vocab", "Словарь", unit.vocab.length],
      ["text", "Текст", unit.texts.length],
      ["tasks", "Задания", unit.tasks.length],
      ["qa", "Вопросы", unit.qa.length],
      ["practice", "Практика", ""],
    ];
    const content =
      tab === "text"
        ? renderText(unit)
        : tab === "tasks"
          ? renderTasks(unit)
          : tab === "qa"
            ? renderQa(unit)
            : tab === "practice"
              ? renderPracticeTab(unit)
              : renderVocab(unit);

    IT.setView(`
      <a class="back-link" href="#/textbook">${I.back} Все юниты</a>
      <header class="unit-hero">
        <div class="unit-hero-top">
          <div>
            <span class="unit-num">UNIT ${String(unit.id).padStart(2, "0")}</span>
            <h1>${esc(unit.title_en)}</h1>
            <div class="ru-title">${esc(unit.title_ru)}</div>
            <div class="unit-hero-meta">
              <span><b>${unit.vocab.length}</b> ${IT.plural(unit.vocab.length, "термин", "термина", "терминов")}</span>
              <span><b>${unit.texts.length}</b> ${IT.plural(unit.texts.length, "текст", "текста", "текстов")}</span>
              <span><b>${unit.tasks.length}</b> ${IT.plural(unit.tasks.length, "задание", "задания", "заданий")}</span>
              <span><b>${unit.translation_sentences.length}</b> ${IT.plural(unit.translation_sentences.length, "фраза", "фразы", "фраз")} для перевода</span>
              <span><b>${unit.qa.length}</b> ${IT.plural(unit.qa.length, "вопрос", "вопроса", "вопросов")} к экзамену</span>
            </div>
          </div>
          <div class="unit-hero-side">
            <div class="progress-dial">
              <div class="dial" style="--p:${st.pct}%"><b>${st.pct}%</b></div>
              <div class="dial-label"><b>${st.learned} / ${unit.vocab.length}</b> закреплено</div>
            </div>
          </div>
        </div>
      </header>
      <nav class="tabs" aria-label="Разделы юнита">
        ${tabs
          .map(
            ([id, label, count]) =>
              `<a class="tab ${tab === id ? "active" : ""}" href="#/unit/${unit.id}/${id}">${label}${count !== "" ? `<span>${count}</span>` : ""}</a>`
          )
          .join("")}
      </nav>
      <div>${content}</div>
      ${unit.id === 15 && IT.finalCheckCallout ? IT.finalCheckCallout() : ""}
    `);
  };

  IT.views = IT.views || {};
  IT.views.unit = renderUnit;
})();
