use serde::{Deserialize, Serialize};

// TranslatorConfig and related types are defined in this file

/// Configuration for DeepLX translation service
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeepLXConfig {
    #[serde(rename = "deeplx_target_lang")]
    pub deeplx_target_lang: String,
    
    #[serde(rename = "deeplx_api_endpoint")]
    pub deeplx_api_endpoint: String,
}

/// Configuration for Tencent translation service
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TencentConfig {
    #[serde(rename = "secret_id")]
    pub secret_id: String,
    
    #[serde(rename = "secret_key")]
    pub secret_key: String,
    
    pub region: String,
    
    #[serde(rename = "source_lang")]
    pub source_lang: String,
    
    #[serde(rename = "target_lang")]
    pub target_lang: String,
}

/// Configuration for translation services
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TranslatorConfig {
    #[serde(rename = "translate_audio")]
    pub translate_audio: bool,
    
    #[serde(rename = "translate_provider")]
    pub translate_provider: String, // "deeplx", "tencent"
    
    pub deeplx: Option<DeepLXConfig>,
    
    pub tencent: Option<TencentConfig>,
}

/// Configuration for TTS preprocessor
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TTSPreprocessorConfig {
    #[serde(rename = "remove_special_char")]
    pub remove_special_char: bool,
    
    #[serde(rename = "ignore_brackets")]
    #[serde(default = "default_true")]
    pub ignore_brackets: bool,
    
    #[serde(rename = "ignore_parentheses")]
    #[serde(default = "default_true")]
    pub ignore_parentheses: bool,
    
    #[serde(rename = "ignore_asterisks")]
    #[serde(default = "default_true")]
    pub ignore_asterisks: bool,
    
    #[serde(rename = "ignore_angle_brackets")]
    #[serde(default = "default_true")]
    pub ignore_angle_brackets: bool,
    
    #[serde(rename = "translator_config")]
    pub translator_config: TranslatorConfig,
}

fn default_true() -> bool {
    true
}

