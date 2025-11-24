use serde::{Deserialize, Serialize};
use crate::config_manager::system::SystemConfig;
use crate::config_manager::character::CharacterConfig;

/// Main configuration for the application using JSON-LD format
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
    #[serde(rename = "@context")]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub context: Option<serde_json::Value>,
    
    #[serde(rename = "system_config")]
    pub system_config: SystemConfig,
    
    #[serde(rename = "character_config")]
    pub character_config: CharacterConfig,
}

impl Config {
    /// Load configuration from JSON-LD file
    pub fn load(path: &str) -> anyhow::Result<Self> {
        use crate::config_manager::utils::{read_jsonld, validate_config};
        let json_value = read_jsonld(path)?;
        validate_config(&json_value)
    }
}

