use std::sync::Arc;
use dashmap::DashMap;
use tokio::sync::RwLock;
use uuid::Uuid;

use crate::config::Config;
use crate::python_service::PythonServiceClient;

#[derive(Clone)]
pub struct AppState {
    pub config: Config,
    pub client_contexts: Arc<DashMap<String, ClientContext>>,
    pub chat_groups: Arc<RwLock<ChatGroupManager>>,
    pub python_service: Arc<PythonServiceClient>,
    pub audio_buffers: Arc<DashMap<String, Vec<f32>>>,
    pub conversation_tasks: Arc<DashMap<String, tokio::task::AbortHandle>>,
}

#[derive(Clone)]
pub struct ClientContext {
    pub client_uid: String,
    pub conf_uid: String,
    pub history_uid: Option<String>,
}

pub struct ChatGroupManager {
    pub client_group_map: DashMap<String, String>, // client_uid -> group_id
    pub groups: DashMap<String, Group>, // group_id -> Group
}

pub struct Group {
    pub group_id: String,
    pub owner_uid: String,
    pub members: Vec<String>,
}

impl AppState {
    pub async fn new(config: Config) -> anyhow::Result<Self> {
        let python_service = Arc::new(PythonServiceClient::new(
            std::env::var("PYTHON_SERVICE_URL")
                .unwrap_or_else(|_| "http://localhost:8000".to_string()),
        ));

        Ok(Self {
            config,
            client_contexts: Arc::new(DashMap::new()),
            chat_groups: Arc::new(RwLock::new(ChatGroupManager::new())),
            python_service,
            audio_buffers: Arc::new(DashMap::new()),
            conversation_tasks: Arc::new(DashMap::new()),
        })
    }

    pub fn generate_client_uid(&self) -> String {
        Uuid::new_v4().to_string()
    }
}

impl ChatGroupManager {
    pub fn new() -> Self {
        Self {
            client_group_map: DashMap::new(),
            groups: DashMap::new(),
        }
    }

    pub fn get_client_group(&self, client_uid: &str) -> Option<String> {
        self.client_group_map.get(client_uid).map(|e| e.value().clone())
    }

    pub fn get_group_members(&self, client_uid: &str) -> Vec<String> {
        if let Some(group_id) = self.get_client_group(client_uid) {
            if let Some(group) = self.groups.get(&group_id) {
                return group.members.clone();
            }
        }
        vec![]
    }
}

