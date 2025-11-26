use async_trait::async_trait;
use futures::Stream;
use std::collections::HashMap;

/// Interface for a stateless language model
/// Stateless means the LLM doesn't store memory, system prompts, or user messages
#[async_trait]
pub trait StatelessLLMInterface: Send + Sync {
    /// Generate a chat completion asynchronously
    /// Returns an iterator to the response tokens
    async fn chat_completion(
        &self,
        messages: Vec<HashMap<String, serde_json::Value>>,
        system: Option<&str>,
    ) -> Result<Box<dyn Stream<Item = Result<String, anyhow::Error>> + Send + Unpin>, anyhow::Error>;
}

