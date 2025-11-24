use async_trait::async_trait;
use futures::Stream;
use std::collections::HashMap;
use std::sync::Arc;
use tracing::info;

use super::stateless_llm_interface::StatelessLLMInterface;
use crate::python_service::PythonServiceClient;

/// Claude LLM implementation
pub struct ClaudeLLM {
    model: String,
    base_url: String,
    api_key: String,
    system: String,
    python_service: Arc<PythonServiceClient>,
}

impl ClaudeLLM {
    pub fn new(
        system: String,
        base_url: String,
        model: String,
        api_key: String,
        python_service: Arc<PythonServiceClient>,
    ) -> Self {
        info!("Initialized ClaudeLLM: model={}, base_url={}", model, base_url);
        Self {
            model,
            base_url,
            api_key,
            system,
            python_service,
        }
    }
}

#[async_trait]
impl StatelessLLMInterface for ClaudeLLM {
    async fn chat_completion(
        &self,
        messages: Vec<HashMap<String, serde_json::Value>>,
        _system: Option<&str>,
    ) -> Result<Box<dyn Stream<Item = Result<String, anyhow::Error>> + Send + Unpin>, anyhow::Error> {
        // Claude uses system prompt from constructor
        let mut service_messages = vec![crate::python_service::Message {
            role: "system".to_string(),
            content: self.system.clone(),
        }];

        for msg in messages {
            if let (Some(role), Some(content)) = (msg.get("role"), msg.get("content")) {
                let role_str = role.as_str().unwrap_or("user");
                let content_str = if content.is_string() {
                    content.as_str().unwrap().to_string()
                } else {
                    serde_json::to_string(content).unwrap_or_default()
                };
                service_messages.push(crate::python_service::Message {
                    role: role_str.to_string(),
                    content: content_str,
                });
            }
        }

        let request = crate::python_service::AgentRequest {
            messages: service_messages,
            context: Some(serde_json::json!({
                "model": self.model,
                "base_url": self.base_url,
                "provider": "claude"
            })),
        };

        let service = self.python_service.clone();
        let response = service.chat(request).await?;
        let text = response.text;
        
        // Split into words as tokens (simplified)
        let tokens: Vec<String> = text.split_whitespace().map(|s| s.to_string()).collect();
        Ok(Box::new(futures::stream::iter(tokens.into_iter().map(Ok))))
    }
}

