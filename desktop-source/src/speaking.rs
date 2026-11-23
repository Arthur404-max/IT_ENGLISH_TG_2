//! Offline speaking-practice prompts derived from the course content.
//!
//! The catalog is deliberately built from local data: short sentences from the
//! reading texts and questions from the unit tasks. No network or AI service is
//! involved, and recordings stay in the browser.

use crate::content::Content;
use crate::progress::Progress;
use serde::Serialize;
use serde_json::{json, Value};
use std::collections::HashSet;

const MAX_SENTENCES_PER_TEXT: usize = 3;
const MAX_QUESTIONS_PER_UNIT: usize = 6;

#[derive(Clone, Debug, Serialize)]
pub struct SpeakingPrompt {
    pub id: String,
    pub unit_id: i32,
    pub unit_title_en: String,
    pub unit_title_ru: String,
    /// `sentence` for shadowing or `question` for a short spoken answer.
    pub kind: String,
    pub text: String,
    /// Text or task title that helps the learner remember the context.
    pub context: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text_letter: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub task_num: Option<i32>,
}

fn split_sentences(paragraph: &str) -> Vec<String> {
    paragraph
        .split_inclusive(|c| matches!(c, '.' | '!' | '?'))
        .map(str::trim)
        .filter(|part| !part.is_empty())
        .map(ToOwned::to_owned)
        .collect()
}

fn normalize(text: &str) -> String {
    text.split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .to_lowercase()
}

fn usable(text: &str, min_words: usize) -> bool {
    let words = text.split_whitespace().count();
    let chars = text.chars().count();
    words >= min_words && (20..=240).contains(&chars) && !text.contains('_')
}

fn sentence_id(unit_id: i32, text_index: usize, sentence_index: usize) -> String {
    format!("u{unit_id}-t{text_index}-s{sentence_index}")
}

fn question_id(unit_id: i32, task_num: i32, question_index: usize) -> String {
    format!("u{unit_id}-q{task_num}-{question_index}")
}

/// Build the stable prompt catalog used by the API and the UI.
pub fn catalog(content: &Content) -> Vec<SpeakingPrompt> {
    let mut prompts = Vec::new();
    let mut seen = HashSet::new();

    for unit in &content.units {
        for (text_index, text) in unit.texts.iter().enumerate() {
            let mut taken = 0usize;
            let mut sentence_index = 0usize;
            'paragraphs: for paragraph in &text.paragraphs {
                for sentence in split_sentences(paragraph) {
                    let ordinal = sentence_index;
                    sentence_index += 1;
                    if taken >= MAX_SENTENCES_PER_TEXT {
                        break 'paragraphs;
                    }
                    if !usable(&sentence, 5) {
                        continue;
                    }
                    let normalized = normalize(&sentence);
                    if !seen.insert(normalized) {
                        continue;
                    }
                    prompts.push(SpeakingPrompt {
                        id: sentence_id(unit.id, text_index, ordinal),
                        unit_id: unit.id,
                        unit_title_en: unit.title_en.clone(),
                        unit_title_ru: unit.title_ru.clone(),
                        kind: "sentence".into(),
                        text: sentence,
                        context: text.title.clone(),
                        text_letter: Some(text.letter.clone()),
                        task_num: None,
                    });
                    taken += 1;
                }
            }
        }

        let mut taken = 0usize;
        'tasks: for task in &unit.tasks {
            for (question_index, line) in task.body.iter().enumerate() {
                if taken >= MAX_QUESTIONS_PER_UNIT {
                    break 'tasks;
                }
                let question = line.trim();
                if !question.ends_with('?') || !usable(question, 3) {
                    continue;
                }
                let normalized = normalize(question);
                if !seen.insert(normalized) {
                    continue;
                }
                prompts.push(SpeakingPrompt {
                    id: question_id(unit.id, task.num, question_index),
                    unit_id: unit.id,
                    unit_title_en: unit.title_en.clone(),
                    unit_title_ru: unit.title_ru.clone(),
                    kind: "question".into(),
                    text: question.to_string(),
                    context: if task.title.trim().is_empty() {
                        "Вопрос по теме юнита".into()
                    } else {
                        task.title.trim().to_string()
                    },
                    text_letter: None,
                    task_num: Some(task.num),
                });
                taken += 1;
            }
        }
    }

    prompts
}

pub fn contains(content: &Content, id: &str) -> bool {
    catalog(content).iter().any(|prompt| prompt.id == id)
}

pub fn view(content: &Content, progress: &Progress) -> Value {
    let prompts = catalog(content);
    let done: HashSet<&str> = progress.speaking_done.iter().map(String::as_str).collect();
    let items: Vec<Value> = prompts
        .iter()
        .map(|prompt| {
            json!({
                "id": prompt.id,
                "unit_id": prompt.unit_id,
                "unit_title_en": prompt.unit_title_en,
                "unit_title_ru": prompt.unit_title_ru,
                "kind": prompt.kind,
                "text": prompt.text,
                "context": prompt.context,
                "text_letter": prompt.text_letter,
                "task_num": prompt.task_num,
                "done": done.contains(prompt.id.as_str()),
            })
        })
        .collect();
    let completed = items
        .iter()
        .filter(|item| item.get("done").and_then(Value::as_bool).unwrap_or(false))
        .count();
    let sentences = prompts
        .iter()
        .filter(|prompt| prompt.kind == "sentence")
        .count();
    let questions = prompts.len().saturating_sub(sentences);

    json!({
        "prompts": items,
        "done": progress.speaking_done,
        "total": prompts.len(),
        "completed": completed,
        "attempts": progress.speaking_attempts,
        "last_at": progress.speaking_last_at,
        "units": content.units.len(),
        "sentences": sentences,
        "questions": questions,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::content::{Task, Text, Unit};

    fn sample_content() -> Content {
        Content {
            units: vec![Unit {
                id: 7,
                title_en: "Networks".into(),
                title_ru: "Сети".into(),
                vocab: vec![],
                texts: vec![Text {
                    letter: "A".into(),
                    title: "How networks work".into(),
                    paragraphs: vec![
                        "A computer network connects devices and lets them exchange data. It can be local or global. This third sentence is long enough for practice."
                            .into(),
                    ],
                }],
                tasks: vec![Task {
                    num: 2,
                    title: "Answer the following questions".into(),
                    body: vec![
                        "What is a computer network?".into(),
                        "This line is not a question".into(),
                        "Why are networks useful?".into(),
                    ],
                }],
                translation_sentences: vec![],
            }],
        }
    }

    #[test]
    fn split_sentences_keeps_punctuation() {
        let parts = split_sentences("One short sentence. Another one! Is this a question?");
        assert_eq!(parts.len(), 3);
        assert!(parts[1].ends_with('!'));
        assert!(parts[2].ends_with('?'));
    }

    #[test]
    fn catalog_contains_sentences_and_questions() {
        let prompts = catalog(&sample_content());
        assert!(prompts.iter().any(|prompt| prompt.kind == "sentence"));
        assert!(prompts.iter().any(|prompt| prompt.kind == "question"));
        assert_eq!(
            prompts
                .iter()
                .filter(|prompt| prompt.kind == "question")
                .count(),
            2
        );
        assert!(contains(&sample_content(), "u7-q2-0"));
    }

    #[test]
    fn catalog_respects_per_text_limit() {
        let prompts = catalog(&sample_content());
        let sentences = prompts
            .iter()
            .filter(|prompt| prompt.kind == "sentence")
            .count();
        assert!(sentences <= MAX_SENTENCES_PER_TEXT);
    }
}
