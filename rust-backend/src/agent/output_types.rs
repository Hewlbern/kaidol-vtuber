use serde::{Deserialize, Serialize};

/// Represents actions that can be performed alongside text output
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Actions {
    /// List of expressions (can be strings or integers)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expressions: Option<Vec<serde_json::Value>>,
    /// List of picture paths/URLs
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pictures: Option<Vec<String>>,
    /// List of sound paths/URLs
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sounds: Option<Vec<String>>,
}

impl Actions {
    pub fn new() -> Self {
        Self {
            expressions: None,
            pictures: None,
            sounds: None,
        }
    }

    /// Convert Actions object to a dictionary for JSON serialization
    pub fn to_dict(&self) -> serde_json::Value {
        let mut result = serde_json::Map::new();
        if let Some(ref exprs) = self.expressions {
            result.insert("expressions".to_string(), serde_json::to_value(exprs).unwrap());
        }
        if let Some(ref pics) = self.pictures {
            result.insert("pictures".to_string(), serde_json::to_value(pics).unwrap());
        }
        if let Some(ref snds) = self.sounds {
            result.insert("sounds".to_string(), serde_json::to_value(snds).unwrap());
        }
        serde_json::Value::Object(result)
    }
}

impl Default for Actions {
    fn default() -> Self {
        Self::new()
    }
}

/// Text to be displayed with optional metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DisplayText {
    /// Text content
    pub text: String,
    /// Name of the speaker (default: "AI")
    #[serde(default = "default_ai_name")]
    pub name: Option<String>,
    /// Avatar path/URL
    #[serde(skip_serializing_if = "Option::is_none")]
    pub avatar: Option<String>,
}

fn default_ai_name() -> Option<String> {
    Some("AI".to_string())
}

impl DisplayText {
    pub fn new(text: String) -> Self {
        Self {
            text,
            name: default_ai_name(),
            avatar: None,
        }
    }

    /// Convert to dictionary for JSON serialization
    pub fn to_dict(&self) -> serde_json::Value {
        serde_json::json!({
            "text": self.text,
            "name": self.name,
            "avatar": self.avatar
        })
    }
}

impl std::fmt::Display for DisplayText {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}: {}", self.name.as_deref().unwrap_or("AI"), self.text)
    }
}

/// Output type for text-based responses.
/// Contains a single sentence pair (display and TTS) with associated actions.
#[derive(Debug, Clone)]
pub struct SentenceOutput {
    /// Text to be displayed in UI
    pub display_text: DisplayText,
    /// Text to be sent to TTS engine
    pub tts_text: String,
    /// Associated actions (expressions, pictures, sounds)
    pub actions: Actions,
}

/// Output type for audio-based responses
#[derive(Debug, Clone)]
pub struct AudioOutput {
    /// Path to audio file
    pub audio_path: String,
    /// Text to be displayed
    pub display_text: DisplayText,
    /// Original transcript
    pub transcript: String,
    /// Associated actions
    pub actions: Actions,
}

/// Base trait for agent outputs that can be iterated
pub trait BaseOutput: Send + Sync {
    /// Get as sentence output if applicable
    fn as_sentence(&self) -> Option<&SentenceOutput>;
    /// Get as audio output if applicable
    fn as_audio(&self) -> Option<&AudioOutput>;
}

impl BaseOutput for SentenceOutput {
    fn as_sentence(&self) -> Option<&SentenceOutput> {
        Some(self)
    }

    fn as_audio(&self) -> Option<&AudioOutput> {
        None
    }
}

impl BaseOutput for AudioOutput {
    fn as_sentence(&self) -> Option<&SentenceOutput> {
        None
    }

    fn as_audio(&self) -> Option<&AudioOutput> {
        Some(self)
    }
}

