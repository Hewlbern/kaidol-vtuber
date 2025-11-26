use serde::{Deserialize, Serialize};
use std::path::PathBuf;

/// Base trait defining required paths for the WebSocketServer
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerPaths {
    pub live2d_models_dir: String,
    pub shared_assets_dir: String,
    pub cache_dir: String,
}

impl ServerPaths {
    pub fn backgrounds_dir(&self) -> PathBuf {
        PathBuf::from(&self.shared_assets_dir).join("backgrounds")
    }

    pub fn avatars_dir(&self) -> PathBuf {
        PathBuf::from(&self.shared_assets_dir).join("avatars")
    }

    pub fn assets_dir(&self) -> PathBuf {
        PathBuf::from(&self.shared_assets_dir).join("assets")
    }
}

/// Configuration required by the WebSocketServer
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerConfig {
    pub host: String,
    pub port: u16,
    pub paths: ServerPaths,
}

