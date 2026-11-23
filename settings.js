/* IT English Lab — settings, AI connection, embedded models */
(() => {
  "use strict";
  const IT = window.IT;
  const { S, esc, icons: I } = IT;

  const API_PRESETS = [
    { id: "ollama", label: "Ollama", url: "http://127.0.0.1:11434/v1", model: "qwen3.5:4b", note: "локально" },
    { id: "lmstudio", label: "LM Studio", url: "http://127.0.0.1:1234/v1", model: "local-model", note: "локально" },
    { id: "llamacpp", label: "llama.cpp", url: "http://127.0.0.1:8080/v1", model: "local-model", note: "локально" },
    { id: "openai", label: "OpenAI", url: "https://api.openai.com/v1", model: "gpt-4o-mini", note: "ключ" },
    { id: "openrouter", label: "OpenRouter", url: "https://openrouter.ai/api/v1", model: "qwen/qwen3.5-9b", note: "ключ" },
    { id: "deepseek", label: "DeepSeek", url: "https://api.deepseek.com/v1", model: "deepseek-chat", note: "ключ" },
  ];

  const EMBED_PRESETS = [
    {
      id: "qwen35_q4",
      name: "Qwen3.5 4B Instruct · Q4_K_M",
      size: "3.01 ГБ",
      meta: "Быстрая · лучший баланс для 16 ГБ RAM",
      url: "https://huggingface.co/bartowski/Qwen_Qwen3.5-4B-GGUF/resolve/main/Qwen_Qwen3.5-4B-Q4_K_M.gguf",
      recommended: true,
    },
    {
      id: "qwen35_q6",
      name: "Qwen3.5 4B Instruct · Q6_K_L",
      size: "3.96 ГБ",
      meta: "Качество выше · требует больше памяти",
      url: "https://huggingface.co/bartowski/Qwen_Qwen3.5-4B-GGUF/resolve/main/Qwen_Qwen3.5-4B-Q6_K_L.gguf",
    },
  ];

  const fmtBytes = (n) => {
    const num = Number(n) || 0;
    if (num < 1024) return `${num} Б`;
    if (num < 1024 * 1024) return `${(num / 1024).toFixed(1)} КБ`;
    if (num < 1024 * 1024 * 1024) return `${(num / (1024 * 1024)).toFixed(1)} МБ`;
    return `${(num / (1024 * 1024 * 1024)).toFixed(2)} ГБ`;
  };

  const draft = () => S.settingsDraft || S.settings || {};

  const testResultHtml = () => {
    if (!S.testResult) return "";
    const r = S.testResult;
    return `<div class="test-result ${r.ok ? "ok" : "bad"}">${esc(r.message || "")}</div>`;
  };

  const embeddedStatus = () => S.embeddedStatus || (S.settings && S.settings.embedded) || { compiled: false, loaded: false, downloading: false, progress: 0, bytes: 0, total: 0, error: null, path: "" };

  const embeddedSection = () => {
    const d = draft();
    const st = embeddedStatus();
    const compiled = !!st.compiled;
    const loaded = !!st.loaded;
    const downloading = !!st.downloading;
    const progress = Math.max(0, Math.min(100, Number(st.progress) || 0));
    const path = d.embedded_model || st.path || "";
    return `
      <section class="settings-section">
        <div class="settings-section-head">
          <div><h2>Встроенная модель</h2><p>GGUF-файл скачивается в папку данных и работает внутри приложения. Интернет нужен только для загрузки.</p></div>
          <span class="badge ${compiled ? (loaded ? "ok" : "accent") : "warn"}">${compiled ? (loaded ? "Загружена" : "Сборка готова") : "Недоступна"}</span>
        </div>
        <div class="settings-section-body">
          ${compiled ? "" : `<div class="compiled-note">${I.info}<span>Эта сборка собрана без <span class="mono">--features embedded</span>. Для встроенной модели используйте релиз с поддержкой GGUF или соберите проект с этой функцией.</span></div>`}

          <div class="field">
            <label>Путь к GGUF-файлу</label>
            <div class="input-with-btn">
              <input class="input" type="text" data-setting="embedded_model" value="${esc(path)}" placeholder="C:\\Users\\...\\model.gguf">
              <button class="btn btn-sm" type="button" data-action="refresh-embedded">${I.refresh}</button>
            </div>
            <div class="field-help">Можно указать свой файл. Нужна Instruct-модель в формате GGUF с chat template — например, Qwen3.5 4B. Уже скачанный файл можно указать напрямую, копировать его в папку приложения не нужно.</div>
          </div>

          <div class="field-row" style="margin-top:14px">
            <div class="field">
              <label>Контекст, токенов</label>
              <input class="input" type="number" min="512" max="16384" step="256" data-setting="embedded_ctx" value="${Number(d.embedded_ctx || 4096)}">
              <div class="field-help">2048–4096 достаточно для репетитора. Больше контекста — больше памяти.</div>
            </div>
            <div class="field">
              <label>Статус</label>
              <div class="test-result ${st.error ? "bad" : loaded ? "ok" : ""}" style="margin-top:0">
                ${st.error ? esc(st.error) : loaded ? "Модель загружена в память и готова отвечать." : downloading ? "Идёт скачивание…" : "Модель ещё не загружена."}
              </div>
            </div>
          </div>

          <div class="embedded-presets">
            ${EMBED_PRESETS.map(
              (p) => `<button class="embed-preset" type="button" data-action="download-model" data-preset="${p.id}" ${downloading ? "disabled" : ""}>
                <span class="ep-top"><span>${esc(p.name)}</span><span class="ep-size">${esc(p.size)}</span></span>
                <span class="ep-meta">${esc(p.meta)} ${p.recommended ? "· рекомендуется" : ""}</span>
              </button>`
            ).join("")}
          </div>

          ${downloading ? `<div class="download-status">
            <div class="download-status-top"><span>Скачивание модели</span><span>${progress}% · ${fmtBytes(st.bytes)} / ${fmtBytes(st.total)}</span></div>
            <div class="progress"><i style="width:${progress}%"></i></div>
          </div>` : ""}

          <div class="embed-actions">
            <button class="btn btn-sm btn-primary" type="button" data-action="load-model" ${!compiled || loaded || downloading || !path ? "disabled" : ""}>${I.play} Загрузить модель</button>
            <button class="btn btn-sm" type="button" data-action="unload-model" ${!loaded ? "disabled" : ""}>Выгрузить</button>
            <button class="btn btn-sm" type="button" data-action="refresh-embedded">${I.refresh} Обновить статус</button>
          </div>

          <div class="compiled-note" style="margin-top:16px">${I.info}<span>Встроенный режим полностью офлайн после загрузки. Первый ответ может занять 10–60 секунд в зависимости от модели и процессора. Если 4B-модель не помещается в память, используйте API-режим или модель меньшего размера.</span></div>
        </div>
      </section>`;
  };

  const openaiSection = () => {
    const d = draft();
    const hasKey = !!S.settings.has_key;
    return `
      <section class="settings-section">
        <div class="settings-section-head">
          <div><h2>OpenAI-совместимый API</h2><p>Подходит Ollama, LM Studio, llama.cpp, OpenAI, OpenRouter, DeepSeek и другие.</p></div>
          <span class="badge ${IT.aiMode() === "openai" ? "ok" : ""}">${IT.aiMode() === "openai" ? "Выбран" : "Режим API"}</span>
        </div>
        <div class="settings-section-body">
          <div class="field">
            <label>Быстрый пресет</label>
            <div class="preset-row">
              ${API_PRESETS.map((p) => `<button class="preset-chip" type="button" data-action="apply-preset" data-preset="${p.id}">${esc(p.label)} · ${esc(p.note)}</button>`).join("")}
            </div>
          </div>
          <div class="field-row" style="margin-top:14px">
            <div class="field">
              <label>Base URL</label>
              <input class="input" type="text" data-setting="base_url" value="${esc(d.base_url || "")}" placeholder="http://127.0.0.1:11434/v1" spellcheck="false">
              <div class="field-help">Адрес сервера вместе с <span class="mono">/v1</span>. Для Ollama по умолчанию: <span class="mono">http://127.0.0.1:11434/v1</span>.</div>
            </div>
            <div class="field">
              <label>Модель</label>
              <input class="input" type="text" data-setting="model" value="${esc(d.model || "")}" placeholder="qwen3.5:4b" spellcheck="false" list="models-list">
              <datalist id="models-list">${(S.models || []).map((m) => `<option value="${esc(m)}"></option>`).join("")}</datalist>
              <div class="field-help">Точное имя модели на сервере. Список можно получить кнопкой ниже.</div>
            </div>
          </div>
          <div class="field" style="margin-top:14px">
            <label>API-ключ</label>
            <input class="input" type="password" data-setting="api_key" value="" placeholder="${hasKey ? esc(S.settings.key_hint || "Ключ сохранён") : "sk-… (необязательно для локальных серверов)"}" autocomplete="off">
            <div class="field-help">${hasKey ? "Ключ уже сохранён в папке данных. Оставьте поле пустым, чтобы не менять." : "Ключ хранится только на этом компьютере в settings.json."}</div>
            ${hasKey ? `<div style="margin-top:7px"><button class="text-btn" type="button" data-action="clear-key">${d.clear_key ? "Отменить удаление ключа" : "Удалить сохранённый ключ"}</button>${d.clear_key ? ` <span class="badge danger">будет удалён</span>` : ""}</div>` : ""}
          </div>
          <div class="field-row" style="margin-top:14px">
            <div class="field">
              <label>Температура</label>
              <input class="input" type="number" min="0" max="1.5" step="0.1" data-setting="temperature" value="${Number(d.temperature ?? 0.4)}">
              <div class="field-help">0.2–0.5 — точнее и стабильнее, 0.7–1.0 — свободнее.</div>
            </div>
            <div class="field">
              <label>Максимум токенов</label>
              <input class="input" type="number" min="64" max="4096" step="32" data-setting="max_tokens" value="${Number(d.max_tokens ?? 700)}">
              <div class="field-help">700–1200 обычно достаточно для ответа репетитора.</div>
            </div>
          </div>
          <div class="settings-actions">
            <button class="btn btn-primary btn-sm" type="button" data-action="test-ai">${I.chip} Проверить подключение</button>
            <button class="btn btn-sm" type="button" data-action="refresh-models">${I.refresh} Получить список моделей</button>
          </div>
          ${testResultHtml()}
          ${S.models && S.models.length ? `<div class="field" style="margin-top:13px"><label>Модели на сервере</label><div class="preset-row">${S.models.slice(0, 18).map((m) => `<button class="preset-chip" type="button" data-action="apply-model" data-model="${esc(m)}">${esc(m)}</button>`).join("")}</div></div>` : ""}
        </div>
      </section>`;
  };

  const offSection = () => `
    <section class="settings-section">
      <div class="settings-section-head"><div><h2>ИИ выключен</h2><p>Карточки, упражнения, словарь и тексты работают полностью офлайн.</p></div><span class="badge">Без ИИ</span></div>
      <div class="settings-section-body">
        <p class="muted" style="font-size:12.5px;line-height:1.7">В этом режиме недоступны проверка свободного перевода и ИИ-репетитор. Чтобы включить их, выберите API-режим или встроенную модель выше.</p>
      </div>
    </section>`;

  const renderStaticSettings = () => {
    const backups = Array.isArray(S.settings.backups) ? S.settings.backups : [];
    const version = S.progress && S.progress.version ? `v${S.progress.version}` : "v3";
    const installable = document.documentElement.classList.contains("pwa-installable");
    IT.setView(`
      <div class="settings-wrap">
        <section class="static-intro">
          <div class="eyebrow">Настройки · статическая версия</div>
          <h1>Офлайн.<br>Без сервера.</h1>
          <p>Это та же программа, но весь прогресс, проверка ответов и материалы работают прямо в браузере. Ни один запрос не уходит на сервер или в ИИ.</p>
          <div class="static-badge-row">
            <span class="static-badge"><i></i> Работает без сети</span>
            <span class="static-badge teal"><i></i> Данные только на устройстве</span>
            <span class="static-badge muted"><i></i> ИИ отключён</span>
          </div>
        </section>

        <section class="settings-section">
          <div class="settings-section-head">
            <div><h2>ИИ отключён</h2><p>В этой сборке нет подключения к API, локальному серверу или встроенной модели.</p></div>
            <span class="badge">off</span>
          </div>
          <div class="settings-section-body">
            <div class="static-note">${I.info}<span>Все упражнения, экзамены, аудирование и карточки проверяются локальным кодом. Кнопки «объяснить с ИИ» и «проверить перевод с ИИ» скрыты, чтобы не обещать недоступную функцию.</span></div>
            <div class="static-note" style="margin-top:9px">${I.lock}<span>Секретные ключи, история чата и настройки моделей не используются. Старые настройки ИИ, если они были сохранены ранее, не отправляются никуда.</span></div>
          </div>
        </section>

        <section class="settings-section">
          <div class="settings-section-head">
            <div><h2>Данные и прогресс</h2><p>Прогресс хранится в этом браузере и доступен без интернета.</p></div>
            <span class="badge">схема ${esc(version)}</span>
          </div>
          <div class="settings-section-body">
            <div class="static-grid">
              <div class="static-card">
                <span class="static-card-label">Хранилище</span>
                <b>IndexedDB</b>
                <span>${esc(S.settings.data_dir || "Этот браузер")}</span>
              </div>
              <div class="static-card">
                <span class="static-card-label">Слов в прогрессе</span>
                <b>${Object.keys((S.progress && S.progress.words) || {}).length}</b>
                <span>изучено ${Number(S.progress && S.progress.learned) || 0}</span>
              </div>
              <div class="static-card">
                <span class="static-card-label">Резервные копии</span>
                <b>${backups.length} / 5</b>
                <span>снимки внутри браузера</span>
              </div>
            </div>

            <div class="field" style="margin-top:16px">
              <label>Резервное копирование</label>
              <div class="static-actions">
                <button class="btn btn-sm" type="button" data-action="export-progress">${I.download} Экспорт прогресса</button>
                <label class="btn btn-sm" for="static-progress-import-merge">${I.upload} Импорт · объединить</label>
                <input id="static-progress-import-merge" class="visually-hidden" type="file" accept="application/json,.json" data-change="import-progress" data-merge="1">
                <label class="btn btn-sm" for="static-progress-import-replace">Импорт · заменить</label>
                <input id="static-progress-import-replace" class="visually-hidden" type="file" accept="application/json,.json" data-change="import-progress" data-merge="0">
              </div>
              <div class="static-copy">«Объединить» добавляет статистику и историю к текущей, «Заменить» полностью заменяет прогресс. Перед импортом автоматически создаётся снимок. JSON можно перенести на телефон или сохранить в облаке вручную.</div>
            </div>

            <div class="divider" style="margin:18px 0"></div>
            <div class="backup-head">
              <div><b>Снимки в браузере</b><span class="muted tiny">Хранятся последние 5 копий прогресса</span></div>
              <span class="badge">${backups.length} / 5</span>
            </div>
            ${
              backups.length
                ? `<div class="static-backup-list">${backups
                    .slice(0, 5)
                    .map(
                      (name, index) =>
                        `<div class="static-backup-row">
                          <span>${I.lock} ${esc(name)}</span>
                          <span class="static-backup-actions"><em>${index === 0 ? "последняя" : "снимок"}</em><button class="text-btn" type="button" data-action="restore-backup" data-name="${esc(name)}">Восстановить</button></span>
                        </div>`
                    )
                    .join("")}</div>`
                : `<div class="static-empty">Снимок создаётся перед импортом, сбросом или восстановлением прогресса. Пока снимков нет.</div>`
            }

            <div class="divider" style="margin:18px 0"></div>
            <div class="danger-actions">
              <button class="btn btn-sm btn-danger" type="button" data-action="reset-progress">${I.trash} Сбросить весь прогресс</button>
            </div>
            <div class="static-copy">Сброс удалит статистику слов, серии, историю ответов и экзаменов. Перед сбросом создаётся резервная копия. Очистка данных сайта в браузере удаляет и прогресс, и снимки — для этого существует экспорт JSON.</div>
          </div>
        </section>

        <section class="settings-section">
          <div class="settings-section-head">
            <div><h2>Приложение</h2><p>Добавьте IT English Lab на главный экран или рабочий стол.</p></div>
            <span class="badge ${installable ? "ok" : ""}">${installable ? "Можно установить" : "PWA"}</span>
          </div>
          <div class="settings-section-body">
            <div class="pwa-install-row">
              <div class="compiled-note" style="margin:0">${I.info}<span>После первого онлайн-запуска service worker сохраняет интерфейс, словари и аудио. Дальше приложение открывается без сети; прогресс остаётся в браузере.</span></div>
              <button class="btn btn-primary btn-sm" type="button" data-action="install-pwa">${I.download} Установить приложение</button>
            </div>
            <div class="static-copy" style="margin-top:9px">Для микрофона в разделе «Речь» нужен HTTPS. На GitHub Pages он включён автоматически; при локальной проверке используйте <span class="mono">localhost</span>.</div>
          </div>
        </section>

        <div class="muted tiny" style="text-align:center;padding:16px 0 8px">IT English Lab · статическая PWA · данные не покидают это устройство</div>
      </div>`);
  };

  const renderSettings = () => {
    if (S.settings && S.settings.static_mode) {
      renderStaticSettings();
      return;
    }
    const d = draft();
    const mode = d.mode || "off";
    IT.setView(`
      <div class="settings-wrap">
        <div class="page-head">
          <div class="left">
            <div class="eyebrow">Настройки</div>
            <h1 class="display" style="font-size:clamp(38px,4.7vw,58px);margin-top:14px">Подключение</h1>
            <p class="lead" style="margin-top:10px">Приложение работает офлайн. ИИ — опция: подключите локальный сервер, API-ключ или скачайте встроенную модель.</p>
          </div>
          <button class="btn btn-primary" type="button" data-action="save-settings">${I.check} Сохранить</button>
        </div>

        <section class="settings-section">
          <div class="settings-section-head"><div><h2>Режим ИИ</h2><p>Можно менять в любой момент. Прогресс и настройки сохраняются локально.</p></div></div>
          <div class="settings-section-body">
            <div class="mode-options">
              <button class="mode-option ${mode === "off" ? "active" : ""}" type="button" data-action="set-mode" data-mode="off">
                <span class="mo-check"></span>
                <span class="mo-top"><span class="mo-icon">${I.lock}</span>Без ИИ</span>
                <span class="mo-desc">Карточки, упражнения, словарь. Полностью офлайн.</span>
              </button>
              <button class="mode-option ${mode === "openai" ? "active" : ""}" type="button" data-action="set-mode" data-mode="openai">
                <span class="mo-check"></span>
                <span class="mo-top"><span class="mo-icon">${I.key}</span>API-ключ / сервер</span>
                <span class="mo-desc">Ollama, LM Studio, OpenAI, OpenRouter. Нужен интернет или локальный сервер.</span>
              </button>
              <button class="mode-option ${mode === "embedded" ? "active" : ""}" type="button" data-action="set-mode" data-mode="embedded">
                <span class="mo-check"></span>
                <span class="mo-top"><span class="mo-icon">${I.chip}</span>Встроенная модель</span>
                <span class="mo-desc">GGUF-модель работает в процессе приложения. Офлайн после загрузки.</span>
              </button>
            </div>
          </div>
        </section>

        ${mode === "off" ? offSection() : ""}
        ${mode === "openai" ? openaiSection() : ""}
        ${mode === "embedded" ? `<div id="embedded-panel">${embeddedSection()}</div>` : ""}

        <section class="settings-section">
          <div class="settings-section-head"><div><h2>Поведение репетитора</h2><p>Необязательные пожелания, которые добавляются к системной инструкции.</p></div></div>
          <div class="settings-section-body">
            <div class="field">
              <label>Дополнительные пожелания</label>
              <textarea class="textarea" data-setting="system_extra" placeholder="Например: отвечай короче, больше примеров на английском, исправляй все ошибки…">${esc(d.system_extra || "")}</textarea>
              <div class="field-help">Не храните здесь секреты. Текст уходит модели вместе с запросом.</div>
            </div>
            <div class="settings-actions">
              <button class="btn btn-primary btn-sm" type="button" data-action="save-settings">${I.check} Сохранить настройки</button>
            </div>
          </div>
        </section>

        <section class="settings-section">
          <div class="settings-section-head"><div><h2>Данные и прогресс</h2><p>Всё хранится локально в папке данных приложения.</p></div><span class="badge">${S.progress.version ? `схема v${S.progress.version}` : "локально"}</span></div>
          <div class="settings-section-body">
            <div class="field">
              <label>Папка данных</label>
              <div class="data-path">${esc(S.settings.data_dir || "")}</div>
              <div class="settings-actions" style="margin-top:9px">
                <button class="btn btn-sm" type="button" data-action="copy-data-dir">${I.upload} Скопировать путь</button>
                <button class="btn btn-sm" type="button" data-action="export-progress">${I.download} Экспорт прогресса</button>
                <label class="btn btn-sm" for="progress-import-merge">${I.upload} Импорт · объединить</label>
                <input id="progress-import-merge" class="visually-hidden" type="file" accept="application/json,.json" data-change="import-progress" data-merge="1">
                <label class="btn btn-sm" for="progress-import-replace">Импорт · заменить</label>
                <input id="progress-import-replace" class="visually-hidden" type="file" accept="application/json,.json" data-change="import-progress" data-merge="0">
              </div>
              <div class="field-help" style="margin-top:7px">«Объединить» добавляет статистику и историю к текущей, «Заменить» полностью заменяет прогресс данными из файла. Перед импортом автоматически создаётся резервная копия. Секретный ключ ИИ не импортируется.</div>
            </div>

            <div class="divider" style="margin:18px 0"></div>
            <div class="backup-head">
              <div><b>Резервные копии</b><span class="muted tiny">Хранятся 5 последних снимков progress.json</span></div>
              <span class="badge">${(S.settings.backups || []).length} / 5</span>
            </div>
            ${
              (S.settings.backups || []).length
                ? `<div class="backup-list">${S.settings.backups
                    .slice(0, 5)
                    .map(
                      (name, index) =>
                        `<div class="backup-row">
                          <span>${I.lock} ${esc(name)}</span>
                          <span class="backup-actions"><em>${index === 0 ? "последняя" : "снимок"}</em><button class="text-btn" type="button" data-action="restore-backup" data-name="${esc(name)}">Восстановить</button></span>
                        </div>`
                    )
                    .join("")}</div>
                   <p class="field-help">Файлы лежат в подпапке <span class="mono">backups</span>. При повреждении прогресса приложение автоматически отложит испорченный файл и запустится с пустыми данными; снимок можно восстановить вручную кнопкой «Восстановить».</p>`
                : `<div class="backup-empty">Снимки создаются при запуске с сохранённым прогрессом, раз в день и перед импортом, сбросом или восстановлением.</div>`
            }

            <div class="divider" style="margin:18px 0"></div>
            <div class="danger-actions">
              <button class="btn btn-sm btn-danger" type="button" data-action="reset-progress">${I.trash} Сбросить весь прогресс</button>
            </div>
            <div class="field-help" style="margin-top:8px">Сброс удалит статистику слов, серии, историю ответов и историю экзаменов. Перед сбросом создаётся резервная копия. Настройки ИИ останутся.</div>
          </div>
        </section>

        <section class="settings-section">
          <div class="settings-section-head">
            <div><h2>Приложение</h2><p>Установите IT English Lab как отдельное окно с иконкой на рабочем столе или телефоне.</p></div>
            <span class="badge ${document.documentElement.classList.contains("pwa-installable") ? "ok" : ""}">${document.documentElement.classList.contains("pwa-installable") ? "Можно установить" : "PWA"}</span>
          </div>
          <div class="settings-section-body">
            <div class="pwa-install-row">
              <div class="compiled-note" style="margin:0">${I.info}<span>Приложение кэширует интерфейс и запускается в отдельном окне. Данные и API всегда остаются на этом устройстве.</span></div>
              <button class="btn btn-primary btn-sm" type="button" data-action="install-pwa">${I.download} Установить приложение</button>
            </div>
          </div>
        </section>

        <section class="settings-section">
          <div class="settings-section-head">
            <div><h2>Мобильный доступ</h2><p>Откройте тренажёр на телефоне в той же Wi-Fi сети.</p></div>
            <span class="badge ${S.settings.lan_enabled ? "ok" : "warn"}">${S.settings.lan_enabled ? "LAN включён" : "Только этот ПК"}</span>
          </div>
          <div class="settings-section-body">
            ${S.settings.lan_enabled && S.settings.lan_url
              ? `<div class="lan-url-card"><div><span>Адрес для телефона</span><b>${esc(S.settings.lan_url)}</b></div><button class="btn btn-sm" type="button" data-action="copy-lan-url">${I.upload} Скопировать</button></div>
                 <p class="field-help">Сервер слушает локальную сеть. Любое устройство в этой сети сможет открыть приложение и увидеть прогресс. Не используйте в общедоступных сетях.</p>`
              : `<div class="compiled-note">${I.info}<span>Сейчас сервер доступен только на этом компьютере. Закройте приложение и запустите его с флагом <span class="mono">--lan</span>, например: <span class="mono">it-english-lab.exe --lan</span>. В консоли появится адрес для телефона.</span></div>`}
          </div>
        </section>

        <div class="muted tiny" style="text-align:center;padding:16px 0 8px">IT English Lab · локальное приложение · данные не отправляются никуда, кроме выбранной вами модели</div>
      </div>`);
    if (mode === "embedded") loadEmbeddedStatus();
  };

  const loadEmbeddedStatus = async () => {
    try {
      const wasDownloading = !!(S.embeddedStatus && S.embeddedStatus.downloading);
      const st = await IT.api("/api/embedded/status");
      S.embeddedStatus = st;
      if (st && st.path) {
        if (S.settingsDraft && !S.settingsDraft.embedded_model) S.settingsDraft.embedded_model = st.path;
        if (S.settings) S.settings.embedded_model = st.path;
      }
      const panel = IT.$("#embedded-panel");
      if (panel) {
        const active = document.activeElement;
        const editing = active && panel.contains(active) && /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName);
        const finished = wasDownloading && !st.downloading;
        if (!editing || finished) panel.innerHTML = embeddedSection();
      } else {
        const old = document.querySelector(".settings-wrap");
        if (old && draft().mode === "embedded") {
          const sections = old.querySelectorAll(".settings-section");
          const last = sections[sections.length - 1];
          if (last) last.insertAdjacentHTML("beforebegin", `<div id="embedded-panel">${embeddedSection()}</div>`);
        }
      }
      if (st && st.downloading) setTimeout(loadEmbeddedStatus, 1400);
    } catch (e) {
      console.warn("embedded status", e);
    }
  };

  const updateEmbeddedPanel = () => {
    const panel = IT.$("#embedded-panel");
    if (panel) panel.innerHTML = embeddedSection();
  };

  const save = async (silent = false) => {
    const d = draft();
    const payload = {
      mode: d.mode || "off",
      base_url: d.base_url || "",
      model: d.model || "",
      temperature: Number(d.temperature ?? 0.4),
      max_tokens: Number(d.max_tokens ?? 700),
      embedded_model: d.embedded_model || "",
      embedded_ctx: Number(d.embedded_ctx ?? 4096),
      system_extra: d.system_extra || "",
    };
    if ((d.api_key || "").trim()) payload.api_key = d.api_key.trim();
    if (d.clear_key) payload.clear_key = true;
    try {
      const res = await IT.api("/api/settings", { method: "POST", body: payload });
      S.settings = res;
      S.testResult = null;
      S.models = [];
      IT.initSettingsDraft();
      IT.hydrateSidebar();
      if (!silent) {
        IT.toast("Настройки сохранены");
        renderSettings();
      }
      return true;
    } catch (e) {
      IT.toast(e.message, "error");
      return false;
    }
  };

  const setMode = (mode) => {
    if (!S.settingsDraft) IT.initSettingsDraft();
    S.settingsDraft.mode = mode;
    S.testResult = null;
    renderSettings();
  };

  const applyPreset = (id) => {
    const p = API_PRESETS.find((x) => x.id === id);
    if (!p) return;
    if (!S.settingsDraft) IT.initSettingsDraft();
    S.settingsDraft.base_url = p.url;
    S.settingsDraft.model = p.model;
    IT.toast(`Пресет: ${p.label}`);
    renderSettings();
  };

  const applyModel = (model) => {
    if (!S.settingsDraft) IT.initSettingsDraft();
    S.settingsDraft.model = model;
    renderSettings();
  };

  const clearKey = () => {
    if (!S.settingsDraft) IT.initSettingsDraft();
    S.settingsDraft.clear_key = !S.settingsDraft.clear_key;
    S.settingsDraft.api_key = "";
    renderSettings();
  };

  const test = async () => {
    const ok = await save(true);
    if (!ok) return;
    const mode = IT.aiMode();
    if (mode === "off") {
      S.testResult = { ok: false, message: "ИИ выключен. Выберите режим API или встроенной модели." };
      renderSettings();
      return;
    }
    S.testResult = { ok: true, message: "Проверяю подключение…" };
    renderSettings();
    if (mode === "embedded") {
      const st = embeddedStatus();
      if (!st.loaded) {
        S.testResult = { ok: false, message: "Модель ещё не загружена. Нажмите «Загрузить модель»." };
      } else {
        try {
          const res = await IT.api("/api/ai/chat", {
            method: "POST",
            body: { unit_id: null, messages: [{ role: "user", content: "Ответь одним словом: OK" }] },
          });
          S.testResult = { ok: true, message: `Модель ответила: ${String(res.reply || "").slice(0, 120)}` };
        } catch (e) {
          S.testResult = { ok: false, message: e.message };
        }
      }
      renderSettings();
      return;
    }
    try {
      const res = await IT.api("/api/ai/test", { method: "POST", body: {} });
      S.testResult = { ok: !!res.ok, message: res.message || "" };
      if (res.models && res.models.length) S.models = res.models;
    } catch (e) {
      S.testResult = { ok: false, message: e.message };
    }
    renderSettings();
  };

  const refreshModels = async () => {
    const ok = await save(true);
    if (!ok) return;
    try {
      const res = await IT.api("/api/ai/models");
      S.models = res.models || [];
      S.testResult = { ok: true, message: S.models.length ? `Найдено моделей: ${S.models.length}.` : "Сервер не вернул список моделей." };
    } catch (e) {
      S.testResult = { ok: false, message: e.message };
    }
    renderSettings();
  };

  const downloadModel = async (preset) => {
    if (!preset) return;
    if (!S.settingsDraft) IT.initSettingsDraft();
    S.settingsDraft.mode = "embedded";
    if (!(await save(true))) return;
    try {
      const res = await IT.api("/api/embedded/download", { method: "POST", body: { preset } });
      IT.toast((res && res.message) || "Скачивание началось");
      if (res && res.path) S.settingsDraft.embedded_model = res.path;
      S.embeddedStatus = { ...(S.embeddedStatus || {}), compiled: true, downloading: true, progress: 0, error: null };
      updateEmbeddedPanel();
      loadEmbeddedStatus();
    } catch (e) {
      IT.toast(e.message, "error");
    }
  };

  const loadModel = async () => {
    let d = draft();
    if (!d.embedded_model) {
      IT.toast("Укажите путь к GGUF-файлу", "error");
      return;
    }
    if (!(await save(true))) return;
    d = draft();
    try {
      const res = await IT.api("/api/embedded/load", { method: "POST", body: { path: d.embedded_model } });
      IT.toast((res && res.message) || "Модель загружена");
      loadEmbeddedStatus();
    } catch (e) {
      IT.toast(e.message, "error");
    }
  };

  const unloadModel = async () => {
    try {
      await IT.api("/api/embedded/unload", { method: "POST", body: {} });
      IT.toast("Модель выгружена");
      loadEmbeddedStatus();
    } catch (e) {
      IT.toast(e.message, "error");
    }
  };

  const reloadSettings = async () => {
    try {
      S.settings = await IT.api("/api/settings");
    } catch (_) {
      /* данные уже изменены; интерфейс покажет прежний снимок настроек */
    }
    renderSettings();
  };

  const restoreBackup = (name) => {
    if (!name) return;
    IT.confirm({
      title: "Восстановить резервную копию?",
      text: `Текущий прогресс будет заменён снимком ${name}. Перед восстановлением создаётся ещё одна резервная копия текущего состояния.`,
      label: "Восстановить",
      onConfirm: async () => {
        try {
          const res = await IT.api("/api/progress/restore", {
            method: "POST",
            body: { name },
          });
          IT.applyProgress((res && res.progress) || {});
          IT.toast("Прогресс восстановлен из резервной копии");
          await reloadSettings();
        } catch (e) {
          IT.toast(e.message || "Не удалось восстановить прогресс", "error");
        }
      },
    });
  };

  const resetProgress = () => {
    IT.confirm({
      title: "Сбросить прогресс?",
      text: "Удалятся все отметки слов, статистика ответов, серия дней и история экзаменов. Перед сбросом будет создана резервная копия. Это действие нельзя отменить.",
      label: "Сбросить",
      danger: true,
      onConfirm: async () => {
        try {
          await IT.api("/api/progress/reset", { method: "POST", body: {} });
          const p = await IT.api("/api/progress");
          IT.applyProgress(p);
          IT.toast("Прогресс сброшен");
          await reloadSettings();
        } catch (e) {
          IT.toast(e.message, "error");
        }
      },
    });
  };

  const importProgress = async (file, merge = true) => {
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      const progress = data && data.progress ? data.progress : data;
      if (!progress || typeof progress !== "object") throw new Error("В файле нет объекта progress");
      const res = await IT.api("/api/progress/import", {
        method: "POST",
        body: { progress, merge: Boolean(merge) },
      });
      IT.applyProgress((res && res.progress) || progress);
      IT.toast(merge ? "Прогресс объединён с текущим" : "Прогресс заменён данными из файла");
      await reloadSettings();
    } catch (e) {
      IT.toast(e.message || "Не удалось импортировать прогресс", "error");
    }
  };

  const copyLanUrl = async () => {
    const url = S.settings && S.settings.lan_url;
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      IT.toast("Адрес скопирован");
    } catch (_) {
      IT.toast(url);
    }
  };

  const exportProgress = () => {
    const data = {
      app: "IT English Lab",
      exported_at: new Date().toISOString(),
      progress: S.progress,
      settings: { ...S.settings, api_key: undefined },
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "it-english-progress.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    IT.toast("Файл прогресса сохранён");
  };

  IT.views = IT.views || {};
  IT.views.settings = renderSettings;
  IT.settingsActions = {
    save,
    setMode,
    applyPreset,
    applyModel,
    clearKey,
    test,
    refreshModels,
    downloadModel,
    loadModel,
    unloadModel,
    resetProgress,
    restoreBackup,
    exportProgress,
    importProgress,
    copyLanUrl,
    loadEmbeddedStatus,
  };
})();
