/// ASR interface - actual implementation in Python service

use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct ASRRequest {
    pub audio_data: Vec<f32>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ASRResponse {
    pub text: String,
    pub success: bool,
}

