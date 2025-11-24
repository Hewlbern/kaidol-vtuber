/// Detect if text is a complete sentence
pub fn is_complete_sentence(text: &str) -> bool {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return false;
    }
    
    // Check for sentence-ending punctuation
    trimmed.ends_with('.') || 
    trimmed.ends_with('!') || 
    trimmed.ends_with('?') ||
    trimmed.ends_with('。') ||
    trimmed.ends_with('！') ||
    trimmed.ends_with('？')
}

/// Split text into sentences (simplified)
pub fn split_sentences(text: &str) -> Vec<String> {
    // Simple sentence splitting by punctuation
    text.split(&['.', '!', '?', '。', '！', '？'][..])
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect()
}

