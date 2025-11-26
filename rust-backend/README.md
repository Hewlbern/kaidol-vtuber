# Vaidol Rust Backend

Lightweight Rust backend for Vaidol VTuber system. Handles WebSocket connections, REST API, and state management. ML services (TTS, RVC, ASR, Agent) run in a separate Python service.

## Architecture

- **Rust Backend**: WebSocket server, REST API, state management
- **Python Service**: TTS, RVC, ASR, Agent, VAD (HTTP API)

## Building

```bash
cargo build --release
```

## Running

```bash
# Set Python service URL (default: http://localhost:8000)
export PYTHON_SERVICE_URL=http://localhost:8000

# Run
cargo run
```

## Docker

See `../docker-compose.yml` for full setup with Python service.

