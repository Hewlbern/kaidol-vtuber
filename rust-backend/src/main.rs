mod config;
mod state;
mod websocket;
mod routes;
mod python_service;
mod handlers;
mod adapters;
mod conversations;
mod utils;
mod config_manager;
mod agent;
mod asr;
mod tts;
mod translate;
mod vad;
mod chat_history;

use anyhow::Result;
use axum::Router;
use std::net::SocketAddr;
use tower_http::cors::CorsLayer;
use tracing::info;

use config::Config;
use state::AppState;

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter("vaidol_backend=debug,tower_http=debug")
        .init();

    // Load configuration - try multiple paths
    // Get the executable directory to resolve relative paths correctly
    let exe_dir = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|p| p.to_path_buf()))
        .unwrap_or_else(|| std::path::PathBuf::from("."));
    
    let config_paths: Vec<String> = vec![
        std::env::var("CONFIG_PATH").ok(),
        // Try conf.jsonld in rust-backend directory first (preferred)
        Some("conf.jsonld".to_string()),
        exe_dir.join("conf.jsonld").canonicalize().ok().and_then(|p| p.to_str().map(|s| s.to_string())),
        // Fallback to YAML files
        exe_dir.join("../backend/conf.yaml").canonicalize().ok().and_then(|p| p.to_str().map(|s| s.to_string())),
        std::path::Path::new("../backend/conf.yaml").canonicalize().ok().and_then(|p| p.to_str().map(|s| s.to_string())),
        Some("conf.yaml".to_string()),
        Some("backend/conf.yaml".to_string()),
    ].into_iter().flatten().collect();
    
    let config_paths_clone = config_paths.clone();
    let mut config = None;
    let mut loaded_path = String::new();
    
    for path in config_paths {
        match Config::load(&path) {
            Ok(cfg) => {
                config = Some(cfg);
                loaded_path = path;
                break;
            }
            Err(e) => {
                tracing::debug!("Failed to load config from {}: {}", path, e);
                continue;
            }
        }
    }
    
    let config = config.ok_or_else(|| anyhow::anyhow!(
        "Could not find config file. Tried: {:?}", config_paths_clone
    ))?;
    
    info!("Loaded configuration from: {}", loaded_path);

    // Ensure directories exist
    let system_config = &config.system_config;
    std::fs::create_dir_all(&system_config.cache_dir)?;
    std::fs::create_dir_all(&system_config.live2d_models_dir)?;
    std::fs::create_dir_all(&system_config.backgrounds_dir)?;
    std::fs::create_dir_all(&system_config.avatars_dir)?;
    std::fs::create_dir_all(&system_config.characters_dir)?;
    std::fs::create_dir_all("chat_history")?;
    
    info!("Initialized directories");

    // Initialize app state
    let app_state = AppState::new(config.clone()).await?;

    // Build application
    let app = Router::new()
        .merge(routes::create_routes(app_state.clone()))
        .layer(CorsLayer::permissive())
        .with_state(app_state);

    // Start server
    let addr = SocketAddr::from(([0, 0, 0, 0], config.system_config.port));
    info!("Starting server on {}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}

