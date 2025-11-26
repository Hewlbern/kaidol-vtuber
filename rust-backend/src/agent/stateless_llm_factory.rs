use std::sync::Arc;
use tracing::info;
use anyhow::Result;

use crate::agent::stateless_llm::StatelessLLMInterface;
use crate::agent::stateless_llm::openai_compatible_llm::OpenAICompatibleLLM;
use crate::agent::stateless_llm::ollama_llm::OllamaLLM;
use crate::agent::stateless_llm::claude_llm::ClaudeLLM;
use crate::agent::stateless_llm::llama_cpp_llm::LlamaCppLLM;
use crate::python_service::PythonServiceClient;

/// Factory for creating stateless LLM instances
pub struct StatelessLLMFactory;

impl StatelessLLMFactory {
    /// Create an LLM based on the configuration.
    ///
    /// # Arguments
    /// * `llm_provider` - The type of LLM to create
    /// * `python_service` - Python service client
    /// * `system_prompt` - Optional system prompt
    /// * `config` - LLM configuration dictionary
    pub fn create_llm(
        llm_provider: &str,
        python_service: Arc<PythonServiceClient>,
        system_prompt: Option<&str>,
        config: &serde_json::Value,
    ) -> Result<Arc<dyn StatelessLLMInterface>> {
        info!("Initializing LLM: {}", llm_provider);

        match llm_provider {
            "openai_compatible_llm" | "openai_llm" | "gemini_llm" | "zhipu_llm" 
            | "deepseek_llm" | "groq_llm" | "mistral_llm" => {
                Ok(Arc::new(OpenAICompatibleLLM::new(
                    config.get("model").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                    config.get("base_url").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                    config.get("llm_api_key").and_then(|v| v.as_str()).unwrap_or("z").to_string(),
                    config.get("organization_id").and_then(|v| v.as_str()).map(|s| s.to_string()),
                    config.get("project_id").and_then(|v| v.as_str()).map(|s| s.to_string()),
                    config.get("temperature").and_then(|v| v.as_f64()).unwrap_or(1.0) as f32,
                    python_service,
                )))
            }
            "ollama_llm" => {
                Ok(Arc::new(OllamaLLM::new(
                    config.get("model").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                    config.get("base_url").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                    config.get("llm_api_key").and_then(|v| v.as_str()).unwrap_or("z").to_string(),
                    config.get("organization_id").and_then(|v| v.as_str()).map(|s| s.to_string()),
                    config.get("project_id").and_then(|v| v.as_str()).map(|s| s.to_string()),
                    config.get("temperature").and_then(|v| v.as_f64()).unwrap_or(1.0) as f32,
                    config.get("keep_alive").and_then(|v| v.as_f64()).unwrap_or(-1.0) as f32,
                    config.get("unload_at_exit").and_then(|v| v.as_bool()).unwrap_or(true),
                    python_service,
                )))
            }
            "claude_llm" => {
                Ok(Arc::new(ClaudeLLM::new(
                    system_prompt.unwrap_or("").to_string(),
                    config.get("base_url").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                    config.get("model").and_then(|v| v.as_str()).unwrap_or("claude-3-haiku-20240307").to_string(),
                    config.get("llm_api_key").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                    python_service,
                )))
            }
            "llama_cpp_llm" => {
                Ok(Arc::new(LlamaCppLLM::new(
                    config.get("model_path").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                )))
            }
            _ => Err(anyhow::anyhow!("Unsupported LLM provider: {}", llm_provider)),
        }
    }
}

