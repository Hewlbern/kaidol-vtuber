use serde::{Deserialize, Serialize};
use crate::config_manager::agent::AgentConfig;
use crate::config_manager::asr::ASRConfig;
use crate::config_manager::tts::TTSConfig;
use crate::config_manager::vad::VADConfig;
use crate::config_manager::tts_preprocessor::TTSPreprocessorConfig;

/// Character configuration settings
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CharacterConfig {
    #[serde(rename = "conf_name")]
    pub conf_name: String,
    
    #[serde(rename = "conf_uid")]
    pub conf_uid: String,
    
    #[serde(rename = "live2d_model_name")]
    pub live2d_model_name: String,
    
    #[serde(rename = "character_name")]
    #[serde(default)]
    pub character_name: String,
    
    #[serde(rename = "human_name")]
    #[serde(default = "default_human_name")]
    pub human_name: String,
    
    #[serde(rename = "avatar")]
    #[serde(default)]
    pub avatar: Option<String>,
    
    #[serde(rename = "persona_prompt")]
    pub persona_prompt: String,
    
    #[serde(rename = "agent_config")]
    pub agent_config: AgentConfig,
    
    #[serde(rename = "asr_config")]
    pub asr_config: ASRConfig,
    
    #[serde(rename = "tts_config")]
    pub tts_config: TTSConfig,
    
    #[serde(rename = "vad_config")]
    pub vad_config: VADConfig,
    
    #[serde(rename = "tts_preprocessor_config")]
    pub tts_preprocessor_config: TTSPreprocessorConfig,
}

fn default_human_name() -> String {
    "Human".to_string()
}

impl CharacterConfig {
    pub fn validate(&self) -> Result<(), String> {
        if self.persona_prompt.is_empty() {
            return Err("Persona_prompt cannot be empty. Please provide a persona prompt.".to_string());
        }
        
        if self.character_name.is_empty() {
            // Use conf_name as fallback
            // This is handled in deserialization
        }
        
        Ok(())
    }
}
