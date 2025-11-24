use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::mpsc;

/// WebSocket send function type
pub type WebSocketSend = mpsc::UnboundedSender<String>;

/// Broadcast function type
pub type BroadcastFunc = Arc<dyn Fn(Vec<String>, Value, Option<String>) -> tokio::task::JoinHandle<()> + Send + Sync>;

/// Audio payload structure
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AudioPayload {
    #[serde(rename = "type")]
    pub payload_type: String,
    pub audio: Option<String>,
    pub volumes: Option<Vec<f32>>,
    pub slice_length: Option<i32>,
    pub display_text: Option<DisplayText>,
    pub actions: Option<Actions>,
    pub forwarded: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DisplayText {
    pub text: String,
    pub name: Option<String>,
    pub avatar: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Actions {
    pub expressions: Option<Vec<i32>>,
    pub motions: Option<Vec<Motion>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Motion {
    pub group: String,
    pub index: i32,
    pub loop_motion: bool,
}

/// Group conversation state
#[derive(Debug, Clone)]
pub struct GroupConversationState {
    pub group_id: String,
    pub conversation_history: Vec<String>,
    pub memory_index: HashMap<String, usize>,
    pub group_queue: Vec<String>,
    pub session_emoji: String,
    pub current_speaker_uid: Option<String>,
}

impl GroupConversationState {
    pub fn new(group_id: String, session_emoji: String, group_members: Vec<String>) -> Self {
        Self {
            group_id,
            conversation_history: Vec::new(),
            memory_index: group_members.iter().map(|uid| (uid.clone(), 0)).collect(),
            group_queue: group_members,
            session_emoji,
            current_speaker_uid: None,
        }
    }
}

/// Conversation configuration
#[derive(Debug, Clone)]
pub struct ConversationConfig {
    pub conf_uid: String,
    pub history_uid: Option<String>,
    pub client_uid: String,
    pub character_name: String,
}

