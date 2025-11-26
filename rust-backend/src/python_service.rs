use serde::{Deserialize, Serialize};
use anyhow::Result;
use reqwest::Client;

#[derive(Debug, Clone)]
pub struct PythonServiceClient {
    client: Client,
    base_url: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TTSRequest {
    pub text: String,
    pub voice: Option<String>,
    pub language: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TTSResponse {
    pub audio_path: String,
    pub success: bool,
    pub error: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RVCRequest {
    pub audio_path: String,
    pub model: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RVCResponse {
    pub audio_path: String,
    pub success: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ASRRequest {
    pub audio_data: Vec<f32>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ASRResponse {
    pub text: String,
    pub success: bool,
}

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

impl PythonServiceClient {
    pub fn new(base_url: String) -> Self {
        Self {
            client: Client::new(),
            base_url,
        }
    }

    pub async fn synthesize_tts(
        &self, 
        request: TTSRequest,
        config: Option<serde_json::Value>,
    ) -> Result<TTSResponse> {
        let url = format!("{}/tts/synthesize", self.base_url);
        
        // Create request body with config
        let mut body = serde_json::json!({
            "text": request.text,
            "voice": request.voice,
            "language": request.language,
        });
        
        if let Some(config) = config {
            body["config"] = config;
        }
        
        let response = self.client.post(&url).json(&body).send().await?;
        let result: TTSResponse = response.json().await?;
        Ok(result)
    }

    pub async fn convert_voice(&self, request: RVCRequest) -> Result<RVCResponse> {
        let url = format!("{}/rvc/convert", self.base_url);
        let response = self.client.post(&url).json(&request).send().await?;
        let result: RVCResponse = response.json().await?;
        Ok(result)
    }

    pub async fn transcribe(&self, request: ASRRequest) -> Result<ASRResponse> {
        let url = format!("{}/asr/transcribe", self.base_url);
        let response = self.client.post(&url).json(&request).send().await?;
        let result: ASRResponse = response.json().await?;
        Ok(result)
    }

    pub async fn chat(&self, request: AgentRequest) -> Result<AgentResponse> {
        let url = format!("{}/agent/chat", self.base_url);
        let response = self.client.post(&url).json(&request).send().await?;
        let result: AgentResponse = response.json().await?;
        Ok(result)
    }

    pub async fn health_check(&self) -> Result<bool> {
        let url = format!("{}/health", self.base_url);
        let response = self.client.get(&url).send().await?;
        Ok(response.status().is_success())
    }
}

