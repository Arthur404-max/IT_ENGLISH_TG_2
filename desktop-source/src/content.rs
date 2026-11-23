use anyhow::Result;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Vocab {
    pub en: String,
    pub ru: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Text {
    pub letter: String,
    pub title: String,
    #[serde(default)]
    pub paragraphs: Vec<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Task {
    pub num: i32,
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub body: Vec<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ExamQuestion {
    pub num: i32,
    #[serde(default)]
    pub question_en: String,
    #[serde(default)]
    pub question_ru: String,
    #[serde(default)]
    pub answer_en: String,
    #[serde(default)]
    pub answer_ru: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Unit {
    pub id: i32,
    pub title_en: String,
    pub title_ru: String,
    #[serde(default)]
    pub vocab: Vec<Vocab>,
    #[serde(default)]
    pub texts: Vec<Text>,
    #[serde(default)]
    pub tasks: Vec<Task>,
    #[serde(default)]
    pub translation_sentences: Vec<String>,
    #[serde(default)]
    pub qa: Vec<ExamQuestion>,
}

#[derive(Clone, Debug, Serialize)]
pub struct UnitSummary {
    pub id: i32,
    pub title_en: String,
    pub title_ru: String,
    pub vocab: usize,
    pub texts: usize,
    pub tasks: usize,
    pub translations: usize,
    pub qa: usize,
}

#[derive(Clone, Debug, Deserialize)]
struct ContentFile {
    units: Vec<Unit>,
}

#[derive(Clone, Debug)]
pub struct Content {
    pub units: Vec<Unit>,
}

impl Content {
    pub fn load() -> Result<Self> {
        let file: ContentFile = serde_json::from_str(include_str!("../data/units.json"))?;
        Ok(Self { units: file.units })
    }

    pub fn summaries(&self) -> Vec<UnitSummary> {
        self.units
            .iter()
            .map(|u| UnitSummary {
                id: u.id,
                title_en: u.title_en.clone(),
                title_ru: u.title_ru.clone(),
                vocab: u.vocab.len(),
                texts: u.texts.len(),
                tasks: u.tasks.len(),
                translations: u.translation_sentences.len(),
                qa: u.qa.len(),
            })
            .collect()
    }

    pub fn unit(&self, id: i32) -> Option<&Unit> {
        self.units.iter().find(|u| u.id == id)
    }

    pub fn total_vocab(&self) -> usize {
        self.units.iter().map(|u| u.vocab.len()).sum()
    }
}
