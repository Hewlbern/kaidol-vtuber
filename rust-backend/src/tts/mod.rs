pub mod interface;
pub mod client;
pub mod factory;

pub use interface::{TTSInterface, TTSRequest, TTSResponse};
pub use client::TTSClient;
pub use factory::TTSFactory;
