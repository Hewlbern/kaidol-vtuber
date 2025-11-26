use serde_json::{json, Value};

/// Create batch input for agent
pub fn create_batch_input(
    input_text: &str,
    images: Option<&Vec<Value>>,
    from_name: &str,
) -> Value {
    json!({
        "input_text": input_text,
        "images": images,
        "from_name": from_name
    })
}

/// EMOJI list for session identification
pub const EMOJI_LIST: &[&str] = &[
    "🎭", "🎪", "🎨", "🎯", "🎲", "🎸", "🎺", "🎻",
    "🎤", "🎧", "🎬", "🎮", "🎰", "🎱", "🎳", "🎴",
];

