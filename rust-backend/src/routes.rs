use axum::{
    extract::{State, Path, Multipart},
    routing::{get, post},
    Router,
    Json,
    http::StatusCode,
};
use serde_json::{json, Value};
use std::path::PathBuf;
use tower_http::services::ServeDir;

use crate::state::AppState;

pub fn create_routes(state: AppState) -> Router<AppState> {
    let system_config = &state.config.system_config;
    
    Router::new()
        // WebSocket
        .route("/client-ws", get(websocket_handler))
        
        // Health check
        .route("/api/health", get(health_check))
        
        // REST API routes
        .route("/api/backgrounds", get(get_backgrounds))
        .route("/api/base-config", get(get_base_config))
        .route("/api/switch-character/:character_id", post(switch_character))
        .route("/api/expression", post(expression_command))
        .route("/api/motion", post(motion_command))
        .route("/asr", post(transcribe_audio))
        
        // Static file serving
        .nest_service("/cache", ServeDir::new(&system_config.cache_dir))
        .nest_service("/live2d-models", ServeDir::new(&system_config.live2d_models_dir))
        .nest_service("/bg", ServeDir::new(&system_config.backgrounds_dir))
        .nest_service("/characters", ServeDir::new(&system_config.characters_dir))
        .nest_service("/avatars", ServeDir::new(&system_config.avatars_dir))
}

async fn websocket_handler(
    ws: axum::extract::ws::WebSocketUpgrade,
    State(state): State<AppState>,
) -> axum::response::Response {
    crate::websocket::websocket_handler(ws, State(state)).await
}

async fn health_check(State(state): State<AppState>) -> Json<Value> {
    let python_healthy = state.python_service.health_check().await.unwrap_or(false);
    Json(json!({
        "status": "ok",
        "python_service": python_healthy
    }))
}

async fn get_backgrounds(State(state): State<AppState>) -> Json<Value> {
    let backgrounds_dir = PathBuf::from(&state.config.system_config.backgrounds_dir);
    let mut backgrounds = Vec::new();
    
    if let Ok(entries) = std::fs::read_dir(&backgrounds_dir) {
        for entry in entries.flatten() {
            if let Ok(file_type) = entry.file_type() {
                if file_type.is_file() {
                    let path = entry.path();
                    if let Some(ext) = path.extension() {
                        let ext_lower = ext.to_string_lossy().to_lowercase();
                        if ["jpg", "jpeg", "png", "gif"].contains(&ext_lower.as_str()) {
                            if let Some(name) = path.file_stem().and_then(|n| n.to_str()) {
                                backgrounds.push(json!({
                                    "name": name,
                                    "path": format!("/bg/{}", path.file_name().unwrap().to_string_lossy())
                                }));
                            }
                        }
                    }
                }
            }
        }
    }
    
    Json(json!(backgrounds))
}

async fn get_base_config(State(state): State<AppState>) -> Json<Value> {
    // Return base configuration for Live2D viewer
    let character = &state.config.character_config;
    Json(json!({
        "character": {
            "id": character.conf_uid,
            "name": character.conf_name,
            "modelName": character.live2d_model_name,
            "persona": "" // TODO: Load from character config
        },
        "characters": [] // TODO: Scan characters directory
    }))
}

async fn switch_character(
    State(_state): State<AppState>,
    Path(character_id): Path<String>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    // TODO: Implement character switching
    Err((
        StatusCode::NOT_IMPLEMENTED,
        Json(json!({"error": "Character switching not yet implemented"}))
    ))
}

async fn expression_command(
    State(_state): State<AppState>,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    // TODO: Implement expression command
    let expression_id = payload.get("expressionId")
        .and_then(|v| v.as_u64())
        .ok_or_else(|| (
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "expressionId is required"}))
        ))?;
    
    // TODO: Trigger expression through adapter
    Ok(Json(json!({
        "status": "success",
        "expression_id": expression_id
    })))
}

async fn motion_command(
    State(_state): State<AppState>,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    // TODO: Implement motion command
    let motion_group = payload.get("motionGroup")
        .and_then(|v| v.as_str())
        .ok_or_else(|| (
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "motionGroup is required"}))
        ))?;
    
    let motion_index = payload.get("motionIndex")
        .and_then(|v| v.as_u64())
        .ok_or_else(|| (
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "motionIndex is required"}))
        ))?;
    
    // TODO: Trigger motion through adapter
    Ok(Json(json!({
        "status": "success",
        "motion_group": motion_group,
        "motion_index": motion_index
    })))
}

async fn transcribe_audio(
    State(state): State<AppState>,
    mut multipart: Multipart,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    // TODO: Implement audio transcription via Python service
    while let Some(field) = multipart.next_field().await.unwrap_or(None) {
        if field.name() == Some("file") {
            if let Ok(data) = field.bytes().await {
                // TODO: Send to Python ASR service
                return Ok(Json(json!({
                    "text": "Transcription not yet implemented"
                })));
            }
        }
    }
    
    Err((
        StatusCode::BAD_REQUEST,
        Json(json!({"error": "No audio file provided"}))
    ))
}

