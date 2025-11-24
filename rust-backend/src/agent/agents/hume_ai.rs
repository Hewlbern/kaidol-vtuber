// Hume AI agent - stub implementation
// Full implementation would require WebSocket client and audio handling
// For now, this is a placeholder that should call Python service

use async_trait::async_trait;
use futures::Stream;
use tracing::warn;

use super::agent_interface::AgentInterface;
use crate::agent::input_types::BatchInput;
use crate::agent::output_types::{BaseOutput, AudioOutput, DisplayText, Actions};

/// Hume AI Agent that handles text input and audio output.
/// Uses AudioOutput type to provide audio responses with transcripts.
pub struct HumeAIAgent {
    api_key: Option<String>,
    host: String,
    config_id: Option<String>,
    idle_timeout: u32,
}

impl HumeAIAgent {
    /// Initialize Hume AI agent
    ///
    /// # Arguments
    /// * `api_key` - Hume AI API key
    /// * `host` - API host
    /// * `config_id` - Optional configuration ID
    /// * `idle_timeout` - Connection idle timeout in seconds
    pub fn new(
        api_key: Option<String>,
        host: String,
        config_id: Option<String>,
        idle_timeout: u32,
    ) -> Self {
        Self {
            api_key,
            host,
            config_id,
            idle_timeout,
        }
    }
}

#[async_trait]
impl AgentInterface for HumeAIAgent {
    async fn chat(
        &mut self,
        _input_data: BatchInput,
    ) -> Box<dyn Stream<Item = Result<Box<dyn BaseOutput>, anyhow::Error>> + Send + Unpin> {
        warn!("Hume AI agent not fully implemented in Rust - use Python service");
        let error = anyhow::anyhow!("Hume AI agent not implemented");
        Box::new(futures::stream::iter(vec![Err(error)]))
    }

    fn handle_interrupt(&mut self, _heard_response: &str) {
        // Handle user interruption (not implemented for Hume AI)
    }

    fn set_memory_from_history(&mut self, _conf_uid: &str, _history_uid: &str) {
        // TODO: Set chat group ID based on history metadata
        // For now, this is a stub
    }
}

// Additional methods not part of the trait
impl HumeAIAgent {
    pub fn reset_interrupt(&mut self) {
        // Stub
    }

    pub fn start_group_conversation(&mut self, _human_name: &str, _ai_participants: &[String]) {
        // Stub
    }
}

