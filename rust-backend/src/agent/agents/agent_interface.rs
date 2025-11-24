use async_trait::async_trait;
use futures::Stream;
use tracing::warn;

use crate::agent::input_types::BatchInput;
use crate::agent::output_types::BaseOutput;

/// Base interface for all agent implementations
#[async_trait]
pub trait AgentInterface: Send + Sync {
    /// Chat with the agent asynchronously.
    ///
    /// This function should be implemented by the agent.
    /// Output type depends on the agent's output_type:
    /// - SentenceOutput: For text-based responses with display and TTS text
    /// - AudioOutput: For direct audio output with display text and transcript
    ///
    /// # Arguments
    /// * `input_data` - User input data
    ///
    /// # Returns
    /// Stream of agent outputs (SentenceOutput or AudioOutput)
    async fn chat(
        &mut self,
        _input_data: BatchInput,
    ) -> Box<dyn Stream<Item = Result<Box<dyn BaseOutput>, anyhow::Error>> + Send + Unpin> {
        warn!("Agent: No chat function set.");
        Box::new(futures::stream::iter(vec![Err(anyhow::anyhow!("Agent: No chat function set."))]))
    }

    /// Handle user interruption. This function will be called when the agent is interrupted.
    ///
    /// # Arguments
    /// * `heard_response` - The part of response heard before interruption
    fn handle_interrupt(&mut self, _heard_response: &str) {
        warn!(
            "Agent: No interrupt handler set. The agent may not handle interruptions \
            correctly. The AI may not be able to understand that it was interrupted."
        );
    }

    /// Load the agent's working memory from chat history
    ///
    /// # Arguments
    /// * `conf_uid` - Configuration ID
    /// * `history_uid` - History ID
    fn set_memory_from_history(&mut self, _conf_uid: &str, _history_uid: &str) {
        // Default implementation does nothing
    }
}

