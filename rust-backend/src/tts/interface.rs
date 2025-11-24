use async_trait::async_trait;
use serde::{Deserialize, Serialize};

/// TTS request for synthesizing text to speech
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TTSRequest {
    pub text: String,
    pub voice: Option<String>,
    pub language: Option<String>,
    pub config: Option<serde_json::Value>, // Additional TTS-specific config
}

/// TTS response containing the generated audio path
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TTSResponse {
    pub audio_path: String,
    pub success: bool,
    pub error: Option<String>,
}

/// TTS interface trait - actual implementation in Python service
#[async_trait]
pub trait TTSInterface: Send + Sync {
    /// Generate speech audio file from text asynchronously
    /// 
    /// # Arguments
    /// * `text` - The text to synthesize
    /// * `file_name_no_ext` - Optional filename without extension (deprecated, handled by Python)
    /// 
    /// # Returns
    /// Path to the generated audio file
    async fn generate_audio(
        &self,
        text: &str,
        file_name_no_ext: Option<&str>,
    ) -> Result<String, anyhow::Error>;

    /// Remove an audio file from the filesystem
    fn remove_file(&self, filepath: &str) -> Result<(), anyhow::Error>;
}
