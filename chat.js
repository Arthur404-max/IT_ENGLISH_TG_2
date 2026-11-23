/* IT English Lab — AI tutor chat */
(() => {
  "use strict";
  const IT = window.IT;
  const { S, esc, icons: I } = IT;
  const STORE_KEY = "itelab-chat-v2";

  const md = (text) => {
    const blocks = [];
    let raw = String(text || "").replace(/```(?:\w+)?\s*\n?([\s\S]*?)```/g, (_, code) => {
      blocks.push(code.replace(/\s+$/, ""));
      return `\u0001${blocks.length - 1}\u0001`;
    });
    let s = esc(raw);
    s = s.replace(/`([^`\n]+)`/g, "<code>$1</code>");
    s = s.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
    s = s.replace(/(^|[\s(])\*([^*\n]+)\*/g, "$1<em>$2</em>");
    s = s
      .split(/\n{2,}/)
      .map((block) => {
        const lines = block.split("\n").filter((l) => l.trim().length);
        if (lines.length && lines.every((l) => /^\s*[-*•]\s+/.test(l))) {
          return `<ul>${lines.map((l) => `<li>${l.replace(/^\s*[-*•]\s+/, "")}</li>`).join("")}</ul>`;
        }
        if (lines.length && lines.every((l) => /^\s*\d+[.)]\s+/.test(l))) {
          return `<ol>${lines.map((l) => `<li>${l.replace(/^\s*\d+[.)]\s+/, "")}</li>`).join("")}</ol>`;
        }
        return `<p>${block.split("\n").map((l) => l || "<br>").join("<br>")}</p>`;
      })
      .join("");
    return s.replace(/\u0001(\d+)\u0001/g, (_, i) => `<pre><code>${esc(blocks[Number(i)])}</code></pre>`);
  };
  IT.md = md;

  const save = () => {
    try {
      localStorage.setItem(
        STORE_KEY,
        JSON.stringify({ unitId: S.chat.unitId, messages: (S.chat.messages || []).slice(-48) })
      );
    } catch (_) {}
  };

  const restore = () => {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (data && Array.isArray(data.messages)) {
        S.chat.messages = data.messages.filter((m) => m && m.role && m.content).slice(-48);
      }
      if (data && data.unitId != null) S.chat.unitId = Number(data.unitId) || null;
    } catch (_) {}
  };
  restore();

  const greeting = () => {
    const id = S.chat.unitId;
    const u = id ? IT.unitById(id) : null;
    if (u) {
      return `Привет! Я помогу с юнитом ${u.id} «${u.title_ru}».\n\nМожем разобрать лексику, проверить перевод или потренировать вопросы к экзамену. С чего начнём?`;
    }
    return "Привет! Я ИИ-репетитор по IT-английскому. Выбери юнит слева или просто напиши вопрос — например, «объясни разницу между compiler и interpreter».";
  };

  const ensureGreeting = () => {
    if (S.chat.unitId && !IT.unitById(S.chat.unitId)) S.chat.unitId = null;
    if (!S.chat.messages || S.chat.messages.length === 0) {
      S.chat.messages = [{ role: "assistant", content: greeting(), greeting: true }];
      save();
    }
  };

  const suggestions = () => {
    const u = S.chat.unitId ? IT.unitById(S.chat.unitId) : null;
    if (u) {
      return [
        { label: `Объясни 5 сложных слов юнита ${u.id}`, prompt: `Объясни простыми словами 5 самых сложных терминов из юнита ${u.id} «${u.title_en}». Дай перевод, пример и короткое пояснение.`, fill: false },
        { label: "Дай 5 экзаменационных вопросов", prompt: `Составь 5 экзаменационных вопросов по юниту ${u.id} «${u.title_en}»: 3 на понимание лексики и 2 на перевод. Не давай ответы сразу.`, fill: false },
        { label: "Составь диалог по теме", prompt: `Составь короткий диалог на английском по теме юнита ${u.id} «${u.title_en}» (6–8 реплик) и добавь перевод сложных фраз на русский.`, fill: false },
        { label: "Проверь мой перевод", prompt: "Проверь мой перевод на английский:\n\nРусская фраза: \nМой перевод: ", fill: true },
      ];
    }
    return [
      { label: "Compiler или interpreter?", prompt: "Объясни разницу между compiler и interpreter простыми словами, с примерами на английском.", fill: false },
      { label: "Фразы для описания технологий", prompt: "Дай 10 полезных английских фраз для описания технологий и IT-продуктов. С переводом и примером.", fill: false },
      { label: "Как отвечать на экзамене", prompt: "Как отвечать на экзамене по IT-английскому, если не знаешь слово? Дай стратегии и полезные фразы.", fill: false },
      { label: "Проверь мой перевод", prompt: "Проверь мой перевод на английский:\n\nРусская фраза: \nМой перевод: ", fill: true },
    ];
  };

  const renderMessages = () => {
    const msgs = S.chat.messages || [];
    return msgs
      .map((m) => {
        const user = m.role === "user";
        return `<div class="msg ${user ? "user" : ""} ${m.error ? "error" : ""}">
          <div class="msg-avatar">${user ? "Я" : "AI"}</div>
          <div class="msg-body">${md(m.content)}</div>
        </div>`;
      })
      .join("");
  };

  const renderTutor = () => {
    ensureGreeting();
    const units = S.units || [];
    const unit = S.chat.unitId ? IT.unitById(S.chat.unitId) : null;
    const off = !IT.aiOn();
    const busy = S.chat.busy;
    const sug = suggestions();
    IT.setView(`
      <div class="chat-page">
        <div class="chat-head">
          <div>
            <div class="eyebrow">ИИ-репетитор</div>
            <h1 class="display" style="font-size:clamp(32px,3.7vw,46px);margin-top:12px">Спросите по-русски</h1>
            <p class="lead" style="font-size:14px;margin-top:5px">Разбор лексики, проверка перевода и экзаменационные вопросы. Контекст юнита подставляется автоматически.</p>
          </div>
          <div style="display:flex;align-items:center;gap:8px">
            <span class="badge ${IT.aiMode() === "openai" ? "ok" : IT.aiMode() === "embedded" ? "accent" : ""}">${esc(IT.aiLabel())}</span>
            <button class="icon-btn" type="button" title="Очистить диалог" data-action="chat-clear">${I.trash}</button>
          </div>
        </div>
        <div class="chat-layout">
          <section class="chat-main">
            ${off ? `<div class="chat-off"><span>ИИ не подключён. Настройте API-ключ или встроенную модель — обычный тренажёр работает и без него.</span><a href="#/settings">Настроить</a></div>` : ""}
            <div class="chat-messages" id="chat-messages">
              ${renderMessages()}
              ${busy ? `<div class="msg"><div class="msg-avatar">AI</div><div class="msg-body"><span class="msg-typing"><i></i><i></i><i></i></span><button class="text-btn chat-cancel" type="button" data-action="chat-cancel">Отменить запрос</button></div></div>` : ""}
            </div>
            <div class="composer">
              <form data-form="chat">
                <div class="composer-inner">
                  <textarea rows="1" data-input="chat-input" placeholder="${off ? "Сначала подключите ИИ в настройках…" : "Напишите вопрос или перевод…"}" ${off ? "disabled" : ""}>${esc(S.chat.input || "")}</textarea>
                  <button class="send" type="submit" aria-label="Отправить" ${off || busy || !(S.chat.input || "").trim() ? "disabled" : ""}>${I.send}</button>
                </div>
              </form>
              <div class="composer-hint">Enter — отправить · Shift+Enter — новая строка. Ответы ИИ могут содержать ошибки: проверяйте важные формулировки.</div>
            </div>
          </section>
          <aside class="chat-side">
            <div class="chat-side-card">
              <h2>Контекст юнита</h2>
              <select class="select" data-change="chat-unit" aria-label="Chat unit context">
                <option value="">Без юнита</option>
                ${units.map((u) => `<option value="${u.id}" ${S.chat.unitId === u.id ? "selected" : ""}>Unit ${u.id} · ${esc(u.title_ru)}</option>`).join("")}
              </select>
              <div class="chat-context" style="margin-top:9px">${unit ? `${esc(unit.title_en)} · ${unit.vocab} ${IT.plural(unit.vocab, "термин", "термина", "терминов")}. В ответах будет лексика этого юнита.` : "Можно спрашивать общие темы IT-английского."}</div>
            </div>
            <div class="chat-side-card">
              <h2>Быстрые запросы</h2>
              <div class="suggest-list">
                ${sug.map((s) => `<button class="suggest" type="button" data-action="chat-suggest" data-prompt="${esc(s.prompt)}" data-fill="${s.fill ? "1" : "0"}">${esc(s.label)}</button>`).join("")}
              </div>
            </div>
            <div class="chat-side-card">
              <h2>Как получить лучшее</h2>
              <div class="chat-context">Пишите конкретно: «переведи фразу…», «объясни слово…», «почему здесь Present Perfect?». Можно вставить свой перевод — репетитор разберёт ошибки.</div>
            </div>
          </aside>
        </div>
      </div>`);
    setTimeout(() => {
      const box = IT.$("#chat-messages");
      if (box) box.scrollTop = box.scrollHeight;
      if (!off && !busy) {
        const ta = IT.$("[data-input='chat-input']");
        if (ta && document.activeElement !== ta && !(S.chat.input || "")) ta.focus();
      }
    }, 30);
  };

  const send = async (text) => {
    const msg = String(text != null ? text : S.chat.input || "").trim();
    if (!msg || S.chat.busy) return;
    if (!IT.aiOn()) {
      IT.toast("ИИ не подключён. Откройте настройки.", "error");
      return;
    }
    ensureGreeting();
    S.chat.input = "";
    S.chat.messages.push({ role: "user", content: msg });
    S.chat.busy = true;
    save();
    renderTutor();
    const controller = "AbortController" in window ? new AbortController() : null;
    S.chat.controller = controller;
    try {
      const history = S.chat.messages
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({ role: m.role, content: m.content }))
        .slice(-18);
      const res = await IT.api("/api/ai/chat", {
        method: "POST",
        body: { unit_id: S.chat.unitId || null, messages: history },
        signal: controller ? controller.signal : undefined,
      });
      S.chat.messages.push({ role: "assistant", content: (res && res.reply) || "Пустой ответ модели." });
    } catch (e) {
      if (e && e.name === "AbortError") {
        S.chat.messages.push({ role: "assistant", content: "Запрос отменён. Можно сформулировать вопрос иначе.", error: true });
      } else {
        S.chat.messages.push({ role: "assistant", content: `Не получилось получить ответ.\n\n${e.message}`, error: true });
      }
    } finally {
      S.chat.controller = null;
      S.chat.busy = false;
      save();
      renderTutor();
    }
  };

  const cancel = () => {
    if (S.chat.controller) {
      S.chat.controller.abort();
      S.chat.controller = null;
    }
    S.chat.busy = false;
    renderTutor();
    IT.toast("Запрос отменён", "info");
  };

  const suggest = (prompt, fill) => {
    if (fill) {
      S.chat.input = prompt;
      renderTutor();
      setTimeout(() => {
        const ta = IT.$("[data-input='chat-input']");
        if (ta) {
          ta.focus();
          ta.setSelectionRange(ta.value.length, ta.value.length);
        }
      }, 30);
      return;
    }
    send(prompt);
  };

  const clear = () => {
    S.chat.messages = [];
    ensureGreeting();
    save();
    renderTutor();
    IT.toast("Диалог очищен");
  };

  const setUnit = (value) => {
    const id = value ? Number(value) : null;
    S.chat.unitId = Number.isFinite(id) && IT.unitById(id) ? id : null;
    S.chat.messages = [];
    ensureGreeting();
    save();
    renderTutor();
  };

  const setInput = (value) => {
    S.chat.input = value;
    const btn = IT.$(".composer .send");
    if (btn) btn.disabled = !IT.aiOn() || S.chat.busy || !value.trim();
  };

  IT.views = IT.views || {};
  IT.views.tutor = renderTutor;
  IT.chatActions = { send, suggest, clear, cancel, setUnit, setInput };
})();
