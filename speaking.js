/* IT English Lab — offline speaking practice: shadowing, questions and local recordings */
(() => {
  "use strict";
  const IT = window.IT;
  const { S, esc, icons: I } = IT;
  IT.views = IT.views || {};

  const state = {
    data: null,
    error: "",
    filter: "all",
    unit: "all",
    index: 0,
    audioUrl: "",
    recording: false,
    starting: false,
    seconds: 0,
    busy: false,
  };

  let mediaRecorder = null;
  let mediaStream = null;
  let chunks = [];
  let recordTimer = null;
  let startedAt = 0;
  let discardNext = false;

  const secureContext = () => window.isSecureContext !== false;
  const micAvailable = () =>
    secureContext() &&
    Boolean(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
  const micStatus = () => {
    if (!secureContext()) return "для записи нужен HTTPS";
    if (!micAvailable()) return "микрофон недоступен";
    return "микрофон доступен";
  };

  const ttsSupported = () => Boolean(IT.tts && IT.tts.supported());
  const ttsVoices = () => (IT.tts ? IT.tts.englishVoices() : []);
  const ttsLang = (voice) => String((voice && voice.lang) || "").replace("_", "-");
  const ttsSelected = () => (IT.tts ? IT.tts.selectedVoice() : null);
  const ttsStored = () => (IT.tts ? IT.tts.storedVoiceKey() : "");
  const ttsHasUS = () => ttsVoices().some((voice) => ttsLang(voice).toLowerCase() === "en-us");
  const ttsHasLocal = () => ttsVoices().some((voice) => voice.localService);
  const voiceBadge = () => {
    if (!ttsSupported()) return { cls: "danger", text: "TTS нет" };
    if (!ttsVoices().length) return { cls: "warn", text: "Нет голосов" };
    if (!ttsHasUS()) return { cls: "warn", text: "Без en-US" };
    return { cls: "ok", text: "en-US" };
  };
  const voiceStatus = () => {
    if (!ttsSupported()) return "TTS недоступен";
    const voices = ttsVoices();
    if (!voices.length) return "Английские голоса не найдены";
    const selected = ttsSelected();
    if (ttsStored() && !selected) return "Сохранённый голос недоступен — авто";
    if (selected) return `${selected.name} · ${ttsLang(selected)}${selected.localService ? " · локальный" : " · онлайн"}`;
    return ttsHasUS() ? "Авто · en-US" : `Авто · ${voices.length} английских голосов`;
  };
  const voiceOptions = () => {
    const selected = ttsSelected();
    const key = selected && IT.tts ? IT.tts.voiceKey(selected) : "";
    const options = [
      `<option value="" ${key ? "" : "selected"}>Авто · голос браузера</option>`,
    ];
    for (const voice of ttsVoices()) {
      const voiceId = IT.tts.voiceKey(voice);
      options.push(
        `<option value="${esc(voiceId)}" ${voiceId === key ? "selected" : ""}>${esc(voice.name)} · ${esc(ttsLang(voice))}${voice.localService ? " · локальный" : ""}</option>`
      );
    }
    return options.join("");
  };
  const ttsNotice = () => {
    if (!ttsSupported()) {
      return `<div class="speaking-tts-note">${I.info}<span>TTS недоступен в этом браузере. Слушайте локальные WAV в <a href="#/audio">аудио-библиотеке</a>.</span></div>`;
    }
    if (!ttsVoices().length) {
      return `<div class="speaking-tts-note">${I.info}<span>Браузер не сообщил английские голоса. Образец может звучать голосом по умолчанию; локальные WAV — в <a href="#/audio">аудио-библиотеке</a>.</span></div>`;
    }
    if (!ttsHasUS()) {
      return `<div class="speaking-tts-note">${I.info}<span>Голос <span class="mono">en-US</span> не найден; выберите доступный английский голос. Локальные WAV — в <a href="#/audio">аудио-библиотеке</a>.</span></div>`;
    }
    if (!ttsHasLocal()) {
      return `<div class="speaking-tts-note">${I.info}<span>Среди английских голосов нет локальных: синтез может требовать сеть. Локальные WAV — в <a href="#/audio">аудио-библиотеке</a>.</span></div>`;
    }
    return "";
  };
  const voiceBlock = () => {
    const badge = voiceBadge();
    return `<section class="speaking-voice-bar">
      <div class="speaking-voice-head">
        <div><span class="eyebrow">ГОЛОС ОБРАЗЦА</span><b>Озвучивание и проверка</b></div>
        <span class="badge ${badge.cls}">${esc(badge.text)}</span>
      </div>
      <div class="speaking-voice-controls">
        <label class="speaking-voice">Голос
          <select class="input" data-change="speaking-voice" aria-label="Голос для образца" ${ttsSupported() ? "" : "disabled"}>${voiceOptions()}</select>
        </label>
        <button class="btn btn-sm" type="button" data-action="speaking-voice-test" ${ttsSupported() ? "" : "disabled"}>${I.speaker} Проверить</button>
        <span class="speaking-voice-status" role="status" aria-live="polite">${esc(voiceStatus())}</span>
      </div>
      <p class="speaking-voice-hint">Выбор голоса сохраняется в этом браузере и применяется к текстам и заданиям. Голоса с пометкой «локальный» работают без сети.</p>
      ${ttsNotice()}
    </section>`;
  };

  const kindLabel = (kind) => (kind === "question" ? "Вопрос" : "Фраза");
  const fmtTime = (seconds) => {
    const value = Math.max(0, Number(seconds) || 0);
    return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
  };

  const filtered = () => {
    const prompts = (state.data && state.data.prompts) || [];
    return prompts.filter((prompt) => {
      const kindOk = state.filter === "all" || prompt.kind === state.filter;
      const unitOk = state.unit === "all" || Number(prompt.unit_id) === Number(state.unit);
      return kindOk && unitOk;
    });
  };

  const current = () => {
    const list = filtered();
    if (!list.length) return null;
    state.index = ((state.index % list.length) + list.length) % list.length;
    return list[state.index];
  };

  const firstOpenIndex = () => {
    const list = filtered();
    const index = list.findIndex((prompt) => !prompt.done);
    return index >= 0 ? index : 0;
  };

  const setData = (data, chooseOpen = false) => {
    state.data = data || { prompts: [] };
    S.progress.speaking_done = state.data.done || [];
    S.progress.speaking_attempts = Number(state.data.attempts) || 0;
    S.progress.speaking_last_at = Number(state.data.last_at) || 0;
    const list = filtered();
    if (!list.length) state.index = 0;
    else if (chooseOpen) state.index = firstOpenIndex();
    else if (state.index >= list.length) state.index = 0;
  };

  const clearAudio = () => {
    if (state.audioUrl) URL.revokeObjectURL(state.audioUrl);
    state.audioUrl = "";
  };

  const stopStream = () => {
    if (mediaStream) {
      mediaStream.getTracks().forEach((track) => track.stop());
      mediaStream = null;
    }
  };

  const stopTimer = () => {
    if (recordTimer) clearInterval(recordTimer);
    recordTimer = null;
  };

  const cleanupRecording = () => {
    stopTimer();
    stopStream();
    mediaRecorder = null;
    chunks = [];
    state.recording = false;
    state.seconds = 0;
    state.starting = false;
  };

  const statusText = () => {
    if (state.recording) return `Идёт запись · ${fmtTime(state.seconds)}`;
    if (state.audioUrl) return "Запись готова — прослушайте себя";
    if (!secureContext()) return "Для записи откройте приложение по HTTPS (Tailscale Serve)";
    if (!micAvailable()) return "Микрофон недоступен в этом браузере";
    return "Готово к записи";
  };

  const updateStatus = () => {
    const el = IT.$("[data-speaking-status]");
    if (el) el.textContent = statusText();
  };

  const onRecorderStop = () => {
    const recorder = mediaRecorder;
    const shouldDiscard = discardNext;
    const recorded = recorder && chunks.length ? new Blob(chunks, { type: recorder.mimeType || "audio/webm" }) : null;
    cleanupRecording();
    discardNext = false;
    if (!shouldDiscard && recorded && recorded.size) {
      clearAudio();
      state.audioUrl = URL.createObjectURL(recorded);
      IT.toast("Запись готова — прослушайте себя");
    }
    if (location.hash.startsWith("#/speaking")) render();
  };

  const stopRecording = (discard = false) => {
    if (!mediaRecorder) {
      cleanupRecording();
      return;
    }
    discardNext = discard;
    try {
      mediaRecorder.stop();
    } catch (_) {
      cleanupRecording();
      discardNext = false;
    }
  };

  const startRecording = async () => {
    if (state.starting || state.recording) return;
    if (!secureContext()) {
      IT.toast("Для записи нужен HTTPS: откройте адрес Tailscale Serve", "error");
      render();
      return;
    }
    if (!micAvailable()) {
      IT.toast("Микрофон недоступен: нужен браузер с поддержкой записи", "error");
      render();
      return;
    }
    IT.speakStop();
    state.starting = true;
    state.seconds = 0;
    updateStatus();
    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!location.hash.startsWith("#/speaking")) {
        stopStream();
        cleanupRecording();
        return;
      }
      chunks = [];
      discardNext = false;
      const recorder = new MediaRecorder(mediaStream);
      mediaRecorder = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size) chunks.push(event.data);
      };
      recorder.onstop = onRecorderStop;
      recorder.onerror = () => {
        IT.toast("Ошибка записи. Проверьте доступ к микрофону.", "error");
        stopRecording(true);
      };
      recorder.start();
      state.recording = true;
      state.starting = false;
      startedAt = Date.now();
      recordTimer = setInterval(() => {
        state.seconds = Math.min(120, Math.floor((Date.now() - startedAt) / 1000));
        updateStatus();
        if (state.seconds >= 120) stopRecording(false);
      }, 500);
      if (location.hash.startsWith("#/speaking")) render();
    } catch (e) {
      cleanupRecording();
      IT.toast("Не удалось включить микрофон. Разрешите доступ в браузере.", "error");
      if (location.hash.startsWith("#/speaking")) render();
    }
  };

  const stopSpeakingAudio = () => {
    IT.speakStop();
    stopRecording(true);
    clearAudio();
  };
  IT.stopSpeakingAudio = stopSpeakingAudio;

  const setFilter = (filter) => {
    stopSpeakingAudio();
    state.filter = ["all", "sentence", "question"].includes(filter) ? filter : "all";
    state.index = firstOpenIndex();
    render();
  };

  const setUnit = (unit) => {
    stopSpeakingAudio();
    state.unit = unit || "all";
    state.index = firstOpenIndex();
    render();
  };

  const resetFilters = () => {
    stopSpeakingAudio();
    state.filter = "all";
    state.unit = "all";
    state.index = firstOpenIndex();
    render();
  };

  const next = () => {
    const list = filtered();
    if (!list.length) return;
    stopSpeakingAudio();
    state.index = (state.index + 1) % list.length;
    render();
  };

  const listen = (rate) => {
    const prompt = current();
    if (prompt) IT.speak(prompt.text, "en-US", Number(rate) || undefined);
  };

  const listenRepeat = () => {
    const prompt = current();
    if (prompt) IT.speakRepeat(prompt.text, "en-US", 0.82, 2, 650);
  };

  const testVoice = () => {
    if (state.recording) {
      IT.toast("Сначала остановите запись");
      return;
    }
    IT.speak("This is your speaking voice. Listen and repeat.", "en-US", 0.82);
  };

  const setVoice = (voiceURI) => {
    if (!IT.tts || !IT.tts.setVoice(voiceURI)) {
      IT.toast("Не удалось сохранить выбор голоса", "error");
    }
    render();
  };

  const attempt = async (completed) => {
    const prompt = current();
    if (!prompt || state.busy) return false;
    if (state.recording) {
      IT.toast("Сначала остановите запись");
      return false;
    }
    state.busy = true;
    try {
      const res = await IT.api("/api/speaking/attempt", {
        method: "POST",
        body: { id: prompt.id, completed: Boolean(completed) },
      });
      if (res.speaking) setData(res.speaking);
      if (completed) {
        clearAudio();
        const list = filtered();
        const open = list.findIndex((item) => !item.done);
        state.index = open >= 0 ? open : (state.index + 1) % Math.max(1, list.length);
        IT.toast("Фраза отмечена — продолжайте");
      } else {
        IT.toast("Попытка сохранена");
      }
      return true;
    } catch (e) {
      IT.toast(e.message, "error");
      return false;
    } finally {
      state.busy = false;
      if (location.hash.startsWith("#/speaking")) render();
    }
  };

  const retry = async () => {
    const ok = await attempt(false);
    if (ok && location.hash.startsWith("#/speaking")) {
      clearAudio();
      startRecording();
    }
  };

  const unitOptions = () => {
    const prompts = (state.data && state.data.prompts) || [];
    const units = new Map();
    for (const prompt of prompts) {
      if (!units.has(prompt.unit_id)) {
        units.set(prompt.unit_id, prompt.unit_title_ru || prompt.unit_title_en || `Юнит ${prompt.unit_id}`);
      }
    }
    return [...units.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(
        ([id, title]) =>
          `<option value="${id}" ${String(state.unit) === String(id) ? "selected" : ""}>${id}. ${esc(title)}</option>`
      )
      .join("");
  };

  const statsBlock = (data) => {
    const total = Number(data.total) || 0;
    const completed = Number(data.completed) || 0;
    const attempts = Number(data.attempts) || 0;
    const pct = total ? Math.round((completed / total) * 100) : 0;
    return `<section class="study-counters speaking-counters">
      <article class="metric-card">
        <span class="metric-label">В базе</span>
        <b>${total}</b>
        <small>${Number(data.sentences) || 0} фраз · ${Number(data.questions) || 0} вопросов</small>
      </article>
      <article class="metric-card">
        <span class="metric-label">Отработано</span>
        <b>${completed}</b>
        <div class="progress"><i style="width:${pct}%"></i></div>
        <small>${pct}% всей базы</small>
      </article>
      <article class="metric-card">
        <span class="metric-label">Попыток</span>
        <b>${attempts}</b>
        <small>${esc(micStatus())}</small>
      </article>
    </section>`;
  };

  const promptCard = (prompt, data) => {
    const list = filtered();
    const done = Boolean(prompt.done);
    const canSpeak = ttsSupported();
    const hint = canSpeak
      ? prompt.kind === "question"
        ? "Сначала ответьте вслух, затем отметьте попытку."
        : "Слушайте образец, повторяйте вслух и запишите себя."
      : "TTS недоступен: слушайте локальные WAV в аудио-библиотеке.";
    const sourceHref =
      prompt.kind === "sentence" && prompt.text_letter
        ? `#/unit/${prompt.unit_id}/text`
        : `#/unit/${prompt.unit_id}/tasks`;
    return `<section class="panel speaking-card" data-prompt-id="${esc(prompt.id)}">
      <div class="speaking-card-head">
        <div>
          <span class="eyebrow">${prompt.kind === "question" ? "ANSWER THE QUESTION" : "SHADOWING"} · ${esc(prompt.unit_title_en)}</span>
          <h2>${esc(prompt.text)}</h2>
          <p class="speaking-context">${esc(prompt.context || "")} · ${esc(prompt.unit_title_ru || "")}${done ? ' <span class="badge accent">отработано</span>' : ""}</p>
        </div>
        <span class="speaking-index">${state.index + 1} / ${Math.max(1, list.length)}</span>
      </div>
      <div class="speaking-actions">
        <button class="btn btn-sm" type="button" data-action="speaking-listen" data-rate="0.88" ${canSpeak ? "" : "disabled"}>${I.speaker} Образец</button>
        <button class="btn btn-sm" type="button" data-action="speaking-listen" data-rate="0.7" ${canSpeak ? "" : "disabled"}>${I.headphones} Медленнее</button>
        <button class="btn btn-sm" type="button" data-action="speaking-listen-repeat" ${canSpeak ? "" : "disabled"}>${I.refresh} Повтор ×2</button>
        <button class="btn btn-sm ${state.recording ? "btn-danger speaking-recording" : "btn-primary"}" type="button" data-action="speaking-record" aria-pressed="${state.recording}" ${state.starting ? "disabled" : ""}>${I.mic} ${state.recording ? "Остановить" : "Записать"}</button>
        <button class="btn btn-sm" type="button" data-action="speaking-retry" ${state.recording || state.busy ? "disabled" : ""}>${I.refresh} Ещё раз</button>
        <button class="btn btn-sm btn-teal" type="button" data-action="speaking-done" ${state.recording || state.busy ? "disabled" : ""}>${I.check} Получилось</button>
        <button class="btn btn-sm btn-ghost" type="button" data-action="speaking-next" ${state.busy ? "disabled" : ""}>Следующая ${I.arrow}</button>
      </div>
      <div class="speaking-status" data-speaking-status role="status" aria-live="polite">${esc(statusText())}</div>
      ${state.audioUrl ? `<audio class="speaking-audio" controls preload="metadata" src="${esc(state.audioUrl)}"></audio>` : ""}
      <div class="speaking-foot">
        <a class="text-btn" href="${sourceHref}">${I.book} ${prompt.kind === "question" ? "Открыть вопросы юнита" : "Открыть текст"}</a>
        <span>${hint}</span>
      </div>
      <p class="speaking-note">Запись остаётся на этом устройстве и не сохраняется в прогрессе. В историю попадает только отметка об отработанной фразе.</p>
    </section>`;
  };

  const filtersBlock = () => `<div class="speaking-toolbar">
    <div class="speaking-filters">
      <button class="chip ${state.filter === "all" ? "active" : ""}" type="button" data-action="speaking-filter" data-filter="all">Все</button>
      <button class="chip ${state.filter === "sentence" ? "active" : ""}" type="button" data-action="speaking-filter" data-filter="sentence">Фразы</button>
      <button class="chip ${state.filter === "question" ? "active" : ""}" type="button" data-action="speaking-filter" data-filter="question">Вопросы</button>
    </div>
    <label class="speaking-unit">Юнит
      <select class="input" data-change="speaking-unit" aria-label="Фильтр по юниту">
        <option value="all" ${state.unit === "all" ? "selected" : ""}>Все юниты</option>
        ${unitOptions()}
      </select>
    </label>
  </div>`;

  const render = () => {
    const root = IT.$("#view");
    if (!root) return;
    if (state.error) {
      root.innerHTML = `<div class="page"><div class="panel error-panel"><b>Не удалось загрузить speaking-практику</b><p>${esc(state.error)}</p><button class="btn" type="button" data-action="speaking-reload">Повторить</button></div></div>`;
      return;
    }
    if (!state.data) {
      root.innerHTML = `<div class="study-loading"><span class="spinner" aria-hidden="true"></span><p>Собираем фразы для речи…</p></div>`;
      return;
    }
    const list = filtered();
    const prompt = current();
    root.innerHTML = `<div class="page speaking-page">
      <div class="page-head"><div><span class="eyebrow">SPEAKING LAB</span><h1>Речь</h1><p class="lead">Короткие фразы и вопросы из юнитов: слушайте образец, повторяйте вслух и записывайте себя. Всё работает локально, без AI.</p></div><div class="speaking-head-actions"><a class="btn btn-ghost" href="#/audio">${I.headphones} Аудио</a><a class="btn btn-ghost" href="#/study">${I.back} Центр учёбы</a></div></div>
      ${statsBlock(state.data)}
      ${filtersBlock()}
      ${voiceBlock()}
      ${prompt ? promptCard(prompt, state.data) : `<section class="panel speaking-empty"><b>В этом фильтре пока нет фраз</b><p>Выберите другой юнит или сбросьте фильтры.</p><button class="btn btn-primary" type="button" data-action="speaking-reset">Сбросить фильтры</button></section>`}
      <p class="study-footnote">Речь · ${Number(state.data.completed) || 0} из ${Number(state.data.total) || 0} фраз отработано · записи не покидают браузер.</p>
    </div>`;
  };

  const load = async () => {
    state.error = "";
    render();
    try {
      const data = await IT.api("/api/speaking");
      setData(data, true);
    } catch (e) {
      state.error = e.message;
    }
    if (location.hash.startsWith("#/speaking")) render();
  };

  const reset = () => {
    stopSpeakingAudio();
    state.data = null;
    state.error = "";
    state.filter = "all";
    state.unit = "all";
    state.index = 0;
    state.audioUrl = "";
    state.recording = false;
    state.starting = false;
    state.seconds = 0;
    state.busy = false;
  };

  const bindVoiceEvents = () => {
    if (!window.speechSynthesis || !window.speechSynthesis.addEventListener) return;
    window.speechSynthesis.addEventListener("voiceschanged", () => {
      if (location.hash.startsWith("#/speaking")) render();
    });
  };

  bindVoiceEvents();

  IT.views.speaking = () => {
    reset();
    render();
    load();
  };

  IT.speakingActions = {
    listen,
    listenRepeat,
    testVoice,
    setVoice,
    toggleRecord: () => (state.recording ? stopRecording(false) : startRecording()),
    next,
    done: () => attempt(true),
    retry,
    setFilter,
    setUnit,
    resetFilters,
    reload: () => {
      state.data = null;
      state.error = "";
      load();
    },
  };
})();
