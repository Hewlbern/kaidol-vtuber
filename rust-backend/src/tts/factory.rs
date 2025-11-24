use std::sync::Arc;
use anyhow::Result;
use tracing::info;
use crate::python_service::PythonServiceClient;
use crate::config_manager::tts::TTSConfig;
use super::client::TTSClient;
use super::interface::TTSInterface;

/// Factory for creating TTS engines/clients
pub struct TTSFactory;

impl TTSFactory {
    /// Create a TTS client based on configuration
    /// 
    /// # Arguments
    /// * `tts_config` - TTS configuration from config manager
    /// * `python_service` - Python service client for making HTTP requests
    /// 
    /// # Returns
    /// Boxed TTSInterface implementation
    pub fn create_tts(
        tts_config: &TTSConfig,
        python_service: Arc<PythonServiceClient>,
    ) -> Result<Arc<dyn TTSInterface>> {
        info!("Initializing TTS engine: {}", tts_config.tts_model);

        // Extract default voice and language from config based on TTS model type
        let (default_voice, default_language, config_json) = 
            Self::extract_config_from_tts_config(tts_config)?;

        let client = TTSClient::new(
            python_service,
            default_voice,
            default_language,
            config_json,
        );

        Ok(Arc::new(client))
    }

    /// Extract configuration values from TTSConfig
    fn extract_config_from_tts_config(
        tts_config: &TTSConfig,
    ) -> Result<(Option<String>, Option<String>, Option<serde_json::Value>)> {
        // Convert TTSConfig to JSON for passing to Python service
        let config_json = serde_json::to_value(tts_config)?;

        // Extract voice and language based on TTS model type
        // Since TTSConfig uses serde_json::Value for flexibility, we extract from the JSON
        let (voice, language) = match tts_config.tts_model.as_str() {
            "azure_tts" => {
                if let Some(azure_config) = &tts_config.azure_tts {
                    if let Some(voice_val) = azure_config.get("voice") {
                        let voice_str = voice_val.as_str().map(|v| v.to_string());
                        (voice_str, None)
                    } else {
                        (None, None)
                    }
                } else {
                    (None, None)
                }
            }
            "edge_tts" => {
                if let Some(edge_config) = &tts_config.edge_tts {
                    if let Some(voice_val) = edge_config.get("voice") {
                        let voice_str = voice_val.as_str().map(|v| v.to_string());
                        (voice_str, None)
                    } else {
                        (None, None)
                    }
                } else {
                    (None, None)
                }
            }
            "melo_tts" => {
                if let Some(melo_config) = &tts_config.melo_tts {
                    let voice = melo_config.get("speaker").and_then(|v| v.as_str());
                    let lang = melo_config.get("language").and_then(|v| v.as_str());
                    (
                        voice.map(|v| v.to_string()),
                        lang.map(|l| l.to_string()),
                    )
                } else {
                    (None, None)
                }
            }
            _ => {
                // For other TTS models, try to extract from config JSON
                let voice = config_json
                    .get("voice")
                    .or_else(|| config_json.get("speaker"))
                    .and_then(|v| v.as_str())
                    .map(|v| v.to_string());
                let language = config_json
                    .get("language")
                    .and_then(|v| v.as_str())
                    .map(|l| l.to_string());
                (voice, language)
            }
        };

        Ok((voice, language, Some(config_json)))
    }
}

