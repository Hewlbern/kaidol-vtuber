use serde::{Deserialize, Serialize};

/// Base configuration for StatelessLLM
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StatelessLLMBaseConfig {
    #[serde(rename = "interrupt_method")]
    #[serde(default = "default_interrupt_method")]
    pub interrupt_method: String, // "system" or "user"
}

fn default_interrupt_method() -> String {
    "user".to_string()
}

/// Configuration for OpenAI-compatible LLM providers
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpenAICompatibleConfig {
    #[serde(flatten)]
    pub base: StatelessLLMBaseConfig,
    
    #[serde(rename = "base_url")]
    pub base_url: String,
    
    #[serde(rename = "llm_api_key")]
    pub llm_api_key: String,
    
    pub model: String,
    
    #[serde(rename = "organization_id")]
    pub organization_id: Option<String>,
    
    #[serde(rename = "project_id")]
    pub project_id: Option<String>,
    
    #[serde(default = "default_temperature")]
    pub temperature: f32,
}

fn default_temperature() -> f32 {
    1.0
}

/// Configuration for Ollama API
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OllamaConfig {
    #[serde(flatten)]
    pub openai_compatible: OpenAICompatibleConfig,
    
    #[serde(rename = "keep_alive")]
    #[serde(default = "default_keep_alive")]
    pub keep_alive: f32,
    
    #[serde(rename = "unload_at_exit")]
    #[serde(default = "default_true")]
    pub unload_at_exit: bool,
}

fn default_keep_alive() -> f32 {
    -1.0
}

fn default_true() -> bool {
    true
}

/// Configuration for Official OpenAI API
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpenAIConfig {
    #[serde(flatten)]
    pub openai_compatible: OpenAICompatibleConfig,
}

/// Configuration for Gemini API
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GeminiConfig {
    #[serde(flatten)]
    pub openai_compatible: OpenAICompatibleConfig,
}

/// Configuration for Mistral API
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MistralConfig {
    #[serde(flatten)]
    pub openai_compatible: OpenAICompatibleConfig,
}

/// Configuration for Zhipu API
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ZhipuConfig {
    #[serde(flatten)]
    pub openai_compatible: OpenAICompatibleConfig,
}

/// Configuration for Deepseek API
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeepseekConfig {
    #[serde(flatten)]
    pub openai_compatible: OpenAICompatibleConfig,
}

/// Configuration for Groq API
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GroqConfig {
    #[serde(flatten)]
    pub openai_compatible: OpenAICompatibleConfig,
}

/// Configuration for Claude API
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClaudeConfig {
    #[serde(flatten)]
    pub base: StatelessLLMBaseConfig,
    
    #[serde(rename = "base_url")]
    pub base_url: String,
    
    #[serde(rename = "llm_api_key")]
    pub llm_api_key: String,
    
    pub model: String,
}

/// Configuration for LlamaCpp
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LlamaCppConfig {
    #[serde(flatten)]
    pub base: StatelessLLMBaseConfig,
    
    #[serde(rename = "model_path")]
    pub model_path: String,
}

/// Pool of LLM provider configurations
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StatelessLLMConfigs {
    #[serde(rename = "openai_compatible_llm")]
    pub openai_compatible_llm: Option<serde_json::Value>,
    
    #[serde(rename = "ollama_llm")]
    pub ollama_llm: Option<serde_json::Value>,
    
    #[serde(rename = "openai_llm")]
    pub openai_llm: Option<serde_json::Value>,
    
    #[serde(rename = "gemini_llm")]
    pub gemini_llm: Option<serde_json::Value>,
    
    #[serde(rename = "zhipu_llm")]
    pub zhipu_llm: Option<serde_json::Value>,
    
    #[serde(rename = "deepseek_llm")]
    pub deepseek_llm: Option<serde_json::Value>,
    
    #[serde(rename = "groq_llm")]
    pub groq_llm: Option<serde_json::Value>,
    
    #[serde(rename = "claude_llm")]
    pub claude_llm: Option<serde_json::Value>,
    
    #[serde(rename = "llama_cpp_llm")]
    pub llama_cpp_llm: Option<serde_json::Value>,
    
    #[serde(rename = "mistral_llm")]
    pub mistral_llm: Option<serde_json::Value>,
}

