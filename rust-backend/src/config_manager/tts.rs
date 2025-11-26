use serde::{Deserialize, Serialize};

/// Configuration for Azure TTS service
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AzureTTSConfig {
    #[serde(rename = "api_key")]
    pub api_key: String,
    
    pub region: String,
    
    pub voice: String,
    
    pub pitch: String,
    
    pub rate: String,
}

/// Configuration for Bark TTS
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BarkTTSConfig {
    pub voice: String,
}

/// Configuration for Edge TTS
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EdgeTTSConfig {
    pub voice: String,
}

/// Configuration for Melo TTS
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MeloTTSConfig {
    pub speaker: String,
    
    pub language: String,
    
    #[serde(default = "default_device_auto")]
    pub device: String,
    
    #[serde(default = "default_speed")]
    pub speed: f32,
}

fn default_device_auto() -> String {
    "auto".to_string()
}

fn default_speed() -> f32 {
    1.0
}

/// Configuration for Text-to-Speech
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TTSConfig {
    #[serde(rename = "tts_model")]
    pub tts_model: String,
    
    #[serde(rename = "azure_tts")]
    pub azure_tts: Option<serde_json::Value>,
    
    #[serde(rename = "bark_tts")]
    pub bark_tts: Option<serde_json::Value>,
    
    #[serde(rename = "edge_tts")]
    pub edge_tts: Option<serde_json::Value>,
    
    #[serde(rename = "melo_tts")]
    pub melo_tts: Option<serde_json::Value>,
    
    // Add other TTS configs as Option<serde_json::Value> for flexibility
    // Full implementations would have specific structs for each
    #[serde(flatten)]
    pub other_configs: Option<serde_json::Value>,
}

