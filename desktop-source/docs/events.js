/* IT English Lab — global events and boot */
(() => {
  "use strict";
  const IT = window.IT;
  const { S, esc } = IT;

  const goTutor = (unitId, prompt) => {
    const id = Number(unitId);
    if (Number.isFinite(id) && IT.unitById(id)) {
      if (S.chat.unitId !== id) {
        S.chat.unitId = id;
        S.chat.messages = [];
      }
    }
    S.chat.input = prompt || "";
    if (location.hash === "#/tutor") IT.views.tutor();
    else location.hash = "#/tutor";
    setTimeout(() => {
      const ta = IT.$("[data-input='chat-input']");
      if (ta) {
        ta.focus();
        ta.setSelectionRange(ta.value.length, ta.value.length);
      }
    }, 80);
  };

  const filterVocab = (query) => {
    S.vocabQuery = query;
    const q = String(query || "").toLowerCase().trim();
    IT.$$("[data-vocab-row]").forEach((row) => {
      const hay = (row.dataset.search || "").toLowerCase();
      row.style.display = !q || hay.includes(q) ? "" : "none";
    });
  };

  const filterTextbook = (query) => {
    S.textbookQuery = query;
    const q = String(query || "").toLowerCase().trim();
    let visible = 0;
    IT.$$("#textbook-list .unit-card").forEach((card) => {
      const hay = (card.dataset.search || "").toLowerCase();
      const show = !q || hay.includes(q);
      card.style.display = show ? "" : "none";
      if (show) visible++;
    });
    const empty = IT.$("#textbook-empty");
    if (empty) empty.style.display = visible ? "none" : "";
  };

  const copyText = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      IT.toast("Скопировано");
    } catch (_) {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
        IT.toast("Скопировано");
      } catch (e) {
        IT.toast("Не удалось скопировать", "error");
      }
      ta.remove();
    }
  };

  document.addEventListener("click", (event) => {
    const el = event.target.closest("[data-action]");
    if (!el) {
      if (!event.target.closest("#sidebar") && !event.target.closest("[data-action='toggle-menu']")) IT.closeMenu();
      return;
    }
    const action = el.dataset.action;
    if (action !== "modal-cancel" && action !== "modal-confirm") {
      if (!event.target.closest("#sidebar") && action !== "toggle-menu") IT.closeMenu();
    }

    switch (action) {
      case "skip-content": {
        event.preventDefault();
        const main = document.getElementById("view");
        if (main) main.focus();
        IT.announce("Основное содержимое");
        break;
      }
      case "reload":
        location.reload();
        break;
      case "toggle-menu":
        event.preventDefault();
        IT.toggleMenu();
        break;
      case "modal-cancel":
        if (el.classList.contains("modal-backdrop") && event.target !== el) break;
        IT.closeModal();
        break;
      case "modal-confirm": {
        const fn = S.modalConfirm;
        IT.closeModal();
        if (fn) fn();
        break;
      }
      case "speak":
        event.preventDefault();
        IT.speak(el.dataset.text || "", el.dataset.lang || "en-US", Number(el.dataset.rate) || undefined);
        break;
      case "qa-jump": {
        event.preventDefault();
        const target = document.getElementById(el.dataset.target || "");
        if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
        break;
      }
      case "speak-text": {
        event.preventDefault();
        const unit = S.unitCache[Number(el.dataset.unit)] || (S.unit && S.unit.id === Number(el.dataset.unit) ? S.unit : null);
        const text = unit && unit.texts.find((t) => String(t.letter) === String(el.dataset.letter));
        if (text) IT.speak((text.paragraphs || []).join(" "), "en-US", Number(el.dataset.rate) || undefined);
        break;
      }
      case "toggle-transcript": {
        event.preventDefault();
        const id = el.dataset.transcript;
        const box = IT.$(`[data-transcript-box="${id}"]`);
        if (!box) break;
        const hidden = box.classList.toggle("is-hidden");
        el.setAttribute("aria-expanded", hidden ? "false" : "true");
        el.textContent = hidden ? "Показать транскрипт" : "Скрыть транскрипт";
        if (!S.shadowTranscript) S.shadowTranscript = {};
        S.shadowTranscript[id] = !hidden;
        break;
      }
      case "explain": {
        event.preventDefault();
        const en = el.dataset.en || "";
        const ru = el.dataset.ru || "";
        const unitId = Number(el.dataset.unit);
        goTutor(
          unitId,
          `Объясни IT-термин "${en}"${ru ? ` (${ru})` : ""} из юнита ${unitId}. Дай простое определение по-русски, 2 примера на английском и типичную ошибку в употреблении.`
        );
        break;
      }
      case "ask-ai": {
        event.preventDefault();
        goTutor(Number(el.dataset.unit), el.dataset.prompt || "");
        break;
      }
      case "start-practice": {
        event.preventDefault();
        IT.practiceActions.start(Number(el.dataset.unit), el.dataset.mode || "flash");
        break;
      }
      case "start-review": {
        event.preventDefault();
        IT.practiceActions.review();
        break;
      }
      case "start-queue": {
        event.preventDefault();
        IT.startQueue(el.dataset.mode || "review");
        break;
      }
      case "start-diagnostic": {
        event.preventDefault();
        IT.examActions.startDiagnostic();
        break;
      }
      case "study-refresh": {
        event.preventDefault();
        IT.studyActions.reload();
        break;
      }
      case "study-mistakes-filter": {
        event.preventDefault();
        IT.studyActions.filterMistakes(el.dataset.filter || "open");
        break;
      }
      case "mistake-resolve": {
        event.preventDefault();
        IT.studyActions.resolveMistake(el.dataset.id || "", el.dataset.resolved === "1");
        break;
      }
      case "mistake-option": {
        event.preventDefault();
        IT.studyActions.pickDrillOption(el.dataset.id || "", Number(el.dataset.index), el.dataset.correct === "1");
        break;
      }
      case "mistake-reveal": {
        event.preventDefault();
        const box = document.getElementById(el.dataset.target || "");
        if (!box) break;
        const hidden = box.classList.toggle("is-hidden");
        el.textContent = hidden ? "Показать образец" : "Скрыть образец";
        break;
      }
      case "audio-reload": {
        event.preventDefault();
        IT.audioActions.reload();
        break;
      }
      case "audio-open": {
        event.preventDefault();
        IT.audioActions.open(el.dataset.id || "");
        break;
      }
      case "audio-close": {
        event.preventDefault();
        S.audio.activeId = "";
        IT.views.audio();
        break;
      }
      case "audio-check": {
        event.preventDefault();
        IT.audioActions.check(el.dataset.id || "", Number(el.dataset.index));
        break;
      }
      case "audio-done": {
        event.preventDefault();
        IT.audioActions.markDone(el.dataset.id || "", el.dataset.done === "1");
        break;
      }
      case "audio-transcript": {
        event.preventDefault();
        IT.audioActions.toggleTranscript(el.dataset.id || "");
        break;
      }
      case "audio-rate": {
        event.preventDefault();
        IT.audioActions.rate(Number(el.dataset.rate) || 1);
        break;
      }
      case "audio-rewind": {
        event.preventDefault();
        IT.audioActions.rewind(Number(el.dataset.seconds) || 0);
        break;
      }
      case "speaking-listen": {
        event.preventDefault();
        IT.speakingActions.listen(Number(el.dataset.rate) || undefined);
        break;
      }
      case "speaking-listen-repeat": {
        event.preventDefault();
        IT.speakingActions.listenRepeat();
        break;
      }
      case "speaking-voice-test": {
        event.preventDefault();
        IT.speakingActions.testVoice();
        break;
      }
      case "speaking-record": {
        event.preventDefault();
        IT.speakingActions.toggleRecord();
        break;
      }
      case "speaking-next": {
        event.preventDefault();
        IT.speakingActions.next();
        break;
      }
      case "speaking-done": {
        event.preventDefault();
        IT.speakingActions.done();
        break;
      }
      case "speaking-retry": {
        event.preventDefault();
        IT.speakingActions.retry();
        break;
      }
      case "speaking-filter": {
        event.preventDefault();
        IT.speakingActions.setFilter(el.dataset.filter || "all");
        break;
      }
      case "speaking-reset": {
        event.preventDefault();
        IT.speakingActions.resetFilters();
        break;
      }
      case "speaking-reload": {
        event.preventDefault();
        IT.speakingActions.reload();
        break;
      }
      case "start-exam": {
        event.preventDefault();
        IT.examActions.start(el.dataset.mode || "exam1");
        break;
      }
      case "exam-check":
        event.preventDefault();
        IT.examActions.check();
        break;
      case "exam-reveal":
        event.preventDefault();
        IT.examActions.reveal();
        break;
      case "exam-grade":
        event.preventDefault();
        IT.examActions.grade(el.dataset.correct === "1");
        break;
      case "exam-next":
        event.preventDefault();
        IT.examActions.next();
        break;
      case "exam-prev":
        event.preventDefault();
        IT.examActions.prev();
        break;
      case "exam-flag":
        event.preventDefault();
        IT.examActions.toggleFlag();
        break;
      case "exam-goto":
        event.preventDefault();
        IT.examActions.goTo(Number(el.dataset.index));
        break;
      case "exam-precheck":
        event.preventDefault();
        IT.examActions.precheck();
        break;
      case "exam-precheck-back":
        event.preventDefault();
        IT.examActions.precheckBack();
        break;
      case "exam-precheck-finish":
        event.preventDefault();
        IT.examActions.precheckFinish();
        break;
      case "exam-skip":
        event.preventDefault();
        IT.examActions.skip();
        break;
      case "exam-finish":
        event.preventDefault();
        IT.examActions.finish(false);
        break;
      case "exam-exit":
        event.preventDefault();
        IT.examActions.exit();
        break;
      case "exam-restart":
        event.preventDefault();
        IT.examActions.restart();
        break;
      case "exam-save-next":
        event.preventDefault();
        IT.examActions.saveNext();
        break;
      case "exam-review-grade":
        event.preventDefault();
        IT.examActions.reviewGrade(Number(el.dataset.index), el.dataset.correct === "1");
        break;
      case "exam-review-finish":
        event.preventDefault();
        IT.examActions.reviewFinish();
        break;
      case "exam-filter":
        event.preventDefault();
        IT.examActions.filter(el.dataset.filter || "all");
        break;
      case "exam-history-open":
        event.preventDefault();
        IT.examActions.historyOpen(el.dataset.id || "");
        break;
      case "exam-history-clear":
        event.preventDefault();
        IT.examActions.historyClear();
        break;
      case "exam-retry-mistakes":
        event.preventDefault();
        IT.examActions.retryMistakes();
        break;
      case "exam-resume":
        event.preventDefault();
        IT.examActions.resumeDraft();
        break;
      case "exam-discard-draft":
        event.preventDefault();
        IT.examActions.discardDraft();
        break;
      case "exam-set-view":
        event.preventDefault();
        IT.examActions.setViewMode(el.dataset.view || "practice");
        break;
      case "exam-record":
        event.preventDefault();
        IT.examActions.record();
        break;
      case "exam-delete-audio":
        event.preventDefault();
        IT.examActions.deleteAudio();
        break;
      case "exam-print":
        event.preventDefault();
        IT.examActions.print(el.dataset.withAnswers === "1");
        break;
      case "custom-units-all":
        event.preventDefault();
        IT.examActions.customUnitsAll();
        break;
      case "custom-units-none":
        event.preventDefault();
        IT.examActions.customUnitsNone();
        break;
      case "custom-types-all":
        event.preventDefault();
        IT.examActions.customTypesAll();
        break;
      case "custom-types-none":
        event.preventDefault();
        IT.examActions.customTypesNone();
        break;
      case "set-direction": {
        event.preventDefault();
        S.practiceConfig.direction = el.dataset.direction === "en-ru" ? "en-ru" : "ru-en";
        if (S.practice) S.practice.direction = S.practiceConfig.direction;
        if (location.hash.startsWith("#/trainer")) IT.views.trainer();
        else if (location.hash.startsWith("#/unit/")) IT.views.unit();
        break;
      }
      case "pick-unit": {
        event.preventDefault();
        S.trainerUnit = Number(el.dataset.unit);
        IT.views.trainer();
        break;
      }
      case "reveal":
        IT.practiceActions.reveal();
        break;
      case "grade":
        IT.practiceActions.grade(el.dataset.correct === "1");
        break;
      case "mcq":
        IT.practiceActions.choose(Number(el.dataset.index));
        break;
      case "sentence-grade":
        IT.practiceActions.sentenceGrade(el.dataset.correct === "1");
        break;
      case "check-translation":
        IT.practiceActions.checkTranslation();
        break;
      case "next-question":
        IT.practiceActions.next();
        break;
      case "restart-practice":
        IT.practiceActions.restart();
        break;
      case "chat-suggest":
        IT.chatActions.suggest(el.dataset.prompt || "", el.dataset.fill === "1");
        break;
      case "chat-clear":
        IT.confirm({
          title: "Очистить диалог?",
          text: "История переписки с репетитором будет удалена с этого компьютера.",
          label: "Очистить",
          danger: true,
          onConfirm: () => IT.chatActions.clear(),
        });
        break;
      case "chat-cancel":
        event.preventDefault();
        IT.chatActions.cancel();
        break;
      case "exam-explain": {
        event.preventDefault();
        const exam = S.exam;
        const item = exam && exam.items[Number(el.dataset.index)];
        if (!item) break;
        goTutor(
          item.unit_id,
          `Объясни мою ошибку в экзаменационном задании. Тип: ${item.typeLabel || item.kind}. Вопрос: «${item.prompt}». Мой ответ: «${item.input || "нет ответа"}». Образец: «${item.answer}». Не меняй оценку, просто объясни разницу и как отвечать лучше.`
        );
        break;
      }
      case "set-mode":
        event.preventDefault();
        IT.settingsActions.setMode(el.dataset.mode || "off");
        break;
      case "apply-preset":
        event.preventDefault();
        IT.settingsActions.applyPreset(el.dataset.preset || "");
        break;
      case "apply-model":
        event.preventDefault();
        IT.settingsActions.applyModel(el.dataset.model || "");
        break;
      case "clear-key":
        event.preventDefault();
        IT.settingsActions.clearKey();
        break;
      case "save-settings":
        event.preventDefault();
        IT.settingsActions.save(false);
        break;
      case "test-ai":
        event.preventDefault();
        IT.settingsActions.test();
        break;
      case "refresh-models":
        event.preventDefault();
        IT.settingsActions.refreshModels();
        break;
      case "download-model":
        event.preventDefault();
        IT.settingsActions.downloadModel(el.dataset.preset || "");
        break;
      case "load-model":
        event.preventDefault();
        IT.settingsActions.loadModel();
        break;
      case "unload-model":
        event.preventDefault();
        IT.settingsActions.unloadModel();
        break;
      case "refresh-embedded":
        event.preventDefault();
        IT.settingsActions.loadEmbeddedStatus();
        break;
      case "reset-progress":
        event.preventDefault();
        IT.settingsActions.resetProgress();
        break;
      case "restore-backup":
        event.preventDefault();
        IT.settingsActions.restoreBackup(el.dataset.name || "");
        break;
      case "export-progress":
        event.preventDefault();
        IT.settingsActions.exportProgress();
        break;
      case "analytics-export":
        event.preventDefault();
        IT.analyticsActions.exportCsv();
        break;
      case "install-pwa":
        event.preventDefault();
        IT.installPwa();
        break;
      case "copy-data-dir":
        event.preventDefault();
        copyText(S.settings.data_dir || "");
        break;
      case "copy-lan-url":
        event.preventDefault();
        IT.settingsActions.copyLanUrl();
        break;
      default:
        break;
    }
  });

  document.addEventListener("input", (event) => {
    const el = event.target;
    if (el.dataset.input === "vocab-search") {
      filterVocab(el.value);
      return;
    }
    if (el.dataset.input === "textbook-search") {
      filterTextbook(el.value);
      return;
    }
    if (el.dataset.input === "practice-input") {
      if (S.practice) S.practice.input = el.value;
      return;
    }
    if (el.dataset.input === "exam-answer") {
      const exam = S.exam;
      if (exam && exam.items[exam.index]) exam.items[exam.index].input = el.value;
      if (IT.saveExamDraft) IT.saveExamDraft();
      return;
    }
    if (el.dataset.input === "chat-input") {
      IT.chatActions.setInput(el.value);
      el.style.height = "auto";
      el.style.height = Math.min(el.scrollHeight, 150) + "px";
      return;
    }
    if (el.dataset.input === "audio-answer") {
      if (!S.audio) return;
      const id = el.dataset.id || "";
      const index = Number(el.dataset.index);
      if (!S.audio.answers[id]) S.audio.answers[id] = {};
      S.audio.answers[id][index] = {
        ...(S.audio.answers[id][index] || {}),
        value: el.value,
      };
      return;
    }
    if (el.dataset.setting) {
      if (!S.settingsDraft) IT.initSettingsDraft();
      const key = el.dataset.setting;
      let value = el.value;
      if (el.type === "number") value = value === "" ? "" : Number(value);
      S.settingsDraft[key] = value;
      if (key === "api_key" && String(value).trim()) S.settingsDraft.clear_key = false;
    }
  });

  document.addEventListener("change", (event) => {
    const el = event.target;
    const examConfigKeys = {
      "exam1-count": "exam1Count",
      "exam1-timer": "exam1Timer",
      "exam2-timer": "exam2Timer",
      "final-count": "finalCount",
      "final-timer": "finalTimer",
    };
    if (examConfigKeys[el.dataset.change]) {
      S.examConfig = S.examConfig || {};
      S.examConfig[examConfigKeys[el.dataset.change]] = Number(el.value) || 0;
      if (IT.examActions && IT.examActions.saveConfig) IT.examActions.saveConfig();
      return;
    }
    if (el.dataset.change === "custom-unit") {
      const custom = S.examConfig.custom || {};
      const units = new Set((custom.units || []).map(Number));
      const id = Number(el.value);
      if (el.checked) units.add(id);
      else units.delete(id);
      S.examConfig.custom = { ...custom, units: [...units].sort((a, b) => a - b) };
      IT.examActions.saveConfig();
      return;
    }
    if (el.dataset.change === "custom-type") {
      const custom = S.examConfig.custom || {};
      const types = new Set(custom.types || []);
      if (el.checked) types.add(el.value);
      else types.delete(el.value);
      S.examConfig.custom = { ...custom, types: [...types] };
      IT.examActions.saveConfig();
      return;
    }
    if (el.dataset.change === "custom-count" || el.dataset.change === "custom-timer") {
      const custom = S.examConfig.custom || {};
      const key = el.dataset.change === "custom-count" ? "count" : "timer";
      S.examConfig.custom = { ...custom, [key]: Number(el.value) || 0 };
      IT.examActions.saveConfig();
      return;
    }
    if (el.dataset.change === "import-progress") {
      const file = el.files && el.files[0];
      const merge = el.dataset.merge === "1";
      el.value = "";
      IT.settingsActions.importProgress(file, merge);
      return;
    }
    if (el.dataset.change === "practice-limit") {
      S.practiceConfig.limit = Number(el.value) || 10;
      return;
    }
    if (el.dataset.change === "analytics-compare") {
      IT.analyticsActions.setCompare(el.dataset.side || "a", el.value);
      return;
    }
    if (el.dataset.change === "chat-unit") {
      IT.chatActions.setUnit(el.value);
      return;
    }
    if (el.dataset.change === "speaking-unit") {
      IT.speakingActions.setUnit(el.value);
      return;
    }
    if (el.dataset.change === "speaking-voice") {
      IT.speakingActions.setVoice(el.value);
      return;
    }
  });

  document.addEventListener("submit", (event) => {
    const form = event.target.closest("form");
    if (!form) return;
    if (form.dataset.form === "typing") {
      event.preventDefault();
      const input = form.querySelector("[data-practice-input]");
      IT.practiceActions.typing(input ? input.value : "");
      return;
    }
    if (form.dataset.form === "chat") {
      event.preventDefault();
      const ta = form.querySelector("[data-input='chat-input']");
      IT.chatActions.send(ta ? ta.value : "");
      return;
    }
    if (form.dataset.form === "study-prefs") {
      event.preventDefault();
      IT.studyActions.savePrefs(form);
      return;
    }
  });

  document.addEventListener("keydown", (event) => {
    if (IT.trapFocus(event)) return;
    if (event.key === "Escape") {
      if (IT.$(".modal-backdrop")) IT.closeModal();
      else IT.closeMenu(true);
      return;
    }
    const el = event.target;
    if (el.dataset && el.dataset.input === "chat-input" && event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      IT.chatActions.send(el.value);
      return;
    }
    if (el.dataset && el.dataset.input === "practice-input" && event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      IT.practiceActions.checkTranslation();
    }
    if (
      el.dataset &&
      el.dataset.input === "exam-answer" &&
      event.key === "Enter" &&
      (el.tagName === "INPUT" || event.ctrlKey || event.metaKey)
    ) {
      event.preventDefault();
      const exam = S.exam;
      const item = exam && exam.items[exam.index];
      if (!item) return;
      if (exam.viewMode === "exam") IT.examActions.saveNext();
      else if (item.auto && !item.answered) IT.examActions.check();
      else if (!item.auto && !item.revealed) IT.examActions.reveal();
    }
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => IT.boot());
  } else {
    IT.boot();
  }
})();
