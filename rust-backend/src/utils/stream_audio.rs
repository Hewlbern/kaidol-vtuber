use serde_json::json;

/// Prepare audio payload for WebSocket
pub fn prepare_audio_payload(
    audio_path: Option<&str>,
    display_text: Option<&str>,
    actions: Option<serde_json::Value>,
    forwarded: bool,
) -> serde_json::Value {
    json!({
        "type": "audio",
        "audio": audio_path,
        "volumes": [],
        "slice_length": 20,
        "display_text": display_text.map(|t| json!({
            "text": t
        })),
        "actions": actions,
        "forwarded": forwarded
    })
}

