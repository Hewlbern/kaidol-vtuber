use serde::{Deserialize, Serialize};

/// Configuration for Azure ASR service
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AzureASRConfig {
    #[serde(rename = "api_key")]
    pub api_key: String,
    
    pub region: String,
    
    #[serde(default = "default_languages")]
    pub languages: Vec<String>,
}

fn default_languages() -> Vec<String> {
    vec!["en-US".to_string(), "zh-CN".to_string()]
}

/// Configuration for Faster Whisper ASR
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FasterWhisperConfig {
    #[serde(rename = "model_path")]
    pub model_path: String,
    
    #[serde(rename = "download_root")]
    pub download_root: String,
    
    pub language: Option<String>,
    
    #[serde(default = "default_device_auto")]
    pub device: String, // "auto", "cpu", "cuda"
}

fn default_device_auto() -> String {
    "auto".to_string()
}

/// Configuration for WhisperCPP ASR
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WhisperCPPConfig {
    #[serde(rename = "model_name")]
    pub model_name: String,
    
    #[serde(rename = "model_dir")]
    pub model_dir: String,
    
    #[serde(rename = "print_realtime")]
    #[serde(default)]
    pub print_realtime: bool,
    
    #[serde(rename = "print_progress")]
    #[serde(default)]
    pub print_progress: bool,
    
    #[serde(default = "default_language_auto")]
    pub language: String, // "auto", "en", "zh"
}

fn default_language_auto() -> String {
    "auto".to_string()
}

/// Configuration for OpenAI Whisper ASR
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WhisperConfig {
    pub name: String,
    
    #[serde(rename = "download_root")]
    pub download_root: String,
    
    #[serde(default = "default_device_cpu")]
    pub device: String, // "cpu", "cuda"
}

fn default_device_cpu() -> String {
    "cpu".to_string()
}

/// Configuration for FunASR
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FunASRConfig {
    #[serde(rename = "model_name")]
    #[serde(default = "default_funasr_model")]
    pub model_name: String,
    
    #[serde(rename = "vad_model")]
    #[serde(default = "default_vad_model")]
    pub vad_model: String,
    
    #[serde(rename = "punc_model")]
    #[serde(default = "default_punc_model")]
    pub punc_model: String,
    
    #[serde(default = "default_device_cpu")]
    pub device: String,
    
    #[serde(rename = "disable_update")]
    #[serde(default = "default_true")]
    pub disable_update: bool,
    
    #[serde(default = "default_ncpu")]
    pub ncpu: i32,
    
    #[serde(default = "default_hub")]
    pub hub: String, // "ms", "hf"
    
    #[serde(rename = "use_itn")]
    #[serde(default)]
    pub use_itn: bool,
    
    #[serde(default = "default_language_auto")]
    pub language: String,
}

fn default_funasr_model() -> String {
    "iic/SenseVoiceSmall".to_string()
}

fn default_vad_model() -> String {
    "fsmn-vad".to_string()
}

fn default_punc_model() -> String {
    "ct-punc".to_string()
}

fn default_ncpu() -> i32 {
    4
}

fn default_hub() -> String {
    "ms".to_string()
}

fn default_true() -> bool {
    true
}

/// Configuration for Groq Whisper ASR
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GroqWhisperASRConfig {
    #[serde(rename = "api_key")]
    pub api_key: String,
    
    #[serde(default = "default_groq_model")]
    pub model: String,
    
    pub lang: Option<String>,
}

fn default_groq_model() -> String {
    "whisper-large-v3-turbo".to_string()
}

/// Configuration for Sherpa Onnx ASR
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SherpaOnnxASRConfig {
    #[serde(rename = "model_type")]
    pub model_type: String,
    
    pub encoder: Option<String>,
    pub decoder: Option<String>,
    pub joiner: Option<String>,
    pub paraformer: Option<String>,
    #[serde(rename = "nemo_ctc")]
    pub nemo_ctc: Option<String>,
    #[serde(rename = "wenet_ctc")]
    pub wenet_ctc: Option<String>,
    #[serde(rename = "tdnn_model")]
    pub tdnn_model: Option<String>,
    #[serde(rename = "whisper_encoder")]
    pub whisper_encoder: Option<String>,
    #[serde(rename = "whisper_decoder")]
    pub whisper_decoder: Option<String>,
    #[serde(rename = "sense_voice")]
    pub sense_voice: Option<String>,
    
    pub tokens: String,
    
    #[serde(rename = "num_threads")]
    #[serde(default = "default_num_threads")]
    pub num_threads: i32,
    
    #[serde(rename = "use_itn")]
    #[serde(default = "default_true")]
    pub use_itn: bool,
    
    #[serde(default = "default_provider_cpu")]
    pub provider: String, // "cpu", "cuda"
}

fn default_num_threads() -> i32 {
    4
}

fn default_provider_cpu() -> String {
    "cpu".to_string()
}

/// Configuration for Automatic Speech Recognition
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ASRConfig {
    #[serde(rename = "asr_model")]
    pub asr_model: String,
    
    #[serde(rename = "azure_asr")]
    pub azure_asr: Option<AzureASRConfig>,
    
    #[serde(rename = "faster_whisper")]
    pub faster_whisper: Option<FasterWhisperConfig>,
    
    #[serde(rename = "whisper_cpp")]
    pub whisper_cpp: Option<WhisperCPPConfig>,
    
    pub whisper: Option<WhisperConfig>,
    
    #[serde(rename = "fun_asr")]
    pub fun_asr: Option<FunASRConfig>,
    
    #[serde(rename = "groq_whisper_asr")]
    pub groq_whisper_asr: Option<GroqWhisperASRConfig>,
    
    #[serde(rename = "sherpa_onnx_asr")]
    pub sherpa_onnx_asr: Option<SherpaOnnxASRConfig>,
}

