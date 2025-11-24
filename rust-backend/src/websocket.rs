use axum::{
    extract::{ws::Message, State, WebSocketUpgrade},
    response::Response,
};
use axum::extract::ws::WebSocket;
use serde_json::json;
use tracing::{info, error};
use futures_util::{SinkExt, StreamExt};

use crate::state::AppState;
use crate::handlers;

pub async fn websocket_handler(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
) -> Response {
    ws.on_upgrade(|socket| handle_socket(socket, state))
}

async fn handle_socket(socket: WebSocket, state: AppState) {
    let client_uid = state.generate_client_uid();
    info!("New WebSocket connection: {}", client_uid);

    // Initialize client context
    let context = crate::state::ClientContext {
        client_uid: client_uid.clone(),
        conf_uid: state.config.character_config.conf_uid.clone(),
        history_uid: None,
    };
    state.client_contexts.insert(client_uid.clone(), context);
    
    // Initialize audio buffer
    state.audio_buffers.insert(client_uid.clone(), Vec::new());
    
    // Initialize group status
    {
        let groups = state.chat_groups.read().await;
        groups.client_group_map.insert(client_uid.clone(), String::new());
    }

    use futures_util::StreamExt as _;
    let (mut sender, mut receiver) = socket.split();

    // Send initial messages matching Python backend
    let initial_messages = vec![
        json!({
            "type": "full-text",
            "text": "Connection established"
        }),
        json!({
            "type": "set-model-and-conf",
            "model_info": {}, // TODO: Load from config
            "conf_name": state.config.character_config.conf_name,
            "conf_uid": state.config.character_config.conf_uid,
            "client_uid": client_uid
        }),
        json!({
            "type": "group-update",
            "members": [],
            "is_owner": false
        }),
        json!({
            "type": "control",
            "text": "start-mic"
        }),
    ];

    for msg in initial_messages {
        if let Err(e) = sender.send(Message::Text(msg.to_string())).await {
            error!("Failed to send initial message: {}", e);
            return;
        }
    }

    // Handle incoming messages
    while let Some(msg) = receiver.next().await {
        match msg {
            Ok(Message::Text(text)) => {
                if let Err(e) = handlers::handle_message(&state, &client_uid, &text, &mut sender).await {
                    error!("Error handling message: {}", e);
                }
            }
            Ok(Message::Close(_)) => {
                info!("Client {} disconnected", client_uid);
                break;
            }
            Err(e) => {
                error!("WebSocket error: {}", e);
                break;
            }
            _ => {}
        }
    }

    // Cleanup
    state.client_contexts.remove(&client_uid);
    state.audio_buffers.remove(&client_uid);
    
    // Cancel any running conversation tasks
    if let Some((_, handle)) = state.conversation_tasks.remove(&client_uid) {
        handle.abort();
    }
    
    // Remove from groups
    {
        let groups = state.chat_groups.write().await;
        groups.client_group_map.remove(&client_uid);
    }
    
    info!("Cleaned up client {}", client_uid);
}

