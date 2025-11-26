// Mem0 agent - stub implementation
// Full implementation would require Mem0 library integration
// For now, this is a placeholder that should call Python service

use async_trait::async_trait;
use futures::Stream;
use tracing::warn;

use super::agent_interface::AgentInterface;
use crate::agent::input_types::BatchInput;
use crate::agent::output_types::{BaseOutput, SentenceOutput};

pub struct Mem0LLM {
    user_id: String,
    system: String,
}

impl Mem0LLM {
    pub fn new(user_id: String, system: String) -> Self {
        Self { user_id, system }
    }
}

#[async_trait]
impl AgentInterface for Mem0LLM {
    async fn chat(
        &mut self,
        _input_data: BatchInput,
    ) -> Box<dyn Stream<Item = Result<Box<dyn BaseOutput>, anyhow::Error>> + Send + Unpin> {
        warn!("Mem0 agent not fully implemented in Rust - use Python service");
        let error = anyhow::anyhow!("Mem0 agent not implemented");
        Box::new(futures::stream::iter(vec![Err(error)]))
    }

    fn handle_interrupt(&mut self, _heard_response: &str) {
        // Stub
    }

    fn set_memory_from_history(&mut self, _conf_uid: &str, _history_uid: &str) {
        // TODO: Load memory from Mem0 vector store
        // For now, this is a stub
    }
}

// Additional methods not part of the trait
impl Mem0LLM {
    pub fn reset_interrupt(&mut self) {
        // Stub
    }

    pub fn start_group_conversation(&mut self, _human_name: &str, _ai_participants: &[String]) {
        // Stub
    }
}

