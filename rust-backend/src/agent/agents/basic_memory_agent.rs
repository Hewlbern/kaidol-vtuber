use async_trait::async_trait;
use futures::Stream;
use std::collections::HashMap;
use tracing::{info, debug};

use super::agent_interface::AgentInterface;
use crate::agent::input_types::{BatchInput, TextSource, ImageSource};
use crate::agent::output_types::{BaseOutput, SentenceOutput, DisplayText, Actions};
use crate::agent::stateless_llm::StatelessLLMInterface;
use crate::python_service::PythonServiceClient;
use crate::chat_history;
use std::sync::Arc;

/// Agent with basic chat memory using a list to store messages.
/// Implements text-based responses with sentence processing pipeline.
pub struct BasicMemoryAgent {
    memory: Vec<HashMap<String, serde_json::Value>>,
    llm: Arc<dyn StatelessLLMInterface>,
    system: String,
    python_service: Arc<PythonServiceClient>,
    interrupt_handled: bool,
    interrupt_method: String, // "system" or "user"
    faster_first_response: bool,
    segment_method: String,
}

impl BasicMemoryAgent {
    /// Initialize the agent with LLM, system prompt and configuration
    ///
    /// # Arguments
    /// * `llm` - The LLM to use
    /// * `system` - System prompt
    /// * `python_service` - Python service client
    /// * `faster_first_response` - Whether to enable faster first response
    /// * `segment_method` - Method for sentence segmentation ("regex" or "pysbd")
    /// * `interrupt_method` - Methods for writing interruptions signal in chat history ("system" or "user")
    pub fn new(
        llm: Arc<dyn StatelessLLMInterface>,
        system: String,
        python_service: Arc<PythonServiceClient>,
        faster_first_response: bool,
        segment_method: String,
        interrupt_method: String,
    ) -> Self {
        let mut agent = Self {
            memory: Vec::new(),
            llm,
            system: String::new(),
            python_service,
            interrupt_handled: false,
            interrupt_method,
            faster_first_response,
            segment_method,
        };

        agent.set_system(system);
        info!("BasicMemoryAgent initialized.");
        agent
    }

    /// Set the system prompt
    pub fn set_system(&mut self, system: String) {
        debug!("Memory Agent: Setting system prompt: '''{}'''", system);

        let system_prompt = if self.interrupt_method == "user" {
            format!("{}\n\nIf you received `[interrupted by user]` signal, you were interrupted.", system)
        } else {
            system
        };

        self.system = system_prompt;
    }

    /// Add a message to the memory
    ///
    /// # Arguments
    /// * `message` - Message content (string or list of content items)
    /// * `role` - Message role
    /// * `display_text` - Optional display information containing name and avatar
    fn add_message(
        &mut self,
        message: serde_json::Value,
        role: &str,
        display_text: Option<&DisplayText>,
    ) {
        let text_content = if let Some(arr) = message.as_array() {
            // Extract text from content array
            let mut text = String::new();
            for item in arr {
                if let Some(obj) = item.as_object() {
                    if obj.get("type").and_then(|v| v.as_str()) == Some("text") {
                        if let Some(txt) = obj.get("text").and_then(|v| v.as_str()) {
                            text.push_str(txt);
                        }
                    }
                }
            }
            serde_json::json!(text)
        } else {
            message
        };

        let mut message_data = HashMap::new();
        message_data.insert("role".to_string(), serde_json::json!(role));
        message_data.insert("content".to_string(), text_content);

        // Add display information if provided
        if let Some(display) = display_text {
            if let Some(name) = &display.name {
                message_data.insert("name".to_string(), serde_json::json!(name));
            }
            if let Some(avatar) = &display.avatar {
                message_data.insert("avatar".to_string(), serde_json::json!(avatar));
            }
        }

        self.memory.push(message_data);
    }

    fn to_text_prompt(&self, input_data: &BatchInput) -> String {
        let mut message_parts = Vec::new();

        // Process text inputs
        for text_data in &input_data.texts {
            match text_data.source {
                TextSource::Input => {
                    message_parts.push(text_data.content.clone());
                }
                TextSource::Clipboard => {
                    message_parts.push(format!("[Clipboard content: {}]", text_data.content));
                }
            }
        }

        // Process images
        if let Some(images) = &input_data.images {
            message_parts.push("\nImages in this message:".to_string());
            for (i, img_data) in images.iter().enumerate() {
                let source_desc = match img_data.source {
                    ImageSource::Camera => "captured from camera",
                    ImageSource::Screen => "screenshot",
                    ImageSource::Clipboard => "from clipboard",
                    ImageSource::Upload => "uploaded",
                };
                message_parts.push(format!("- Image {} ({})", i + 1, source_desc));
            }
        }

        message_parts.join("\n")
    }

    /// Prepare messages list with image support
    fn to_messages(&mut self, input_data: &BatchInput) -> Vec<HashMap<String, serde_json::Value>> {
        let mut messages = self.memory.clone();

        let user_message = if let Some(images) = &input_data.images {
            // Multi-modal message with images
            let mut content = Vec::new();
            let text_content = self.to_text_prompt(input_data);
            content.push(serde_json::json!({
                "type": "text",
                "text": text_content
            }));

            for img_data in images {
                content.push(serde_json::json!({
                    "type": "image_url",
                    "image_url": {
                        "url": img_data.data,
                        "detail": "auto"
                    }
                }));
            }

            let mut msg = HashMap::new();
            msg.insert("role".to_string(), serde_json::json!("user"));
            msg.insert("content".to_string(), serde_json::json!(content));
            msg
        } else {
            let mut msg = HashMap::new();
            msg.insert("role".to_string(), serde_json::json!("user"));
            msg.insert("content".to_string(), serde_json::json!(self.to_text_prompt(input_data)));
            msg
        };

        messages.push(user_message.clone());
        
        // Add to memory
        self.add_message(
            user_message.get("content").unwrap().clone(),
            "user",
            None,
        );

        messages
    }
}

#[async_trait]
impl AgentInterface for BasicMemoryAgent {
    async fn chat(
        &mut self,
        input_data: BatchInput,
    ) -> Box<dyn Stream<Item = Result<Box<dyn BaseOutput>, anyhow::Error>> + Send + Unpin> {
        let messages = self.to_messages(&input_data);
        let system = Some(self.system.as_str());

        // Call LLM through stateless LLM interface
        let token_stream = match self.llm.chat_completion(messages, system).await {
            Ok(stream) => stream,
            Err(e) => {
                let error = anyhow::anyhow!("LLM error: {}", e);
                return Box::new(futures::stream::iter(vec![Err(error)]));
            }
        };

        // Collect tokens into complete response
        // TODO: Implement proper sentence-by-sentence streaming with transformers
        // For now, collect all tokens and create a single sentence output
        let mut complete_response = String::new();
        let token_stream = token_stream;
        
        use futures::StreamExt;
        let tokens: Vec<Result<String, anyhow::Error>> = token_stream.collect().await;
        
        for token_result in tokens {
            match token_result {
                Ok(token) => complete_response.push_str(&token),
                Err(e) => {
                    let error = anyhow::anyhow!("Token stream error: {}", e);
                    return Box::new(futures::stream::iter(vec![Err(error)]));
                }
            }
        }

        // Store complete response in memory
        self.add_message(serde_json::json!(complete_response.clone()), "assistant", None);

        // Create sentence output
        // TODO: Apply transformers (sentence_divider, actions_extractor, display_processor, tts_filter)
        let output = SentenceOutput {
            display_text: DisplayText::new(complete_response.clone()),
            tts_text: complete_response.clone(),
            actions: Actions::new(),
        };

        Box::new(futures::stream::iter(vec![Ok(Box::new(output) as Box<dyn BaseOutput>)]))
    }

    /// Handle an interruption by the user.
    ///
    /// # Arguments
    /// * `heard_response` - The part of the AI response heard by the user before interruption
    fn handle_interrupt(&mut self, heard_response: &str) {
        if self.interrupt_handled {
            return;
        }

        self.interrupt_handled = true;

        // Update last assistant message if exists
        if let Some(last_msg) = self.memory.last_mut() {
            if last_msg.get("role").and_then(|v| v.as_str()) == Some("assistant") {
                if let Some(content) = last_msg.get_mut("content") {
                    *content = serde_json::json!(format!("{}...", heard_response));
                }
            } else {
                // Add assistant message with heard response
                if !heard_response.is_empty() {
                    self.add_message(
                        serde_json::json!(format!("{}...", heard_response)),
                        "assistant",
                        None,
                    );
                }
            }
        }

        // Add interrupt signal
        let interrupt_role = if self.interrupt_method == "system" {
            "system"
        } else {
            "user"
        };
        self.add_message(
            serde_json::json!("[Interrupted by user]"),
            interrupt_role,
            None,
        );
    }

    /// Load the memory from chat history
    fn set_memory_from_history(&mut self, conf_uid: &str, history_uid: &str) {
        // Load history from file system
        match chat_history::get_history(conf_uid, history_uid) {
            Ok(messages) => {
                self.memory.clear();
                
                // Add system message
                self.add_message(
                    serde_json::json!(self.system.clone()),
                    "system",
                    None,
                );

                // Add history messages
                for msg in messages {
                    let role = if msg.role == "human" {
                        "user"
                    } else {
                        "assistant"
                    };
                    self.add_message(
                        serde_json::json!(msg.content),
                        role,
                        None,
                    );
                }
            }
            Err(e) => {
                tracing::warn!("Failed to load history: {}", e);
                // Fallback: just reset memory with system prompt
                self.memory.clear();
                self.add_message(
                    serde_json::json!(self.system.clone()),
                    "system",
                    None,
                );
            }
        }
    }
}

// Additional methods not part of the trait
impl BasicMemoryAgent {
    /// Reset the interrupt handled flag for a new conversation.
    pub fn reset_interrupt(&mut self) {
        self.interrupt_handled = false;
    }

    /// Start a group conversation by adding a system message that informs the AI about
    /// the conversation participants.
    ///
    /// # Arguments
    /// * `human_name` - Name of the human participant
    /// * `ai_participants` - Names of other AI participants in the conversation
    pub fn start_group_conversation(&mut self, human_name: &str, ai_participants: &[String]) {
        let other_ais = ai_participants.join(", ");
        
        // TODO: Load group conversation prompt from prompts system
        let group_context = format!(
            "You are in a group conversation with {} and other AIs: {}",
            human_name, other_ais
        );
        
        self.add_message(serde_json::json!(group_context), "user", None);
        debug!("Added group conversation context: '''{}'''", group_context);
    }
}

