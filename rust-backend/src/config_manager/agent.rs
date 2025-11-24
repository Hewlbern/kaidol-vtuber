use serde::{Deserialize, Serialize};
use crate::config_manager::stateless_llm::StatelessLLMConfigs;

/// Configuration for the basic memory agent
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BasicMemoryAgentConfig {
    #[serde(rename = "llm_provider")]
    pub llm_provider: String, // Literal type would be validated at runtime
    
    #[serde(rename = "faster_first_response")]
    #[serde(default = "default_true")]
    pub faster_first_response: bool,
    
    #[serde(rename = "segment_method")]
    #[serde(default = "default_segment_method")]
    pub segment_method: String, // "regex" or "pysbd"
}

fn default_true() -> bool {
    true
}

fn default_segment_method() -> String {
    "pysbd".to_string()
}

/// Configuration for Mem0 vector store
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Mem0VectorStoreConfig {
    pub provider: String,
    pub config: serde_json::Value,
}

/// Configuration for Mem0 LLM
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Mem0LLMConfig {
    pub provider: String,
    pub config: serde_json::Value,
}

/// Configuration for Mem0 embedder
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Mem0EmbedderConfig {
    pub provider: String,
    pub config: serde_json::Value,
}

/// Configuration for Mem0
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Mem0Config {
    #[serde(rename = "vector_store")]
    pub vector_store: Mem0VectorStoreConfig,
    
    pub llm: Mem0LLMConfig,
    
    pub embedder: Mem0EmbedderConfig,
}

/// Configuration for the Hume AI agent
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HumeAIConfig {
    #[serde(rename = "api_key")]
    pub api_key: String,
    
    #[serde(default = "default_hume_host")]
    pub host: String,
    
    #[serde(rename = "config_id")]
    pub config_id: Option<String>,
    
    #[serde(rename = "idle_timeout")]
    #[serde(default = "default_idle_timeout")]
    pub idle_timeout: u32,
}

fn default_hume_host() -> String {
    "api.hume.ai".to_string()
}

fn default_idle_timeout() -> u32 {
    15
}

/// Settings for different types of agents
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentSettings {
    #[serde(rename = "basic_memory_agent")]
    pub basic_memory_agent: Option<BasicMemoryAgentConfig>,
    
    #[serde(rename = "mem0_agent")]
    pub mem0_agent: Option<Mem0Config>,
    
    #[serde(rename = "hume_ai_agent")]
    pub hume_ai_agent: Option<HumeAIConfig>,
}

/// Configuration for conversation agent
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentConfig {
    #[serde(rename = "conversation_agent_choice")]
    pub conversation_agent_choice: String, // "basic_memory_agent", "mem0_agent", "hume_ai_agent"
    
    #[serde(rename = "agent_settings")]
    pub agent_settings: AgentSettings,
    
    #[serde(rename = "llm_configs")]
    pub llm_configs: StatelessLLMConfigs,
}

