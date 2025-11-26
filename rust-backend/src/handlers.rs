use serde_json::Value;
use tracing::{info, warn};
use axum::extract::ws::Message;
use futures_util::SinkExt;

use crate::state::AppState;

pub async fn handle_message(
    state: &AppState,
    client_uid: &str,
    text: &str,
    sender: &mut futures_util::stream::SplitSink<axum::extract::ws::WebSocket, Message>,
) -> anyhow::Result<()> {
    let msg: Value = serde_json::from_str(text)?;
    let msg_type = msg.get("type").and_then(|v| v.as_str());

    match msg_type {
        Some("add-client-to-group") => {
            handle_add_to_group(state, client_uid, &msg, sender).await?;
        }
        Some("remove-client-from-group") => {
            handle_remove_from_group(state, client_uid, &msg, sender).await?;
        }
        Some("request-group-info") => {
            handle_group_info(state, client_uid, sender).await?;
        }
        Some("text-input") => {
            handle_text_input(state, client_uid, &msg, sender).await?;
        }
        Some("mic-audio-end") => {
            handle_audio_end(state, client_uid, &msg, sender).await?;
        }
        Some("mic-audio-data") => {
            handle_audio_data(state, client_uid, &msg).await?;
        }
        Some("raw-audio-data") => {
            handle_raw_audio_data(state, client_uid, &msg, sender).await?;
        }
        Some("ai-speak-signal") => {
            handle_ai_speak_signal(state, client_uid, sender).await?;
        }
        Some("interrupt-signal") => {
            handle_interrupt(state, client_uid, &msg).await?;
        }
        Some("fetch-configs") => {
            handle_fetch_configs(state, client_uid, sender).await?;
        }
        Some("switch-config") => {
            handle_switch_config(state, client_uid, &msg, sender).await?;
        }
        Some("fetch-backgrounds") => {
            handle_fetch_backgrounds(state, client_uid, sender).await?;
        }
        Some("audio-play-start") => {
            handle_audio_play_start(state, client_uid, &msg, sender).await?;
        }
        Some("fetch-history-list") => {
            handle_history_list(state, client_uid, sender).await?;
        }
        Some("fetch-and-set-history") => {
            handle_fetch_history(state, client_uid, &msg, sender).await?;
        }
        Some("create-new-history") => {
            handle_create_history(state, client_uid, sender).await?;
        }
        Some("delete-history") => {
            handle_delete_history(state, client_uid, &msg, sender).await?;
        }
        Some("expression-command") => {
            handle_expression_command(state, client_uid, &msg, sender).await?;
        }
        Some("motion-command") => {
            handle_motion_command(state, client_uid, &msg, sender).await?;
        }
        Some("frontend-playback-complete") => {
            // Ignore - just an acknowledgment
        }
        _ => {
            warn!("Unknown message type: {:?}", msg_type);
        }
    }

    Ok(())
}

async fn handle_add_to_group(
    state: &AppState,
    client_uid: &str,
    msg: &Value,
    _sender: &mut futures_util::stream::SplitSink<axum::extract::ws::WebSocket, Message>,
) -> anyhow::Result<()> {
    let target_uid = msg.get("invitee_uid").and_then(|v| v.as_str());
    if let Some(target) = target_uid {
        let groups = state.chat_groups.read().await;
        // Implementation for adding to group
        info!("Adding {} to group with {}", target, client_uid);
    }
    Ok(())
}

async fn handle_remove_from_group(
    state: &AppState,
    client_uid: &str,
    msg: &Value,
    _sender: &mut futures_util::stream::SplitSink<axum::extract::ws::WebSocket, Message>,
) -> anyhow::Result<()> {
    let target_uid = msg.get("target_uid").and_then(|v| v.as_str());
    if let Some(target) = target_uid {
        info!("Removing {} from group", target);
    }
    Ok(())
}

async fn handle_text_input(
    state: &AppState,
    client_uid: &str,
    msg: &Value,
    sender: &mut futures_util::stream::SplitSink<axum::extract::ws::WebSocket, Message>,
) -> anyhow::Result<()> {
    let text = msg.get("text").and_then(|v| v.as_str()).unwrap_or("");
    
    // Call Python agent service
    let request = crate::python_service::AgentRequest {
        messages: vec![crate::python_service::Message {
            role: "user".to_string(),
            content: text.to_string(),
        }],
        context: None,
    };

    let response = state.python_service.chat(request).await?;
    
    // Send response back via WebSocket
    let _ = sender.send(Message::Text(
        serde_json::json!({
            "type": "full-text",
            "text": response.text
        })
        .to_string(),
    ))
    .await;

    Ok(())
}

async fn handle_audio_end(
    state: &AppState,
    client_uid: &str,
    _msg: &Value,
    sender: &mut futures_util::stream::SplitSink<axum::extract::ws::WebSocket, Message>,
) -> anyhow::Result<()> {
    // Get accumulated audio data from buffer and clear it
    let audio_data = if let Some(mut buffer) = state.audio_buffers.get_mut(client_uid) {
        let data = buffer.value().clone();
        buffer.value_mut().clear();
        data
    } else {
        Vec::new()
    };

    if audio_data.is_empty() {
        warn!("No audio data in buffer for {}", client_uid);
        return Ok(());
    }

    // Call Python ASR service
    let request = crate::python_service::ASRRequest { audio_data };
    let response = state.python_service.transcribe(request).await?;

    // Process transcribed text as text input
    let text_msg = serde_json::json!({
        "type": "text-input",
        "text": response.text
    });
    handle_text_input(state, client_uid, &text_msg, sender).await?;

    Ok(())
}

async fn handle_fetch_configs(
    state: &AppState,
    client_uid: &str,
    sender: &mut futures_util::stream::SplitSink<axum::extract::ws::WebSocket, Message>,
) -> anyhow::Result<()> {
    // Scan config directory and send list
    let _ = sender.send(Message::Text(
        serde_json::json!({
            "type": "config-files",
            "configs": []
        })
        .to_string(),
    ))
    .await;
    Ok(())
}

async fn handle_switch_config(
    state: &AppState,
    client_uid: &str,
    msg: &Value,
    _sender: &mut futures_util::stream::SplitSink<axum::extract::ws::WebSocket, Message>,
) -> anyhow::Result<()> {
    let config_file = msg.get("file").and_then(|v| v.as_str());
    if let Some(file) = config_file {
        info!("Switching config to {}", file);
        // Reload config and notify client
    }
    Ok(())
}

async fn handle_expression_command(
    state: &AppState,
    client_uid: &str,
    msg: &Value,
    _sender: &mut futures_util::stream::SplitSink<axum::extract::ws::WebSocket, Message>,
) -> anyhow::Result<()> {
    let expression_id = msg.get("expression_id").and_then(|v| v.as_str());
    if let Some(id) = expression_id {
        info!("Expression command: {}", id);
        // Send expression update to client
    }
    Ok(())
}

async fn handle_motion_command(
    state: &AppState,
    client_uid: &str,
    msg: &Value,
    _sender: &mut futures_util::stream::SplitSink<axum::extract::ws::WebSocket, Message>,
) -> anyhow::Result<()> {
    let motion_group = msg.get("motion_group").and_then(|v| v.as_str());
    let motion_index = msg.get("motion_index").and_then(|v| v.as_u64());
    if let (Some(group), Some(index)) = (motion_group, motion_index) {
        info!("Motion command: {}/{}", group, index);
        // Send motion update to client
    }
    Ok(())
}

async fn handle_group_info(
    state: &AppState,
    client_uid: &str,
    sender: &mut futures_util::stream::SplitSink<axum::extract::ws::WebSocket, Message>,
) -> anyhow::Result<()> {
    let groups = state.chat_groups.read().await;
    let members = groups.get_group_members(client_uid);
    let group_id = groups.get_client_group(client_uid);
    
    let is_owner = if let Some(gid) = group_id {
        groups.groups.get(&gid).map(|g| g.owner_uid == client_uid).unwrap_or(false)
    } else {
        false
    };
    
    let _ = sender.send(Message::Text(
        serde_json::json!({
            "type": "group-update",
            "members": members,
            "is_owner": is_owner
        })
        .to_string(),
    ))
    .await;
    
    Ok(())
}

async fn handle_audio_data(
    state: &AppState,
    client_uid: &str,
    msg: &Value,
) -> anyhow::Result<()> {
    let audio_data = msg
        .get("audio")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_f64().map(|f| f as f32))
                .collect::<Vec<f32>>()
        })
        .unwrap_or_default();
    
    if let Some(mut buffer) = state.audio_buffers.get_mut(client_uid) {
        buffer.value_mut().extend(audio_data);
    }
    
    Ok(())
}

async fn handle_raw_audio_data(
    state: &AppState,
    client_uid: &str,
    msg: &Value,
    sender: &mut futures_util::stream::SplitSink<axum::extract::ws::WebSocket, Message>,
) -> anyhow::Result<()> {
    // TODO: Process through VAD via Python service
    // For now, just accumulate audio data
    handle_audio_data(state, client_uid, msg).await?;
    
    // Send mic-audio-end signal (simplified - should use VAD)
    let _ = sender.send(Message::Text(
        serde_json::json!({
            "type": "control",
            "text": "mic-audio-end"
        })
        .to_string(),
    ))
    .await;
    
    Ok(())
}

async fn handle_ai_speak_signal(
    state: &AppState,
    client_uid: &str,
    sender: &mut futures_util::stream::SplitSink<axum::extract::ws::WebSocket, Message>,
) -> anyhow::Result<()> {
    // Trigger AI to speak
    let _ = sender.send(Message::Text(
        serde_json::json!({
            "type": "full-text",
            "text": "AI wants to speak something..."
        })
        .to_string(),
    ))
    .await;
    
    // Process as empty text input to trigger conversation
    let text_msg = serde_json::json!({
        "type": "text-input",
        "text": ""
    });
    handle_text_input(state, client_uid, &text_msg, sender).await?;
    
    Ok(())
}

async fn handle_interrupt(
    state: &AppState,
    client_uid: &str,
    msg: &Value,
) -> anyhow::Result<()> {
    let heard_response = msg.get("text").and_then(|v| v.as_str()).unwrap_or("");
    info!("Interrupt signal from {}: {}", client_uid, heard_response);
    
    // Cancel conversation task
    if let Some((_, handle)) = state.conversation_tasks.remove(client_uid) {
        handle.abort();
    }
    
    // Clear audio buffer
    if let Some(mut buffer) = state.audio_buffers.get_mut(client_uid) {
        buffer.value_mut().clear();
    }
    
    Ok(())
}

async fn handle_fetch_backgrounds(
    state: &AppState,
    _client_uid: &str,
    sender: &mut futures_util::stream::SplitSink<axum::extract::ws::WebSocket, Message>,
) -> anyhow::Result<()> {
    // TODO: Scan backgrounds directory
    let _ = sender.send(Message::Text(
        serde_json::json!({
            "type": "background-files",
            "files": []
        })
        .to_string(),
    ))
    .await;
    
    Ok(())
}

async fn handle_audio_play_start(
    state: &AppState,
    client_uid: &str,
    msg: &Value,
    sender: &mut futures_util::stream::SplitSink<axum::extract::ws::WebSocket, Message>,
) -> anyhow::Result<()> {
    let groups = state.chat_groups.read().await;
    let members = groups.get_group_members(client_uid);
    
    if members.len() > 1 {
        let display_text = msg.get("display_text");
        // Broadcast to other group members
        // TODO: Implement broadcasting
        info!("Audio play start for group with {} members", members.len());
    }
    
    Ok(())
}

async fn handle_history_list(
    state: &AppState,
    client_uid: &str,
    sender: &mut futures_util::stream::SplitSink<axum::extract::ws::WebSocket, Message>,
) -> anyhow::Result<()> {
    // TODO: Fetch history list from Python service or file system
    let _ = sender.send(Message::Text(
        serde_json::json!({
            "type": "history-list",
            "histories": []
        })
        .to_string(),
    ))
    .await;
    
    Ok(())
}

async fn handle_fetch_history(
    state: &AppState,
    client_uid: &str,
    msg: &Value,
    sender: &mut futures_util::stream::SplitSink<axum::extract::ws::WebSocket, Message>,
) -> anyhow::Result<()> {
    let history_uid = msg.get("history_uid").and_then(|v| v.as_str());
    
    if let Some(uid) = history_uid {
        if let Some(mut context) = state.client_contexts.get_mut(client_uid) {
            context.value_mut().history_uid = Some(uid.to_string());
        }
        
        // TODO: Fetch history from Python service
        let _ = sender.send(Message::Text(
            serde_json::json!({
                "type": "history-data",
                "messages": []
            })
            .to_string(),
        ))
        .await;
    }
    
    Ok(())
}

async fn handle_create_history(
    state: &AppState,
    client_uid: &str,
    sender: &mut futures_util::stream::SplitSink<axum::extract::ws::WebSocket, Message>,
) -> anyhow::Result<()> {
    // Generate new history UID
    let history_uid = uuid::Uuid::new_v4().to_string();
    
    if let Some(mut context) = state.client_contexts.get_mut(client_uid) {
        context.value_mut().history_uid = Some(history_uid.clone());
    }
    
    let _ = sender.send(Message::Text(
        serde_json::json!({
            "type": "new-history-created",
            "history_uid": history_uid
        })
        .to_string(),
    ))
    .await;
    
    Ok(())
}

async fn handle_delete_history(
    state: &AppState,
    client_uid: &str,
    msg: &Value,
    sender: &mut futures_util::stream::SplitSink<axum::extract::ws::WebSocket, Message>,
) -> anyhow::Result<()> {
    let history_uid = msg.get("history_uid").and_then(|v| v.as_str());
    
    if let Some(uid) = history_uid {
        // TODO: Delete history from Python service or file system
        
        // Clear if it's the current history
        if let Some(mut context) = state.client_contexts.get_mut(client_uid) {
            if context.value().history_uid.as_ref().map(|s| s.as_str()) == Some(uid) {
                context.value_mut().history_uid = None;
            }
        }
        
        let _ = sender.send(Message::Text(
            serde_json::json!({
                "type": "history-deleted",
                "success": true,
                "history_uid": uid
            })
            .to_string(),
        ))
        .await;
    }
    
    Ok(())
}

