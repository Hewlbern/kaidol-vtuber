use serde::{Deserialize, Serialize};

/// Represents a string with translations in multiple languages
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MultiLingualString {
    pub en: String,
    pub zh: String,
}

impl MultiLingualString {
    pub fn get(&self, lang_code: &str) -> &str {
        match lang_code {
            "zh" => &self.zh,
            _ => &self.en,
        }
    }
}

/// Represents a description with translations in multiple languages
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Description {
    #[serde(flatten)]
    pub text: MultiLingualString,
    pub notes: Option<MultiLingualString>,
}

impl Description {
    pub fn get_text(&self, lang_code: &str) -> &str {
        self.text.get(lang_code)
    }

    pub fn get_notes(&self, lang_code: &str) -> Option<&str> {
        self.notes.as_ref().map(|n| n.get(lang_code))
    }

    pub fn from_str(text: &str, notes: Option<&str>) -> Self {
        Self {
            text: MultiLingualString {
                en: text.to_string(),
                zh: text.to_string(),
            },
            notes: notes.map(|n| MultiLingualString {
                en: n.to_string(),
                zh: n.to_string(),
            }),
        }
    }
}

/// Trait for types that support internationalization
pub trait I18nMixin {
    fn get_field_description(&self, field_name: &str, lang_code: &str) -> Option<String>;
    fn get_field_notes(&self, field_name: &str, lang_code: &str) -> Option<String>;
}

