//! Optional in-process GGUF inference.
//!
//! This module is compiled only with the `embedded` feature.  It keeps a
//! llama.cpp model in memory and creates a short-lived context for every
//! generation.  A separate status object is used so the UI can poll download
//! and load state without waiting for a long generation to finish.

use crate::ai::ChatMessage;
use crate::settings::Settings;
use llama_cpp_2::{
    context::params::LlamaContextParams,
    llama_backend::LlamaBackend,
    llama_batch::LlamaBatch,
    model::{params::LlamaModelParams, LlamaChatMessage, LlamaChatTemplate, LlamaModel},
    sampling::LlamaSampler,
};
use serde_json::{json, Value};
use std::{
    num::NonZeroU32,
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tokio::io::AsyncWriteExt;

const THINK_OPEN: &str = "\x3cthink\x3e";
const THINK_CLOSE: &str = "\x3c/think\x3e";
const THINK_EMPTY: &str = "\n\x3cthink\x3e\n\n\x3c/think\x3e\n\n";

struct Preset {
    id: &'static str,
    name: &'static str,
    file: &'static str,
    url: &'static str,
    size: u64,
}

const PRESETS: &[Preset] = &[
    Preset {
        id: "qwen35_q4",
        name: "Qwen3.5 4B Instruct · Q4_K_M",
        file: "Qwen_Qwen3.5-4B-Q4_K_M.gguf",
        url: "https://huggingface.co/bartowski/Qwen_Qwen3.5-4B-GGUF/resolve/main/Qwen_Qwen3.5-4B-Q4_K_M.gguf",
        size: 3_013_027_808,
    },
    Preset {
        id: "qwen35_q6",
        name: "Qwen3.5 4B Instruct · Q6_K_L",
        file: "Qwen_Qwen3.5-4B-Q6_K_L.gguf",
        url: "https://huggingface.co/bartowski/Qwen_Qwen3.5-4B-GGUF/resolve/main/Qwen_Qwen3.5-4B-Q6_K_L.gguf",
        size: 3_959_316_448,
    },
];

fn preset(id: &str) -> Option<&'static Preset> {
    PRESETS.iter().find(|p| p.id == id)
}

struct ModelState {
    // Field order matters: the model must be dropped before the backend that
    // initialized it.
    model: Option<LlamaModel>,
    backend: Option<LlamaBackend>,
}

#[derive(Default)]
struct Status {
    loaded: bool,
    loaded_path: Option<String>,
    downloading: bool,
    downloaded: u64,
    total: u64,
    error: Option<String>,
    last_path: Option<String>,
}

/// Shared manager used by the HTTP layer.  The model mutex is held only while
/// loading or generating, never by status requests.
#[derive(Clone)]
pub struct EmbeddedManager {
    model: Arc<Mutex<ModelState>>,
    status: Arc<Mutex<Status>>,
}

impl EmbeddedManager {
    pub fn new() -> Self {
        Self {
            model: Arc::new(Mutex::new(ModelState {
                model: None,
                backend: None,
            })),
            status: Arc::new(Mutex::new(Status::default())),
        }
    }
}

fn lock_status(manager: &EmbeddedManager) -> std::sync::MutexGuard<'_, Status> {
    manager.status.lock().unwrap_or_else(|e| e.into_inner())
}

pub fn status_json(manager: &EmbeddedManager, settings: &Settings) -> Value {
    let st = lock_status(manager);
    let settings_path = settings.embedded_model.trim();
    let path = if !settings_path.is_empty() {
        settings_path.to_string()
    } else {
        st.last_path.clone().unwrap_or_default()
    };
    let progress = if st.total > 0 {
        ((st.downloaded.saturating_mul(100)) / st.total).min(100) as u32
    } else {
        0
    };
    json!({
        "compiled": true,
        "loaded": st.loaded,
        "downloading": st.downloading,
        "progress": progress,
        "bytes": st.downloaded,
        "total": st.total,
        "error": st.error,
        "path": path,
        "loaded_path": st.loaded_path,
    })
}

fn load_blocking(
    model_state: Arc<Mutex<ModelState>>,
    status: Arc<Mutex<Status>>,
    path: String,
    n_ctx: u32,
) -> Result<String, String> {
    {
        let st = status.lock().unwrap_or_else(|e| e.into_inner());
        if st.downloading {
            return Err("Сначала дождитесь окончания скачивания модели.".into());
        }
        if st.loaded && st.loaded_path.as_deref() == Some(path.as_str()) {
            return Ok("Эта модель уже загружена.".into());
        }
    }

    let mut ms = model_state.lock().unwrap_or_else(|e| e.into_inner());
    let old_model = ms.model.take();
    drop(old_model);
    let old_backend = ms.backend.take();
    drop(old_backend);

    {
        let mut st = status.lock().unwrap_or_else(|e| e.into_inner());
        st.loaded = false;
        st.loaded_path = None;
        st.error = None;
        st.last_path = Some(path.clone());
    }

    let result = (|| -> Result<(LlamaModel, LlamaBackend), String> {
        let backend = LlamaBackend::init()
            .map_err(|e| format!("Не удалось инициализировать llama.cpp: {e}"))?;
        let params = LlamaModelParams::default()
            .with_n_gpu_layers(0)
            .with_use_mmap(true);
        let model = LlamaModel::load_from_file(&backend, &path, &params)
            .map_err(|e| format!("Не удалось загрузить модель: {e}"))?;
        Ok((model, backend))
    })();

    match result {
        Ok((model, backend)) => {
            let params = model.n_params();
            ms.model = Some(model);
            ms.backend = Some(backend);
            {
                let mut st = status.lock().unwrap_or_else(|e| e.into_inner());
                st.loaded = true;
                st.loaded_path = Some(path.clone());
                st.last_path = Some(path);
                st.error = None;
            }
            Ok(format!(
                "Модель загружена ({} параметров, контекст до {} токенов).",
                format_params(params),
                n_ctx
            ))
        }
        Err(e) => {
            let mut st = status.lock().unwrap_or_else(|e| e.into_inner());
            st.loaded = false;
            st.loaded_path = None;
            st.error = Some(e.clone());
            Err(e)
        }
    }
}

fn format_params(n: u64) -> String {
    if n >= 1_000_000_000 {
        format!("{:.1} млрд", n as f64 / 1_000_000_000.0)
    } else if n >= 1_000_000 {
        format!("{:.0} млн", n as f64 / 1_000_000.0)
    } else {
        n.to_string()
    }
}

pub async fn load(manager: &EmbeddedManager, settings: &Settings) -> Result<String, String> {
    let path = settings.embedded_model.trim().to_string();
    if path.is_empty() {
        return Err("Укажите путь к GGUF-файлу модели.".into());
    }
    if !Path::new(&path).is_file() {
        return Err(format!("Файл модели не найден: {path}"));
    }
    let n_ctx = settings.embedded_ctx.clamp(512, 16384);
    let model_state = manager.model.clone();
    let status = manager.status.clone();
    tokio::task::spawn_blocking(move || load_blocking(model_state, status, path, n_ctx))
        .await
        .map_err(|e| format!("Загрузка модели была прервана: {e}"))?
}

pub fn unload(manager: &EmbeddedManager) {
    {
        let mut ms = manager.model.lock().unwrap_or_else(|e| e.into_inner());
        let model = ms.model.take();
        drop(model);
        let backend = ms.backend.take();
        drop(backend);
    }
    let mut st = lock_status(manager);
    st.loaded = false;
    st.loaded_path = None;
    st.error = None;
}

fn seed() -> u32 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.subsec_nanos() ^ d.as_secs() as u32)
        .unwrap_or(1234)
}

fn find_stop(text: &str) -> Option<usize> {
    [
        "<|im_end|>",
        "<|eot_id|>",
        "<|end_of_text|>",
        "<end_of_turn>",
        "</s>",
    ]
    .iter()
    .filter_map(|tag| text.find(tag))
    .min()
}

/// Qwen3.5 starts every answer with a long reasoning block unless the prompt
/// already contains a closed, empty thinking block.  The tutor needs short,
/// ready-to-read replies, so detect the model's thinking-template flag and
/// prefill that block after rendering the chat template.  Other templates are
/// left unchanged.
fn model_chat_template(model: &LlamaModel) -> Result<(LlamaChatTemplate, bool), String> {
    let template = model.chat_template(None).map_err(|_| {
        "У выбранной модели нет chat template. Используйте Instruct-версию GGUF (например, Qwen3.5 4B Instruct)."
            .to_string()
    })?;
    let uses_thinking = template
        .to_str()
        .map(|raw| raw.contains("enable_thinking"))
        .unwrap_or(false);
    Ok((template, uses_thinking))
}

/// Strip a reasoning block if the model emitted one anyway.  Returning raw
/// chain-of-thought text to the student is worse than asking for a retry.
fn strip_reasoning(text: &str) -> Result<String, String> {
    let trimmed = text.trim();
    if let Some(pos) = trimmed.rfind(THINK_CLOSE) {
        let answer = trimmed[pos + THINK_CLOSE.len()..].trim();
        return Ok(answer.to_string());
    }
    if trimmed.starts_with(THINK_OPEN) {
        return Err(
            "Модель не успела закончить ответ. Увеличьте лимит токенов или повторите запрос."
                .into(),
        );
    }
    Ok(trimmed.to_string())
}

fn generate_blocking(
    model_state: Arc<Mutex<ModelState>>,
    messages: &[ChatMessage],
    n_ctx: u32,
    temperature: f32,
    max_tokens: u32,
) -> Result<String, String> {
    let ms = model_state.lock().unwrap_or_else(|e| e.into_inner());
    let model = ms.model.as_ref().ok_or_else(|| {
        "Встроенная модель не загружена. Откройте настройки и нажмите «Загрузить модель»."
            .to_string()
    })?;
    let backend = ms.backend.as_ref().ok_or_else(|| {
        "Встроенный движок не инициализирован. Загрузите модель заново.".to_string()
    })?;

    let n_ctx = n_ctx.min(model.n_ctx_train().max(512)).max(512);
    let max_tokens = max_tokens.min((n_ctx.saturating_sub(256)).max(64)).max(16);

    let (template, uses_thinking) = model_chat_template(model)?;
    let mut chat = Vec::with_capacity(messages.len());
    for m in messages {
        chat.push(
            LlamaChatMessage::new(m.role.clone(), m.content.clone())
                .map_err(|e| format!("Некорректное сообщение для модели: {e}"))?,
        );
    }
    let mut prompt = model
        .apply_chat_template(&template, &chat, true)
        .map_err(|e| format!("Не удалось применить chat template: {e}"))?;
    if uses_thinking {
        const ASSISTANT: &str = "<|im_start|>assistant";
        if let Some(pos) = prompt.rfind(ASSISTANT) {
            let tail = &prompt[pos + ASSISTANT.len()..];
            if tail.trim().is_empty() || tail.trim() == THINK_OPEN {
                prompt.truncate(pos + ASSISTANT.len());
                prompt.push_str(THINK_EMPTY);
            }
        }
    }

    let threads = std::thread::available_parallelism()
        .map(|n| n.get() as i32)
        .unwrap_or(4)
        .clamp(1, 8);
    let ctx_params = LlamaContextParams::default()
        .with_n_ctx(NonZeroU32::new(n_ctx))
        .with_n_batch(512)
        .with_n_threads(threads)
        .with_n_threads_batch(threads);
    let mut ctx = model
        .new_context(backend, ctx_params)
        .map_err(|e| format!("Не удалось создать контекст модели: {e}"))?;

    let vocab = model.vocab();
    let mut tokens = vocab.tokenize(prompt.as_bytes(), false, true);
    if tokens.is_empty() {
        return Err("Не удалось разбить запрос на токены.".into());
    }

    let max_prompt = (n_ctx as usize)
        .saturating_sub(max_tokens as usize + 16)
        .max(64);
    if tokens.len() > max_prompt {
        // Keep the beginning of the system prompt and the most recent turns.
        let head = max_prompt.min(128);
        let tail = max_prompt.saturating_sub(head);
        let mut trimmed = Vec::with_capacity(max_prompt);
        trimmed.extend_from_slice(&tokens[..head]);
        trimmed.extend_from_slice(&tokens[tokens.len() - tail..]);
        tokens = trimmed;
    }

    let n_batch = (ctx.n_batch() as usize).max(1);
    let mut batch = LlamaBatch::new(n_batch, 1);
    let mut pos = 0_i32;
    for chunk in tokens.chunks(n_batch) {
        batch.clear();
        let last = chunk.len().saturating_sub(1);
        for (i, token) in chunk.iter().enumerate() {
            batch
                .add(*token, pos, &[0], i == last)
                .map_err(|e| format!("Ошибка формирования пакета токенов: {e}"))?;
            pos += 1;
        }
        ctx.decode(&mut batch)
            .map_err(|e| format!("Ошибка вычисления модели: {e}"))?;
    }

    let mut samplers = vec![
        LlamaSampler::penalties(model.n_vocab(), 256, 1.1, 0.0, 0.0),
        LlamaSampler::top_k(40),
        LlamaSampler::top_p(0.95, 1),
    ];
    if temperature <= 0.05 {
        samplers.push(LlamaSampler::greedy());
    } else {
        samplers.push(LlamaSampler::temp(temperature.clamp(0.05, 1.5)));
        samplers.push(LlamaSampler::dist(seed()));
    }
    let mut sampler = LlamaSampler::chain_simple(samplers);

    let mut output: Vec<u8> = Vec::new();
    for _ in 0..max_tokens {
        if pos >= n_ctx as i32 {
            break;
        }
        let token = sampler.sample(&ctx, -1);
        if vocab.is_eog(token) {
            break;
        }
        sampler.accept(token);
        output.extend_from_slice(&vocab.token_to_piece(token, false, None));

        let text = String::from_utf8_lossy(&output);
        if let Some(cut) = find_stop(&text) {
            output.truncate(cut);
            break;
        }

        batch.clear();
        batch
            .add(token, pos, &[0], true)
            .map_err(|e| format!("Ошибка формирования пакета токенов: {e}"))?;
        pos += 1;
        ctx.decode(&mut batch)
            .map_err(|e| format!("Ошибка генерации: {e}"))?;
    }

    let mut text = String::from_utf8_lossy(&output).to_string();
    if let Some(cut) = find_stop(&text) {
        text.truncate(cut);
    }
    let text = strip_reasoning(&text)?;
    if text.is_empty() {
        Err(
            "Модель не сгенерировала текст. Попробуйте ещё раз или выберите модель побольше."
                .into(),
        )
    } else {
        Ok(text)
    }
}

pub async fn generate(
    manager: &EmbeddedManager,
    settings: &Settings,
    messages: &[ChatMessage],
) -> Result<String, String> {
    let model_state = manager.model.clone();
    let messages = messages.to_vec();
    let n_ctx = settings.embedded_ctx.clamp(512, 16384);
    let temperature = settings.temperature.clamp(0.0, 1.5);
    let max_tokens = settings.max_tokens.clamp(16, 4096);
    tokio::task::spawn_blocking(move || {
        generate_blocking(model_state, &messages, n_ctx, temperature, max_tokens)
    })
    .await
    .map_err(|e| format!("Генерация была прервана: {e}"))?
}

fn part_path(target: &Path) -> PathBuf {
    target.with_extension("gguf.part")
}

pub async fn start_download(
    manager: &EmbeddedManager,
    data_dir: &Path,
    preset_id: &str,
) -> Result<String, String> {
    let p = preset(preset_id).ok_or_else(|| "Неизвестная модель для скачивания.".to_string())?;
    let dir = data_dir.join("models");
    tokio::fs::create_dir_all(&dir)
        .await
        .map_err(|e| format!("Не удалось создать папку моделей: {e}"))?;
    let target = dir.join(p.file);

    if let Ok(meta) = tokio::fs::metadata(&target).await {
        if meta.len() >= p.size.saturating_mul(9) / 10 {
            {
                let mut st = lock_status(manager);
                st.downloading = false;
                st.downloaded = meta.len();
                st.total = meta.len();
                st.error = None;
                st.last_path = Some(target.to_string_lossy().to_string());
            }
            return Ok(format!("Модель уже скачана: {}", target.display()));
        }
        let _ = tokio::fs::remove_file(&target).await;
    }

    {
        let mut st = lock_status(manager);
        if st.downloading {
            return Err("Скачивание уже идёт. Дождитесь окончания.".into());
        }
        st.downloading = true;
        st.downloaded = 0;
        st.total = p.size;
        st.error = None;
        st.last_path = Some(target.to_string_lossy().to_string());
    }

    let status = manager.status.clone();
    let url = p.url.to_string();
    let expected = p.size;
    let name = p.name.to_string();
    tokio::spawn(async move {
        if let Err(e) = download_task(status.clone(), url, target, expected).await {
            let mut st = status.lock().unwrap_or_else(|x| x.into_inner());
            st.downloading = false;
            st.error = Some(e);
        }
    });
    Ok(format!("Скачивание началось: {name}"))
}

async fn download_task(
    status: Arc<Mutex<Status>>,
    url: String,
    target: PathBuf,
    expected: u64,
) -> Result<(), String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(900))
        .user_agent("IT-English-Lab/embedded-download")
        .build()
        .map_err(|e| format!("Не удалось создать HTTP-клиент: {e}"))?;
    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Не удалось начать скачивание: {e}"))?;
    let http_status = resp.status();
    if !http_status.is_success() {
        return Err(format!("Сервер моделей вернул ошибку {http_status}."));
    }
    let total = resp.content_length().unwrap_or(expected);
    {
        let mut st = status.lock().unwrap_or_else(|e| e.into_inner());
        st.total = total.max(expected);
    }

    let tmp = part_path(&target);
    if let Some(parent) = target.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|e| format!("Не удалось создать папку моделей: {e}"))?;
    }
    let mut file = tokio::fs::File::create(&tmp)
        .await
        .map_err(|e| format!("Не удалось создать файл модели: {e}"))?;

    let mut resp = resp;
    let mut downloaded = 0_u64;
    loop {
        match resp.chunk().await {
            Ok(Some(chunk)) => {
                file.write_all(&chunk)
                    .await
                    .map_err(|e| format!("Ошибка записи файла модели: {e}"))?;
                downloaded += chunk.len() as u64;
                let mut st = status.lock().unwrap_or_else(|e| e.into_inner());
                st.downloaded = downloaded;
            }
            Ok(None) => break,
            Err(e) => {
                let _ = tokio::fs::remove_file(&tmp).await;
                return Err(format!("Скачивание прервалось: {e}"));
            }
        }
    }
    file.flush()
        .await
        .map_err(|e| format!("Не удалось сохранить файл модели: {e}"))?;
    drop(file);

    if expected > 0 && downloaded < expected.saturating_mul(9) / 10 {
        let _ = tokio::fs::remove_file(&tmp).await;
        return Err(format!(
            "Файл скачался не полностью ({} из {} байт). Попробуйте ещё раз.",
            downloaded, expected
        ));
    }

    if target.exists() {
        let _ = tokio::fs::remove_file(&target).await;
    }
    tokio::fs::rename(&tmp, &target)
        .await
        .map_err(|e| format!("Не удалось переименовать файл модели: {e}"))?;

    {
        let mut st = status.lock().unwrap_or_else(|e| e.into_inner());
        st.downloading = false;
        st.downloaded = downloaded;
        st.total = downloaded.max(total);
        st.error = None;
        st.last_path = Some(target.to_string_lossy().to_string());
    }
    Ok(())
}

// Keep this helper here so a future UI can show the set of downloadable models
// even if the build was made without the embedded feature.
#[allow(dead_code)]
pub fn presets_json() -> Value {
    json!(PRESETS
        .iter()
        .map(|p| json!({
            "id": p.id,
            "name": p.name,
            "file": p.file,
            "url": p.url,
            "size": p.size
        }))
        .collect::<Vec<_>>())
}
