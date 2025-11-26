use async_trait::async_trait;
use serde_json::Value;
use std::collections::HashMap;

/// Base interface for all backend adapters
#[allow(dead_code)]
#[async_trait]
pub trait BackendAdapter: Send + Sync {
    /// Generate text response
    async fn generate_text(
        &self,
        prompt: &str,
        context: Option<&HashMap<String, Value>>,
    ) -> Result<Vec<String>, anyhow::Error>;

    /// Trigger character expression
    async fn trigger_expression(
        &self,
        expression_id: i32,
        duration: Option<i32>,
        priority: i32,
    ) -> Result<HashMap<String, Value>, anyhow::Error>;

    /// Trigger character motion
    async fn trigger_motion(
        &self,
        motion_group: &str,
        motion_index: i32,
        loop_motion: bool,
        priority: i32,
    ) -> Result<HashMap<String, Value>, anyhow::Error>;

    /// Get current character state
    async fn get_character_state(&self) -> Result<HashMap<String, Value>, anyhow::Error>;
}

