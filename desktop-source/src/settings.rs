use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(default)]
pub struct Settings {
    pub mode: String,
    pub base_url: String,
    pub model: String,
    pub api_key: String,
    pub temperature: f32,
    pub max_tokens: u32,
    pub embedded_model: String,
    pub embedded_ctx: u32,
    pub system_extra: String,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            mode: "off".into(),
            base_url: "http://127.0.0.1:11434/v1".into(),
            model: "qwen3.5:4b".into(),
            api_key: String::new(),
            temperature: 0.4,
            max_tokens: 700,
            embedded_model: String::new(),
            embedded_ctx: 4096,
            system_extra: String::new(),
        }
    }
}

impl Settings {
    pub fn is_ai_on(&self) -> bool {
        self.mode == "openai" || self.mode == "embedded"
    }

    pub fn key_hint(&self) -> String {
        if self.api_key.is_empty() {
            String::new()
        } else if self.api_key.len() <= 8 {
            "••••".into()
        } else {
            format!("••••{}", &self.api_key[self.api_key.len() - 4..])
        }
    }
}

/// Load JSON and report a recoverable problem instead of failing silently.
///
/// A corrupt file is moved aside as `*.corrupt-<timestamp>.json` so the user
/// can inspect or restore it, while the application still starts with defaults.
pub fn load_json_checked<T: for<'de> Deserialize<'de> + Default>(
    path: &Path,
) -> (T, Option<String>) {
    match fs::read_to_string(path) {
        Ok(text) => match serde_json::from_str::<T>(&text) {
            Ok(value) => (value, None),
            Err(error) => {
                let moved = quarantine_corrupt(path);
                let detail = moved
                    .map(|p| format!("Файл сохранён как {}", p.display()))
                    .unwrap_or_else(|| "Не удалось сохранить копию повреждённого файла.".into());
                (
                    T::default(),
                    Some(format!(
                        "{} повреждён: {error}. {detail}",
                        path.file_name().unwrap_or_default().to_string_lossy()
                    )),
                )
            }
        },
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => (T::default(), None),
        Err(error) => (
            T::default(),
            Some(format!("Не удалось прочитать {}: {error}", path.display())),
        ),
    }
}

fn timestamp() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn timestamp_millis() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0)
}

/// Backup names are `progress-<millis>[-<n>].json`. The embedded timestamp
/// makes their chronological order explicit, even when several snapshots are
/// created within the same second.
fn backup_stamp(name: &str, stem: &str) -> u128 {
    let rest = match name.strip_prefix(&format!("{stem}-")) {
        Some(rest) => rest,
        None => return 0,
    };
    let digits = rest.split(['-', '.']).next().unwrap_or("0");
    digits.parse().unwrap_or(0)
}

fn quarantine_corrupt(path: &Path) -> Option<PathBuf> {
    let stem = path.file_stem()?.to_string_lossy().to_string();
    let parent = path.parent().unwrap_or_else(|| Path::new("."));
    for n in 0..20 {
        let suffix = if n == 0 {
            timestamp().to_string()
        } else {
            format!("{}-{n}", timestamp())
        };
        let target = parent.join(format!("{stem}.corrupt-{suffix}.json"));
        if !target.exists() {
            if fs::rename(path, &target).is_ok() {
                return Some(target);
            }
            if fs::copy(path, &target).is_ok() {
                let _ = fs::remove_file(path);
                return Some(target);
            }
            return None;
        }
    }
    None
}

pub fn backups_dir(data_dir: &Path) -> PathBuf {
    data_dir.join("backups")
}

/// Copy a JSON file into `backups/` and keep the newest `keep` copies.
/// Returns the created backup path, or None when the source does not exist.
pub fn backup_json(path: &Path, keep: usize) -> anyhow::Result<Option<PathBuf>> {
    if !path.exists() {
        return Ok(None);
    }
    let parent = path.parent().unwrap_or_else(|| Path::new("."));
    let dir = parent.join("backups");
    fs::create_dir_all(&dir)?;
    let stem = path
        .file_stem()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();
    let mut target = dir.join(format!("{stem}-{}.json", timestamp_millis()));
    let mut n = 1;
    while target.exists() {
        target = dir.join(format!("{stem}-{}-{n}.json", timestamp_millis()));
        n += 1;
    }
    fs::copy(path, &target)?;
    prune_backups(&dir, &stem, keep.max(1))?;
    Ok(Some(target))
}

fn prune_backups(dir: &Path, stem: &str, keep: usize) -> anyhow::Result<()> {
    let mut files: Vec<(u128, PathBuf)> = fs::read_dir(dir)?
        .filter_map(Result::ok)
        .filter_map(|entry| {
            let path = entry.path();
            let name = path.file_name()?.to_string_lossy().to_string();
            if !name.starts_with(&format!("{stem}-")) || !name.ends_with(".json") {
                return None;
            }
            Some((backup_stamp(&name, stem), path))
        })
        .collect();
    files.sort_by(|a, b| b.0.cmp(&a.0).then_with(|| b.1.cmp(&a.1)));
    for (_, path) in files.into_iter().skip(keep) {
        let _ = fs::remove_file(path);
    }
    Ok(())
}

pub fn list_backups(data_dir: &Path, stem: &str) -> Vec<String> {
    let dir = backups_dir(data_dir);
    let mut out: Vec<(u128, String)> = fs::read_dir(dir)
        .into_iter()
        .flatten()
        .filter_map(Result::ok)
        .filter_map(|entry| {
            let name = entry.file_name().to_string_lossy().to_string();
            if name.starts_with(&format!("{stem}-")) && name.ends_with(".json") {
                Some((backup_stamp(&name, stem), name))
            } else {
                None
            }
        })
        .collect();
    out.sort_by(|a, b| b.0.cmp(&a.0).then_with(|| b.1.cmp(&a.1)));
    out.into_iter().map(|(_, name)| name).collect()
}

pub fn save_json<T: Serialize>(path: &Path, value: &T) -> anyhow::Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let tmp = path.with_extension("tmp");
    fs::write(&tmp, serde_json::to_vec_pretty(value)?)?;
    fs::rename(&tmp, path)?;
    Ok(())
}

pub fn data_dir() -> PathBuf {
    if let Ok(dir) = std::env::var("IT_ENGLISH_DATA") {
        if !dir.trim().is_empty() {
            return PathBuf::from(dir);
        }
    }
    if let Ok(appdata) = std::env::var("APPDATA") {
        return PathBuf::from(appdata).join("ITEnglishLab");
    }
    PathBuf::from(".it-english-lab")
}
