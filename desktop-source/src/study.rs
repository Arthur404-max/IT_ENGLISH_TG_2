//! Study logic that sits between the raw progress file and the UI.
//!
//! Everything here is deterministic and works offline: queue selection, daily
//! limits, readiness, the weekly plan and the mistake notebook all derive from
//! the local content, exam history and FSRS state.

use crate::content::Content;
use crate::progress::{key, Progress, StudyPrefs, WordStat};
use chrono::{Datelike, Duration, Local, NaiveDate};
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};

#[derive(Clone, Debug)]
struct TermInfo {
    en: String,
    ru: String,
    definition: String,
}

#[derive(Clone, Debug)]
struct WordRef {
    unit_id: i32,
    unit_title: String,
    en: String,
    ru: String,
    definition: String,
}

fn normalize(value: &str) -> String {
    value.trim().to_lowercase()
}

fn term_lookup(exams: &Value) -> HashMap<(i32, String), TermInfo> {
    let mut out = HashMap::new();
    if let Some(terms) = exams.get("terms").and_then(Value::as_array) {
        for term in terms {
            let unit_id = term.get("unit_id").and_then(Value::as_i64).unwrap_or(0) as i32;
            let en = term.get("en").and_then(Value::as_str).unwrap_or("");
            if en.trim().is_empty() {
                continue;
            }
            out.insert(
                (unit_id, normalize(en)),
                TermInfo {
                    en: en.to_string(),
                    ru: term
                        .get("ru")
                        .and_then(Value::as_str)
                        .unwrap_or("")
                        .to_string(),
                    definition: term
                        .get("definition")
                        .and_then(Value::as_str)
                        .unwrap_or("")
                        .to_string(),
                },
            );
        }
    }
    out
}

fn catalog(content: &Content, terms: &HashMap<(i32, String), TermInfo>) -> Vec<WordRef> {
    let mut out = Vec::new();
    for unit in &content.units {
        for vocab in &unit.vocab {
            let info = terms.get(&(unit.id, normalize(&vocab.en)));
            out.push(WordRef {
                unit_id: unit.id,
                unit_title: unit.title_en.clone(),
                en: vocab.en.clone(),
                ru: vocab.ru.clone(),
                definition: info.map(|t| t.definition.clone()).unwrap_or_default(),
            });
        }
    }
    out
}

fn stat_for<'a>(p: &'a Progress, word: &WordRef) -> Option<&'a WordStat> {
    p.words.get(&key(word.unit_id, &word.en))
}

fn now_ts() -> i64 {
    Local::now().timestamp()
}

fn today() -> String {
    Local::now().format("%Y-%m-%d").to_string()
}

fn unit_error_priority(p: &Progress) -> HashMap<i32, u32> {
    let mut out: HashMap<i32, u32> = HashMap::new();
    for attempt in p.exams.iter().take(30) {
        for item in &attempt.items {
            if item.graded == Some(false) && item.unit_id > 0 {
                *out.entry(item.unit_id).or_insert(0) += 1;
            }
        }
    }
    out
}

fn unresolved_mistake_count(p: &Progress) -> usize {
    let resolved: HashSet<&str> = p.resolved_mistakes.iter().map(String::as_str).collect();
    let mut seen: HashSet<String> = HashSet::new();
    let mut count = 0;
    for attempt in &p.exams {
        for (index, item) in attempt.items.iter().enumerate() {
            if item.graded == Some(true) {
                continue;
            }
            let id = mistake_id(attempt, item, index);
            if seen.insert(id.clone()) && !resolved.contains(id.as_str()) {
                count += 1;
            }
        }
    }
    count
}

fn mistake_id(
    attempt: &crate::progress::ExamAttempt,
    item: &crate::progress::ExamAttemptItem,
    index: usize,
) -> String {
    if !item.item_id.trim().is_empty() {
        format!("exam:{}", item.item_id.trim())
    } else {
        format!("exam:{}:{}", attempt.id, index)
    }
}

fn word_json(word: &WordRef, stat: Option<&WordStat>, reason: &str, now: i64) -> Value {
    let (
        state,
        stability,
        difficulty,
        due_at,
        reviews,
        correct,
        wrong,
        lapses,
        leech,
        retrievability,
    ) = if let Some(stat) = stat {
        (
            stat.fsrs_state.clone(),
            stat.stability,
            stat.difficulty,
            stat.due_at,
            stat.reviews,
            stat.correct,
            stat.wrong,
            stat.lapses,
            stat.leech,
            stat.retrievability_at(now),
        )
    } else {
        ("new".to_string(), 0.0, 5.0, 0, 0, 0, 0, 0, false, 0.0)
    };
    json!({
        "unit_id": word.unit_id,
        "unit_title": word.unit_title,
        "en": word.en,
        "ru": word.ru,
        "definition": word.definition,
        "kind": "word",
        "reason": reason,
        "state": state,
        "stability": round3(stability),
        "difficulty": round2(difficulty),
        "due_at": due_at,
        "reviews": reviews,
        "correct": correct,
        "wrong": wrong,
        "lapses": lapses,
        "leech": leech,
        "retrievability": round3(retrievability),
    })
}

fn round3(value: f64) -> f64 {
    (value * 1000.0).round() / 1000.0
}

fn round2(value: f64) -> f64 {
    (value * 100.0).round() / 100.0
}

fn queue_counts(
    p: &Progress,
    words: &[WordRef],
    now: i64,
    unit_priority: &HashMap<i32, u32>,
) -> Value {
    let new_total = words
        .iter()
        .filter(|word| {
            stat_for(p, word)
                .map(|stat| !stat.is_active())
                .unwrap_or(true)
        })
        .count();
    let due_total = words
        .iter()
        .filter(|word| {
            stat_for(p, word)
                .map(|stat| stat.is_active() && !stat.leech && stat.is_due(now))
                .unwrap_or(false)
        })
        .count();
    let leech_total = words
        .iter()
        .filter(|word| {
            stat_for(p, word)
                .map(|stat| stat.is_active() && stat.leech)
                .unwrap_or(false)
        })
        .count();
    let day = today();
    let used_new = p.day_new.get(&day).copied().unwrap_or(0);
    let used_review = p.day_reviews.get(&day).copied().unwrap_or(0);
    let used_leech = p.day_leech.get(&day).copied().unwrap_or(0);
    let mistakes = unresolved_mistake_count(p);
    let new_remaining = new_total.min(p.prefs.daily_new_limit.saturating_sub(used_new) as usize);
    let review_remaining =
        due_total.min(p.prefs.daily_review_limit.saturating_sub(used_review) as usize);
    let leech_remaining =
        leech_total.min(p.prefs.daily_leech_limit.saturating_sub(used_leech) as usize);
    let exam_remaining = mistakes.min(p.prefs.daily_exam_limit as usize);
    let _ = unit_priority;
    json!({
        "new": new_total,
        "new_remaining": new_remaining,
        "due": due_total,
        "review_remaining": review_remaining,
        "leech": leech_total,
        "leech_remaining": leech_remaining,
        "mistakes": mistakes,
        "exam_remaining": exam_remaining,
        "used": {
            "new": used_new,
            "review": used_review,
            "leech": used_leech,
            "exam_errors": p.day_exam_errors.get(&day).copied().unwrap_or(0),
        },
    })
}

fn prefs_json(prefs: &StudyPrefs) -> Value {
    json!({
        "daily_new_limit": prefs.daily_new_limit,
        "daily_review_limit": prefs.daily_review_limit,
        "daily_leech_limit": prefs.daily_leech_limit,
        "daily_exam_limit": prefs.daily_exam_limit,
        "desired_minutes": prefs.desired_minutes,
        "desired_retention_pct": prefs.desired_retention_pct,
        "max_interval_days": prefs.max_interval_days,
        "exam_date": prefs.exam_date,
    })
}

/// Build the smart queue for one mode: `review`, `new`, `leech` or `exam`.
pub fn queue(
    p: &Progress,
    content: &Content,
    exams: &Value,
    mode: &str,
    requested_limit: Option<usize>,
) -> Value {
    let mode = match mode.trim().to_lowercase().as_str() {
        "new" => "new",
        "leech" => "leech",
        "exam" | "mistakes" => "exam",
        _ => "review",
    };
    let now = now_ts();
    let terms = term_lookup(exams);
    let words = catalog(content, &terms);
    let priority = unit_error_priority(p);
    let counts = queue_counts(p, &words, now, &priority);
    let day = today();
    let default_limit = 50usize;
    let requested = requested_limit.unwrap_or(default_limit).clamp(1, 200);

    let mut items: Vec<(WordRef, Value)> = Vec::new();
    let available: usize;
    let remaining: usize;

    match mode {
        "new" => {
            let mut fresh: Vec<&WordRef> = words
                .iter()
                .filter(|word| {
                    stat_for(p, word)
                        .map(|stat| !stat.is_active())
                        .unwrap_or(true)
                })
                .collect();
            fresh.sort_by(|a, b| {
                let pa = priority.get(&a.unit_id).copied().unwrap_or(0);
                let pb = priority.get(&b.unit_id).copied().unwrap_or(0);
                pb.cmp(&pa)
                    .then(a.unit_id.cmp(&b.unit_id))
                    .then(a.en.cmp(&b.en))
            });
            let used = p.day_new.get(&day).copied().unwrap_or(0);
            let cap = (p.prefs.daily_new_limit.saturating_sub(used) as usize).min(requested);
            available = fresh.len();
            remaining = available.min(cap);
            for word in fresh.into_iter().take(cap) {
                items.push((word.clone(), word_json(word, None, "new", now)));
            }
        }
        "leech" => {
            let mut leeches: Vec<(&WordRef, &WordStat)> = words
                .iter()
                .filter_map(|word| {
                    stat_for(p, word)
                        .filter(|stat| stat.is_active() && stat.leech)
                        .map(|stat| (word, stat))
                })
                .collect();
            leeches.sort_by(|a, b| {
                b.1.lapses
                    .cmp(&a.1.lapses)
                    .then(b.1.wrong.cmp(&a.1.wrong))
                    .then(a.1.due_at.cmp(&b.1.due_at))
            });
            let used = p.day_leech.get(&day).copied().unwrap_or(0);
            let cap = (p.prefs.daily_leech_limit.saturating_sub(used) as usize).min(requested);
            available = leeches.len();
            remaining = available.min(cap);
            for (word, stat) in leeches.into_iter().take(cap) {
                items.push((word.clone(), word_json(word, Some(stat), "leech", now)));
            }
        }
        "exam" => {
            let mistakes = mistake_entries(p, content, exams);
            let mut by_word: HashMap<String, Value> = HashMap::new();
            for item in &mistakes {
                if item
                    .get("resolved")
                    .and_then(Value::as_bool)
                    .unwrap_or(false)
                {
                    continue;
                }
                let review_en = item
                    .get("review_en")
                    .and_then(Value::as_str)
                    .unwrap_or("")
                    .trim()
                    .to_string();
                let unit_id = item.get("unit_id").and_then(Value::as_i64).unwrap_or(0) as i32;
                if review_en.is_empty() || unit_id <= 0 {
                    continue;
                }
                let entry = by_word.entry(key(unit_id, &review_en)).or_insert_with(|| {
                    let word = words
                        .iter()
                        .find(|word| {
                            word.unit_id == unit_id && normalize(&word.en) == normalize(&review_en)
                        })
                        .cloned();
                    if let Some(word) = word {
                        let stat = stat_for(p, &word);
                        let mut payload = word_json(&word, stat, "exam", now);
                        payload["mistake_id"] = item.get("id").cloned().unwrap_or(Value::Null);
                        payload
                    } else {
                        json!({
                            "unit_id": unit_id,
                            "en": review_en,
                            "ru": "",
                            "definition": "",
                            "kind": "word",
                            "reason": "exam",
                            "mistake_id": item.get("id").cloned().unwrap_or(Value::Null),
                        })
                    }
                });
                if entry.get("mistake_id").map(Value::is_null).unwrap_or(true) {
                    entry["mistake_id"] = item.get("id").cloned().unwrap_or(Value::Null);
                }
            }
            let mut list: Vec<Value> = by_word.into_values().collect();
            list.sort_by(|a, b| {
                a.get("unit_id")
                    .and_then(Value::as_i64)
                    .cmp(&b.get("unit_id").and_then(Value::as_i64))
            });
            available = list.len();
            let cap = requested.min(p.prefs.daily_exam_limit as usize);
            remaining = available.min(cap);
            for payload in list.into_iter().take(cap) {
                items.push((
                    WordRef {
                        unit_id: payload.get("unit_id").and_then(Value::as_i64).unwrap_or(0) as i32,
                        unit_title: payload
                            .get("unit_title")
                            .and_then(Value::as_str)
                            .unwrap_or("")
                            .to_string(),
                        en: payload
                            .get("en")
                            .and_then(Value::as_str)
                            .unwrap_or("")
                            .to_string(),
                        ru: payload
                            .get("ru")
                            .and_then(Value::as_str)
                            .unwrap_or("")
                            .to_string(),
                        definition: payload
                            .get("definition")
                            .and_then(Value::as_str)
                            .unwrap_or("")
                            .to_string(),
                    },
                    payload,
                ));
            }
        }
        _ => {
            let mut due: Vec<(&WordRef, &WordStat)> = words
                .iter()
                .filter_map(|word| {
                    stat_for(p, word)
                        .filter(|stat| stat.is_active() && !stat.leech && stat.is_due(now))
                        .map(|stat| (word, stat))
                })
                .collect();
            due.sort_by(|a, b| {
                a.1.due_at
                    .cmp(&b.1.due_at)
                    .then(b.1.lapses.cmp(&a.1.lapses))
                    .then(b.1.wrong.cmp(&a.1.wrong))
                    .then(
                        a.1.stability
                            .partial_cmp(&b.1.stability)
                            .unwrap_or(std::cmp::Ordering::Equal),
                    )
            });
            let used = p.day_reviews.get(&day).copied().unwrap_or(0);
            let cap = (p.prefs.daily_review_limit.saturating_sub(used) as usize).min(requested);
            available = due.len();
            remaining = available.min(cap);
            for (word, stat) in due.into_iter().take(cap) {
                items.push((word.clone(), word_json(word, Some(stat), "due", now)));
            }
        }
    }

    json!({
        "mode": mode,
        "items": items.into_iter().map(|(_, value)| value).collect::<Vec<_>>(),
        "available": available,
        "remaining": remaining,
        "requested_limit": requested,
        "counts": counts,
        "prefs": prefs_json(&p.prefs),
        "today": p.today_json(),
        "generated_at": now,
    })
}

fn exam_component(p: &Progress) -> (f64, usize) {
    let mut weighted = 0.0;
    let mut weight = 0.0;
    let mut count = 0;
    for attempt in p
        .exams
        .iter()
        .filter(|a| a.total > 0 && a.mode != "diagnostic")
        .take(12)
    {
        count += 1;
        let w = 1.0 / (count as f64).sqrt();
        weighted += attempt.score_pct as f64 * w;
        weight += w;
    }
    if weight <= 0.0 {
        (0.0, 0)
    } else {
        (weighted / weight, count)
    }
}

/// Compute a transparent 0..100 readiness score and what to do next.
pub fn readiness(p: &Progress, content: &Content, exams: &Value) -> Value {
    let now = now_ts();
    let terms = term_lookup(exams);
    let words = catalog(content, &terms);
    let total_vocab = words.len().max(1);
    let mut active = 0usize;
    let mut mastered = 0usize;
    let mut correct = 0u32;
    let mut wrong = 0u32;
    let mut memory = 0.0;
    for word in &words {
        if let Some(stat) = stat_for(p, word).filter(|stat| stat.is_active()) {
            active += 1;
            correct = correct.saturating_add(stat.correct);
            wrong = wrong.saturating_add(stat.wrong);
            memory += stat.retrievability_at(now);
            if stat.box_ >= 3 || stat.stability >= 8.0 {
                mastered += 1;
            }
        }
    }
    let coverage = (active as f64 / total_vocab as f64) * 100.0;
    let accuracy = if correct + wrong == 0 {
        0.0
    } else {
        (correct as f64 / (correct + wrong) as f64) * 100.0
    };
    let memory_pct = if active == 0 {
        0.0
    } else {
        (memory / active as f64) * 100.0
    };
    let mastery = (mastered as f64 / total_vocab as f64) * 100.0;
    let vocab_score = coverage * 0.45 + accuracy * 0.25 + memory_pct * 0.20 + mastery * 0.10;

    let (exam_score, exam_count) = exam_component(p);
    let diagnostic = p
        .exams
        .iter()
        .find(|attempt| attempt.mode == "diagnostic" && attempt.total > 0);
    let diagnostic_score = diagnostic
        .map(|attempt| attempt.score_pct as f64)
        .unwrap_or(0.0);

    let active_days = p
        .days
        .keys()
        .filter(|date| {
            NaiveDate::parse_from_str(date, "%Y-%m-%d")
                .map(|d| (Local::now().date_naive() - d).num_days() <= 14)
                .unwrap_or(false)
        })
        .count() as f64;
    let consistency = ((active_days / 10.0) * 70.0 + (p.streak() as f64) * 6.0).min(100.0);

    let score = if diagnostic.is_some() {
        vocab_score * 0.38 + exam_score * 0.28 + diagnostic_score * 0.22 + consistency * 0.12
    } else {
        vocab_score * 0.50 + exam_score * 0.35 + consistency * 0.15
    }
    .clamp(0.0, 100.0);

    let band = if score < 35.0 {
        "старт"
    } else if score < 55.0 {
        "база"
    } else if score < 75.0 {
        "уверенно"
    } else {
        "готовность"
    };

    // Unit-level breakdown: coverage, accuracy and exam errors.
    let mut unit_errors: HashMap<i32, u32> = HashMap::new();
    for attempt in p.exams.iter().take(20) {
        for item in &attempt.items {
            if item.graded == Some(false) && item.unit_id > 0 {
                *unit_errors.entry(item.unit_id).or_insert(0) += 1;
            }
        }
    }
    let mut unit_aggs: HashMap<i32, (String, usize, usize, u32, u32)> = HashMap::new();
    for word in &words {
        let entry = unit_aggs
            .entry(word.unit_id)
            .or_insert((word.unit_title.clone(), 0, 0, 0, 0));
        entry.1 += 1;
        if let Some(stat) = stat_for(p, word).filter(|stat| stat.is_active()) {
            entry.2 += 1;
            entry.3 = entry.3.saturating_add(stat.correct);
            entry.4 = entry.4.saturating_add(stat.wrong);
        }
    }
    let mut weak_units: Vec<Value> = unit_aggs
        .into_iter()
        .map(|(id, (title, total, active, correct, wrong))| {
            let errors = unit_errors.get(&id).copied().unwrap_or(0);
            let coverage = if total == 0 {
                0.0
            } else {
                active as f64 / total as f64 * 100.0
            };
            let accuracy = if correct + wrong == 0 {
                0.0
            } else {
                correct as f64 / (correct + wrong) as f64 * 100.0
            };
            let penalty = (errors as f64 * 8.0).min(40.0);
            let score = (coverage * 0.55 + accuracy * 0.45 - penalty).clamp(0.0, 100.0);
            let reason = if errors >= 2 {
                "ошибки в экзаменах"
            } else if active == 0 {
                "не начат"
            } else if accuracy < 60.0 {
                "низкая точность"
            } else {
                "мало повторений"
            };
            json!({
                "id": id,
                "title": title,
                "score": score.round() as i64,
                "coverage": coverage.round() as i64,
                "accuracy": accuracy.round() as i64,
                "errors": errors,
                "reason": reason,
            })
        })
        .collect();
    weak_units.sort_by(|a, b| {
        let sa = a.get("score").and_then(Value::as_i64).unwrap_or(0);
        let sb = b.get("score").and_then(Value::as_i64).unwrap_or(0);
        sa.cmp(&sb).then(
            a.get("errors")
                .and_then(Value::as_i64)
                .unwrap_or(0)
                .cmp(&b.get("errors").and_then(Value::as_i64).unwrap_or(0))
                .reverse(),
        )
    });
    let weak_units: Vec<Value> = weak_units.into_iter().take(3).collect();

    let mut type_aggs: HashMap<String, (u32, u32)> = HashMap::new();
    for attempt in p.exams.iter().take(20) {
        for item in &attempt.items {
            let label = if !item.type_label.trim().is_empty() {
                item.type_label.clone()
            } else if !item.kind.trim().is_empty() {
                item.kind.clone()
            } else {
                continue;
            };
            let entry = type_aggs.entry(label).or_insert((0, 0));
            if item.graded == Some(true) {
                entry.0 += 1;
            } else if item.graded == Some(false) {
                entry.1 += 1;
            }
        }
    }
    let mut weak_types: Vec<Value> = type_aggs
        .into_iter()
        .filter(|(_, (correct, wrong))| correct + wrong > 0)
        .map(|(label, (correct, wrong))| {
            let accuracy = correct as f64 / (correct + wrong) as f64 * 100.0;
            json!({
                "label": label,
                "correct": correct,
                "wrong": wrong,
                "accuracy": accuracy.round() as i64,
            })
        })
        .collect();
    weak_types.sort_by(|a, b| {
        let aa = a.get("accuracy").and_then(Value::as_i64).unwrap_or(100);
        let ba = b.get("accuracy").and_then(Value::as_i64).unwrap_or(100);
        aa.cmp(&ba).then(
            b.get("wrong")
                .and_then(Value::as_i64)
                .unwrap_or(0)
                .cmp(&a.get("wrong").and_then(Value::as_i64).unwrap_or(0)),
        )
    });
    let weak_types: Vec<Value> = weak_types.into_iter().take(3).collect();

    let days_left = days_to_exam(&p.prefs.exam_date);
    let recommendation = if diagnostic.is_none() {
        "Пройдите диагностику: она покажет реальный уровень и настроит план.".to_string()
    } else if score < 50.0 {
        let unit = weak_units
            .first()
            .and_then(|u| u.get("title"))
            .and_then(Value::as_str)
            .unwrap_or("базовые юниты");
        format!("Начните с повторения и юнита «{unit}». Не увеличивайте дневные лимиты, пока не закрепите базу.")
    } else if score < 75.0 {
        let unit = weak_units
            .first()
            .and_then(|u| u.get("title"))
            .and_then(Value::as_str)
            .unwrap_or("слабые темы");
        format!("Держите ритм: очередь и leech-колода, затем слабая тема «{unit}».")
    } else {
        "Готовность высокая: поддерживайте повторения, добивайте ошибки и проверяйте себя на полном экзамене.".to_string()
    };

    let diagnostic_json = diagnostic.map(|attempt| {
        json!({
            "attempt_id": attempt.id,
            "score_pct": attempt.score_pct,
            "finished_at": attempt.finished_at,
            "title": attempt.title,
        })
    });

    json!({
        "score": score.round() as i64,
        "band": band,
        "components": [
            { "key": "vocab", "label": "Словарь", "value": vocab_score.round() as i64, "hint": "покрытие, точность и память" },
            { "key": "exam", "label": "Экзамены", "value": exam_score.round() as i64, "hint": format!("{} попыток", exam_count) },
            { "key": "diagnostic", "label": "Диагностика", "value": diagnostic_score.round() as i64, "hint": if diagnostic.is_some() { "последний результат" } else { "ещё не пройдена" } },
            { "key": "consistency", "label": "Регулярность", "value": consistency.round() as i64, "hint": format!("{} активных дней", active_days as u32) },
        ],
        "weak_units": weak_units,
        "weak_types": weak_types,
        "recommendation": recommendation,
        "exam_date": p.prefs.exam_date,
        "days_left": days_left,
        "diagnostic": diagnostic_json,
        "stats": {
            "total_vocab": total_vocab,
            "active_vocab": active,
            "mastered": mastered,
            "accuracy": accuracy.round() as i64,
            "memory": memory_pct.round() as i64,
            "streak": p.streak(),
            "exams": p.exams.len(),
            "due": p.due_count(),
            "leeches": words.iter().filter(|word| stat_for(p, word).map(|s| s.is_active() && s.leech).unwrap_or(false)).count(),
            "mistakes": unresolved_mistake_count(p),
        },
        "generated_at": now,
    })
}

fn days_to_exam(value: &str) -> Option<i64> {
    if value.trim().is_empty() {
        return None;
    }
    NaiveDate::parse_from_str(value.trim(), "%Y-%m-%d")
        .ok()
        .map(|date| (date - Local::now().date_naive()).num_days())
}

fn truncate_sentences(value: &str, max: usize) -> String {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return String::new();
    }
    let mut out = String::new();
    let mut sentences = 0;
    for part in trimmed.split_inclusive(|c| matches!(c, '.' | '!' | '?')) {
        out.push_str(part);
        sentences += 1;
        if sentences >= max || out.chars().count() >= 340 {
            break;
        }
    }
    if out.trim().is_empty() {
        trimmed.chars().take(340).collect()
    } else {
        out.trim().to_string()
    }
}

fn pick_options(correct: &str, candidates: &[String], seed: usize) -> Vec<String> {
    let mut unique: Vec<String> = Vec::new();
    for candidate in candidates {
        if candidate.trim().is_empty() || normalize(candidate) == normalize(correct) {
            continue;
        }
        if !unique
            .iter()
            .any(|existing| normalize(existing) == normalize(candidate))
        {
            unique.push(candidate.clone());
        }
    }
    let start = if unique.is_empty() {
        0
    } else {
        seed % unique.len()
    };
    let mut options: Vec<String> = unique.iter().cycle().skip(start).take(3).cloned().collect();
    let insert_at = seed % (options.len() + 1);
    options.insert(insert_at, correct.to_string());
    options
}

fn mistake_entries(p: &Progress, content: &Content, exams: &Value) -> Vec<Value> {
    let terms = term_lookup(exams);
    let words = catalog(content, &terms);
    let mut seen: HashSet<String> = HashSet::new();
    let resolved: HashSet<&str> = p.resolved_mistakes.iter().map(String::as_str).collect();
    let mut out = Vec::new();
    for attempt in &p.exams {
        for (index, item) in attempt.items.iter().enumerate() {
            if item.graded == Some(true) {
                continue;
            }
            let id = mistake_id(attempt, item, index);
            if !seen.insert(id.clone()) {
                continue;
            }
            if item.prompt.trim().is_empty() && item.answer.trim().is_empty() {
                continue;
            }
            let unit_title = content
                .unit(item.unit_id)
                .map(|unit| unit.title_en.clone())
                .unwrap_or_else(|| item.section_label.clone());
            let lookup_en = if !item.review_en.trim().is_empty() {
                item.review_en.trim()
            } else {
                item.answer.trim()
            };
            let term = terms.get(&(item.unit_id, normalize(lookup_en))).cloned();
            let same_unit_ru: Vec<String> = words
                .iter()
                .filter(|word| word.unit_id == item.unit_id)
                .map(|word| word.ru.clone())
                .collect();
            let same_unit_en: Vec<String> = words
                .iter()
                .filter(|word| word.unit_id == item.unit_id)
                .map(|word| word.en.clone())
                .collect();
            let seed = id.bytes().map(|b| b as usize).sum::<usize>();

            let (explanation, example, drill) = if let Some(term) = &term {
                let explanation = if item.input.trim().is_empty() {
                    format!(
                        "Задание пропущено. «{}» — {}. {}",
                        term.en, term.ru, term.definition
                    )
                } else {
                    format!(
                        "Ваш ответ: «{}». «{}» — {}. {}",
                        item.input.trim(),
                        term.en,
                        term.ru,
                        term.definition
                    )
                };
                let example = if term.definition.trim().is_empty() {
                    format!("{} — {}.", term.en, term.ru)
                } else {
                    format!("{} — {}. {}", term.en, term.ru, term.definition)
                };
                let asks_for_term = matches!(item.kind.as_str(), "reverse" | "definition");
                let (question, answer, options, hint) = if asks_for_term {
                    let question = if term.definition.trim().is_empty() {
                        format!("Какой термин означает «{}»?", term.ru)
                    } else {
                        format!("Какой термин подходит к определению: {}?", term.definition)
                    };
                    (
                        question,
                        term.en.clone(),
                        pick_options(&term.en, &same_unit_en, seed),
                        "Определение и термин связаны с темой юнита.".to_string(),
                    )
                } else {
                    (
                        format!("Выберите правильный перевод: «{}»", term.en),
                        term.ru.clone(),
                        pick_options(&term.ru, &same_unit_ru, seed),
                        "Обратите внимание на часть речи и контекст.".to_string(),
                    )
                };
                (
                    explanation,
                    example,
                    json!({
                        "mode": "choice",
                        "question": question,
                        "answer": answer,
                        "options": options,
                        "hint": hint,
                    }),
                )
            } else if item.kind == "abbr" || item.type_label.to_lowercase().contains("аббрев")
            {
                (
                    format!(
                        "{} Аббревиатура расшифровывается как «{}».",
                        if item.input.trim().is_empty() {
                            "Задание пропущено.".to_string()
                        } else {
                            format!("Ваш ответ: «{}».", item.input.trim())
                        },
                        item.answer
                    ),
                    item.answer.clone(),
                    json!({
                        "mode": "self",
                        "question": format!("Расшифруйте аббревиатуру «{}».", if item.prompt.trim().is_empty() { &item.answer } else { &item.prompt }),
                        "answer": item.answer,
                        "options": [],
                        "hint": item.note,
                    }),
                )
            } else {
                let explanation = format!(
                    "{} Сверьтесь с образцом и выделите 2–3 ключевых факта.{}",
                    if item.input.trim().is_empty() {
                        "Задание пропущено.".to_string()
                    } else {
                        format!("Ваш ответ: «{}».", item.input.trim())
                    },
                    if item.note.trim().is_empty() {
                        String::new()
                    } else {
                        format!(" {}", item.note.trim())
                    }
                );
                (
                    explanation,
                    truncate_sentences(&item.answer, 2),
                    json!({
                        "mode": "self",
                        "question": format!("Ответьте по ключевым пунктам: {}", item.prompt),
                        "answer": item.answer,
                        "options": [],
                        "hint": item.note,
                    }),
                )
            };

            out.push(json!({
                "id": id,
                "resolved": resolved.contains(id.as_str()),
                "attempt_id": attempt.id,
                "attempt_title": attempt.title,
                "finished_at": attempt.finished_at,
                "unit_id": item.unit_id,
                "unit_title": unit_title,
                "kind": item.kind,
                "type_label": item.type_label,
                "prompt": item.prompt,
                "input": item.input,
                "answer": item.answer,
                "answer_label": item.answer_label,
                "note": item.note,
                "source": item.source,
                "review_en": item.review_en,
                "tags": item.tags,
                "explanation": explanation,
                "example": example,
                "drill": drill,
            }));
        }
    }
    out.sort_by(|a, b| {
        let ra = a.get("resolved").and_then(Value::as_bool).unwrap_or(false);
        let rb = b.get("resolved").and_then(Value::as_bool).unwrap_or(false);
        ra.cmp(&rb).then(
            b.get("finished_at")
                .and_then(Value::as_i64)
                .unwrap_or(0)
                .cmp(&a.get("finished_at").and_then(Value::as_i64).unwrap_or(0)),
        )
    });
    out
}

/// Mistake notebook entries with deterministic explanations and mini-drills.
pub fn mistakes(p: &Progress, content: &Content, exams: &Value) -> Value {
    let items = mistake_entries(p, content, exams);
    let resolved = items
        .iter()
        .filter(|item| {
            item.get("resolved")
                .and_then(Value::as_bool)
                .unwrap_or(false)
        })
        .count();
    json!({
        "items": items,
        "total": items.len(),
        "resolved": resolved,
        "unresolved": items.len().saturating_sub(resolved),
    })
}

pub fn set_mistake_resolved(p: &mut Progress, id: &str, resolved: bool) {
    let id = id.trim();
    if id.is_empty() {
        return;
    }
    let exists = p.resolved_mistakes.iter().any(|item| item == id);
    if resolved && !exists {
        p.resolved_mistakes.push(id.to_string());
    } else if !resolved && exists {
        p.resolved_mistakes.retain(|item| item != id);
    }
}

fn plan_task(
    kind: &str,
    title: &str,
    detail: &str,
    minutes: u32,
    action: &str,
    mode: &str,
    href: &str,
) -> Value {
    json!({
        "kind": kind,
        "title": title,
        "detail": detail,
        "minutes": minutes,
        "action": action,
        "mode": mode,
        "href": href,
    })
}

/// Seven-day adaptive plan. Today's block uses the real queue state; the rest
/// of the week alternates review, weak units, new words and a check.
pub fn plan(p: &Progress, content: &Content, exams: &Value) -> Value {
    let now = now_ts();
    let terms = term_lookup(exams);
    let words = catalog(content, &terms);
    let priority = unit_error_priority(p);
    let counts = queue_counts(p, &words, now, &priority);
    let readiness_view = readiness(p, content, exams);
    let score = readiness_view
        .get("score")
        .and_then(Value::as_i64)
        .unwrap_or(0);
    let weak_units = readiness_view
        .get("weak_units")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let weak_title = weak_units
        .first()
        .and_then(|u| u.get("title"))
        .and_then(Value::as_str)
        .unwrap_or("слабая тема");
    let weak_id = weak_units
        .first()
        .and_then(|u| u.get("id"))
        .and_then(Value::as_i64)
        .unwrap_or(1);
    let due = counts
        .get("review_remaining")
        .and_then(Value::as_u64)
        .unwrap_or(0) as u32;
    let new_remaining = counts
        .get("new_remaining")
        .and_then(Value::as_u64)
        .unwrap_or(0) as u32;
    let leech = counts
        .get("leech_remaining")
        .and_then(Value::as_u64)
        .unwrap_or(0) as u32;
    let mistakes = counts.get("mistakes").and_then(Value::as_u64).unwrap_or(0) as u32;
    let desired = p.prefs.desired_minutes.max(10);
    let today_tasks = {
        let mut tasks = Vec::new();
        if due > 0 {
            tasks.push(plan_task(
                "review",
                "Повторить слова",
                &format!("{} карточек из очереди", due),
                (8 + due.min(20) / 3).min(desired),
                "queue",
                "review",
                "",
            ));
        }
        if new_remaining > 0 {
            tasks.push(plan_task(
                "new",
                "Новые слова",
                &format!("{} слов в пределах дневного лимита", new_remaining),
                8,
                "queue",
                "new",
                "",
            ));
        }
        if leech > 0 {
            tasks.push(plan_task(
                "leech",
                "Leech-колода",
                &format!("{} проблемных слов", leech),
                6,
                "queue",
                "leech",
                "",
            ));
        }
        if mistakes > 0 {
            tasks.push(plan_task(
                "mistakes",
                "Тетрадь ошибок",
                &format!("{} ошибок с мини-дриллами", mistakes),
                8,
                "href",
                "",
                "#/study/mistakes",
            ));
        }
        if tasks.is_empty() {
            tasks.push(plan_task(
                "audio",
                "Аудирование",
                "Один локальный аудиоматериал и задания",
                8,
                "href",
                "",
                "#/audio",
            ));
            tasks.push(plan_task(
                "check",
                "Проверка",
                "Диагностика или короткий экзамен",
                20,
                "diagnostic",
                "",
                "",
            ));
        }
        tasks.truncate(4);
        tasks
    };

    let mut days = Vec::new();
    let start = Local::now().date_naive();
    let weekdays = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
    for offset in 0..7 {
        let date = start + Duration::days(offset);
        let weekday = weekdays[date.weekday().num_days_from_monday() as usize];
        let tasks = if offset == 0 {
            today_tasks.clone()
        } else {
            let mut tasks = Vec::new();
            match offset {
                1 | 4 => {
                    tasks.push(plan_task(
                        "review",
                        "Повторение",
                        "Держим интервалы FSRS",
                        10,
                        "queue",
                        "review",
                        "",
                    ));
                    tasks.push(plan_task(
                        "weak",
                        &format!("Слабая тема: {weak_title}"),
                        "Слова и текст юнита",
                        10,
                        "href",
                        "",
                        &format!("#/unit/{weak_id}/vocab"),
                    ));
                    if offset == 4 && leech > 0 {
                        tasks.push(plan_task(
                            "leech",
                            "Leech-колода",
                            "Проблемные слова и мини-дриллы",
                            6,
                            "queue",
                            "leech",
                            "",
                        ));
                    }
                }
                2 | 5 => {
                    tasks.push(plan_task(
                        "new",
                        "Новые слова",
                        "Небольшая порция без перегрузки",
                        8,
                        "queue",
                        "new",
                        "",
                    ));
                    tasks.push(plan_task(
                        "audio",
                        "Аудирование",
                        "Слушаем и отвечаем на вопросы",
                        8,
                        "href",
                        "",
                        "#/audio",
                    ));
                    if offset == 5 && mistakes > 0 {
                        tasks.push(plan_task(
                            "mistakes",
                            "Тетрадь ошибок",
                            "Разбираем 2–3 ошибки",
                            8,
                            "href",
                            "",
                            "#/study/mistakes",
                        ));
                    }
                }
                3 => {
                    if readiness_view
                        .get("diagnostic")
                        .map(Value::is_null)
                        .unwrap_or(true)
                        || score < 60
                    {
                        tasks.push(plan_task(
                            "check",
                            "Диагностика",
                            "20 смешанных заданий с таймером",
                            22,
                            "diagnostic",
                            "",
                            "",
                        ));
                    } else {
                        tasks.push(plan_task(
                            "exam",
                            "Мини-экзамен",
                            "Проверяем прогресс на экзаменационном банке",
                            20,
                            "href",
                            "",
                            "#/exams",
                        ));
                    }
                    tasks.push(plan_task(
                        "mistakes",
                        "Разбор ошибок",
                        "Объяснение, пример и дрилл",
                        8,
                        "href",
                        "",
                        "#/study/mistakes",
                    ));
                }
                _ => {
                    tasks.push(plan_task(
                        "check",
                        "Проверка недели",
                        "Диагностика и обзор готовности",
                        22,
                        "diagnostic",
                        "",
                        "",
                    ));
                    tasks.push(plan_task(
                        "review",
                        "Лёгкое повторение",
                        "Только карточки, без нового",
                        8,
                        "queue",
                        "review",
                        "",
                    ));
                }
            }
            tasks
        };
        let total: u32 = tasks
            .iter()
            .filter_map(|task| task.get("minutes").and_then(Value::as_u64))
            .sum::<u64>() as u32;
        days.push(json!({
            "date": date.format("%Y-%m-%d").to_string(),
            "weekday": weekday,
            "today": offset == 0,
            "focus": if offset == 0 { weak_title } else if offset == 3 || offset == 6 { "проверка" } else { "ритм и слабые темы" },
            "tasks": tasks,
            "total_minutes": total,
        }));
    }

    let today_plan = days.first().cloned().unwrap_or(Value::Null);
    json!({
        "days": days,
        "today": today_plan,
        "readiness": score,
        "weak_units": weak_units,
        "exam_date": p.prefs.exam_date,
        "days_left": days_to_exam(&p.prefs.exam_date),
        "note": "План пересчитывается после каждого ответа, экзамена и изменения лимитов.",
        "generated_at": now,
    })
}
