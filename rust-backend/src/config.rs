use serde::{Deserialize, Serialize};
use std::fs;
use anyhow::Result;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
    pub system_config: SystemConfig,
    pub character_config: CharacterConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemConfig {
    #[serde(default = "default_conf_version")]
    pub conf_version: Option<String>,
    pub host: String,
    pub port: u16,
    pub config_alts_dir: String,
    pub live2d_models_dir: String,
    pub shared_assets_dir: String,
    pub cache_dir: String,
    #[serde(default = "default_backgrounds_dir")]
    pub backgrounds_dir: String,
    #[serde(default = "default_avatars_dir")]
    pub avatars_dir: String,
    #[serde(default = "default_characters_dir")]
    pub characters_dir: String,
    #[serde(default)]
    pub tool_prompts: std::collections::HashMap<String, String>,
}

fn default_conf_version() -> Option<String> {
    Some("v1.1.1".to_string())
}

fn default_backgrounds_dir() -> String {
    "config/shared/backgrounds".to_string()
}

fn default_avatars_dir() -> String {
    "config/shared/avatars".to_string()
}

fn default_characters_dir() -> String {
    "config/characters".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CharacterConfig {
    pub conf_name: String,
    pub conf_uid: String,
    pub live2d_model_name: String,
    pub character_name: String,
    pub avatar: Option<String>,
    pub human_name: String,
}

impl Config {
    pub fn load(path: &str) -> Result<Self> {
        // Try to resolve the path - if relative, try from current dir and from rust-backend dir
        let content = if std::path::Path::new(path).exists() {
            fs::read_to_string(path)?
        } else {
            // Try from rust-backend directory
            let rust_backend_path = std::path::Path::new(".").canonicalize()
                .ok()
                .and_then(|p| {
                    if p.ends_with("rust-backend") {
                        Some(p.join(path))
                    } else {
                        None
                    }
                });
            
            if let Some(p) = rust_backend_path {
                if p.exists() {
                    fs::read_to_string(&p)?
                } else {
                    fs::read_to_string(path)?
                }
            } else {
                fs::read_to_string(path)?
            }
        };
        
        // Determine file type by extension or content
        let path_lower = path.to_lowercase();
        if path_lower.ends_with(".jsonld") || path_lower.ends_with(".json") {
            // Load as JSON/JSON-LD
            let json_value: serde_json::Value = serde_json::from_str(&content)?;
            // Remove @context if present (we don't need it for deserialization)
            let config: Config = serde_json::from_value(json_value)?;
            Ok(config)
        } else {
            // Load as YAML
            let config: Config = serde_yaml::from_str(&content)?;
            Ok(config)
        }
    }
}

impl Default for SystemConfig {
    fn default() -> Self {
        Self {
            conf_version: default_conf_version(),
            host: "localhost".to_string(),
            port: 12393,
            config_alts_dir: "characters".to_string(),
            live2d_models_dir: "config/live2d-models".to_string(),
            shared_assets_dir: "config/shared".to_string(),
            cache_dir: "cache".to_string(),
            backgrounds_dir: default_backgrounds_dir(),
            avatars_dir: default_avatars_dir(),
            characters_dir: default_characters_dir(),
            tool_prompts: std::collections::HashMap::new(),
        }
    }
}

