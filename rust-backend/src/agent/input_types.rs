use serde::{Deserialize, Serialize};

/// Enum for different image sources
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ImageSource {
    #[serde(rename = "camera")]
    Camera,
    #[serde(rename = "screen")]
    Screen,
    #[serde(rename = "clipboard")]
    Clipboard,
    #[serde(rename = "upload")]
    Upload,
}

/// Enum for different text sources
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TextSource {
    #[serde(rename = "input")]
    Input,    // Main user input/transcription
    #[serde(rename = "clipboard")]
    Clipboard, // Text from clipboard
}

/// Represents an image from various sources
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageData {
    /// Source of the image
    pub source: ImageSource,
    /// Base64 encoded image data or URL
    pub data: String,
    /// MIME type of the image (e.g., 'image/jpeg', 'image/png')
    pub mime_type: String,
}

/// Represents a file uploaded by the user
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileData {
    /// Original filename
    pub name: String,
    /// Base64 encoded file data
    pub data: String,
    /// MIME type of the file
    pub mime_type: String,
}

/// Represents text data from various sources
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TextData {
    /// Source of the text
    pub source: TextSource,
    /// The text content
    pub content: String,
    /// Name of the sender/character
    #[serde(skip_serializing_if = "Option::is_none")]
    pub from_name: Option<String>,
}

/// Base trait for all input types
pub trait BaseInput: Send + Sync {}

/// Input type for batch processing, containing complete transcription and optional media
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BatchInput {
    /// List of text data from different sources
    pub texts: Vec<TextData>,
    /// Optional list of images
    #[serde(skip_serializing_if = "Option::is_none")]
    pub images: Option<Vec<ImageData>>,
    /// Optional list of files
    #[serde(skip_serializing_if = "Option::is_none")]
    pub files: Option<Vec<FileData>>,
}

impl BaseInput for BatchInput {}

impl BatchInput {
    pub fn new(texts: Vec<TextData>) -> Self {
        Self {
            texts,
            images: None,
            files: None,
        }
    }
}

