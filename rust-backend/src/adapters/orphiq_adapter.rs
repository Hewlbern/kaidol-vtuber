use async_trait::async_trait;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::mpsc;

use super::base_adapter::BackendAdapter;
use crate::state::ClientContext;
use crate::python_service::PythonServiceClient;

/// Adapter for existing orphiq backend
pub struct OrphiqAdapter {
    client_context: Arc<ClientContext>,
    python_service: Arc<PythonServiceClient>,
    websocket_sender: mpsc::UnboundedSender<String>,
    current_expression: Option<i32>,
    current_motion: Option<HashMap<String, Value>>,
}

impl OrphiqAdapter {
    pub fn new(
        client_context: Arc<ClientContext>,
        python_service: Arc<PythonServiceClient>,
        websocket_sender: mpsc::UnboundedSender<String>,
    ) -> Self {
        Self {
            client_context,
            python_service,
            websocket_sender,
            current_expression: None,
            current_motion: None,
        }
    }
}

#[async_trait]
impl BackendAdapter for OrphiqAdapter {
    async fn generate_text(
        &self,
        prompt: &str,
        _context: Option<&HashMap<String, Value>>,
    ) -> Result<Vec<String>, anyhow::Error> {
        // Call Python agent service
        let request = crate::python_service::AgentRequest {
            messages: vec![crate::python_service::Message {
                role: "user".to_string(),
                content: prompt.to_string(),
            }],
            context: None,
        };

        let response = self.python_service.chat(request).await?;
        
        // Split response into chunks (simplified)
        Ok(vec![response.text])
    }

    async fn trigger_expression(
        &self,
        expression_id: i32,
        duration: Option<i32>,
        priority: i32,
    ) -> Result<HashMap<String, Value>, anyhow::Error> {
        let payload = json!({
            "type": "audio",
            "audio": null,
            "volumes": [],
            "slice_length": 20,
            "display_text": {
                "text": format!("Expression {}", expression_id),
                "name": "Character", // TODO: Get from context
            },
            "actions": {
                "expressions": [expression_id]
            },
            "forwarded": false
        });

        self.websocket_sender.send(payload.to_string())?;

        let mut result = HashMap::new();
        result.insert("status".to_string(), json!("success"));
        result.insert("expression_id".to_string(), json!(expression_id));
        if let Some(d) = duration {
            result.insert("duration".to_string(), json!(d));
        }
        result.insert("priority".to_string(), json!(priority));
        Ok(result)
    }

    async fn trigger_motion(
        &self,
        motion_group: &str,
        motion_index: i32,
        loop_motion: bool,
        priority: i32,
    ) -> Result<HashMap<String, Value>, anyhow::Error> {
        let payload = json!({
            "type": "motion-command",
            "motion_group": motion_group,
            "motion_index": motion_index,
            "loop": loop_motion,
            "priority": priority
        });

        self.websocket_sender.send(payload.to_string())?;

        let mut result = HashMap::new();
        result.insert("status".to_string(), json!("success"));
        result.insert("motion_group".to_string(), json!(motion_group));
        result.insert("motion_index".to_string(), json!(motion_index));
        result.insert("loop".to_string(), json!(loop_motion));
        result.insert("priority".to_string(), json!(priority));
        Ok(result)
    }

    async fn get_character_state(&self) -> Result<HashMap<String, Value>, anyhow::Error> {
        let mut result = HashMap::new();
        result.insert("character_name".to_string(), json!("Character")); // TODO: Get from context
        result.insert("model_name".to_string(), json!("")); // TODO: Get from context
        result.insert("current_expression".to_string(), json!(self.current_expression));
        result.insert("current_motion".to_string(), json!(self.current_motion));
        result.insert("conf_uid".to_string(), json!(self.client_context.conf_uid));
        Ok(result)
    }
}

