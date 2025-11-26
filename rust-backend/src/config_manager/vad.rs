use serde::{Deserialize, Serialize};

/// Configuration for Silero VAD service
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SileroVADConfig {
    #[serde(rename = "orig_sr")]
    pub orig_sr: i32,
    
    #[serde(rename = "target_sr")]
    pub target_sr: i32,
    
    #[serde(rename = "prob_threshold")]
    pub prob_threshold: f32,
    
    #[serde(rename = "db_threshold")]
    pub db_threshold: i32,
    
    #[serde(rename = "required_hits")]
    pub required_hits: i32,
    
    #[serde(rename = "required_misses")]
    pub required_misses: i32,
    
    #[serde(rename = "smoothing_window")]
    pub smoothing_window: i32,
}

/// Configuration for Voice Activity Detection
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VADConfig {
    #[serde(rename = "vad_model")]
    pub vad_model: String, // "silero_vad"
    
    #[serde(rename = "silero_vad")]
    pub silero_vad: Option<SileroVADConfig>,
}

