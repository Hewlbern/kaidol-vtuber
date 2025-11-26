use crate::state::AppState;
use serde_json::Value;
use tracing::info;

/// Process a single-user conversation turn
pub async fn process_single_conversation(
    state: &AppState,
    client_uid: &str,
    user_input: &str,
    _images: Option<&Vec<Value>>,
    _session_emoji: &str,
    sender: &tokio::sync::mpsc::UnboundedSender<String>,
) -> anyhow::Result<()> {
    info!("Processing single conversation for {}", client_uid);

    // Send conversation start signals
    let _ = sender.send(serde_json::json!({
        "type": "control",
        "text": "conversation-chain-start"
    }).to_string());

    // Call Python agent service
    let request = crate::python_service::AgentRequest {
        messages: vec![crate::python_service::Message {
            role: "user".to_string(),
            content: user_input.to_string(),
        }],
        context: None,
    };

    let response = state.python_service.chat(request).await?;

    // Send response
    let _ = sender.send(serde_json::json!({
        "type": "full-text",
        "text": response.text
    }).to_string());

    // TODO: Process TTS, expressions, etc.

    // Send conversation end signal
    let _ = sender.send(serde_json::json!({
        "type": "control",
        "text": "conversation-chain-end"
    }).to_string());

    Ok(())
}

