use async_trait::async_trait;
use futures::Stream;
use std::collections::HashMap;
use std::sync::Arc;
use tracing::info;

use super::stateless_llm_interface::StatelessLLMInterface;
use crate::python_service::PythonServiceClient;

/// OpenAI compatible LLM implementation
/// Calls Python service for actual LLM interaction
pub struct OpenAICompatibleLLM {
    model: String,
    base_url: String,
    api_key: String,
    organization_id: Option<String>,
    project_id: Option<String>,
    temperature: f32,
    python_service: Arc<PythonServiceClient>,
}

impl OpenAICompatibleLLM {
    pub fn new(
        model: String,
        base_url: String,
        api_key: String,
        organization_id: Option<String>,
        project_id: Option<String>,
        temperature: f32,
        python_service: Arc<PythonServiceClient>,
    ) -> Self {
        info!(
            "Initialized OpenAICompatibleLLM: model={}, base_url={}",
            model, base_url
        );
        Self {
            model,
            base_url,
            api_key,
            organization_id,
            project_id,
            temperature,
            python_service,
        }
    }
}

#[async_trait]
impl StatelessLLMInterface for OpenAICompatibleLLM {
    async fn chat_completion(
        &self,
        messages: Vec<HashMap<String, serde_json::Value>>,
        system: Option<&str>,
    ) -> Result<Box<dyn Stream<Item = Result<String, anyhow::Error>> + Send + Unpin>, anyhow::Error> {
        // Convert messages to Python service format
        let mut service_messages = Vec::new();
        
        // Add system message if provided
        if let Some(sys) = system {
            service_messages.push(crate::python_service::Message {
                role: "system".to_string(),
                content: sys.to_string(),
            });
        }

        // Convert other messages
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
                "temperature": self.temperature
            })),
        };

        let service = self.python_service.clone();
        
        // Return a stream that calls Python service
        // TODO: Implement proper streaming from Python service
        let response = service.chat(request).await?;
        let text = response.text;
        
        // Split into words as tokens (simplified)
        let tokens: Vec<String> = text.split_whitespace().map(|s| s.to_string()).collect();
        Ok(Box::new(futures::stream::iter(tokens.into_iter().map(Ok))))
    }
}

