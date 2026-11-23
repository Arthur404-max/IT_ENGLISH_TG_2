/* IT English Lab — analytics: units, item types, time, compare and CSV */
(() => {
  "use strict";
  const IT = window.IT;
  const { S, esc, icons: I } = IT;

  const attempts = () => (S.progress.exams || []).slice(0, 40);
  const attemptById = (id) => attempts().find((a) => String(a.id) === String(id));
  const pct = (correct, total) => (total ? Math.round((correct / total) * 100) : 0);
  const shortDate = (stamp) => {
    const value = Number(stamp) || 0;
    const date = new Date(value > 0 && value < 10_000_000_000 ? value * 1000 : value);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  };
  const dayLabel = (value) => {
    const date = new Date(`${value}T00:00:00`);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
  };
  const fmtMinutes = (ms) => {
    const minutes = Math.round((Number(ms) || 0) / 60000);
    return minutes ? `${minutes} мин` : "—";
  };
  const fmtSeconds = (ms) => {
    const seconds = Math.round((Number(ms) || 0) / 1000);
    return seconds ? `${seconds} с` : "—";
  };
  const unitTitle = (id) => {
    const unit = IT.unitById(Number(id));
    return unit ? `Unit ${String(id).padStart(2, "0")} · ${unit.title_ru}` : `Unit ${String(id).padStart(2, "0")}`;
  };
  const typeLabel = (item) => item.type_label || item.typeLabel || item.kind || "Задание";
  const sectionLabel = (item) => item.section_label || item.sectionLabel || item.section || "Задания";

  const collect = (list) => {
    const units = new Map();
    const types = new Map();
    let itemMs = 0;
    let answered = 0;
    let graded = 0;
    let correct = 0;
    let wrong = 0;
    for (const attempt of list) {
      for (const item of attempt.items || []) {
        const unitId = Number(item.unit_id) || 0;
        const unit = units.get(unitId) || {
          id: unitId,
          correct: 0,
          wrong: 0,
          answered: 0,
          total: 0,
          ms: 0,
        };
        const typeName = typeLabel(item);
        const type = types.get(typeName) || { name: typeName, correct: 0, wrong: 0, answered: 0, total: 0, ms: 0 };
        for (const row of [unit, type]) {
          row.total += 1;
          if (item.answered) row.answered += 1;
          if (item.graded === true) row.correct += 1;
          if (item.graded === false) row.wrong += 1;
          row.ms += Number(item.time_ms) || 0;
        }
        units.set(unitId, unit);
        types.set(typeName, type);
        itemMs += Number(item.time_ms) || 0;
        if (item.answered) answered += 1;
        if (item.graded === true) {
          correct += 1;
          graded += 1;
        }
        if (item.graded === false) {
          wrong += 1;
          graded += 1;
        }
      }
    }
    return {
      units: [...units.values()].sort((a, b) => a.id - b.id),
      types: [...types.values()].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, "ru")),
      itemMs,
      answered,
      graded,
      correct,
      wrong,
    };
  };

  const wordSummary = () => {
    const byUnit = new Map();
    for (const [key, stat] of Object.entries(S.progress.words || {})) {
      const unitId = Number(String(key).split("|")[0]);
      if (!unitId) continue;
      const row = byUnit.get(unitId) || { studied: 0, due: 0, correct: 0, wrong: 0 };
      row.correct += Number(stat.correct) || 0;
      row.wrong += Number(stat.wrong) || 0;
      if (IT.hasStudied(stat)) {
        row.studied += 1;
        if (IT.isDue(stat)) row.due += 1;
      }
      byUnit.set(unitId, row);
    }
    return byUnit;
  };

  const metrics = (list) => {
    const scores = list.map((a) => Number(a.score_pct) || 0);
    const avg = scores.length ? Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length) : 0;
    const best = scores.length ? Math.max(...scores) : 0;
    const timeSec = list.reduce((sum, a) => sum + (Number(a.time_spent_sec) || 0), 0);
    const totalCorrect = list.reduce((sum, a) => sum + (Number(a.correct) || 0), 0);
    const totalItems = list.reduce((sum, a) => sum + (Number(a.total) || 0), 0);
    return { avg, best, timeSec, totalCorrect, totalItems, accuracy: pct(totalCorrect, totalItems) };
  };

  const recommendationItems = (list, data) => {
    const out = [];
    const due = Number(S.progress.due) || 0;
    if (due > 0) {
      out.push({
        title: `Повторите ${due} ${IT.plural(due, "карточку", "карточки", "карточек")}`,
        text: "Очередь SRS уже собрана по срокам. Короткая сессия удержит слова в памяти.",
        href: "#/trainer",
        action: "start-review",
        label: "Начать повторение",
      });
    }
    const weakUnits = data.units
      .filter((u) => u.graded >= 2 || u.wrong > 0)
      .map((u) => ({ ...u, accuracy: pct(u.correct, u.correct + u.wrong) }))
      .filter((u) => u.accuracy < 75)
      .sort((a, b) => a.accuracy - b.accuracy || b.wrong - a.wrong)
      .slice(0, 3);
    for (const unit of weakUnits) {
      out.push({
        title: `${unitTitle(unit.id)} — ${unit.accuracy}%`,
        text: `Ошибок: ${unit.wrong}. Откройте словарь юнита и пройдите тренировку по слабым карточкам.`,
        href: `#/unit/${unit.id}/vocab`,
        label: "К словарю",
      });
    }
    const slowType = data.types
      .filter((t) => t.total >= 2 && t.ms > 0)
      .map((t) => ({ ...t, avgMs: Math.round(t.ms / t.total) }))
      .sort((a, b) => b.avgMs - a.avgMs)[0];
    if (slowType && slowType.avgMs > 45000) {
      out.push({
        title: `Медленнее всего: ${slowType.name}`,
        text: `В среднем ${fmtSeconds(slowType.avgMs)} на задание. Попробуйте тренировку в спокойном темпе и разберите образцы.`,
        href: "#/exams",
        label: "К экзаменам",
      });
    }
    if (!list.length) {
      out.push({
        title: "Начните с короткой проверки",
        text: "Пройдите 10 вопросов в режиме тренировки — после этого появятся точные слабые темы.",
        href: "#/exams",
        label: "Открыть экзамены",
      });
    } else if (!out.length) {
      out.push({
        title: "Хороший баланс",
        text: "Слабых тем по экзаменационным заданиям не видно. Поддерживайте ритм: короткие повторения каждый день.",
        href: "#/trainer",
        label: "К тренажёру",
      });
    }
    return out.slice(0, 4);
  };

  const chartHtml = () => {
    const activity = Array.isArray(S.progress.activity) && S.progress.activity.length
      ? S.progress.activity
      : Array.from({ length: 30 }, (_, i) => ({ date: "", count: 0, ms: 0 }));
    const max = Math.max(1, ...activity.map((d) => Number(d.count) || 0));
    const bars = activity
      .map((day, index) => {
        const count = Number(day.count) || 0;
        const height = count ? Math.max(4, Math.round((count / max) * 100)) : 2;
        const label = day.date ? `${dayLabel(day.date)}: ${count} ${IT.plural(count, "ответ", "ответа", "ответов")}` : "нет данных";
        return `<div class="analytics-bar-col" title="${esc(label)}">
          <div class="analytics-bar-wrap"><i style="height:${height}%" class="${count ? "has" : ""}"></i></div>
          ${index % 5 === 0 || index === activity.length - 1 ? `<span>${day.date ? dayLabel(day.date) : ""}</span>` : "<span></span>"}
        </div>`;
      })
      .join("");
    const total = activity.reduce((sum, day) => sum + (Number(day.count) || 0), 0);
    return `<section class="analytics-panel chart-panel">
      <div class="analytics-panel-head">
        <div><div class="eyebrow">Последние 30 дней</div><h2>Активность</h2></div>
        <span class="badge">${total} ${IT.plural(total, "ответ", "ответа", "ответов")}</span>
      </div>
      <div class="analytics-chart" role="img" aria-label="Столбчатый график активности за 30 дней. Всего ${total} ответов.">${bars}</div>
      <p class="muted tiny">Высота столбца — число ответов за день. Наведите курсор, чтобы увидеть точное значение.</p>
    </section>`;
  };

  const unitTable = (data) => {
    const words = wordSummary();
    const ids = [...new Set([...data.units.map((u) => u.id), ...words.keys()])].filter((id) => id > 0).sort((a, b) => a - b);
    if (!ids.length) return `<div class="analytics-empty">Данных по юнитам пока нет. Пройдите тренировку или экзамен.</div>`;
    const rows = ids
      .map((id) => {
        const exam = data.units.find((u) => u.id === id) || { correct: 0, wrong: 0, answered: 0, total: 0, ms: 0 };
        const word = words.get(id) || { studied: 0, due: 0, correct: 0, wrong: 0 };
        const accuracy = pct(exam.correct, exam.correct + exam.wrong);
        const hasExam = exam.total > 0;
        const tone = hasExam ? (accuracy >= 80 ? "ok" : accuracy >= 60 ? "warn" : "bad") : "empty";
        return `<tr>
          <td><a href="#/unit/${id}/vocab"><b>${String(id).padStart(2, "0")}</b> ${esc(unitTitle(id).replace(/^Unit \d+ · /, ""))}</a></td>
          <td>${hasExam ? `${exam.correct}/${exam.correct + exam.wrong}` : "—"}</td>
          <td><span class="analytics-score ${tone}">${hasExam ? `${accuracy}%` : "—"}</span></td>
          <td>${word.studied || 0}</td>
          <td>${word.due || 0}</td>
          <td>${fmtMinutes(exam.ms)}</td>
        </tr>`;
      })
      .join("");
    return `<div class="analytics-table-wrap"><table class="analytics-table">
      <thead><tr><th>Юнит</th><th>Верно</th><th>Точность</th><th>Слов изучено</th><th>К повторению</th><th>Время</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`;
  };

  const typeCards = (data) => {
    if (!data.types.length) return `<div class="analytics-empty">Типы заданий появятся после первой попытки.</div>`;
    return `<div class="type-grid">${data.types
      .map((type) => {
        const accuracy = pct(type.correct, type.correct + type.wrong);
        const tone = accuracy >= 80 ? "ok" : accuracy >= 60 ? "warn" : "bad";
        return `<div class="type-card">
          <div class="type-card-top"><b>${esc(type.name)}</b><span class="analytics-score ${tone}">${accuracy}%</span></div>
          <div class="type-bar"><i class="${tone}" style="width:${accuracy}%"></i></div>
          <div class="type-card-meta"><span>${type.correct} верно · ${type.wrong} ошибок</span><span>${fmtSeconds(type.total ? type.ms / type.total : 0)} / задание</span></div>
        </div>`;
      })
      .join("")}</div>`;
  };

  const compareSelect = (side, selected) => {
    const list = attempts().slice(0, 20);
    const options = list
      .map(
        (a) =>
          `<option value="${esc(a.id)}" ${String(a.id) === String(selected) ? "selected" : ""}>${esc(shortDate(a.finished_at))} · ${esc(a.title || "Экзамен")} · ${Number(a.score_pct) || 0}%</option>`
      )
      .join("");
    return `<select class="select" data-change="analytics-compare" data-side="${side}" aria-label="Попытка ${side === "a" ? "А" : "Б"}">
      <option value="">Выберите попытку</option>${options}
    </select>`;
  };

  const delta = (a, b, unit = "%") => {
    const diff = Number(a) - Number(b);
    if (!Number.isFinite(diff)) return "—";
    const sign = diff > 0 ? "+" : "";
    return `${sign}${diff}${unit}`;
  };

  const comparePanel = () => {
    const list = attempts();
    if (!list.length) {
      return `<section class="analytics-panel"><div class="analytics-panel-head"><div><div class="eyebrow">Сравнение</div><h2>Попытки</h2></div></div><div class="analytics-empty">Сравнение появится после двух завершённых попыток.</div></section>`;
    }
    const aId = S.analytics.a && attemptById(S.analytics.a) ? S.analytics.a : list[0].id;
    const bDefault = list.find((a) => String(a.id) !== String(aId))?.id || "";
    const bId = S.analytics.b && attemptById(S.analytics.b) ? S.analytics.b : bDefault;
    const a = attemptById(aId);
    const b = attemptById(bId);
    const sectionsOf = (attempt) => {
      const map = new Map();
      for (const item of (attempt && attempt.items) || []) {
        const name = sectionLabel(item);
        const row = map.get(name) || { name, correct: 0, total: 0, ms: 0 };
        row.total += 1;
        if (item.graded === true) row.correct += 1;
        row.ms += Number(item.time_ms) || 0;
        map.set(name, row);
      }
      return map;
    };
    const sa = sectionsOf(a);
    const sb = sectionsOf(b);
    const names = [...new Set([...sa.keys(), ...sb.keys()])];
    const sectionRows = names
      .map((name) => {
        const ra = sa.get(name);
        const rb = sb.get(name);
        return `<tr><td>${esc(name)}</td><td>${ra ? `${pct(ra.correct, ra.total)}%` : "—"}</td><td>${rb ? `${pct(rb.correct, rb.total)}%` : "—"}</td><td>${ra && rb ? delta(pct(ra.correct, ra.total), pct(rb.correct, rb.total)) : "—"}</td></tr>`;
      })
      .join("");
    return `<section class="analytics-panel compare-panel">
      <div class="analytics-panel-head"><div><div class="eyebrow">Динамика</div><h2>Сравнение попыток</h2></div></div>
      <div class="compare-pickers">
        <label><span>Попытка А</span>${compareSelect("a", aId)}</label>
        <label><span>Попытка Б</span>${compareSelect("b", bId)}</label>
      </div>
      <div class="compare-headline">
        <div><span>Балл</span><b>${a ? Number(a.score_pct) || 0 : 0}% → ${b ? Number(b.score_pct) || 0 : 0}%</b><em>${a && b ? delta(a.score_pct, b.score_pct) : "—"}</em></div>
        <div><span>Время</span><b>${a ? IT.formatTime(a.time_spent_sec) : "—"} → ${b ? IT.formatTime(b.time_spent_sec) : "—"}</b></div>
        <div><span>Дата</span><b>${a ? shortDate(a.finished_at) : "—"} / ${b ? shortDate(b.finished_at) : "—"}</b></div>
      </div>
      ${
        sectionRows
          ? `<div class="analytics-table-wrap"><table class="analytics-table compare-table"><thead><tr><th>Раздел</th><th>А</th><th>Б</th><th>Δ</th></tr></thead><tbody>${sectionRows}</tbody></table></div>`
          : `<div class="analytics-empty">В выбранных попытках нет разбивки по разделам.</div>`
      }
      <p class="muted tiny">А — более новая попытка по умолчанию. Отрицательная динамика не ошибка: важнее регулярность и разбор причин.</p>
    </section>`;
  };

  const render = () => {
    const list = attempts();
    const data = collect(list);
    const m = metrics(list);
    const today = IT.today();
    const recommendations = recommendationItems(list, data);
    const recHtml = recommendations
      .map(
        (rec) => `<article class="recommendation">
          <div class="recommendation-icon">${I.spark}</div>
          <div><b>${esc(rec.title)}</b><p>${esc(rec.text)}</p></div>
          ${rec.action ? `<button class="btn btn-sm" type="button" data-action="${rec.action}">${esc(rec.label)}</button>` : `<a class="btn btn-sm" href="${rec.href}">${esc(rec.label)}</a>`}
        </article>`
      )
      .join("");
    IT.setView(`
      <div class="page-head analytics-head">
        <div class="left">
          <div class="eyebrow">Прогресс · слабые темы · время</div>
          <h1 class="display" style="font-size:clamp(38px,4.7vw,58px);margin-top:14px">Аналитика</h1>
          <p class="lead" style="margin-top:10px">Где вы сильны, что стоит повторить и как меняются результаты от попытки к попытке.</p>
        </div>
        <button class="btn" type="button" data-action="analytics-export">${I.download} Экспорт CSV</button>
      </div>

      <div class="analytics-metrics">
        <div class="metric-card"><span>Средний балл</span><b>${m.avg}%</b><em>${list.length ? `${list.length} ${IT.plural(list.length, "попытка", "попытки", "попыток")}` : "нет попыток"}</em></div>
        <div class="metric-card"><span>Лучший результат</span><b>${m.best}%</b><em>${m.totalCorrect} / ${m.totalItems} заданий</em></div>
        <div class="metric-card"><span>Время за попытки</span><b>${m.timeSec ? IT.formatTime(m.timeSec) : "—"}</b><em>${fmtMinutes(data.itemMs)} по заданиям</em></div>
        <div class="metric-card"><span>Сегодня</span><b>${today.answers + today.examAnswers}</b><em>${fmtMinutes(today.ms)} · ${today.exams} ${IT.plural(today.exams, "экзамен", "экзамена", "экзаменов")} · ${today.due} к повторению</em></div>
      </div>

      <section class="analytics-recommendations">
        <div class="analytics-panel-head"><div><div class="eyebrow">Следующий шаг</div><h2>Рекомендации</h2></div><span class="badge">${S.progress.streak || 0} ${IT.plural(S.progress.streak || 0, "день", "дня", "дней")} подряд</span></div>
        <div class="recommendation-list">${recHtml}</div>
      </section>

      ${chartHtml()}

      <section class="analytics-panel">
        <div class="analytics-panel-head"><div><div class="eyebrow">Экзаменационные задания</div><h2>По юнитам</h2></div><span class="badge">${data.answered} отвечено</span></div>
        ${unitTable(data)}
      </section>

      <section class="analytics-panel">
        <div class="analytics-panel-head"><div><div class="eyebrow">Что проверяет экзамен</div><h2>По типам заданий</h2></div></div>
        ${typeCards(data)}
      </section>

      ${comparePanel()}

      <p class="muted tiny analytics-foot">Данные хранятся локально и попадают в экспорт CSV только по нажатию. В CSV есть ID заданий и время ответа — их можно обрабатывать в таблице.</p>
    `);
  };

  const csvCell = (value) => `"${String(value ?? "").replace(/"/g, '""').replace(/\r?\n/g, " ")}"`;
  const exportCsv = () => {
    const list = attempts();
    const header = [
      "Дата",
      "Попытка",
      "Режим",
      "Название",
      "Балл",
      "Верно",
      "Всего",
      "Время попытки, с",
      "ID задания",
      "Тип",
      "Раздел",
      "Юнит",
      "Оценка",
      "Время задания, мс",
      "Ответ",
      "Образец",
    ];
    const rows = [header.map(csvCell).join(";")];
    for (const attempt of list) {
      const rawStamp = Number(attempt.finished_at) || 0;
      const date = rawStamp
        ? new Date(rawStamp < 10_000_000_000 ? rawStamp * 1000 : rawStamp).toLocaleString("ru-RU")
        : "";
      const items = attempt.items && attempt.items.length ? attempt.items : [{}];
      for (const item of items) {
        rows.push(
          [
            date,
            attempt.id || "",
            attempt.view_mode || attempt.mode || "",
            attempt.title || "",
            attempt.score_pct || 0,
            attempt.correct || 0,
            attempt.total || 0,
            attempt.time_spent_sec || 0,
            item.item_id || "",
            typeLabel(item),
            sectionLabel(item),
            item.unit_id || "",
            item.graded === true ? "зачтено" : item.graded === false ? "не зачтено" : "без оценки",
            Number(item.time_ms) || 0,
            item.input || "",
            item.answer || "",
          ]
            .map(csvCell)
            .join(";")
        );
      }
    }
    const blob = new Blob(["\ufeff" + rows.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `it-english-lab-analytics-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    IT.toast(`CSV готов: ${rows.length - 1} строк`);
  };

  const setCompare = (side, id) => {
    S.analytics[side === "b" ? "b" : "a"] = id || "";
    render();
  };

  IT.views = IT.views || {};
  IT.views.analytics = render;
  IT.analyticsActions = { exportCsv, setCompare, refresh: render };
})();
