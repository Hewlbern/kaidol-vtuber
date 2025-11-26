/// Agent interface - actual implementation in Python service
/// This module provides type definitions and client interfaces

use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct AgentRequest {
    pub messages: Vec<Message>,
    pub context: Option<serde_json::Value>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Message {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AgentResponse {
    pub text: String,
    pub success: bool,
}

