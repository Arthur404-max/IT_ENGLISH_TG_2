use chrono::{Duration, Local, TimeZone};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

pub const SCHEMA_VERSION: u32 = 3;

// FSRS-5 default weights. They are intentionally local constants: the app
// must keep scheduling exactly the same way offline and in every release.
const FSRS_W: [f64; 17] = [
    0.40255, 1.18385, 3.173, 15.69105, 7.1949, 0.5345, 1.4604, 0.0046, 1.54575, 0.1192, 1.01925,
    1.9395, 0.11, 0.29605, 2.2698, 0.2315, 2.9898,
];
const FSRS_DECAY: f64 = -0.5;
const FSRS_FACTOR: f64 = 19.0 / 81.0;

fn default_ease() -> f64 {
    2.5
}

fn default_difficulty() -> f64 {
    5.0
}

fn default_state() -> String {
    "new".into()
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct WordStat {
    #[serde(rename = "box", default)]
    pub box_: u8,
    #[serde(default)]
    pub correct: u32,
    #[serde(default)]
    pub wrong: u32,
    #[serde(default)]
    pub last_seen: i64,
    /// Unix seconds when the card should be shown again. 0 means "due now".
    #[serde(default)]
    pub due_at: i64,
    /// Current SRS interval in days. 0 means the card is in relearning.
    #[serde(default)]
    pub interval_days: u32,
    #[serde(default = "default_ease")]
    pub ease_factor: f64,
    #[serde(default)]
    pub reviews: u32,
    /// Last measured response time in milliseconds.
    #[serde(default)]
    pub last_ms: u32,

    // FSRS fields. They are additive: v2 files load with sensible defaults and
    // the legacy box/interval/ease fields above remain available to old clients.
    #[serde(default)]
    pub stability: f64,
    #[serde(default = "default_difficulty")]
    pub difficulty: f64,
    #[serde(default = "default_state")]
    pub fsrs_state: String,
    #[serde(default)]
    pub lapses: u32,
    #[serde(default)]
    pub leech: bool,
    #[serde(default)]
    pub scheduled_days: u32,
    #[serde(default)]
    pub elapsed_days: u32,
    #[serde(default)]
    pub last_rating: u8,
    #[serde(default)]
    pub streak_correct: u32,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
pub struct StudyPrefs {
    #[serde(default = "default_new_limit")]
    pub daily_new_limit: u32,
    #[serde(default = "default_review_limit")]
    pub daily_review_limit: u32,
    #[serde(default = "default_leech_limit")]
    pub daily_leech_limit: u32,
    #[serde(default = "default_exam_limit")]
    pub daily_exam_limit: u32,
    #[serde(default = "default_minutes")]
    pub desired_minutes: u32,
    /// Target probability of recall (80..95%) used by FSRS when choosing the
    /// next interval. 90% preserves the intervals of earlier releases.
    #[serde(default = "default_retention")]
    pub desired_retention_pct: u32,
    /// Hard cap for any scheduled interval, in days.
    #[serde(default = "default_max_interval")]
    pub max_interval_days: u32,
    /// Optional ISO date (YYYY-MM-DD) of the real exam.
    #[serde(default)]
    pub exam_date: String,
}

fn default_new_limit() -> u32 {
    12
}
fn default_review_limit() -> u32 {
    60
}
fn default_leech_limit() -> u32 {
    15
}
fn default_exam_limit() -> u32 {
    15
}
fn default_minutes() -> u32 {
    25
}
fn default_retention() -> u32 {
    90
}
fn default_max_interval() -> u32 {
    3650
}

impl Default for StudyPrefs {
    fn default() -> Self {
        Self {
            daily_new_limit: default_new_limit(),
            daily_review_limit: default_review_limit(),
            daily_leech_limit: default_leech_limit(),
            daily_exam_limit: default_exam_limit(),
            desired_minutes: default_minutes(),
            desired_retention_pct: default_retention(),
            max_interval_days: default_max_interval(),
            exam_date: String::new(),
        }
    }
}

impl Default for WordStat {
    fn default() -> Self {
        Self {
            box_: 0,
            correct: 0,
            wrong: 0,
            last_seen: 0,
            due_at: 0,
            interval_days: 0,
            ease_factor: default_ease(),
            reviews: 0,
            last_ms: 0,
            stability: 0.0,
            difficulty: default_difficulty(),
            fsrs_state: default_state(),
            lapses: 0,
            leech: false,
            scheduled_days: 0,
            elapsed_days: 0,
            last_rating: 0,
            streak_correct: 0,
        }
    }
}

impl WordStat {
    pub fn is_due(&self, now: i64) -> bool {
        self.due_at == 0 || self.due_at <= now
    }

    pub fn is_active(&self) -> bool {
        self.reviews > 0
            || self.correct > 0
            || self.wrong > 0
            || self.last_seen > 0
            || self.due_at > 0
            || self.stability > 0.0
    }

    /// Estimated probability that the word is still remembered right now.
    pub fn retrievability_at(&self, now: i64) -> f64 {
        if self.stability <= 0.0 || self.last_seen <= 0 {
            return 0.0;
        }
        let elapsed = ((now - self.last_seen).max(0) as f64) / 86_400.0;
        (1.0 + FSRS_FACTOR * elapsed / self.stability).powf(FSRS_DECAY)
    }

    fn normalize(&mut self) {
        if !self.ease_factor.is_finite() || self.ease_factor <= 0.0 {
            self.ease_factor = default_ease();
        }
        self.ease_factor = self.ease_factor.clamp(1.3, 4.0);
        self.interval_days = self.interval_days.min(3650);
        self.box_ = self.box_.min(5);
        if !self.stability.is_finite() || self.stability < 0.0 {
            self.stability = 0.0;
        }
        self.stability = self.stability.min(3650.0);
        if !self.difficulty.is_finite() || self.difficulty <= 0.0 {
            self.difficulty = default_difficulty();
        }
        self.difficulty = self.difficulty.clamp(1.0, 10.0);
        if !matches!(
            self.fsrs_state.as_str(),
            "new" | "learning" | "review" | "relearning"
        ) {
            self.fsrs_state = if self.reviews > 0 {
                "review".into()
            } else {
                "new".into()
            };
        }
        self.scheduled_days = self.scheduled_days.min(3650);
        self.last_rating = self.last_rating.min(4);
        self.streak_correct = self.streak_correct.min(1000);
    }

    fn initial_stability(rating: u8) -> f64 {
        FSRS_W[(rating.clamp(1, 4) - 1) as usize]
    }

    fn initial_difficulty(rating: u8) -> f64 {
        let rating = rating.clamp(1, 4) as f64;
        (FSRS_W[4] - (FSRS_W[5] * (rating - 1.0)).exp() + 1.0).clamp(1.0, 10.0)
    }

    fn next_difficulty(current: f64, rating: u8) -> f64 {
        let delta = -0.7 * (rating.clamp(1, 4) as f64 - 3.0);
        let next = current + delta;
        let reverted = 0.05 * Self::initial_difficulty(4) + 0.95 * next;
        reverted.clamp(1.0, 10.0)
    }

    fn success_stability(current: f64, difficulty: f64, retrievability: f64, rating: u8) -> f64 {
        let hard_penalty = if rating == 2 { FSRS_W[15] } else { 1.0 };
        let easy_bonus = if rating == 4 { FSRS_W[16] } else { 1.0 };
        let growth = FSRS_W[8].exp()
            * (11.0 - difficulty)
            * current.powf(-FSRS_W[9])
            * ((1.0 - retrievability) * FSRS_W[10]).exp_m1()
            * hard_penalty
            * easy_bonus;
        (current * (1.0 + growth)).clamp(0.1, 3650.0)
    }

    fn lapse_stability(current: f64, difficulty: f64, retrievability: f64) -> f64 {
        let next = FSRS_W[11]
            * difficulty.powf(-FSRS_W[12])
            * ((current + 1.0).powf(FSRS_W[13]) - 1.0)
            * ((1.0 - retrievability) * FSRS_W[14]).exp();
        next.clamp(0.1, 3650.0)
    }

    /// Convert FSRS stability to a review interval at the requested target
    /// retention. The FSRS formula at 90% is exactly `stability` in days, so
    /// the default setting keeps the scheduling of earlier releases.
    fn interval_for_stability(stability: f64, retention_pct: u32, max_interval_days: u32) -> u32 {
        let retention = retention_pct.clamp(80, 95) as f64 / 100.0;
        let cap = max_interval_days.clamp(7, 3650) as f64;
        let interval = stability / FSRS_FACTOR * (retention.powf(1.0 / FSRS_DECAY) - 1.0);
        interval.round().clamp(1.0, cap) as u32
    }

    fn apply_fsrs(
        &mut self,
        rating: u8,
        now: i64,
        first_review: bool,
        elapsed_days: f64,
        retention_pct: u32,
        max_interval_days: u32,
    ) {
        let rating = rating.clamp(1, 4);
        let current = self.stability.max(0.1);
        let difficulty = self.difficulty.clamp(1.0, 10.0);
        let retrievability = if first_review {
            0.0
        } else {
            (1.0 + FSRS_FACTOR * elapsed_days.max(0.0) / current).powf(FSRS_DECAY)
        };
        let next_stability = if first_review {
            Self::initial_stability(rating)
        } else if rating == 1 {
            Self::lapse_stability(current, difficulty, retrievability)
        } else {
            Self::success_stability(current, difficulty, retrievability, rating)
        };
        let next_difficulty = if first_review {
            Self::initial_difficulty(rating)
        } else {
            Self::next_difficulty(difficulty, rating)
        };
        let interval = if rating == 1 {
            0
        } else {
            Self::interval_for_stability(next_stability, retention_pct, max_interval_days)
        };

        self.stability = next_stability.clamp(0.1, 3650.0);
        self.difficulty = next_difficulty.clamp(1.0, 10.0);
        self.elapsed_days = elapsed_days.round().clamp(0.0, 3650.0) as u32;
        self.scheduled_days = interval;
        self.interval_days = interval;
        self.box_ = if interval == 0 {
            0
        } else {
            box_from_interval(interval)
        };
        self.fsrs_state = if rating == 1 {
            if first_review {
                "learning".into()
            } else {
                "relearning".into()
            }
        } else {
            "review".into()
        };
        if rating == 1 && !first_review {
            self.lapses = self.lapses.saturating_add(1);
        }
        self.last_rating = rating;
        self.due_at = if interval == 0 {
            // Short relearning step. This is intentionally in the same shape
            // as the v2 scheduler so old clients still understand the queue.
            now + 10 * 60
        } else {
            now + interval as i64 * 86_400
        };
    }

    fn refresh_leech(&mut self) {
        let attempts = self.correct.saturating_add(self.wrong);
        let accuracy = if attempts == 0 {
            1.0
        } else {
            self.correct as f64 / attempts as f64
        };
        if self.lapses >= 4 || (self.wrong >= 5 && accuracy < 0.6) {
            self.leech = true;
        }
        if self.leech && self.streak_correct >= 3 {
            self.leech = false;
        }
    }
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct Stats {
    #[serde(default)]
    pub answers: u32,
    #[serde(default)]
    pub correct: u32,
    #[serde(default)]
    pub sessions: u32,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct ExamAttemptItem {
    #[serde(default)]
    pub item_id: String,
    #[serde(default)]
    pub kind: String,
    #[serde(default)]
    pub section: String,
    #[serde(default)]
    pub section_label: String,
    #[serde(default)]
    pub type_label: String,
    #[serde(default)]
    pub unit_id: i32,
    #[serde(default)]
    pub prompt: String,
    #[serde(default)]
    pub answer: String,
    #[serde(default)]
    pub input: String,
    #[serde(default)]
    pub answer_label: String,
    #[serde(default)]
    pub note: String,
    #[serde(default)]
    pub source: String,
    #[serde(default)]
    pub source_tab: String,
    #[serde(default)]
    pub auto: bool,
    #[serde(default)]
    pub answered: bool,
    #[serde(default)]
    pub graded: Option<bool>,
    #[serde(default)]
    pub time_ms: u32,
    /// Flagged for review during the exam.
    #[serde(default)]
    pub flagged: bool,
    /// Bank tags (unit, type, skill) for filtering and analytics.
    #[serde(default)]
    pub tags: Vec<String>,
    /// Vocabulary term this exam item should return to the SRS queue if wrong.
    #[serde(default)]
    pub review_en: String,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct ExamAttempt {
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub mode: String,
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub subtitle: String,
    #[serde(default)]
    pub view_mode: String,
    #[serde(default)]
    pub started_at: i64,
    #[serde(default)]
    pub finished_at: i64,
    #[serde(default)]
    pub time_spent_sec: u32,
    #[serde(default)]
    pub timeout: bool,
    #[serde(default)]
    pub total: u32,
    #[serde(default)]
    pub correct: u32,
    #[serde(default)]
    pub wrong: u32,
    #[serde(default)]
    pub skipped: u32,
    #[serde(default)]
    pub score_pct: u32,
    #[serde(default)]
    pub items: Vec<ExamAttemptItem>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(default)]
pub struct Progress {
    #[serde(default)]
    pub words: HashMap<String, WordStat>,
    #[serde(default)]
    pub stats: Stats,
    #[serde(default)]
    pub days: HashMap<String, u32>,
    #[serde(default)]
    pub exams: Vec<ExamAttempt>,
    /// Milliseconds spent answering cards, by local date (YYYY-MM-DD).
    #[serde(default)]
    pub day_ms: HashMap<String, u64>,
    /// Finished exams, by local date (YYYY-MM-DD).
    #[serde(default)]
    pub day_exams: HashMap<String, u32>,
    /// New cards introduced today, by local date.
    #[serde(default)]
    pub day_new: HashMap<String, u32>,
    /// Active (non-leech) card reviews today, by local date.
    #[serde(default)]
    pub day_reviews: HashMap<String, u32>,
    /// Leeches reviewed today, by local date.
    #[serde(default)]
    pub day_leech: HashMap<String, u32>,
    /// Failed exam vocabulary assigned to the review queue today.
    #[serde(default)]
    pub day_exam_errors: HashMap<String, u32>,
    /// Daily study limits and the optional exam date.
    #[serde(default)]
    pub prefs: StudyPrefs,
    /// Mistake-notebook entries the learner explicitly marked as practised.
    #[serde(default)]
    pub resolved_mistakes: Vec<String>,
    /// Audio library items completed locally.
    #[serde(default)]
    pub audio_done: Vec<String>,
    /// Speaking-practice prompts explicitly marked as practised.
    #[serde(default)]
    pub speaking_done: Vec<String>,
    /// Number of self-rated speaking attempts.
    #[serde(default)]
    pub speaking_attempts: u32,
    /// Unix seconds of the latest speaking attempt.
    #[serde(default)]
    pub speaking_last_at: i64,
    /// Schema version. Missing in v1 files, so `serde(default)` must stay 0.
    #[serde(default)]
    pub version: u32,
}

impl Default for Progress {
    fn default() -> Self {
        Self {
            words: HashMap::new(),
            stats: Stats::default(),
            days: HashMap::new(),
            exams: Vec::new(),
            day_ms: HashMap::new(),
            day_exams: HashMap::new(),
            day_new: HashMap::new(),
            day_reviews: HashMap::new(),
            day_leech: HashMap::new(),
            day_exam_errors: HashMap::new(),
            prefs: StudyPrefs::default(),
            resolved_mistakes: Vec::new(),
            audio_done: Vec::new(),
            speaking_done: Vec::new(),
            speaking_attempts: 0,
            speaking_last_at: 0,
            version: SCHEMA_VERSION,
        }
    }
}

pub fn key(unit_id: i32, en: &str) -> String {
    format!("{}|{}", unit_id, en.trim().to_lowercase())
}

fn box_interval(box_: u8) -> u32 {
    match box_ {
        0 => 0,
        1 => 1,
        2 => 2,
        3 => 4,
        4 => 8,
        _ => 16,
    }
}

fn box_from_interval(days: u32) -> u8 {
    match days {
        0 => 0,
        1 => 1,
        2..=3 => 2,
        4..=7 => 3,
        8..=15 => 4,
        _ => 5,
    }
}

fn today_key() -> String {
    Local::now().format("%Y-%m-%d").to_string()
}

fn normalize_timestamp(ts: i64) -> i64 {
    if ts > 10_000_000_000 {
        ts / 1000
    } else {
        ts
    }
}

impl Progress {
    /// Migrates v1/v2 progress to the FSRS schema. Returns true when data changed.
    pub fn migrate(&mut self) -> bool {
        let old_version = self.version;
        let changed = old_version != SCHEMA_VERSION;
        if old_version < 2 {
            let now = Local::now().timestamp();
            for word in self.words.values_mut() {
                word.normalize();
                if word.reviews == 0 {
                    word.reviews = word.correct + word.wrong;
                }
                if word.interval_days == 0 && word.box_ > 0 {
                    word.interval_days = box_interval(word.box_);
                    word.due_at = if word.last_seen > 0 {
                        word.last_seen + word.interval_days as i64 * 86_400
                    } else {
                        now
                    };
                }
            }
            // v1 stored exam attempts but not the per-day exam counters.
            // Derive them so the analytics page keeps its history after upgrade.
            let attempts = self.exams.clone();
            for attempt in attempts {
                if attempt.finished_at <= 0 {
                    continue;
                }
                let date = Local
                    .timestamp_opt(attempt.finished_at, 0)
                    .single()
                    .unwrap_or_else(Local::now)
                    .format("%Y-%m-%d")
                    .to_string();
                *self.day_exams.entry(date.clone()).or_insert(0) += 1;
                if attempt.time_spent_sec > 0 {
                    *self.day_ms.entry(date).or_insert(0) += attempt.time_spent_sec as u64 * 1000;
                }
            }
        }

        // v2 words have box/interval/ease data but no FSRS memory state. Derive
        // a safe starting stability from the old interval; the next review then
        // updates it with the normal FSRS formula.
        for word in self.words.values_mut() {
            word.normalize();
            if word.reviews == 0 && (word.correct > 0 || word.wrong > 0) {
                word.reviews = word.correct + word.wrong;
            }
            if old_version < 3 {
                if word.stability <= 0.0 && word.is_active() {
                    let days = if word.interval_days > 0 {
                        word.interval_days
                    } else {
                        box_interval(word.box_)
                    };
                    word.stability = days.max(1) as f64;
                }
                if word.difficulty <= 0.0 || !word.difficulty.is_finite() {
                    word.difficulty = (5.0 + (2.5 - word.ease_factor) * 1.5).clamp(1.0, 10.0);
                }
                if word.scheduled_days == 0 {
                    word.scheduled_days = word.interval_days;
                }
                if word.fsrs_state == "new" && word.is_active() {
                    word.fsrs_state = if word.interval_days == 0 {
                        "relearning".into()
                    } else {
                        "review".into()
                    };
                }
                if word.lapses == 0 && word.wrong > 0 {
                    word.lapses = word.wrong.min(3);
                }
                word.refresh_leech();
            }
        }
        self.version = SCHEMA_VERSION;
        self.exams.truncate(100);
        changed
    }

    pub fn record(&mut self, unit_id: i32, en: &str, correct: bool, response_ms: u32) -> &WordStat {
        // Old API clients only send correct/response time. Derive a useful
        // FSRS rating without requiring UI changes: fast correct = Easy,
        // normal correct = Good, slow correct = Hard, wrong = Again.
        let rating = if !correct {
            1
        } else if response_ms > 0 && response_ms <= 6_000 {
            4
        } else if response_ms > 20_000 {
            2
        } else {
            3
        };
        self.record_rating(unit_id, en, rating, response_ms)
    }

    /// Record one answer with an explicit FSRS rating (1 Again … 4 Easy).
    pub fn record_rating(
        &mut self,
        unit_id: i32,
        en: &str,
        rating: u8,
        response_ms: u32,
    ) -> &WordStat {
        let rating = rating.clamp(1, 4);
        let correct = rating > 1;
        let now = Local::now().timestamp();
        let today = today_key();
        let response_ms = response_ms.min(600_000);
        let k = key(unit_id, en);
        let was_active = self.words.get(&k).map(WordStat::is_active).unwrap_or(false);
        let was_leech = self.words.get(&k).map(|word| word.leech).unwrap_or(false);
        let retention_pct = self.prefs.desired_retention_pct;
        let max_interval_days = self.prefs.max_interval_days;

        *self.days.entry(today.clone()).or_insert(0) += 1;
        if response_ms > 0 {
            *self.day_ms.entry(today.clone()).or_insert(0) += response_ms as u64;
        }
        self.stats.answers += 1;
        if correct {
            self.stats.correct += 1;
        }

        let entry = self.words.entry(k).or_default();
        entry.normalize();
        let first_review = !was_active && entry.reviews == 0 && entry.last_seen == 0;
        let elapsed = if entry.last_seen > 0 {
            ((now - entry.last_seen).max(0) as f64) / 86_400.0
        } else {
            0.0
        };
        entry.last_seen = now;
        entry.reviews = entry.reviews.saturating_add(1);
        if response_ms > 0 {
            entry.last_ms = response_ms;
        }
        if correct {
            entry.correct = entry.correct.saturating_add(1);
            entry.streak_correct = entry.streak_correct.saturating_add(1);
        } else {
            entry.wrong = entry.wrong.saturating_add(1);
            entry.streak_correct = 0;
        }
        match rating {
            1 => entry.ease_factor = (entry.ease_factor - 0.2).max(1.3),
            2 => entry.ease_factor = (entry.ease_factor - 0.05).max(1.3),
            4 => entry.ease_factor = (entry.ease_factor + 0.05).min(3.2),
            _ => {}
        }
        entry.apply_fsrs(
            rating,
            now,
            first_review,
            elapsed,
            retention_pct,
            max_interval_days,
        );
        entry.refresh_leech();

        if !was_active {
            *self.day_new.entry(today).or_insert(0) += 1;
        } else if was_leech {
            *self.day_leech.entry(today).or_insert(0) += 1;
        } else {
            *self.day_reviews.entry(today).or_insert(0) += 1;
        }
        entry
    }

    pub fn finish_session(&mut self) {
        self.stats.sessions += 1;
    }

    /// Put a vocabulary word back into today's review queue.
    pub fn flag_for_review(&mut self, unit_id: i32, en: &str) {
        let entry = self.words.entry(key(unit_id, en)).or_default();
        entry.normalize();
        entry.due_at = Local::now().timestamp();
        entry.interval_days = 0;
        entry.scheduled_days = 0;
        if entry.reviews > 0 || entry.correct + entry.wrong > 0 {
            entry.fsrs_state = "relearning".into();
            entry.stability = entry.stability.min(1.0).max(0.1);
        }
    }

    pub fn add_exam(&mut self, mut attempt: ExamAttempt) -> ExamAttempt {
        let now = Local::now().timestamp();
        if attempt.id.trim().is_empty() {
            attempt.id = format!(
                "exam-{}-{}",
                Local::now().timestamp_millis(),
                self.exams.len()
            );
        }
        if attempt.finished_at <= 0 {
            attempt.finished_at = now;
        } else {
            attempt.finished_at = normalize_timestamp(attempt.finished_at);
        }
        if attempt.started_at <= 0 {
            attempt.started_at = attempt.finished_at;
        } else {
            attempt.started_at = normalize_timestamp(attempt.started_at);
        }
        if attempt.started_at > attempt.finished_at {
            attempt.started_at = attempt.finished_at;
        }
        attempt.total = attempt.items.len() as u32;
        attempt.correct = attempt
            .items
            .iter()
            .filter(|item| item.graded == Some(true))
            .count() as u32;
        attempt.wrong = attempt
            .items
            .iter()
            .filter(|item| item.graded == Some(false))
            .count() as u32;
        attempt.skipped = attempt
            .total
            .saturating_sub(attempt.correct + attempt.wrong);
        attempt.score_pct = if attempt.total == 0 {
            0
        } else {
            ((attempt.correct as f64 / attempt.total as f64) * 100.0).round() as u32
        };

        // Every failed vocabulary item returns to the SRS queue automatically.
        let failed: Vec<(i32, String)> = attempt
            .items
            .iter()
            .filter(|item| item.graded == Some(false))
            .filter(|item| !item.review_en.trim().is_empty())
            .map(|item| (item.unit_id, item.review_en.clone()))
            .collect();
        let failed_count = failed.len() as u32;
        for (unit_id, en) in failed {
            self.flag_for_review(unit_id, &en);
        }
        if failed_count > 0 {
            *self.day_exam_errors.entry(today_key()).or_insert(0) += failed_count;
        }

        let date = Local
            .timestamp_opt(attempt.finished_at, 0)
            .single()
            .unwrap_or_else(Local::now)
            .format("%Y-%m-%d")
            .to_string();
        *self.day_exams.entry(date.clone()).or_insert(0) += 1;
        *self.day_ms.entry(date).or_insert(0) += attempt.time_spent_sec as u64 * 1000;

        self.exams.insert(0, attempt.clone());
        self.exams.truncate(100);
        attempt
    }

    pub fn clear_exams(&mut self) {
        self.exams.clear();
    }

    pub fn reset(&mut self) {
        self.words.clear();
        self.stats = Stats::default();
        self.days.clear();
        self.exams.clear();
        self.day_ms.clear();
        self.day_exams.clear();
        self.day_new.clear();
        self.day_reviews.clear();
        self.day_leech.clear();
        self.day_exam_errors.clear();
        self.prefs = StudyPrefs::default();
        self.resolved_mistakes.clear();
        self.audio_done.clear();
        self.speaking_done.clear();
        self.speaking_attempts = 0;
        self.speaking_last_at = 0;
        self.version = SCHEMA_VERSION;
    }

    pub fn due_count(&self) -> usize {
        let now = Local::now().timestamp();
        self.words
            .values()
            .filter(|word| word.is_active() && word.is_due(now))
            .count()
    }

    pub fn today_json(&self) -> serde_json::Value {
        let today = today_key();
        let exam_answers: u32 = self
            .exams
            .iter()
            .filter(|attempt| {
                Local
                    .timestamp_opt(attempt.finished_at, 0)
                    .single()
                    .unwrap_or_else(Local::now)
                    .format("%Y-%m-%d")
                    .to_string()
                    == today
            })
            .flat_map(|attempt| attempt.items.iter())
            .filter(|item| item.answered)
            .count() as u32;
        serde_json::json!({
            "date": today,
            "answers": self.days.get(&today).copied().unwrap_or(0),
            "exam_answers": exam_answers,
            "ms": self.day_ms.get(&today).copied().unwrap_or(0),
            "exams": self.day_exams.get(&today).copied().unwrap_or(0),
            "new": self.day_new.get(&today).copied().unwrap_or(0),
            "reviews": self.day_reviews.get(&today).copied().unwrap_or(0),
            "leech": self.day_leech.get(&today).copied().unwrap_or(0),
            "exam_errors": self.day_exam_errors.get(&today).copied().unwrap_or(0),
            "due": self.due_count(),
        })
    }

    pub fn merge_from(&mut self, mut other: Progress) {
        other.migrate();
        for (k, incoming) in other.words {
            match self.words.get_mut(&k) {
                None => {
                    self.words.insert(k, incoming);
                }
                Some(current) => {
                    let incoming_latest = incoming.last_seen >= current.last_seen;
                    current.correct = current.correct.saturating_add(incoming.correct);
                    current.wrong = current.wrong.saturating_add(incoming.wrong);
                    current.reviews = current.reviews.saturating_add(incoming.reviews);
                    current.box_ = current.box_.max(incoming.box_);
                    current.interval_days = current.interval_days.max(incoming.interval_days);
                    current.ease_factor =
                        ((current.ease_factor + incoming.ease_factor) / 2.0).clamp(1.3, 4.0);
                    current.due_at = if current.due_at == 0 || incoming.due_at == 0 {
                        0
                    } else {
                        current.due_at.min(incoming.due_at)
                    };
                    current.lapses = current.lapses.max(incoming.lapses);
                    current.leech = current.leech || incoming.leech;
                    current.scheduled_days = current.scheduled_days.max(incoming.scheduled_days);
                    current.streak_correct = current.streak_correct.max(incoming.streak_correct);
                    if incoming_latest {
                        current.last_seen = incoming.last_seen;
                        current.last_ms = incoming.last_ms;
                        current.stability = incoming.stability.max(current.stability);
                        current.difficulty = incoming.difficulty;
                        current.fsrs_state = incoming.fsrs_state;
                        current.elapsed_days = incoming.elapsed_days;
                        current.last_rating = incoming.last_rating;
                    }
                }
            }
        }
        self.stats.answers = self.stats.answers.saturating_add(other.stats.answers);
        self.stats.correct = self.stats.correct.saturating_add(other.stats.correct);
        self.stats.sessions = self.stats.sessions.saturating_add(other.stats.sessions);
        for (day, count) in other.days {
            *self.days.entry(day).or_insert(0) += count;
        }
        for (day, ms) in other.day_ms {
            *self.day_ms.entry(day).or_insert(0) += ms;
        }
        for (day, count) in other.day_exams {
            *self.day_exams.entry(day).or_insert(0) += count;
        }
        for (day, count) in other.day_new {
            *self.day_new.entry(day).or_insert(0) += count;
        }
        for (day, count) in other.day_reviews {
            *self.day_reviews.entry(day).or_insert(0) += count;
        }
        for (day, count) in other.day_leech {
            *self.day_leech.entry(day).or_insert(0) += count;
        }
        for (day, count) in other.day_exam_errors {
            *self.day_exam_errors.entry(day).or_insert(0) += count;
        }
        if self.prefs == StudyPrefs::default() {
            self.prefs = other.prefs;
        }
        for id in other.resolved_mistakes {
            if !self.resolved_mistakes.contains(&id) {
                self.resolved_mistakes.push(id);
            }
        }
        for id in other.audio_done {
            if !self.audio_done.contains(&id) {
                self.audio_done.push(id);
            }
        }
        self.speaking_attempts = self
            .speaking_attempts
            .saturating_add(other.speaking_attempts);
        self.speaking_last_at = self.speaking_last_at.max(other.speaking_last_at);
        for id in other.speaking_done {
            if !self.speaking_done.contains(&id) {
                self.speaking_done.push(id);
            }
        }
        let mut ids: std::collections::HashSet<String> = self
            .exams
            .iter()
            .map(|attempt| attempt.id.clone())
            .collect();
        for attempt in other.exams {
            if ids.insert(attempt.id.clone()) {
                self.exams.push(attempt);
            }
        }
        self.exams.sort_by(|a, b| b.finished_at.cmp(&a.finished_at));
        self.exams.truncate(100);
        self.version = SCHEMA_VERSION;
    }

    pub fn streak(&self) -> u32 {
        let today = Local::now().date_naive();
        let mut streak = 0;
        let mut cursor = today;
        if !self
            .days
            .contains_key(&cursor.format("%Y-%m-%d").to_string())
        {
            cursor -= Duration::days(1);
        }
        loop {
            let key = cursor.format("%Y-%m-%d").to_string();
            if self.days.contains_key(&key) {
                streak += 1;
                cursor -= Duration::days(1);
            } else {
                break;
            }
        }
        streak
    }

    pub fn learned_count(&self) -> usize {
        self.words.values().filter(|w| w.box_ >= 3).count()
    }

    pub fn activity_json(&self) -> serde_json::Value {
        let mut days: Vec<_> = self.days.iter().collect();
        days.sort_by(|a, b| a.0.cmp(b.0));
        let mut exam_answers: HashMap<String, u32> = HashMap::new();
        let mut exam_count: HashMap<String, u32> = HashMap::new();
        for attempt in &self.exams {
            let date = Local
                .timestamp_opt(attempt.finished_at, 0)
                .single()
                .unwrap_or_else(Local::now)
                .format("%Y-%m-%d")
                .to_string();
            let answered = attempt.items.iter().filter(|item| item.answered).count() as u32;
            *exam_answers.entry(date.clone()).or_insert(0) += answered;
            *exam_count.entry(date).or_insert(0) += 1;
        }
        let start = Local::now().date_naive() - Duration::days(29);
        let mut out = Vec::new();
        for i in 0..30 {
            let d = start + Duration::days(i);
            let k = d.format("%Y-%m-%d").to_string();
            let practice = self.days.get(&k).copied().unwrap_or(0);
            let exams = exam_answers.get(&k).copied().unwrap_or(0);
            out.push(serde_json::json!({
                "date": k,
                "count": practice + exams,
                "practice": practice,
                "exam_answers": exams,
                "exam_count": exam_count.get(&k).copied().unwrap_or(0),
                "ms": self.day_ms.get(&k).copied().unwrap_or(0),
            }));
        }
        serde_json::Value::Array(out)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_prefs_preserve_legacy_intervals() {
        let prefs = StudyPrefs::default();
        assert_eq!(prefs.desired_retention_pct, 90);
        assert_eq!(prefs.max_interval_days, 3650);
        assert_eq!(WordStat::interval_for_stability(10.0, 90, 3650), 10);
    }

    #[test]
    fn higher_retention_schedules_sooner() {
        let relaxed = WordStat::interval_for_stability(20.0, 80, 3650);
        let balanced = WordStat::interval_for_stability(20.0, 90, 3650);
        let strict = WordStat::interval_for_stability(20.0, 95, 3650);
        assert!(relaxed > balanced, "{relaxed} > {balanced}");
        assert!(balanced > strict, "{balanced} > {strict}");
    }

    #[test]
    fn max_interval_caps_every_schedule() {
        assert_eq!(WordStat::interval_for_stability(1000.0, 90, 30), 30);
        assert_eq!(WordStat::interval_for_stability(1000.0, 90, 1), 7);
    }

    #[test]
    fn record_rating_uses_personal_retention() {
        let mut strict = Progress::default();
        strict.prefs.desired_retention_pct = 95;
        let strict_word = strict.record_rating(99, "retention-test", 3, 0);
        assert_eq!(strict_word.scheduled_days, 1);

        let mut relaxed = Progress::default();
        relaxed.prefs.desired_retention_pct = 80;
        let relaxed_word = relaxed.record_rating(99, "retention-test", 3, 0);
        assert_eq!(relaxed_word.scheduled_days, 8);
    }

    #[test]
    fn old_prefs_json_gets_retention_defaults() {
        let prefs: StudyPrefs = serde_json::from_value(serde_json::json!({
            "daily_new_limit": 12,
            "daily_review_limit": 60,
            "daily_leech_limit": 15,
            "daily_exam_limit": 15,
            "desired_minutes": 25,
            "exam_date": ""
        }))
        .unwrap();
        assert_eq!(prefs.desired_retention_pct, 90);
        assert_eq!(prefs.max_interval_days, 3650);
    }

    #[test]
    fn old_progress_json_gets_speaking_defaults() {
        let progress: Progress = serde_json::from_value(serde_json::json!({
            "version": 3,
            "words": {},
            "stats": { "answers": 1 }
        }))
        .unwrap();
        assert!(progress.speaking_done.is_empty());
        assert_eq!(progress.speaking_attempts, 0);
        assert_eq!(progress.speaking_last_at, 0);
    }

    #[test]
    fn speaking_merge_unions_done_and_adds_attempts() {
        let mut current = Progress::default();
        current.speaking_done = vec!["a".into()];
        current.speaking_attempts = 2;
        current.speaking_last_at = 10;

        let mut incoming = Progress::default();
        incoming.speaking_done = vec!["a".into(), "b".into()];
        incoming.speaking_attempts = 3;
        incoming.speaking_last_at = 20;

        current.merge_from(incoming);
        assert_eq!(current.speaking_done, vec!["a", "b"]);
        assert_eq!(current.speaking_attempts, 5);
        assert_eq!(current.speaking_last_at, 20);
    }
}
