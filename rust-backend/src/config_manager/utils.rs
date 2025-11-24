use std::fs;
use std::path::{Path, PathBuf};
use anyhow::Result;
use regex::Regex;
use serde_json::Value;
use tracing::{error, debug};

use crate::config_manager::main::Config;

/// Read JSON-LD configuration file with environment variable substitution
pub fn read_jsonld(config_path: &str) -> Result<Value> {
    if !Path::new(config_path).exists() {
        anyhow::bail!("Configuration file not found: {}", config_path);
    }

    let content = load_text_file_with_guess_encoding(config_path)?;
    if content.is_empty() {
        anyhow::bail!("Failed to read configuration file: {}", config_path);
    }

    // Replace environment variables: ${VAR_NAME}
    let pattern = Regex::new(r"\$\{(\w+)\}").unwrap();
    let content = pattern.replace_all(&content, |caps: &regex::Captures| {
        let var_name = caps.get(1).unwrap().as_str();
        std::env::var(var_name).unwrap_or_else(|_| caps.get(0).unwrap().as_str().to_string())
    });

    // Parse JSON-LD
    let json_value: Value = serde_json::from_str(&content)?;
    
    // Extract @context if present (JSON-LD feature)
    // For now, we'll just parse as regular JSON and ignore @context
    Ok(json_value)
}

/// Validate configuration data against the Config model
pub fn validate_config(config_data: &Value) -> Result<Config> {
    let config: Config = serde_json::from_value(config_data.clone())?;
    Ok(config)
}

/// Load text file with encoding detection
pub fn load_text_file_with_guess_encoding(file_path: &str) -> Result<String> {
    let encodings = ["utf-8", "utf-8-sig", "gbk", "gb2312", "ascii", "cp936"];

    for encoding in &encodings {
        if let Ok(content) = read_file_with_encoding(file_path, encoding) {
            return Ok(content);
        }
    }

    // Try with encoding_rs for detection
    let bytes = fs::read(file_path)?;
    let (cow, _, _) = encoding_rs::Encoding::for_label(b"utf-8")
        .unwrap_or(encoding_rs::UTF_8)
        .decode(&bytes);
    
    Ok(cow.to_string())
}

fn read_file_with_encoding(file_path: &str, encoding: &str) -> Result<String> {
    use std::io::Read;
    let mut file = fs::File::open(file_path)?;
    let mut buffer = Vec::new();
    file.read_to_end(&mut buffer)?;

    match encoding {
        "utf-8" | "utf-8-sig" => {
            // Remove BOM if present
            if buffer.starts_with(&[0xEF, 0xBB, 0xBF]) {
                buffer.drain(0..3);
            }
            Ok(String::from_utf8(buffer)?)
        }
        "gbk" | "gb2312" => {
            let (cow, _, _) = encoding_rs::GBK.decode(&buffer);
            Ok(cow.to_string())
        }
        "ascii" => {
            Ok(String::from_utf8(buffer)?)
        }
        "cp936" => {
            let (cow, _, _) = encoding_rs::GBK.decode(&buffer);
            Ok(cow.to_string())
        }
        _ => Ok(String::from_utf8(buffer)?),
    }
}

/// Save configuration to JSON-LD file
pub fn save_config(config: &Config, config_path: &Path) -> Result<()> {
    let mut config_data = serde_json::to_value(config)?;
    
    // Add @context for JSON-LD
    let mut context_obj = serde_json::Map::new();
    context_obj.insert("@vocab".to_string(), serde_json::Value::String("https://vaidol.example.org/config#".to_string()));
    context_obj.insert("system_config".to_string(), serde_json::Value::String("https://vaidol.example.org/config#SystemConfig".to_string()));
    context_obj.insert("character_config".to_string(), serde_json::Value::String("https://vaidol.example.org/config#CharacterConfig".to_string()));
    let context = serde_json::Value::Object(context_obj);
    
    if let serde_json::Value::Object(ref mut obj) = config_data {
        obj.insert("@context".to_string(), context);
    }

    let json_string = serde_json::to_string_pretty(&config_data)?;
    fs::write(config_path, json_string)?;
    Ok(())
}

/// Scan config_alts directory and return list of config information
pub fn scan_config_alts_directory(config_alts_dir: &str) -> Result<Vec<serde_json::Value>> {
    let mut config_files = Vec::new();

    // Add default config first
    if let Ok(default_config) = read_jsonld("conf.jsonld") {
        let conf_name = default_config
            .pointer("/character_config/conf_name")
            .and_then(|v| v.as_str())
            .unwrap_or("conf.jsonld");
        config_files.push(serde_json::json!({
            "filename": "conf.jsonld",
            "name": conf_name
        }));
    }

    // Scan other configs
    let config_dir = PathBuf::from("config").join(config_alts_dir);
    if config_dir.exists() {
        for entry in fs::read_dir(config_dir)? {
            let entry = entry?;
            let path = entry.path();
            if path.is_file() && path.extension().and_then(|s| s.to_str()) == Some("jsonld") {
                if let Ok(config) = read_jsonld(path.to_str().unwrap()) {
                    let conf_name = config
                        .pointer("/character_config/conf_name")
                        .and_then(|v| v.as_str())
                        .unwrap_or_else(|| {
                            path.file_name()
                                .and_then(|n| n.to_str())
                                .unwrap_or("unknown")
                        });
                    config_files.push(serde_json::json!({
                        "filename": path.file_name().and_then(|n| n.to_str()).unwrap_or("unknown"),
                        "name": conf_name
                    }));
                }
            }
        }
    }

    debug!("Found config files: {:?}", config_files);
    Ok(config_files)
}

/// Scan backgrounds directory
pub fn scan_bg_directory() -> Vec<String> {
    let mut bg_files = Vec::new();
    let bg_dir = PathBuf::from("config/shared/backgrounds");
    
    if let Ok(entries) = fs::read_dir(bg_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() {
                if let Some(ext) = path.extension().and_then(|s| s.to_str()) {
                    if matches!(ext.to_lowercase().as_str(), "jpg" | "jpeg" | "png" | "gif") {
                        if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                            bg_files.push(name.to_string());
                        }
                    }
                }
            }
        }
    }
    
    bg_files
}
