// Llama.cpp LLM - stub implementation
// Full implementation would require llama.cpp bindings

use async_trait::async_trait;
use futures::Stream;
use std::collections::HashMap;
use tracing::warn;

use super::stateless_llm_interface::StatelessLLMInterface;

pub struct LlamaCppLLM {
    model_path: String,
}

impl LlamaCppLLM {
    pub fn new(model_path: String) -> Self {
        Self { model_path }
    }
}

#[async_trait]
impl StatelessLLMInterface for LlamaCppLLM {
    async fn chat_completion(
        &self,
        _messages: Vec<HashMap<String, serde_json::Value>>,
        _system: Option<&str>,
    ) -> Result<Box<dyn Stream<Item = Result<String, anyhow::Error>> + Send + Unpin>, anyhow::Error> {
        warn!("Llama.cpp LLM not fully implemented in Rust - use Python service");
        Err(anyhow::anyhow!("Llama.cpp LLM not implemented"))
    }
}

