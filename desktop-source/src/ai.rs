use crate::content::Unit;
use crate::settings::Settings;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

#[derive(Serialize)]
struct ChatRequest<'a> {
    model: &'a str,
    messages: &'a [ChatMessage],
    temperature: f32,
    max_tokens: u32,
    stream: bool,
}

fn endpoint(base: &str, path: &str) -> String {
    format!(
        "{}/{}",
        base.trim_end_matches('/'),
        path.trim_start_matches('/')
    )
}

fn auth(req: reqwest::RequestBuilder, settings: &Settings) -> reqwest::RequestBuilder {
    if settings.api_key.trim().is_empty() {
        req
    } else {
        req.bearer_auth(settings.api_key.trim())
    }
}

pub async fn openai_chat(
    client: &reqwest::Client,
    settings: &Settings,
    messages: &[ChatMessage],
) -> Result<String, String> {
    if settings.base_url.trim().is_empty() {
        return Err("Не заполнен адрес API (base URL).".into());
    }
    if settings.model.trim().is_empty() {
        return Err("Не выбрана модель.".into());
    }
    let url = endpoint(&settings.base_url, "chat/completions");
    let body = ChatRequest {
        model: settings.model.trim(),
        messages,
        temperature: settings.temperature.clamp(0.0, 1.5),
        max_tokens: settings.max_tokens.clamp(64, 4096),
        stream: false,
    };
    let resp = auth(client.post(&url), settings)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Не удалось подключиться к модели: {e}"))?;
    let status = resp.status();
    let text = resp
        .text()
        .await
        .map_err(|e| format!("Ошибка чтения ответа модели: {e}"))?;
    if !status.is_success() {
        let short = text.chars().take(700).collect::<String>();
        return Err(format!("Модель вернула ошибку {status}: {short}"));
    }
    let value: Value = serde_json::from_str(&text).map_err(|e| {
        format!(
            "Модель вернула не JSON: {e}. Ответ: {}",
            text.chars().take(400).collect::<String>()
        )
    })?;
    extract_content(&value).ok_or_else(|| {
        format!(
            "В ответе модели нет текста. Ответ: {}",
            text.chars().take(500).collect::<String>()
        )
    })
}

fn extract_content(value: &Value) -> Option<String> {
    let msg = value
        .get("choices")
        .and_then(|c| c.get(0))
        .and_then(|c| c.get("message"))?;
    if let Some(s) = msg.get("content").and_then(|c| c.as_str()) {
        return Some(s.to_string());
    }
    if let Some(parts) = msg.get("content").and_then(|c| c.as_array()) {
        let joined = parts
            .iter()
            .filter_map(|p| p.get("text").and_then(|t| t.as_str()))
            .collect::<Vec<_>>()
            .join("");
        if !joined.is_empty() {
            return Some(joined);
        }
    }
    // Some reasoning APIs put the answer in "reasoning_content" only.
    msg.get("reasoning_content")
        .and_then(|c| c.as_str())
        .map(ToString::to_string)
}

pub async fn list_models(
    client: &reqwest::Client,
    settings: &Settings,
) -> Result<Vec<String>, String> {
    if settings.base_url.trim().is_empty() {
        return Err("Не заполнен адрес API (base URL).".into());
    }
    let url = endpoint(&settings.base_url, "models");
    let resp = auth(client.get(&url), settings)
        .send()
        .await
        .map_err(|e| format!("Не удалось получить список моделей: {e}"))?;
    let status = resp.status();
    let text = resp.text().await.map_err(|e| e.to_string())?;
    if !status.is_success() {
        return Err(format!(
            "Сервер вернул {status}: {}",
            text.chars().take(400).collect::<String>()
        ));
    }
    let value: Value = serde_json::from_str(&text).map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    if let Some(data) = value.get("data").and_then(|d| d.as_array()) {
        for item in data {
            if let Some(id) = item.get("id").and_then(|i| i.as_str()) {
                out.push(id.to_string());
            } else if let Some(name) = item.get("name").and_then(|i| i.as_str()) {
                out.push(name.to_string());
            }
        }
    } else if let Some(models) = value.get("models").and_then(|d| d.as_array()) {
        for item in models {
            if let Some(name) = item.get("name").and_then(|i| i.as_str()) {
                out.push(name.to_string());
            }
        }
    }
    out.sort();
    out.dedup();
    Ok(out)
}

fn unit_words(unit: &Unit, limit: usize) -> String {
    unit.vocab
        .iter()
        .take(limit)
        .map(|v| format!("{} — {}", v.en, v.ru))
        .collect::<Vec<_>>()
        .join("; ")
}

fn unit_excerpt(unit: &Unit, limit: usize) -> String {
    let parts: Vec<&str> = unit
        .texts
        .iter()
        .flat_map(|t| t.paragraphs.iter())
        .map(String::as_str)
        .collect();
    parts.join(" ").chars().take(limit).collect()
}

pub fn chat_system(settings: &Settings, unit: Option<&Unit>) -> String {
    let mut s = String::from(
        "Ты — ИИ-репетитор по IT-английскому в приложении IT English Lab. \
Студент — русскоязычный, уровень A2–B1, готовится к экзамену по английскому в техническом вузе. \
Твоя задача — помочь понять IT-лексику и научиться переводить с русского на английский.\n\
Правила:\n\
- Отвечай по-русски, но все примеры, термины и исправления давай на английском.\n\
- Будь конкретным: короткие абзацы, списки, примеры. Не читай лекций без запроса.\n\
- Если студент перевёл фразу, сначала укажи, что получилось хорошо, затем исправь ошибки и дай естественный вариант.\n\
- Не выдумывай факты о материалах курса. Если чего-то нет в контексте, скажи об этом.\n\
- Не выполняй домашнее задание целиком без объяснения: показывай, как прийти к ответу.\n\
- Не используй Markdown-таблицы, они плохо читаются в чате.\n",
    );
    if let Some(u) = unit {
        s.push_str(&format!(
            "\nТекущий юнит {}: {} / {}.\nАктивная лексика: {}.\nФрагмент текста: {}\n",
            u.id,
            u.title_en,
            u.title_ru,
            unit_words(u, 30),
            unit_excerpt(u, 900)
        ));
    } else {
        s.push_str(
            "\nСтудент не выбрал юнит. Можешь отвечать на общие вопросы по IT-английскому.\n",
        );
    }
    if !settings.system_extra.trim().is_empty() {
        s.push_str("\nДополнительные пожелания пользователя: ");
        s.push_str(settings.system_extra.trim());
        s.push('\n');
    }
    s
}

pub fn check_messages(unit: Option<&Unit>, sentence_ru: &str, answer_en: &str) -> Vec<ChatMessage> {
    let context = unit
        .map(|u| {
            format!(
                "Юнит {}: {}. Лексика: {}",
                u.id,
                u.title_en,
                unit_words(u, 24)
            )
        })
        .unwrap_or_default();
    let system = format!(
        "Ты — строгий, но доброжелательный преподаватель IT-английского. Проверь перевод студента с русского на английский.\n\
{context}\n\
Верни ТОЛЬКО валидный JSON без markdown и пояснений вокруг:\n\
{{\"score\": <целое 0-100>, \"verdict\": <краткая оценка по-русски>, \"corrected\": <исправленный английский вариант>, \"explanation\": <конкретное объяснение ошибок, 1-3 предложения>, \"tips\": [<совет 1>, <совет 2>]}}\n\
Не копируй угловые скобки и служебные подписи из схемы; подставь реальные значения. Критерии: смысл, грамматика, порядок слов, IT-лексика, естественность. Если перевод уже верный, score 95-100 и corrected можно оставить как есть. В tips дай 1-2 конкретных совета именно по этому переводу; не повторяй инструкцию и не пиши шаблонные фразы. Не добавляй ничего вне JSON."
    );
    let user = format!("Русская фраза: {sentence_ru}\nПеревод студента: {answer_en}");
    vec![
        ChatMessage {
            role: "system".into(),
            content: system,
        },
        ChatMessage {
            role: "user".into(),
            content: user,
        },
    ]
}

pub fn check_retry_messages(
    unit: Option<&Unit>,
    sentence_ru: &str,
    answer_en: &str,
) -> Vec<ChatMessage> {
    let context = unit
        .map(|u| {
            format!(
                "Юнит {}: {}. Лексика: {}",
                u.id,
                u.title_en,
                unit_words(u, 18)
            )
        })
        .unwrap_or_default();
    let system = format!(
        "Ты — экзаменатор по IT-английскому. Предыдущий ответ модели не удалось разобрать как JSON.\n\
{context}\n\
Верни ровно один JSON-объект и больше ничего. Не используй ```json, markdown, комментарии или текст до/после JSON.\n\
Поля: score — целое число 0-100; verdict — краткая конкретная оценка по-русски; corrected — исправленный английский вариант; explanation — конкретное объяснение ошибок по-русски; tips — массив из 1-2 строк с советами.\n\
Не копируй названия полей или эту инструкцию в значения. Все строки бери в двойные кавычки, внутри строк не должно быть сырых переводов строк."
    );
    let user = format!(
        "Русская фраза: {sentence_ru}\nПеревод студента: {answer_en}\nПроверь смысл, грамматику, порядок слов и IT-лексику. Верни только JSON."
    );
    vec![
        ChatMessage {
            role: "system".into(),
            content: system,
        },
        ChatMessage {
            role: "user".into(),
            content: user,
        },
    ]
}

pub fn parse_json_answer(text: &str) -> Value {
    let trimmed = text.trim();
    if let Ok(v) = serde_json::from_str::<Value>(trimmed) {
        return v;
    }
    if let (Some(start), Some(end)) = (trimmed.find('{'), trimmed.rfind('}')) {
        if end > start {
            if let Ok(v) = serde_json::from_str::<Value>(&trimmed[start..=end]) {
                return v;
            }
        }
    }
    json!({
        "score": Value::Null,
        "verdict": "Модель ответила не в формате JSON",
        "corrected": "",
        "explanation": trimmed.chars().take(1200).collect::<String>(),
        "tips": []
    })
}

fn score_of(value: &Value) -> Option<f64> {
    if let Some(n) = value.as_f64() {
        return Some(n);
    }
    let raw = value.as_str()?.trim().replace(',', ".");
    if let Some((left, _)) = raw.split_once('/') {
        return left.trim().parse::<f64>().ok();
    }
    raw.parse::<f64>().ok()
}

fn score_verdict(score: f64) -> &'static str {
    if score >= 90.0 {
        "Отличный перевод! Смысл передан точно."
    } else if score >= 75.0 {
        "Хороший перевод, есть небольшие недочёты."
    } else if score >= 60.0 {
        "Перевод понятен, но нужно исправить ошибки."
    } else {
        "Перевод требует доработки."
    }
}

fn score_explanation(score: f64) -> &'static str {
    if score >= 90.0 {
        "Перевод в целом точный и естественный. Проверьте мелкие детали: артикли, предлоги и порядок слов."
    } else if score >= 75.0 {
        "Смысл передан верно, но есть грамматические или лексические неточности. Сравните с исправленным вариантом."
    } else if score >= 60.0 {
        "Основная мысль понятна, но в переводе есть заметные ошибки. Обратите внимание на грамматику и IT-лексику."
    } else {
        "Перевод пока неточный. Сначала передайте смысл, затем проверьте грамматику и порядок слов."
    }
}

fn looks_like_placeholder(text: &str) -> bool {
    let lower = text.to_lowercase();
    [
        "краткая оценка",
        "оценка по-русски",
        "контрольный перевод",
        "отправленный естественный",
        "исправленный английский вариант",
        "исправленный естественный",
        "2-3",
        "коротких совет",
        "полезных выражения",
        "что не так и почему",
        "1-2 предложения",
        "1-3 предложения",
        "конкретное объяснение",
        "конкретные советы",
        "конкретный совет",
        "служебные подписи",
        "совет 1",
        "совет 2",
    ]
    .iter()
    .any(|needle| lower.contains(needle))
}

pub fn normalize_check_result(result: &mut Value, answer_en: &str) {
    let Some(obj) = result.as_object_mut() else {
        *result = json!({
            "score": Value::Null,
            "verdict": "Модель ответила не в формате JSON",
            "corrected": answer_en.trim(),
            "explanation": "Не удалось разобрать ответ модели. Проверьте перевод вручную.",
            "tips": []
        });
        return;
    };

    let score = obj.get("score").and_then(score_of);
    if let Some(value) = score {
        obj.insert(
            "score".into(),
            json!(value.round().clamp(0.0, 100.0) as i64),
        );
    }

    let verdict = obj
        .get("verdict")
        .and_then(Value::as_str)
        .unwrap_or("")
        .trim()
        .to_string();
    if verdict.is_empty() || verdict.chars().count() > 180 || looks_like_placeholder(&verdict) {
        let fallback = score.map(score_verdict).unwrap_or("Проверка завершена");
        obj.insert("verdict".into(), json!(fallback));
    }

    let corrected = obj
        .get("corrected")
        .and_then(Value::as_str)
        .unwrap_or("")
        .trim()
        .to_string();
    let corrected_is_bad = corrected.is_empty()
        || !corrected.chars().any(|c| c.is_ascii_alphabetic())
        || looks_like_placeholder(&corrected);
    if corrected_is_bad {
        obj.insert("corrected".into(), json!(answer_en.trim()));
    }

    let explanation = obj
        .get("explanation")
        .and_then(Value::as_str)
        .unwrap_or("")
        .trim()
        .to_string();
    if explanation.is_empty()
        || explanation.chars().count() > 900
        || looks_like_placeholder(&explanation)
    {
        let fallback = score
            .map(score_explanation)
            .unwrap_or("Модель не дала пояснение. Проверьте перевод вручную.");
        obj.insert("explanation".into(), json!(fallback));
    }

    let raw_tips = obj.remove("tips");
    let mut tips: Vec<String> = match raw_tips {
        Some(Value::Array(items)) => items
            .into_iter()
            .filter_map(|item| item.as_str().map(str::to_string))
            .collect(),
        Some(Value::String(item)) => vec![item],
        _ => Vec::new(),
    };
    let mut had_placeholder_tip = false;
    tips.retain(|tip| {
        let tip = tip.trim();
        let placeholder = looks_like_placeholder(tip);
        if placeholder {
            had_placeholder_tip = true;
        }
        !tip.is_empty() && tip.chars().count() <= 200 && !placeholder
    });
    if had_placeholder_tip {
        // The model echoed the schema instead of giving real advice. Do not mix
        // the remaining random suggestions with the useful feedback.
        tips.clear();
    }
    tips.truncate(3);
    obj.insert("tips".into(), json!(tips));
}
