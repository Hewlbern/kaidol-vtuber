use async_trait::async_trait;
use futures::Stream;
use std::collections::HashMap;
use std::sync::Arc;
use tracing::info;

use super::stateless_llm_interface::StatelessLLMInterface;
use super::openai_compatible_llm::OpenAICompatibleLLM;

/// Ollama LLM implementation
/// Extends OpenAICompatibleLLM since Ollama uses OpenAI-compatible API
pub struct OllamaLLM {
    inner: OpenAICompatibleLLM,
    keep_alive: f32,
    unload_at_exit: bool,
}

impl OllamaLLM {
    pub fn new(
        model: String,
        base_url: String,
        api_key: String,
        organization_id: Option<String>,
        project_id: Option<String>,
        temperature: f32,
        keep_alive: f32,
        unload_at_exit: bool,
        python_service: Arc<crate::python_service::PythonServiceClient>,
    ) -> Self {
        info!("Initialized OllamaLLM: model={}, base_url={}", model, base_url);
        
        let inner = OpenAICompatibleLLM::new(
            model,
            base_url,
            api_key,
            organization_id,
            project_id,
            temperature,
            python_service,
        );

        Self {
            inner,
            keep_alive,
            unload_at_exit,
        }
    }
}

#[async_trait]
impl StatelessLLMInterface for OllamaLLM {
    async fn chat_completion(
        &self,
        messages: Vec<HashMap<String, serde_json::Value>>,
        system: Option<&str>,
    ) -> Result<Box<dyn Stream<Item = Result<String, anyhow::Error>> + Send + Unpin>, anyhow::Error> {
        self.inner.chat_completion(messages, system).await
    }
}

impl Drop for OllamaLLM {
    fn drop(&mut self) {
        if self.unload_at_exit {
            info!("Ollama: Unloading model (keep_alive=0)");
            // TODO: Call Python service to unload model
        }
    }
}

