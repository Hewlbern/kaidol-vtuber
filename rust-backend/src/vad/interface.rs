/// VAD interface - actual implementation in Python service

use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct VADRequest {
    pub audio_data: Vec<f32>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct VADResponse {
    pub speech_detected: bool,
    pub audio_segments: Vec<Vec<f32>>,
    pub success: bool,
}

