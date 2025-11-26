use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use crate::config_manager::interfaces::ServerPaths;

/// System configuration settings
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemConfig {
    #[serde(rename = "conf_version")]
    pub conf_version: String,
    
    pub host: String,
    pub port: u16,
    
    #[serde(rename = "config_alts_dir")]
    pub config_alts_dir: String,
    
    #[serde(rename = "tool_prompts")]
    pub tool_prompts: HashMap<String, String>,
    
    #[serde(rename = "live2d_models_dir")]
    #[serde(default = "default_live2d_models_dir")]
    pub live2d_models_dir: String,
    
    #[serde(rename = "shared_assets_dir")]
    #[serde(default = "default_shared_assets_dir")]
    pub shared_assets_dir: String,
    
    #[serde(rename = "cache_dir")]
    #[serde(default = "default_cache_dir")]
    pub cache_dir: String,
    
    #[serde(rename = "backgrounds_dir")]
    #[serde(default = "default_backgrounds_dir")]
    pub backgrounds_dir: String,
    
    #[serde(rename = "characters_dir")]
    #[serde(default = "default_characters_dir")]
    pub characters_dir: String,
}

fn default_live2d_models_dir() -> String {
    "config/live2d-models".to_string()
}

fn default_shared_assets_dir() -> String {
    "config/shared".to_string()
}

fn default_cache_dir() -> String {
    "cache".to_string()
}

fn default_backgrounds_dir() -> String {
    "config/shared/backgrounds".to_string()
}

fn default_characters_dir() -> String {
    "config/characters".to_string()
}

impl SystemConfig {
    pub fn validate_port(&self) -> Result<(), String> {
        if self.port > 65535 {
            return Err("Port must be between 0 and 65535".to_string());
        }
        Ok(())
    }

    pub fn get_backgrounds_path(&self) -> PathBuf {
        PathBuf::from(&self.backgrounds_dir)
    }

    pub fn get_characters_path(&self) -> PathBuf {
        PathBuf::from(&self.characters_dir)
    }

    pub fn avatars_dir(&self) -> PathBuf {
        PathBuf::from(&self.shared_assets_dir).join("avatars")
    }

    pub fn assets_dir(&self) -> PathBuf {
        PathBuf::from(&self.shared_assets_dir).join("assets")
    }

    pub fn live2d_models_path(&self) -> PathBuf {
        PathBuf::from(&self.live2d_models_dir).canonicalize()
            .unwrap_or_else(|_| PathBuf::from(&self.live2d_models_dir))
    }

    pub fn model_paths(&self) -> HashMap<String, PathBuf> {
        let mut paths = HashMap::new();
        let models_path = self.live2d_models_path();
        
        if let Ok(entries) = std::fs::read_dir(&models_path) {
            for entry in entries.flatten() {
                let model_dir = entry.path();
                if model_dir.is_dir() {
                    if let Some(model_json) = find_model_json(&model_dir) {
                        if let Some(name) = model_dir.file_name().and_then(|n| n.to_str()) {
                            paths.insert(name.to_string(), model_json);
                        }
                    }
                }
            }
        }
        
        paths
    }

    pub fn backgrounds_path(&self) -> PathBuf {
        PathBuf::from(&self.backgrounds_dir)
    }
}

fn find_model_json(dir: &PathBuf) -> Option<PathBuf> {
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() {
                if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                    if name.ends_with(".model.json") {
                        return Some(path);
                    }
                }
            }
        }
    }
    None
}

impl Default for SystemConfig {
    fn default() -> Self {
        Self {
            conf_version: "1.0".to_string(),
            host: "localhost".to_string(),
            port: 12393,
            config_alts_dir: "characters".to_string(),
            tool_prompts: HashMap::new(),
            live2d_models_dir: default_live2d_models_dir(),
            shared_assets_dir: default_shared_assets_dir(),
            cache_dir: default_cache_dir(),
            backgrounds_dir: default_backgrounds_dir(),
            characters_dir: default_characters_dir(),
        }
    }
}
