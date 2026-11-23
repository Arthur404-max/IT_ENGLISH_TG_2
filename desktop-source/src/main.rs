mod ai;
mod content;
#[cfg(feature = "embedded")]
mod embedded;
mod progress;
mod settings;
mod speaking;
mod study;

use ai::ChatMessage;
use axum::{
    extract::{Path, Query, State},
    http::{header, StatusCode},
    response::{Html, IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use content::{Content, Unit};
use fs2::FileExt as Fs2FileExt;
use progress::{ExamAttempt, Progress, SCHEMA_VERSION};
use serde::Deserialize;
use serde_json::{json, Value};
use settings::Settings;
use std::{
    fs::OpenOptions,
    net::{IpAddr, Ipv4Addr, TcpListener},
    path::PathBuf,
    sync::{Arc, Mutex, RwLock},
};
use tokio::net::TcpListener as TokioListener;

type ApiResult<T> = Result<T, (StatusCode, Json<Value>)>;

fn api_err(status: StatusCode, msg: impl Into<String>) -> (StatusCode, Json<Value>) {
    (status, Json(json!({ "error": msg.into() })))
}

struct Store {
    dir: PathBuf,
    settings: RwLock<Settings>,
    progress: Mutex<Progress>,
    warnings: Mutex<Vec<String>>,
    save_error: Mutex<Option<String>>,
    last_backup_day: Mutex<String>,
    _lock: std::fs::File,
}

impl Store {
    fn load(dir: PathBuf) -> anyhow::Result<Self> {
        std::fs::create_dir_all(&dir)?;
        let lock_path = dir.join("app.lock");
        let lock_file = OpenOptions::new()
            .create(true)
            .read(true)
            .write(true)
            .open(&lock_path)?;
        if Fs2FileExt::try_lock_exclusive(&lock_file).is_err() {
            anyhow::bail!(
                "IT English Lab уже запущен с папкой данных {}. Закройте другой экземпляр или укажите другую --data-dir.",
                dir.display()
            );
        }

        let settings_path = dir.join("settings.json");
        let progress_path = dir.join("progress.json");
        let (settings, settings_warning): (Settings, Option<String>) =
            settings::load_json_checked(&settings_path);
        let (mut progress, progress_warning): (Progress, Option<String>) =
            settings::load_json_checked(&progress_path);
        // Startup snapshot before any migration or recovery. Do not copy a file
        // that failed to parse: it has already been quarantined for inspection.
        if progress_warning.is_none() {
            let _ = settings::backup_json(&progress_path, 5);
        }
        let mut warnings = Vec::new();
        if let Some(w) = settings_warning {
            warnings.push(w);
        }
        if let Some(w) = progress_warning {
            warnings.push(w);
        }
        if progress.migrate() {
            if let Err(e) = settings::save_json(&progress_path, &progress) {
                warnings.push(format!("Не удалось сохранить миграцию прогресса: {e}"));
            }
        }
        let today = chrono::Local::now().format("%Y-%m-%d").to_string();
        Ok(Self {
            dir,
            settings: RwLock::new(settings),
            progress: Mutex::new(progress),
            warnings: Mutex::new(warnings),
            save_error: Mutex::new(None),
            last_backup_day: Mutex::new(today),
            _lock: lock_file,
        })
    }

    fn save_settings(&self) -> anyhow::Result<()> {
        let s = self.settings.read().unwrap().clone();
        settings::save_json(&self.dir.join("settings.json"), &s)
    }

    fn backup_progress(&self) -> anyhow::Result<()> {
        settings::backup_json(&self.dir.join("progress.json"), 5).map(|_| ())
    }

    fn maybe_daily_backup(&self) {
        let today = chrono::Local::now().format("%Y-%m-%d").to_string();
        let should_backup = self
            .last_backup_day
            .lock()
            .map(|day| *day != today)
            .unwrap_or(false);
        if !should_backup {
            return;
        }
        if settings::backup_json(&self.dir.join("progress.json"), 5).is_ok() {
            if let Ok(mut day) = self.last_backup_day.lock() {
                *day = today;
            }
        }
    }

    fn save_progress(&self) -> anyhow::Result<()> {
        self.maybe_daily_backup();
        let result = {
            let p = self
                .progress
                .lock()
                .map_err(|_| anyhow::anyhow!("Блокировка прогресса повреждена"))?;
            settings::save_json(&self.dir.join("progress.json"), &*p)
        };
        if let Ok(mut error) = self.save_error.lock() {
            *error = result.as_ref().err().map(|e| e.to_string());
        }
        result
    }
}

fn persist(state: &AppState) -> ApiResult<()> {
    state.store.save_progress().map_err(|error| {
        api_err(
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Не удалось сохранить прогресс: {error}"),
        )
    })
}

#[derive(Clone)]
struct AppState {
    store: Arc<Store>,
    content: Arc<Content>,
    exams: Arc<Value>,
    audio: Arc<Value>,
    http: reqwest::Client,
    lan_enabled: bool,
    lan_url: Option<String>,
    #[cfg(feature = "embedded")]
    embedded: Arc<embedded::EmbeddedManager>,
}

#[derive(Deserialize)]
struct AnswerReq {
    unit_id: i32,
    en: String,
    correct: bool,
    #[serde(default)]
    response_ms: Option<u32>,
    /// Optional FSRS rating: 1 Again, 2 Hard, 3 Good, 4 Easy.
    #[serde(default)]
    rating: Option<u8>,
}

#[derive(Deserialize)]
struct SessionReq {
    #[serde(default)]
    correct: u32,
    #[serde(default)]
    total: u32,
}

#[derive(Deserialize)]
struct ChatReq {
    #[serde(default)]
    unit_id: Option<i32>,
    #[serde(default)]
    messages: Vec<ChatMessage>,
}

#[derive(Deserialize)]
struct CheckReq {
    #[serde(default)]
    unit_id: Option<i32>,
    sentence_ru: String,
    answer_en: String,
}

#[derive(Deserialize)]
struct ImportProgressReq {
    progress: Value,
    #[serde(default)]
    merge: bool,
}

#[derive(Deserialize)]
struct RestoreProgressReq {
    name: String,
}

#[derive(Deserialize)]
struct QueueQuery {
    #[serde(default)]
    kind: Option<String>,
    #[serde(default)]
    limit: Option<usize>,
}

#[derive(Deserialize)]
struct PrefsReq {
    #[serde(default)]
    daily_new_limit: Option<u32>,
    #[serde(default)]
    daily_review_limit: Option<u32>,
    #[serde(default)]
    daily_leech_limit: Option<u32>,
    #[serde(default)]
    daily_exam_limit: Option<u32>,
    #[serde(default)]
    desired_minutes: Option<u32>,
    #[serde(default)]
    desired_retention_pct: Option<u32>,
    #[serde(default)]
    max_interval_days: Option<u32>,
    #[serde(default)]
    exam_date: Option<String>,
}

#[derive(Deserialize)]
struct MistakeResolveReq {
    id: String,
    #[serde(default = "default_true")]
    resolved: bool,
}

#[derive(Deserialize)]
struct AudioDoneReq {
    id: String,
    #[serde(default = "default_true")]
    done: bool,
}

#[derive(Deserialize)]
struct SpeakingAttemptReq {
    id: String,
    /// True when the learner marks the prompt as practised; false for a retry.
    #[serde(default)]
    completed: bool,
}

fn default_true() -> bool {
    true
}

#[derive(Deserialize)]
struct SettingsReq {
    #[serde(default)]
    mode: Option<String>,
    #[serde(default)]
    base_url: Option<String>,
    #[serde(default)]
    model: Option<String>,
    #[serde(default)]
    api_key: Option<String>,
    #[serde(default)]
    clear_key: Option<bool>,
    #[serde(default)]
    temperature: Option<f32>,
    #[serde(default)]
    max_tokens: Option<u32>,
    #[serde(default)]
    embedded_model: Option<String>,
    #[serde(default)]
    embedded_ctx: Option<u32>,
    #[serde(default)]
    system_extra: Option<String>,
}

fn settings_view(state: &AppState) -> Value {
    let s = state.store.settings.read().unwrap();
    #[cfg(not(feature = "embedded"))]
    let embedded = json!({
        "compiled": false,
        "loaded": false,
        "downloading": false,
        "progress": 0,
        "bytes": 0,
        "total": 0,
        "error": null,
        "path": s.embedded_model,
    });
    #[cfg(feature = "embedded")]
    let embedded = crate::embedded::status_json(&state.embedded, &s);
    json!({
        "mode": s.mode,
        "base_url": s.base_url,
        "model": s.model,
        "has_key": !s.api_key.trim().is_empty(),
        "key_hint": s.key_hint(),
        "temperature": s.temperature,
        "max_tokens": s.max_tokens,
        "embedded_model": s.embedded_model,
        "embedded_ctx": s.embedded_ctx,
        "system_extra": s.system_extra,
        "data_dir": state.store.dir.to_string_lossy(),
        "backups": settings::list_backups(&state.store.dir, "progress"),
        "lan_enabled": state.lan_enabled,
        "lan_url": state.lan_url,
        "embedded": embedded
    })
}

fn progress_view(p: &Progress) -> Value {
    json!({
        "version": p.version,
        "schema_version": SCHEMA_VERSION,
        "words": p.words,
        "stats": p.stats,
        "days": p.days,
        "streak": p.streak(),
        "learned": p.learned_count(),
        "activity": p.activity_json(),
        "exams": p.exams,
        "due": p.due_count(),
        "today": p.today_json(),
        "prefs": p.prefs,
        "resolved_mistakes": p.resolved_mistakes,
        "audio_done": p.audio_done,
        "speaking_done": p.speaking_done,
        "speaking_attempts": p.speaking_attempts,
        "speaking_last_at": p.speaking_last_at,
        "day_new": p.day_new,
        "day_reviews": p.day_reviews,
        "day_leech": p.day_leech,
        "day_exam_errors": p.day_exam_errors,
    })
}

async fn index() -> Html<&'static str> {
    Html(include_str!("../assets/index.html"))
}

fn js_response(body: &'static str) -> Response {
    (
        [
            (
                header::CONTENT_TYPE,
                "application/javascript; charset=utf-8",
            ),
            (header::CACHE_CONTROL, "no-cache"),
        ],
        body,
    )
        .into_response()
}

async fn app_js() -> Response {
    js_response(include_str!("../assets/app.js"))
}

async fn views_home_js() -> Response {
    js_response(include_str!("../assets/views-home.js"))
}

async fn views_unit_js() -> Response {
    js_response(include_str!("../assets/views-unit.js"))
}

async fn practice_js() -> Response {
    js_response(include_str!("../assets/practice.js"))
}

async fn chat_js() -> Response {
    js_response(include_str!("../assets/chat.js"))
}

async fn settings_js() -> Response {
    js_response(include_str!("../assets/settings.js"))
}

async fn events_js() -> Response {
    js_response(include_str!("../assets/events.js"))
}

async fn exam_js() -> Response {
    js_response(include_str!("../assets/exam.js"))
}

async fn analytics_js() -> Response {
    js_response(include_str!("../assets/analytics.js"))
}

async fn study_js() -> Response {
    js_response(include_str!("../assets/study.js"))
}

async fn audio_js() -> Response {
    js_response(include_str!("../assets/audio.js"))
}

async fn speaking_js() -> Response {
    js_response(include_str!("../assets/speaking.js"))
}

async fn pwa_js() -> Response {
    js_response(include_str!("../assets/pwa.js"))
}

async fn styles_css() -> Response {
    (
        [(header::CONTENT_TYPE, "text/css; charset=utf-8")],
        include_str!("../assets/styles.css"),
    )
        .into_response()
}

async fn favicon() -> Response {
    (
        [
            (header::CONTENT_TYPE, "image/svg+xml"),
            (header::CACHE_CONTROL, "public, max-age=86400"),
        ],
        r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#c6f56b"/><path d="M20 18h24v8H36v22h-8V26h-8z" fill="#0b0f0e"/></svg>"##,
    )
        .into_response()
}

async fn health(State(state): State<AppState>) -> Json<Value> {
    let warnings = state
        .store
        .warnings
        .lock()
        .map(|w| w.clone())
        .unwrap_or_default();
    let save_error = state.store.save_error.lock().ok().and_then(|e| e.clone());
    Json(json!({
        "ok": true,
        "version": env!("CARGO_PKG_VERSION"),
        "schema_version": SCHEMA_VERSION,
        "data_dir": state.store.dir.to_string_lossy(),
        "warnings": warnings,
        "save_error": save_error,
    }))
}

async fn manifest() -> Response {
    (
        [
            (
                header::CONTENT_TYPE,
                "application/manifest+json; charset=utf-8",
            ),
            (header::CACHE_CONTROL, "no-cache"),
        ],
        include_str!("../assets/manifest.webmanifest"),
    )
        .into_response()
}

async fn service_worker() -> Response {
    (
        [
            (
                header::CONTENT_TYPE,
                "application/javascript; charset=utf-8",
            ),
            (header::CACHE_CONTROL, "no-cache"),
            (
                header::HeaderName::from_static("service-worker-allowed"),
                "/",
            ),
        ],
        include_str!("../assets/sw.js"),
    )
        .into_response()
}

async fn app_icon_svg() -> Response {
    (
        [
            (header::CONTENT_TYPE, "image/svg+xml"),
            (header::CACHE_CONTROL, "public, max-age=86400"),
        ],
        include_str!("../assets/icon.svg"),
    )
        .into_response()
}

async fn app_icon_192() -> Response {
    (
        [
            (header::CONTENT_TYPE, "image/png"),
            (header::CACHE_CONTROL, "public, max-age=86400"),
        ],
        include_bytes!("../assets/icon-192.png").as_slice(),
    )
        .into_response()
}

async fn app_icon_512() -> Response {
    (
        [
            (header::CONTENT_TYPE, "image/png"),
            (header::CACHE_CONTROL, "public, max-age=86400"),
        ],
        include_bytes!("../assets/icon-512.png").as_slice(),
    )
        .into_response()
}

async fn audio_file(Path(name): Path<String>) -> Response {
    let bytes: &'static [u8] = match name.as_str() {
        "unit03-multicore.wav" => include_bytes!("../assets/audio/unit03-multicore.wav").as_slice(),
        "unit07-osi.wav" => include_bytes!("../assets/audio/unit07-osi.wav").as_slice(),
        "unit09-search.wav" => include_bytes!("../assets/audio/unit09-search.wav").as_slice(),
        "unit12-virus.wav" => include_bytes!("../assets/audio/unit12-virus.wav").as_slice(),
        "unit14-neural.wav" => include_bytes!("../assets/audio/unit14-neural.wav").as_slice(),
        _ => {
            return (
                StatusCode::NOT_FOUND,
                Json(json!({ "error": "Аудиофайл не найден" })),
            )
                .into_response()
        }
    };
    (
        [
            (header::CONTENT_TYPE, "audio/wav"),
            (header::CACHE_CONTROL, "public, max-age=86400"),
        ],
        bytes,
    )
        .into_response()
}

async fn get_exams(State(state): State<AppState>) -> Json<Value> {
    Json((*state.exams).clone())
}

async fn get_units(State(state): State<AppState>) -> Json<Value> {
    Json(json!({
        "units": state.content.summaries(),
        "total_vocab": state.content.total_vocab(),
        "total_units": state.content.units.len(),
    }))
}

async fn get_unit(State(state): State<AppState>, Path(id): Path<i32>) -> ApiResult<Json<Unit>> {
    state
        .content
        .unit(id)
        .cloned()
        .map(Json)
        .ok_or_else(|| api_err(StatusCode::NOT_FOUND, format!("Юнит {id} не найден")))
}

async fn get_progress(State(state): State<AppState>) -> Json<Value> {
    let p = state.store.progress.lock().unwrap();
    let mut view = progress_view(&p);
    let warnings = state
        .store
        .warnings
        .lock()
        .map(|w| w.clone())
        .unwrap_or_default();
    drop(p);
    view["warnings"] = json!(warnings);
    Json(view)
}

async fn get_study_queue(
    State(state): State<AppState>,
    Query(query): Query<QueueQuery>,
) -> Json<Value> {
    let p = state.store.progress.lock().unwrap();
    let mode = query.kind.as_deref().unwrap_or("review");
    Json(study::queue(
        &p,
        &state.content,
        &state.exams,
        mode,
        query.limit,
    ))
}

async fn get_study_readiness(State(state): State<AppState>) -> Json<Value> {
    let p = state.store.progress.lock().unwrap();
    Json(study::readiness(&p, &state.content, &state.exams))
}

async fn get_study_plan(State(state): State<AppState>) -> Json<Value> {
    let p = state.store.progress.lock().unwrap();
    Json(study::plan(&p, &state.content, &state.exams))
}

async fn get_study_mistakes(State(state): State<AppState>) -> Json<Value> {
    let p = state.store.progress.lock().unwrap();
    Json(study::mistakes(&p, &state.content, &state.exams))
}

async fn post_mistake_resolve(
    State(state): State<AppState>,
    Json(req): Json<MistakeResolveReq>,
) -> ApiResult<Json<Value>> {
    let id = req.id.trim();
    if id.is_empty() {
        return Err(api_err(StatusCode::BAD_REQUEST, "Не указан id ошибки"));
    }
    let unresolved = {
        let mut p = state.store.progress.lock().unwrap();
        study::set_mistake_resolved(&mut p, id, req.resolved);
        let view = study::mistakes(&p, &state.content, &state.exams);
        view.get("unresolved").and_then(Value::as_u64).unwrap_or(0)
    };
    persist(&state)?;
    Ok(Json(
        json!({ "ok": true, "id": id, "resolved": req.resolved, "unresolved": unresolved }),
    ))
}

async fn post_study_prefs(
    State(state): State<AppState>,
    Json(req): Json<PrefsReq>,
) -> ApiResult<Json<Value>> {
    let prefs = {
        let mut p = state.store.progress.lock().unwrap();
        if let Some(value) = req.daily_new_limit {
            p.prefs.daily_new_limit = value.min(100);
        }
        if let Some(value) = req.daily_review_limit {
            p.prefs.daily_review_limit = value.min(500);
        }
        if let Some(value) = req.daily_leech_limit {
            p.prefs.daily_leech_limit = value.min(100);
        }
        if let Some(value) = req.daily_exam_limit {
            p.prefs.daily_exam_limit = value.min(100);
        }
        if let Some(value) = req.desired_minutes {
            p.prefs.desired_minutes = value.clamp(5, 180);
        }
        if let Some(value) = req.desired_retention_pct {
            p.prefs.desired_retention_pct = value.clamp(80, 95);
        }
        if let Some(value) = req.max_interval_days {
            p.prefs.max_interval_days = value.clamp(7, 3650);
        }
        if let Some(date) = req.exam_date {
            let date = date.trim().to_string();
            if !date.is_empty() && chrono::NaiveDate::parse_from_str(&date, "%Y-%m-%d").is_err() {
                return Err(api_err(
                    StatusCode::BAD_REQUEST,
                    "Дата экзамена должна быть в формате ГГГГ-ММ-ДД",
                ));
            }
            p.prefs.exam_date = date;
        }
        p.prefs.clone()
    };
    persist(&state)?;
    Ok(Json(json!({ "ok": true, "prefs": prefs })))
}

async fn get_audio(State(state): State<AppState>) -> Json<Value> {
    let p = state.store.progress.lock().unwrap();
    let mut view = (*state.audio).clone();
    view["done"] = json!(p.audio_done);
    view["completed"] = json!(p.audio_done.len());
    Json(view)
}

async fn get_speaking(State(state): State<AppState>) -> Json<Value> {
    let p = state.store.progress.lock().unwrap();
    Json(speaking::view(&state.content, &p))
}

async fn post_speaking_attempt(
    State(state): State<AppState>,
    Json(req): Json<SpeakingAttemptReq>,
) -> ApiResult<Json<Value>> {
    let id = req.id.trim();
    if id.is_empty() {
        return Err(api_err(StatusCode::BAD_REQUEST, "Не указана фраза"));
    }
    if !speaking::contains(&state.content, id) {
        return Err(api_err(StatusCode::NOT_FOUND, "Фраза не найдена"));
    }
    let view = {
        let mut p = state.store.progress.lock().unwrap();
        p.speaking_attempts = p.speaking_attempts.saturating_add(1);
        p.speaking_last_at = chrono::Local::now().timestamp();
        if req.completed && !p.speaking_done.iter().any(|item| item == id) {
            p.speaking_done.push(id.to_string());
        }
        speaking::view(&state.content, &p)
    };
    persist(&state)?;
    Ok(Json(json!({
        "ok": true,
        "id": id,
        "completed": req.completed,
        "speaking": view,
    })))
}

async fn post_audio_done(
    State(state): State<AppState>,
    Json(req): Json<AudioDoneReq>,
) -> ApiResult<Json<Value>> {
    let id = req.id.trim();
    if id.is_empty() {
        return Err(api_err(StatusCode::BAD_REQUEST, "Не указан аудиоматериал"));
    }
    let known = state
        .audio
        .get("items")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .any(|item| item.get("id").and_then(Value::as_str) == Some(id))
        })
        .unwrap_or(false);
    if !known {
        return Err(api_err(StatusCode::NOT_FOUND, "Аудиоматериал не найден"));
    }
    let done = {
        let mut p = state.store.progress.lock().unwrap();
        let exists = p.audio_done.iter().any(|item| item == id);
        if req.done && !exists {
            p.audio_done.push(id.to_string());
        } else if !req.done && exists {
            p.audio_done.retain(|item| item != id);
        }
        p.audio_done.clone()
    };
    persist(&state)?;
    Ok(Json(json!({ "ok": true, "id": id, "done": done })))
}

async fn post_answer(
    State(state): State<AppState>,
    Json(req): Json<AnswerReq>,
) -> ApiResult<Json<Value>> {
    let response_ms = req.response_ms.unwrap_or(0).min(600_000);
    let (word, stats, streak, learned, today, due) = {
        let mut p = state.store.progress.lock().unwrap();
        let word = match req.rating {
            Some(rating) => p
                .record_rating(req.unit_id, &req.en, rating, response_ms)
                .clone(),
            None => p
                .record(req.unit_id, &req.en, req.correct, response_ms)
                .clone(),
        };
        (
            word,
            p.stats.clone(),
            p.streak(),
            p.learned_count(),
            p.today_json(),
            p.due_count(),
        )
    };
    persist(&state)?;
    Ok(Json(json!({
        "word": word,
        "stats": stats,
        "streak": streak,
        "learned": learned,
        "today": today,
        "due": due,
    })))
}

async fn post_session(
    State(state): State<AppState>,
    Json(req): Json<SessionReq>,
) -> ApiResult<Json<Value>> {
    let stats = {
        let mut p = state.store.progress.lock().unwrap();
        p.finish_session();
        p.stats.clone()
    };
    persist(&state)?;
    Ok(Json(
        json!({ "ok": true, "stats": stats, "correct": req.correct, "total": req.total }),
    ))
}

async fn reset_progress(State(state): State<AppState>) -> ApiResult<Json<Value>> {
    state.store.backup_progress().map_err(|error| {
        api_err(
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Не удалось создать резервную копию: {error}"),
        )
    })?;
    {
        let mut p = state.store.progress.lock().unwrap();
        p.reset();
    }
    persist(&state)?;
    Ok(Json(json!({ "ok": true })))
}

async fn get_exam_history(State(state): State<AppState>) -> Json<Value> {
    let p = state.store.progress.lock().unwrap();
    Json(json!({ "attempts": p.exams }))
}

async fn post_exam_history(
    State(state): State<AppState>,
    Json(attempt): Json<ExamAttempt>,
) -> ApiResult<Json<Value>> {
    let (saved, today, due) = {
        let mut p = state.store.progress.lock().unwrap();
        let saved = p.add_exam(attempt);
        (saved, p.today_json(), p.due_count())
    };
    persist(&state)?;
    Ok(Json(
        json!({ "ok": true, "attempt": saved, "today": today, "due": due }),
    ))
}

async fn delete_exam_history(State(state): State<AppState>) -> ApiResult<Json<Value>> {
    state.store.backup_progress().map_err(|error| {
        api_err(
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Не удалось создать резервную копию: {error}"),
        )
    })?;
    {
        let mut p = state.store.progress.lock().unwrap();
        p.clear_exams();
    }
    persist(&state)?;
    let due = {
        let p = state.store.progress.lock().unwrap();
        p.due_count()
    };
    Ok(Json(json!({ "ok": true, "due": due })))
}

async fn import_progress(
    State(state): State<AppState>,
    Json(req): Json<ImportProgressReq>,
) -> ApiResult<Json<Value>> {
    let object = req
        .progress
        .as_object()
        .ok_or_else(|| api_err(StatusCode::BAD_REQUEST, "Ожидался объект прогресса"))?;
    let known = [
        "version",
        "schema_version",
        "words",
        "stats",
        "days",
        "exams",
        "day_ms",
        "day_exams",
        "day_new",
        "day_reviews",
        "prefs",
        "resolved_mistakes",
        "audio_done",
        "speaking_done",
        "speaking_attempts",
        "speaking_last_at",
    ];
    if !known.iter().any(|key| object.contains_key(*key)) {
        return Err(api_err(
            StatusCode::BAD_REQUEST,
            "В файле нет данных IT English Lab: ожидались поля progress/words/stats/exams.",
        ));
    }
    let mut imported: Progress = serde_json::from_value(req.progress).map_err(|e| {
        api_err(
            StatusCode::BAD_REQUEST,
            format!("Некорректный файл прогресса: {e}"),
        )
    })?;
    imported.migrate();
    state.store.backup_progress().map_err(|error| {
        api_err(
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Не удалось создать резервную копию: {error}"),
        )
    })?;
    let merged = req.merge;
    let view = {
        let mut p = state.store.progress.lock().unwrap();
        if merged {
            p.merge_from(imported);
        } else {
            *p = imported;
        }
        progress_view(&p)
    };
    persist(&state)?;
    Ok(Json(
        json!({ "ok": true, "merged": merged, "progress": view }),
    ))
}

async fn restore_progress(
    State(state): State<AppState>,
    Json(req): Json<RestoreProgressReq>,
) -> ApiResult<Json<Value>> {
    let name = req.name.trim();
    let backups = settings::list_backups(&state.store.dir, "progress");
    if !backups.iter().any(|item| item == name) {
        return Err(api_err(
            StatusCode::BAD_REQUEST,
            "Резервная копия не найдена. Обновите список и попробуйте снова.",
        ));
    }
    let path = settings::backups_dir(&state.store.dir).join(name);
    let text = std::fs::read_to_string(&path).map_err(|error| {
        api_err(
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Не удалось прочитать резервную копию: {error}"),
        )
    })?;
    let mut restored: Progress = serde_json::from_str(&text).map_err(|error| {
        api_err(
            StatusCode::BAD_REQUEST,
            format!("Резервная копия повреждена: {error}"),
        )
    })?;
    restored.migrate();
    // Keep the current state recoverable before replacing it.
    state.store.backup_progress().map_err(|error| {
        api_err(
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Не удалось создать резервную копию текущего прогресса: {error}"),
        )
    })?;
    let view = {
        let mut p = state.store.progress.lock().unwrap();
        *p = restored;
        progress_view(&p)
    };
    persist(&state)?;
    Ok(Json(
        json!({ "ok": true, "restored": name, "progress": view }),
    ))
}

async fn get_settings(State(state): State<AppState>) -> Json<Value> {
    Json(settings_view(&state))
}

async fn post_settings(
    State(state): State<AppState>,
    Json(req): Json<SettingsReq>,
) -> ApiResult<Json<Value>> {
    {
        let mut s = state.store.settings.write().unwrap();
        if let Some(mode) = req.mode {
            let mode = mode.trim().to_lowercase();
            if !matches!(mode.as_str(), "off" | "openai" | "embedded") {
                return Err(api_err(StatusCode::BAD_REQUEST, "Неизвестный режим ИИ"));
            }
            s.mode = mode;
        }
        if let Some(url) = req.base_url {
            s.base_url = url.trim().trim_end_matches('/').to_string();
        }
        if let Some(model) = req.model {
            s.model = model.trim().to_string();
        }
        if req.clear_key.unwrap_or(false) {
            s.api_key.clear();
        } else if let Some(key) = req.api_key {
            let key = key.trim().to_string();
            if !key.is_empty() {
                s.api_key = key;
            }
        }
        if let Some(t) = req.temperature {
            s.temperature = t.clamp(0.0, 1.5);
        }
        if let Some(m) = req.max_tokens {
            s.max_tokens = m.clamp(64, 4096);
        }
        if let Some(path) = req.embedded_model {
            s.embedded_model = path.trim().to_string();
        }
        if let Some(ctx) = req.embedded_ctx {
            s.embedded_ctx = ctx.clamp(512, 16384);
        }
        if let Some(extra) = req.system_extra {
            s.system_extra = extra.trim().to_string();
        }
    }
    state.store.save_settings().map_err(|error| {
        api_err(
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Не удалось сохранить настройки: {error}"),
        )
    })?;
    Ok(Json(settings_view(&state)))
}

async fn call_model(state: &AppState, messages: &[ChatMessage]) -> Result<String, String> {
    let settings = state.store.settings.read().unwrap().clone();
    call_model_with_settings(state, &settings, messages).await
}

async fn call_model_with_settings(
    state: &AppState,
    settings: &crate::settings::Settings,
    messages: &[ChatMessage],
) -> Result<String, String> {
    match settings.mode.as_str() {
        "openai" => ai::openai_chat(&state.http, settings, messages).await,
        "embedded" => {
            #[cfg(feature = "embedded")]
            {
                return crate::embedded::generate(&state.embedded, settings, messages).await;
            }
            #[cfg(not(feature = "embedded"))]
            {
                Err("Эта сборка собрана без встроенной модели. Используйте API-режим или пересоберите с --features embedded.".into())
            }
        }
        _ => Err("ИИ не подключён. Откройте «Настройки» и выберите режим работы.".into()),
    }
}

async fn get_models(State(state): State<AppState>) -> ApiResult<Json<Value>> {
    let s = state.store.settings.read().unwrap().clone();
    if s.mode != "openai" {
        return Err(api_err(
            StatusCode::BAD_REQUEST,
            "Список моделей доступен только для OpenAI-совместимого API.",
        ));
    }
    match ai::list_models(&state.http, &s).await {
        Ok(models) => Ok(Json(json!({ "models": models }))),
        Err(e) => Err(api_err(StatusCode::BAD_GATEWAY, e)),
    }
}

async fn post_chat(
    State(state): State<AppState>,
    Json(req): Json<ChatReq>,
) -> ApiResult<Json<Value>> {
    if req.messages.is_empty() {
        return Err(api_err(StatusCode::BAD_REQUEST, "Пустой запрос"));
    }
    let unit = req.unit_id.and_then(|id| state.content.unit(id).cloned());
    let settings = state.store.settings.read().unwrap().clone();
    if !settings.is_ai_on() {
        return Err(api_err(
            StatusCode::BAD_REQUEST,
            "ИИ не подключён. Откройте «Настройки», выберите API-ключ или встроенную модель.",
        ));
    }
    let mut messages = vec![ChatMessage {
        role: "system".into(),
        content: ai::chat_system(&settings, unit.as_ref()),
    }];
    let start = req.messages.len().saturating_sub(16);
    for m in &req.messages[start..] {
        let role = m.role.trim().to_lowercase();
        if !matches!(role.as_str(), "user" | "assistant") {
            continue;
        }
        let content = m.content.trim();
        if content.is_empty() {
            continue;
        }
        messages.push(ChatMessage {
            role,
            content: content.chars().take(6000).collect(),
        });
    }
    match call_model(&state, &messages).await {
        Ok(reply) => Ok(Json(json!({
            "reply": reply,
            "mode": settings.mode,
            "model": if settings.mode == "embedded" { settings.embedded_model } else { settings.model },
        }))),
        Err(e) => Err(api_err(StatusCode::BAD_GATEWAY, e)),
    }
}

async fn post_check(
    State(state): State<AppState>,
    Json(req): Json<CheckReq>,
) -> ApiResult<Json<Value>> {
    if req.sentence_ru.trim().is_empty() || req.answer_en.trim().is_empty() {
        return Err(api_err(
            StatusCode::BAD_REQUEST,
            "Нужны исходная фраза и перевод.",
        ));
    }
    let unit = req.unit_id.and_then(|id| state.content.unit(id).cloned());
    let settings = state.store.settings.read().unwrap().clone();
    if !settings.is_ai_on() {
        return Err(api_err(
            StatusCode::BAD_REQUEST,
            "Проверка перевода требует подключённого ИИ.",
        ));
    }
    let messages = ai::check_messages(unit.as_ref(), &req.sentence_ru, &req.answer_en);
    let mut check_settings = settings.clone();
    check_settings.temperature = check_settings.temperature.min(0.2);
    match call_model_with_settings(&state, &check_settings, &messages).await {
        Ok(text) => {
            let mut raw = text;
            let mut parsed = ai::parse_json_answer(&raw);
            let score_missing = parsed.get("score").map(Value::is_null).unwrap_or(true);
            if score_missing {
                // Small local models sometimes wrap JSON in prose or forget the
                // schema. One strict retry is cheaper than showing a broken score.
                let retry_messages =
                    ai::check_retry_messages(unit.as_ref(), &req.sentence_ru, &req.answer_en);
                if let Ok(retry_text) =
                    call_model_with_settings(&state, &check_settings, &retry_messages).await
                {
                    let retry_parsed = ai::parse_json_answer(&retry_text);
                    if retry_parsed
                        .get("score")
                        .map(|value| !value.is_null())
                        .unwrap_or(false)
                    {
                        parsed = retry_parsed;
                        raw = retry_text;
                    }
                }
            }
            ai::normalize_check_result(&mut parsed, &req.answer_en);
            Ok(Json(json!({ "result": parsed, "raw": raw })))
        }
        Err(e) => Err(api_err(StatusCode::BAD_GATEWAY, e)),
    }
}

async fn post_test(State(state): State<AppState>) -> Json<Value> {
    let s = state.store.settings.read().unwrap().clone();
    if s.mode == "off" {
        return Json(
            json!({ "ok": false, "message": "ИИ выключен. Выберите режим в настройках." }),
        );
    }
    if s.mode == "embedded" {
        return Json(json!({
            "ok": false,
            "message": "Проверка встроенной модели выполняется на странице настроек."
        }));
    }
    match ai::list_models(&state.http, &s).await {
        Ok(models) => Json(json!({
            "ok": true,
            "message": format!("Подключение работает. Доступно моделей: {}.", models.len()),
            "models": models
        })),
        Err(list_err) => {
            let messages = vec![
                ChatMessage {
                    role: "system".into(),
                    content: "Ответь одним словом: OK".into(),
                },
                ChatMessage {
                    role: "user".into(),
                    content: "ping".into(),
                },
            ];
            match ai::openai_chat(&state.http, &s, &messages).await {
                Ok(_) => Json(json!({
                    "ok": true,
                    "message": "Сервер ответил на тестовый запрос. Список моделей недоступен, но чат работает."
                })),
                Err(chat_err) => Json(json!({
                    "ok": false,
                    "message": format!("Не удалось подключиться. Список моделей: {list_err}. Тестовый запрос: {chat_err}")
                })),
            }
        }
    }
}

async fn embedded_status(State(state): State<AppState>) -> Json<Value> {
    let s = state.store.settings.read().unwrap().clone();
    #[cfg(not(feature = "embedded"))]
    let v = json!({
        "compiled": false,
        "loaded": false,
        "downloading": false,
        "progress": 0,
        "bytes": 0,
        "total": 0,
        "error": null,
        "path": s.embedded_model,
    });
    #[cfg(feature = "embedded")]
    let v = crate::embedded::status_json(&state.embedded, &s);
    Json(v)
}

#[derive(Deserialize)]
#[allow(dead_code)]
struct EmbeddedAction {
    #[serde(default)]
    path: Option<String>,
    #[serde(default)]
    preset: Option<String>,
}

async fn embedded_load(
    State(state): State<AppState>,
    Json(req): Json<EmbeddedAction>,
) -> ApiResult<Json<Value>> {
    #[cfg(feature = "embedded")]
    {
        let mut s = state.store.settings.read().unwrap().clone();
        if let Some(p) = req.path.filter(|p| !p.trim().is_empty()) {
            s.embedded_model = p.trim().to_string();
            state.store.settings.write().unwrap().embedded_model = s.embedded_model.clone();
            state.store.save_settings().map_err(|e| {
                api_err(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    format!("Failed to save settings: {e}"),
                )
            })?;
        }
        match crate::embedded::load(&state.embedded, &s).await {
            Ok(message) => Ok(Json(json!({ "ok": true, "message": message }))),
            Err(e) => Err(api_err(StatusCode::BAD_REQUEST, e)),
        }
    }
    #[cfg(not(feature = "embedded"))]
    {
        let _ = (&state, req);
        Err(api_err(
            StatusCode::BAD_REQUEST,
            "Эта сборка без встроенной модели.",
        ))
    }
}

async fn embedded_unload(State(state): State<AppState>) -> Json<Value> {
    let _ = &state;
    #[cfg(feature = "embedded")]
    {
        crate::embedded::unload(&state.embedded);
    }
    Json(json!({ "ok": true }))
}

async fn embedded_download(
    State(state): State<AppState>,
    Json(req): Json<EmbeddedAction>,
) -> ApiResult<Json<Value>> {
    #[cfg(feature = "embedded")]
    {
        let preset = req.preset.unwrap_or_default();
        match crate::embedded::start_download(&state.embedded, &state.store.dir, &preset).await {
            Ok(message) => {
                let s = state.store.settings.read().unwrap().clone();
                let status = crate::embedded::status_json(&state.embedded, &s);
                let path = status
                    .get("path")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .to_string();
                let mut changed = false;
                if !path.is_empty() {
                    let mut settings = state.store.settings.write().unwrap();
                    if settings.embedded_model != path {
                        settings.embedded_model = path.clone();
                        changed = true;
                    }
                }
                if changed {
                    state.store.save_settings().map_err(|e| {
                        api_err(
                            StatusCode::INTERNAL_SERVER_ERROR,
                            format!("Failed to save settings: {e}"),
                        )
                    })?;
                }
                Ok(Json(
                    json!({ "ok": true, "message": message, "path": path }),
                ))
            }
            Err(e) => Err(api_err(StatusCode::BAD_REQUEST, e)),
        }
    }
    #[cfg(not(feature = "embedded"))]
    {
        let _ = (&state, req);
        Err(api_err(
            StatusCode::BAD_REQUEST,
            "Эта сборка без встроенной модели.",
        ))
    }
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let args = parse_args();
    if args.help {
        println!("IT English Lab\n\n--port <PORT>      порт (по умолчанию 8787)\n--no-open         не открывать браузер\n--data-dir <PATH> папка для настроек и прогресса\n--lan             доступ с телефона по локальной сети (0.0.0.0)\n--help            эта справка");
        return Ok(());
    }
    let data_dir = args.data_dir.unwrap_or_else(settings::data_dir);
    let store = Arc::new(Store::load(data_dir.clone())?);
    let content = Arc::new(Content::load()?);
    let exams: Arc<Value> = Arc::new(serde_json::from_str(include_str!("../data/exams.json"))?);
    let audio: Arc<Value> = Arc::new(serde_json::from_str(include_str!("../data/audio.json"))?);
    let http = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(180))
        .user_agent(format!("IT-English-Lab/{}", env!("CARGO_PKG_VERSION")))
        .build()?;
    let start_port = args.port.unwrap_or(8787);
    let host = if args.lan { "0.0.0.0" } else { "127.0.0.1" };
    let mut bound = None;
    for port in start_port..start_port.saturating_add(40) {
        if let Ok(listener) = TcpListener::bind((host, port)) {
            listener.set_nonblocking(true)?;
            bound = Some((listener, port));
            break;
        }
    }
    let (std_listener, port) =
        bound.ok_or_else(|| anyhow::anyhow!("Не удалось найти свободный порт"))?;
    let url = format!("http://127.0.0.1:{port}");
    let lan_url = if args.lan {
        local_ipv4().map(|ip| format!("http://{ip}:{port}"))
    } else {
        None
    };

    let state = AppState {
        store,
        content: content.clone(),
        exams,
        audio,
        http,
        lan_enabled: args.lan,
        lan_url: lan_url.clone(),
        #[cfg(feature = "embedded")]
        embedded: Arc::new(embedded::EmbeddedManager::new()),
    };

    let app = Router::new()
        .route("/", get(index))
        .route("/app.js", get(app_js))
        .route("/views-home.js", get(views_home_js))
        .route("/views-unit.js", get(views_unit_js))
        .route("/practice.js", get(practice_js))
        .route("/chat.js", get(chat_js))
        .route("/settings.js", get(settings_js))
        .route("/events.js", get(events_js))
        .route("/exam.js", get(exam_js))
        .route("/analytics.js", get(analytics_js))
        .route("/study.js", get(study_js))
        .route("/audio.js", get(audio_js))
        .route("/speaking.js", get(speaking_js))
        .route("/pwa.js", get(pwa_js))
        .route("/styles.css", get(styles_css))
        .route("/favicon.ico", get(favicon))
        .route("/manifest.webmanifest", get(manifest))
        .route("/sw.js", get(service_worker))
        .route("/icon.svg", get(app_icon_svg))
        .route("/icon-192.png", get(app_icon_192))
        .route("/icon-512.png", get(app_icon_512))
        .route("/audio/{file}", get(audio_file))
        .route("/api/health", get(health))
        .route("/api/exams", get(get_exams))
        .route("/api/units", get(get_units))
        .route("/api/units/{id}", get(get_unit))
        .route("/api/progress", get(get_progress))
        .route("/api/progress/reset", post(reset_progress))
        .route("/api/progress/import", post(import_progress))
        .route("/api/progress/restore", post(restore_progress))
        .route("/api/study/queue", get(get_study_queue))
        .route("/api/study/readiness", get(get_study_readiness))
        .route("/api/study/plan", get(get_study_plan))
        .route("/api/study/prefs", post(post_study_prefs))
        .route("/api/mistakes", get(get_study_mistakes))
        .route("/api/mistakes/resolve", post(post_mistake_resolve))
        .route("/api/audio", get(get_audio))
        .route("/api/audio/done", post(post_audio_done))
        .route("/api/speaking", get(get_speaking))
        .route("/api/speaking/attempt", post(post_speaking_attempt))
        .route(
            "/api/exam/history",
            get(get_exam_history)
                .post(post_exam_history)
                .delete(delete_exam_history),
        )
        .route("/api/answer", post(post_answer))
        .route("/api/session", post(post_session))
        .route("/api/settings", get(get_settings).post(post_settings))
        .route("/api/ai/models", get(get_models))
        .route("/api/ai/chat", post(post_chat))
        .route("/api/ai/check", post(post_check))
        .route("/api/ai/test", post(post_test))
        .route("/api/embedded/status", get(embedded_status))
        .route("/api/embedded/load", post(embedded_load))
        .route("/api/embedded/unload", post(embedded_unload))
        .route("/api/embedded/download", post(embedded_download))
        .with_state(state);

    let listener = TokioListener::from_std(std_listener)?;

    println!("┌──────────────────────────────────────────────┐");
    println!("│  IT English Lab                              │");
    println!(
        "│  {} юнитов · {} терминов                      ",
        content.units.len(),
        content.total_vocab()
    );
    println!("│  Открыто: {url}");
    if let Some(lan) = &lan_url {
        println!("│  Телефон: {lan}");
        println!("│  Доступен всем устройствам в локальной сети  │");
    }
    println!("│  Данные:  {}", data_dir.display());
    println!("│  Ctrl+C — остановить сервер                   │");
    println!("└──────────────────────────────────────────────┘");

    if !args.no_open {
        let url = url.clone();
        tokio::spawn(async move {
            tokio::time::sleep(std::time::Duration::from_millis(350)).await;
            open_browser(&url);
        });
    }

    axum::serve(listener, app).await?;
    Ok(())
}

fn local_ipv4() -> Option<IpAddr> {
    let best = if_addrs::get_if_addrs()
        .ok()?
        .into_iter()
        .filter_map(|iface| {
            let if_addrs::IfAddr::V4(v4) = iface.addr else {
                return None;
            };
            let ip = v4.ip;
            if ip.is_loopback() || ip.is_unspecified() || ip.is_link_local() {
                return None;
            }
            let score = local_ipv4_score(&iface.name, ip);
            Some((score, iface.name, ip))
        })
        .max_by_key(|(score, _, _)| *score)?;
    Some(IpAddr::V4(best.2))
}

fn local_ipv4_score(name: &str, ip: Ipv4Addr) -> i32 {
    let [a, b, _, _] = ip.octets();
    let mut score = 0;
    if ip.is_private() {
        score += 100;
    }
    match (a, b) {
        (192, 168) => score += 50,
        (10, _) => score += 35,
        (172, 16..=31) => score += 25,
        (198, 18) => score -= 150,
        _ => {}
    }

    let name = name.to_lowercase();
    if ["wi-fi", "wifi", "wlan", "wireless", "беспровод"]
        .iter()
        .any(|part| name.contains(part))
    {
        score += 80;
    }
    if name.contains("ethernet") || name.contains("以太网") {
        score += 20;
    }
    if [
        "vethernet",
        "wsl",
        "virtual",
        "vmware",
        "vbox",
        "hyper-v",
        "tailscale",
        "zerotier",
        "vpn",
        "tun",
        "tap",
        "bluetooth",
        "蓝牙",
    ]
    .iter()
    .any(|part| name.contains(part))
    {
        score -= 200;
    }
    score
}

#[cfg(windows)]
fn open_browser(url: &str) {
    let _ = std::process::Command::new("cmd")
        .args(["/C", "start", "", url])
        .spawn();
}

#[cfg(not(windows))]
fn open_browser(url: &str) {
    let _ = std::process::Command::new("xdg-open").arg(url).spawn();
}

struct Args {
    port: Option<u16>,
    no_open: bool,
    data_dir: Option<PathBuf>,
    lan: bool,
    help: bool,
}

fn parse_args() -> Args {
    let mut args = Args {
        port: None,
        no_open: false,
        data_dir: None,
        lan: false,
        help: false,
    };
    let mut it = std::env::args().skip(1);
    while let Some(arg) = it.next() {
        match arg.as_str() {
            "--port" => {
                if let Some(v) = it.next() {
                    args.port = v.parse().ok();
                }
            }
            "--no-open" => args.no_open = true,
            "--lan" => args.lan = true,
            "--data-dir" => {
                if let Some(v) = it.next() {
                    args.data_dir = Some(PathBuf::from(v));
                }
            }
            "--help" | "-h" => args.help = true,
            other => eprintln!("Неизвестный аргумент: {other}"),
        }
    }
    args
}
