use async_trait::async_trait;
use std::sync::Arc;
use tracing::{debug, error};
use crate::python_service::PythonServiceClient;
use super::interface::{TTSInterface, TTSRequest};

/// TTS client that communicates with Python TTS service
pub struct TTSClient {
    python_service: Arc<PythonServiceClient>,
    default_voice: Option<String>,
    default_language: Option<String>,
    tts_config: Option<serde_json::Value>,
}

impl TTSClient {
    /// Create a new TTS client
    pub fn new(
        python_service: Arc<PythonServiceClient>,
        default_voice: Option<String>,
        default_language: Option<String>,
        tts_config: Option<serde_json::Value>,
    ) -> Self {
        Self {
            python_service,
            default_voice,
            default_language,
            tts_config,
        }
    }

    /// Synthesize text to speech using Python service
    pub async fn synthesize(
        &self,
        text: &str,
        voice: Option<&str>,
        language: Option<&str>,
    ) -> Result<String, anyhow::Error> {
        let request = TTSRequest {
            text: text.to_string(),
            voice: voice
                .map(|v| v.to_string())
                .or_else(|| self.default_voice.clone()),
            language: language
                .map(|l| l.to_string())
                .or_else(|| self.default_language.clone()),
            config: self.tts_config.clone(),
        };

        debug!("Sending TTS request: text={}, config provided={}", 
               text, request.config.is_some());
        
        // Convert to Python service request format
        let python_request = crate::python_service::TTSRequest {
            text: request.text,
            voice: request.voice,
            language: request.language,
        };
        
        // Add config to the request if available
        // We'll need to update python_service.rs to support config
        let response = self
            .python_service
            .synthesize_tts(python_request, request.config.clone())
            .await?;

        if response.success {
            debug!("TTS synthesis successful: {}", response.audio_path);
            Ok(response.audio_path)
        } else {
            let error_msg = response.error.unwrap_or_else(|| "Unknown error".to_string());
            error!("TTS synthesis failed: {}", error_msg);
            Err(anyhow::anyhow!("TTS synthesis failed: {}", error_msg))
        }
    }
}

#[async_trait]
impl TTSInterface for TTSClient {
    async fn generate_audio(
        &self,
        text: &str,
        _file_name_no_ext: Option<&str>,
    ) -> Result<String, anyhow::Error> {
        self.synthesize(text, None, None).await
    }

    fn remove_file(&self, filepath: &str) -> Result<(), anyhow::Error> {
        use std::fs;
        if fs::metadata(filepath).is_ok() {
            fs::remove_file(filepath)?;
            debug!("Removed TTS audio file: {}", filepath);
        } else {
            debug!("TTS audio file does not exist: {}", filepath);
        }
        Ok(())
    }
}

