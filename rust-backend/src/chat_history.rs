use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::SystemTime;
use anyhow::Result;
use uuid::Uuid;
use regex::Regex;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HistoryMessage {
    pub role: String, // "human" or "ai"
    pub timestamp: String,
    pub content: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub avatar: Option<String>,
}

fn is_safe_filename(filename: &str) -> bool {
    if filename.is_empty() || filename.len() > 255 {
        return false;
    }
    
    let pattern = Regex::new(r"^[\w\-_\u0020-\u007E\u00A0-\uFFFF]+$").unwrap();
    pattern.is_match(filename)
}

fn sanitize_path_component(component: &str) -> Result<String> {
    let sanitized = Path::new(component)
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| anyhow::anyhow!("Invalid path component: {}", component))?
        .to_string();
    
    if !is_safe_filename(&sanitized) {
        return Err(anyhow::anyhow!("Invalid characters in path component: {}", component));
    }
    
    Ok(sanitized)
}

fn ensure_conf_dir(conf_uid: &str) -> Result<PathBuf> {
    if conf_uid.is_empty() {
        return Err(anyhow::anyhow!("conf_uid cannot be empty"));
    }
    
    let safe_conf_uid = sanitize_path_component(conf_uid)?;
    let base_dir = PathBuf::from("chat_history").join(&safe_conf_uid);
    fs::create_dir_all(&base_dir)?;
    Ok(base_dir)
}

fn get_safe_history_path(conf_uid: &str, history_uid: &str) -> Result<PathBuf> {
    let safe_conf_uid = sanitize_path_component(conf_uid)?;
    let safe_history_uid = sanitize_path_component(history_uid)?;
    let base_dir = PathBuf::from("chat_history").join(&safe_conf_uid);
    let full_path = base_dir.join(format!("{}.json", safe_history_uid));
    
    // Ensure path is within base_dir (prevent path traversal)
    if !full_path.starts_with(&base_dir) {
        return Err(anyhow::anyhow!("Invalid path: Path traversal detected"));
    }
    
    Ok(full_path)
}

pub fn create_new_history(conf_uid: &str) -> Result<String> {
    if conf_uid.is_empty() {
        tracing::warn!("No conf_uid provided");
        return Ok(String::new());
    }
    
    // Format: YYYY-MM-DD_HH-MM-SS_{uuid}
    let now = SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs();
    let datetime = chrono::DateTime::<chrono::Utc>::from_timestamp(now as i64, 0)
        .unwrap_or_else(|| chrono::Utc::now());
    let timestamp = datetime.format("%Y-%m-%d_%H-%M-%S").to_string();
    let uuid_hex = Uuid::new_v4().as_simple().to_string();
    let history_uid = format!("{}_{}", timestamp, uuid_hex);
    
    let conf_dir = ensure_conf_dir(conf_uid)?;
    let filepath = conf_dir.join(format!("{}.json", history_uid));
    
    // Create history file with empty metadata
    let now = SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs();
    let datetime = chrono::DateTime::<chrono::Utc>::from_timestamp(now as i64, 0)
        .unwrap_or_else(|| chrono::Utc::now());
    let initial_data = vec![serde_json::json!({
        "role": "metadata",
        "timestamp": datetime.to_rfc3339()
    })];
    
    fs::write(&filepath, serde_json::to_string_pretty(&initial_data)?)?;
    tracing::debug!("Created new history file: {:?}", filepath);
    
    Ok(history_uid)
}

pub fn store_message(
    conf_uid: &str,
    history_uid: &str,
    role: &str,
    content: &str,
    name: Option<&str>,
    avatar: Option<&str>,
) -> Result<()> {
    let filepath = get_safe_history_path(conf_uid, history_uid)?;
    
    // Read existing history
    let mut messages: Vec<serde_json::Value> = if filepath.exists() {
        let content = fs::read_to_string(&filepath)?;
        serde_json::from_str(&content)?
    } else {
        Vec::new()
    };
    
    // Add new message
    let now = SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs();
    let datetime = chrono::DateTime::<chrono::Utc>::from_timestamp(now as i64, 0)
        .unwrap_or_else(|| chrono::Utc::now());
    let message = serde_json::json!({
        "role": role,
        "timestamp": datetime.to_rfc3339(),
        "content": content,
        "name": name,
        "avatar": avatar
    });
    
    messages.push(message);
    
    // Write back
    fs::write(&filepath, serde_json::to_string_pretty(&messages)?)?;
    
    Ok(())
}

pub fn get_history_list(conf_uid: &str) -> Result<Vec<String>> {
    let conf_dir = ensure_conf_dir(conf_uid)?;
    let mut history_list = Vec::new();
    
    if conf_dir.exists() {
        for entry in fs::read_dir(&conf_dir)? {
            let entry = entry?;
            let path = entry.path();
            if path.is_file() && path.extension() == Some(std::ffi::OsStr::new("json")) {
                if let Some(stem) = path.file_stem().and_then(|s| s.to_str()) {
                    history_list.push(stem.to_string());
                }
            }
        }
    }
    
    // Sort by filename (which includes timestamp)
    history_list.sort();
    history_list.reverse(); // Most recent first
    
    Ok(history_list)
}

pub fn get_history(conf_uid: &str, history_uid: &str) -> Result<Vec<HistoryMessage>> {
    let filepath = get_safe_history_path(conf_uid, history_uid)?;
    
    if !filepath.exists() {
        return Ok(Vec::new());
    }
    
    let content = fs::read_to_string(&filepath)?;
    let messages: Vec<serde_json::Value> = serde_json::from_str(&content)?;
    
    let mut history = Vec::new();
    for msg in messages {
        if let Some(role) = msg.get("role").and_then(|r| r.as_str()) {
            if role == "metadata" {
                continue; // Skip metadata entries
            }
            
            if let Ok(message) = serde_json::from_value::<HistoryMessage>(msg) {
                history.push(message);
            }
        }
    }
    
    Ok(history)
}

pub fn delete_history(conf_uid: &str, history_uid: &str) -> Result<()> {
    let filepath = get_safe_history_path(conf_uid, history_uid)?;
    
    if filepath.exists() {
        fs::remove_file(&filepath)?;
        tracing::debug!("Deleted history file: {:?}", filepath);
    }
    
    Ok(())
}

