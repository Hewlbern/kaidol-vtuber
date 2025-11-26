use std::sync::Arc;
use tracing::info;
use anyhow::Result;

use crate::agent::agents::AgentInterface;
use crate::agent::agents::basic_memory_agent::BasicMemoryAgent;
use crate::agent::agents::hume_ai::HumeAIAgent;
use crate::agent::agents::mem0_llm::Mem0LLM;
use crate::agent::stateless_llm_factory::StatelessLLMFactory;
use crate::python_service::PythonServiceClient;

/// Factory for creating agent instances
pub struct AgentFactory;

impl AgentFactory {
    /// Create an agent based on the configuration.
    ///
    /// # Arguments
    /// * `conversation_agent_choice` - The type of agent to create
    /// * `agent_settings` - Settings for different types of agents
    /// * `llm_configs` - Pool of LLM configurations
    /// * `system_prompt` - The system prompt to use
    /// * `python_service` - Python service client for ML operations
    /// * `live2d_model` - Optional Live2D model instance for expression extraction
    /// * `tts_preprocessor_config` - Optional configuration for TTS preprocessing
    pub fn create_agent(
        conversation_agent_choice: &str,
        agent_settings: &serde_json::Value,
        llm_configs: &serde_json::Value,
        system_prompt: &str,
        python_service: Arc<PythonServiceClient>,
        _live2d_model: Option<Arc<dyn std::any::Any + Send + Sync>>, // TODO: Proper Live2D model type
        _tts_preprocessor_config: Option<serde_json::Value>, // TODO: Proper TTS preprocessor config type
    ) -> Result<Box<dyn AgentInterface>> {
        info!("Initializing agent: {}", conversation_agent_choice);

        match conversation_agent_choice {
            "basic_memory_agent" => {
                // Get the LLM provider choice from agent settings
                let basic_settings = agent_settings
                    .get("basic_memory_agent")
                    .ok_or_else(|| anyhow::anyhow!("basic_memory_agent settings not found"))?;
                
                let llm_provider = basic_settings
                    .get("llm_provider")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow::anyhow!("LLM provider not specified for basic memory agent"))?;

                // Get the LLM config for this provider
                let mut llm_config = llm_configs
                    .get(llm_provider)
                    .ok_or_else(|| anyhow::anyhow!("Configuration not found for LLM provider: {}", llm_provider))?
                    .clone();

                // Extract interrupt_method from config (removes it from config)
                let interrupt_method = llm_config
                    .get("interrupt_method")
                    .and_then(|v| v.as_str())
                    .unwrap_or("user")
                    .to_string();

                // Create the stateless LLM
                let llm = StatelessLLMFactory::create_llm(
                    llm_provider,
                    python_service.clone(),
                    Some(system_prompt),
                    &llm_config,
                )?;

                // Create the agent with the LLM
                let faster_first_response = basic_settings
                    .get("faster_first_response")
                    .and_then(|v| v.as_bool())
                    .unwrap_or(true);
                
                let segment_method = basic_settings
                    .get("segment_method")
                    .and_then(|v| v.as_str())
                    .unwrap_or("pysbd")
                    .to_string();

                let agent = BasicMemoryAgent::new(
                    llm,
                    system_prompt.to_string(),
                    python_service,
                    faster_first_response,
                    segment_method,
                    interrupt_method,
                );

                Ok(Box::new(agent))
            }
            "mem0_agent" => {
                let mem0_settings = agent_settings
                    .get("mem0_agent")
                    .ok_or_else(|| anyhow::anyhow!("Mem0 agent settings not found"))?;

                // Validate required settings
                let required_fields = ["base_url", "model", "mem0_config"];
                for field in required_fields.iter() {
                    if !mem0_settings.get(field).is_some() {
                        return Err(anyhow::anyhow!(
                            "Missing required field '{}' in mem0_agent settings",
                            field
                        ));
                    }
                }

                let user_id = mem0_settings
                    .get("user_id")
                    .and_then(|v| v.as_str())
                    .unwrap_or("default")
                    .to_string();

                Ok(Box::new(Mem0LLM::new(
                    user_id,
                    system_prompt.to_string(),
                )))
            }
            "hume_ai_agent" => {
                let settings = agent_settings
                    .get("hume_ai_agent")
                    .ok_or_else(|| anyhow::anyhow!("Hume AI agent settings not found"))?;
                
                Ok(Box::new(HumeAIAgent::new(
                    settings.get("api_key").and_then(|v| v.as_str()).map(|s| s.to_string()),
                    settings.get("host")
                        .and_then(|v| v.as_str())
                        .unwrap_or("api.hume.ai")
                        .to_string(),
                    settings.get("config_id").and_then(|v| v.as_str()).map(|s| s.to_string()),
                    settings.get("idle_timeout")
                        .and_then(|v| v.as_u64())
                        .unwrap_or(15) as u32,
                )))
            }
            _ => Err(anyhow::anyhow!(
                "Unsupported agent type: {}",
                conversation_agent_choice
            )),
        }
    }
}

