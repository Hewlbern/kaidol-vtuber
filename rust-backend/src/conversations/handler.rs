use crate::state::AppState;
use crate::conversations::single_conversation::process_single_conversation;
use crate::conversations::group_conversation::process_group_conversation;
use serde_json::Value;
use tracing::info;

/// Handle conversation triggers
pub async fn handle_conversation_trigger(
    state: &AppState,
    client_uid: &str,
    msg_type: &str,
    data: &Value,
    sender: &tokio::sync::mpsc::UnboundedSender<String>,
) -> anyhow::Result<()> {
    let user_input = match msg_type {
        "ai-speak-signal" => {
            let _ = sender.send(serde_json::json!({
                "type": "full-text",
                "text": "AI wants to speak something..."
            }).to_string());
            String::new()
        }
        "text-input" => {
            data.get("text")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string()
        }
        _ => {
            // mic-audio-end - get from buffer
            if let Some(buffer) = state.audio_buffers.get(client_uid) {
                // TODO: Convert audio buffer to text via ASR
                String::new()
            } else {
                String::new()
            }
        }
    };

    let images = data.get("images").and_then(|v| v.as_array());
    let session_emoji = "🎭"; // TODO: Random emoji

    // Check if in group
    let groups = state.chat_groups.read().await;
    let group_members = groups.get_group_members(client_uid);

    if group_members.len() > 1 {
        // Group conversation
        drop(groups);
        process_group_conversation(
            state,
            client_uid,
            &group_members,
            &user_input,
            images,
            session_emoji,
            sender,
        )
        .await?;
    } else {
        // Single conversation
        drop(groups);
        process_single_conversation(
            state,
            client_uid,
            &user_input,
            images,
            session_emoji,
            sender,
        )
        .await?;
    }

    Ok(())
}

