# Rust Porting Assessment for Tauri Integration

## Executive Summary

**Overall Difficulty: Medium to High** (6-8 weeks for experienced Rust developer)

Porting the Python backend to Rust for Tauri integration is **feasible** with a hybrid approach. The architecture can be split into:
- **Rust Core** (WebSocket server, routing, state management, business logic)
- **Python Services** (TTS, RVC, ML models, ASR) - kept as subprocess services
- **Tauri Integration** (Frontend + Rust backend in single app)

---

## Architecture Overview

### Current Python Backend Structure

```
backend/src/open_llm_vtuber/
├── server.py              # FastAPI app, routing, static files
├── websocket_handler.py   # WebSocket connection management
├── routes.py              # REST + WebSocket endpoints
├── service_context.py     # Service initialization & state
├── chat_group.py          # Group management logic
├── autonomous_message_generator.py
├── tts/                   # ⚠️ Keep in Python
├── rvc/                   # ⚠️ Keep in Python
├── asr/                   # ⚠️ Keep in Python
├── agent/                 # ⚠️ Keep in Python (LLM integrations)
├── vad/                   # ⚠️ Keep in Python
└── config_manager/        # ✅ Port to Rust
```

---

## Porting Strategy: Hybrid Approach

### ✅ **Port to Rust** (Core Infrastructure)

#### 1. **WebSocket Server & Routing** (High Priority)
- **Current**: FastAPI + Uvicorn ASGI server
- **Rust**: Use `tokio-tungstenite` or `axum` with WebSocket support
- **Difficulty**: Medium
- **Effort**: 1-2 weeks
- **Benefits**: 
  - Better performance and memory safety
  - Native async/await support
  - Lower latency for WebSocket connections

**Key Components to Port:**
- `websocket_handler.py` → Rust WebSocket handler
- `chat_group.py` → Rust state management
- Connection lifecycle management
- Message routing and broadcasting

#### 2. **REST API Routes** (High Priority)
- **Current**: FastAPI routes in `routes.py`
- **Rust**: Use `axum` or `actix-web`
- **Difficulty**: Medium
- **Effort**: 1 week
- **Benefits**: Type-safe routing, better performance

**Routes to Port:**
- `/api/expression` - Expression control
- `/api/motion` - Motion control
- `/api/config` - Configuration management
- `/api/autonomous` - Autonomous mode control
- Static file serving (for Live2D models, backgrounds, etc.)

#### 3. **State Management** (Medium Priority)
- **Current**: Python dictionaries and classes
- **Rust**: Use `Arc<Mutex<>>` or `Arc<RwLock<>>` for shared state
- **Difficulty**: Medium-High (Rust ownership/borrowing)
- **Effort**: 1 week
- **Benefits**: Thread-safe, memory-safe state management

**Components:**
- `ChatGroupManager` → Rust struct with `HashMap`/`DashMap`
- Client connection tracking
- Service context caching
- Configuration state

#### 4. **Configuration Management** (Medium Priority)
- **Current**: YAML parsing with Pydantic models
- **Rust**: Use `serde` + `serde_yaml` or `config-rs`
- **Difficulty**: Low-Medium
- **Effort**: 3-5 days
- **Benefits**: Type-safe configuration, compile-time validation

#### 5. **Message Handling & Routing** (Medium Priority)
- **Current**: Python message handlers dictionary
- **Rust**: Use enum-based message types with pattern matching
- **Difficulty**: Medium
- **Effort**: 1 week
- **Benefits**: Exhaustive pattern matching, type safety

---

### ⚠️ **Keep in Python** (ML/AI Services)

#### 1. **TTS (Text-to-Speech)** - Keep in Python
**Why:**
- Heavy dependency on Python ML libraries:
  - `torch`, `torchaudio`
  - `librosa`, `soundfile`
  - `edge-tts`, `azure-cognitiveservices-speech`
  - Multiple TTS providers (15+ implementations)
- Complex model loading and inference
- Frequent updates to TTS libraries

**Integration Strategy:**
- Run as Python subprocess/service
- Communicate via:
  - **Option A**: HTTP API (Python FastAPI microservice)
  - **Option B**: gRPC (better performance)
  - **Option C**: Unix domain sockets (lowest latency)
  - **Option D**: Message queue (Redis/RabbitMQ) for async processing

**Recommended**: HTTP API or gRPC for simplicity and performance

#### 2. **RVC (Retrieval-based Voice Conversion)** - Keep in Python
**Why:**
- Deep PyTorch dependencies
- Complex model pipeline (Hubert, RMVPE, synthesizer)
- JIT compilation optimizations
- Model caching system
- Heavy GPU/CPU computation

**Integration Strategy:**
- Same as TTS (subprocess/service)
- Can share same Python service with TTS

#### 3. **ASR (Automatic Speech Recognition)** - Keep in Python
**Why:**
- Uses `sherpa-onnx`, `whisper`, `silero-vad`
- Audio processing libraries (`librosa`, `soundfile`)
- Model inference pipelines

**Integration Strategy:**
- Part of Python ML service

#### 4. **Agent/LLM Engine** - Keep in Python
**Why:**
- Multiple LLM provider integrations:
  - OpenAI, Anthropic, Groq, Ollama, etc.
- Complex prompt engineering
- Memory management (mem0, vector stores)
- Streaming response handling
- Python-specific libraries (`langchain`, `anthropic`, `openai`)

**Integration Strategy:**
- Python service with HTTP/gRPC API
- Rust backend makes HTTP requests to Python agent service

#### 5. **VAD (Voice Activity Detection)** - Keep in Python
**Why:**
- Uses `silero-vad`, `torch`
- Audio processing dependencies

**Integration Strategy:**
- Part of Python ML service

---

## Tauri Integration Architecture

### Proposed Structure

```
vaidol-tauri/
├── src-tauri/
│   ├── src/
│   │   ├── main.rs              # Tauri entry point
│   │   ├── websocket.rs         # WebSocket server
│   │   ├── routes.rs             # REST API routes
│   │   ├── state.rs              # State management
│   │   ├── config.rs             # Configuration
│   │   ├── python_service.rs     # Python service client
│   │   └── handlers/             # Message handlers
│   ├── Cargo.toml
│   └── tauri.conf.json
├── frontend/                     # Next.js frontend (existing)
│   └── (current structure)
└── python-services/             # Python ML services
    ├── tts_service.py
    ├── rvc_service.py
    ├── asr_service.py
    └── agent_service.py
```

### Communication Flow

```
┌─────────────────────────────────────────────────────────┐
│                    Tauri Application                    │
│                                                          │
│  ┌──────────────┐         ┌──────────────┐            │
│  │   Frontend   │◄───────►│  Rust Core   │            │
│  │  (Next.js)   │  IPC    │  (Tauri)     │            │
│  └──────────────┘         └──────┬───────┘            │
│                                   │                     │
│                                   │ HTTP/gRPC          │
│                                   ▼                     │
│                          ┌──────────────┐             │
│                          │   Python     │             │
│                          │ ML Services  │             │
│                          │  (TTS/RVC/   │             │
│                          │   ASR/Agent) │             │
│                          └──────────────┘             │
└─────────────────────────────────────────────────────────┘
```

### Tauri Commands (Frontend ↔ Rust)

```rust
// Example Tauri commands
#[tauri::command]
async fn send_expression(expression: ExpressionCommand) -> Result<()> {
    // Handle expression command
}

#[tauri::command]
async fn get_config() -> Result<Config> {
    // Return configuration
}

#[tauri::command]
async fn start_autonomous_mode() -> Result<()> {
    // Start autonomous message generation
}
```

### WebSocket in Tauri

**Option 1: Rust WebSocket Server (Recommended)**
- Run WebSocket server in Rust backend
- Frontend connects via `ws://localhost:port`
- Better performance, native integration

**Option 2: Tauri IPC for Real-time**
- Use Tauri events for real-time updates
- Simpler but less standard (not WebSocket protocol)

---

## Implementation Phases

### Phase 1: Foundation (2-3 weeks)
1. ✅ Set up Tauri project structure
2. ✅ Port configuration management to Rust
3. ✅ Port basic REST API routes
4. ✅ Set up Python service communication layer

### Phase 2: WebSocket & State (2-3 weeks)
1. ✅ Port WebSocket handler to Rust
2. ✅ Port chat group management
3. ✅ Port message routing
4. ✅ Implement state management

### Phase 3: Python Integration (1-2 weeks)
1. ✅ Create Python service wrapper
2. ✅ Implement HTTP/gRPC client in Rust
3. ✅ Port conversation handling
4. ✅ Test end-to-end flow

### Phase 4: Frontend Integration (1 week)
1. ✅ Integrate Next.js frontend into Tauri
2. ✅ Update WebSocket connections
3. ✅ Test UI interactions
4. ✅ Polish and optimization

### Phase 5: Autonomous Mode & Advanced Features (1-2 weeks)
1. ✅ Port autonomous message generator
2. ✅ Port chat platform integrations
3. ✅ Port expression/motion API
4. ✅ Final testing and bug fixes

**Total Estimated Time: 7-11 weeks** (for experienced Rust developer)

---

## Challenges & Solutions

### Challenge 1: Python ↔ Rust Communication
**Problem**: Need efficient, low-latency communication between Rust and Python services.

**Solutions:**
- **gRPC** (Recommended): Type-safe, efficient, streaming support
- **HTTP with async**: Simple, easy to debug
- **Message queue**: For async processing (Redis/RabbitMQ)
- **Shared memory**: For high-performance scenarios (advanced)

### Challenge 2: Async State Management
**Problem**: Rust's ownership system makes shared mutable state complex.

**Solutions:**
- Use `Arc<RwLock<>>` for read-heavy workloads
- Use `Arc<Mutex<>>` for write-heavy workloads
- Consider `DashMap` for concurrent hash maps
- Use channels (`tokio::sync::mpsc`) for message passing

### Challenge 3: Error Handling
**Problem**: Python exceptions vs Rust `Result` types.

**Solutions:**
- Use `anyhow` or `thiserror` for error handling
- Convert Python exceptions to Rust errors in service layer
- Implement proper error propagation

### Challenge 4: Type Safety
**Problem**: Python's dynamic typing vs Rust's static typing.

**Solutions:**
- Use `serde` for JSON serialization/deserialization
- Define clear API contracts between Rust and Python
- Use code generation for API clients (gRPC)

### Challenge 5: Frontend Integration
**Problem**: Next.js frontend needs to work in Tauri.

**Solutions:**
- Tauri supports web frontends natively
- Use Tauri IPC for backend communication
- Keep WebSocket for real-time features (or use Tauri events)
- Update API endpoints to use Tauri commands where appropriate

---

## Python Service Architecture

### Recommended: Single Python Service

```python
# python-services/main_service.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

# TTS endpoints
@app.post("/tts/synthesize")
async def synthesize_text(text: str, voice: str):
    # TTS logic
    pass

# RVC endpoints
@app.post("/rvc/convert")
async def convert_voice(audio: bytes, model: str):
    # RVC logic
    pass

# ASR endpoints
@app.post("/asr/transcribe")
async def transcribe_audio(audio: bytes):
    # ASR logic
    pass

# Agent endpoints
@app.post("/agent/chat")
async def chat(messages: List[dict]):
    # Agent logic
    pass
```

### Rust Client

```rust
// src/python_service.rs
use reqwest::Client;

pub struct PythonServiceClient {
    client: Client,
    base_url: String,
}

impl PythonServiceClient {
    pub async fn synthesize(&self, text: &str, voice: &str) -> Result<Vec<u8>> {
        // HTTP request to Python service
    }
    
    pub async fn convert_voice(&self, audio: &[u8], model: &str) -> Result<Vec<u8>> {
        // HTTP request to Python service
    }
}
```

---

## Performance Considerations

### Advantages of Rust Port
- **Lower Memory Usage**: Rust's zero-cost abstractions
- **Better Concurrency**: Native async/await, no GIL
- **Faster Startup**: No Python interpreter overhead
- **Better Resource Management**: Automatic cleanup

### Python Service Overhead
- **HTTP/gRPC Latency**: ~1-5ms per call (acceptable for TTS/RVC)
- **Process Startup**: Python service runs continuously (no startup overhead)
- **Memory**: Python services can be memory-intensive (models)

### Optimization Strategies
1. **Connection Pooling**: Reuse HTTP connections to Python service
2. **Async Processing**: Process TTS/RVC in background
3. **Caching**: Cache TTS results for repeated text
4. **Batch Processing**: Batch multiple requests when possible

---

## Migration Path

### Incremental Migration Strategy

1. **Phase 1**: Keep Python backend, add Rust WebSocket server alongside
2. **Phase 2**: Move routing to Rust, Python handles ML services
3. **Phase 3**: Move state management to Rust
4. **Phase 4**: Integrate into Tauri, add frontend
5. **Phase 5**: Remove old Python backend, keep only ML services

This allows testing at each phase without breaking existing functionality.

---

## Dependencies & Tools

### Rust Crates Needed
- `tokio` - Async runtime
- `axum` or `actix-web` - Web framework
- `tokio-tungstenite` - WebSocket support
- `serde` + `serde_json` - Serialization
- `reqwest` - HTTP client (for Python services)
- `anyhow` / `thiserror` - Error handling
- `dashmap` - Concurrent hash maps
- `tauri` - Tauri framework

### Python Service Dependencies
- Keep existing dependencies
- Add FastAPI for service API (if not using gRPC)
- Add gRPC (optional, for better performance)

---

## Code Size Comparison

### Current Python Backend
- **Total Lines**: ~15,000+ lines
- **Core Logic**: ~8,000 lines (portable)
- **ML Services**: ~7,000 lines (keep in Python)

### Estimated Rust Backend
- **Core Logic**: ~5,000-6,000 lines (more concise)
- **Python Service Client**: ~500-1,000 lines
- **Total**: ~6,000-7,000 lines

**Rust code is typically 30-50% more concise** due to:
- Pattern matching
- Type system
- No need for defensive programming
- Better abstractions

---

## Testing Strategy

1. **Unit Tests**: Test Rust components in isolation
2. **Integration Tests**: Test Rust ↔ Python communication
3. **E2E Tests**: Test full flow with frontend
4. **Performance Tests**: Benchmark against Python backend

---

## Advantages of Hybrid Architecture

### 1. **Separation of Concerns**
The hybrid structure creates clear boundaries between different system responsibilities:

- **Rust Core**: Handles I/O, networking, state management, business logic
- **Python Services**: Handles ML model inference, audio processing, LLM interactions
- **Frontend**: Handles UI, user interactions, Live2D rendering

**Benefits:**
- ✅ **Independent Scaling**: Scale Rust backend and Python services separately
- ✅ **Technology Flexibility**: Use best tool for each job (Rust for performance, Python for ML)
- ✅ **Easier Maintenance**: Changes to ML services don't affect core infrastructure
- ✅ **Team Specialization**: ML engineers work in Python, backend engineers work in Rust

### 2. **Performance Optimization**
- **Rust Core**: 
  - Lower latency for WebSocket connections (~10-50μs vs ~1-5ms in Python)
  - Better memory efficiency (no GIL, zero-cost abstractions)
  - Faster startup time (no Python interpreter overhead)
  - Better concurrency (native async, no GIL limitations)
  
- **Python Services**:
  - Can be optimized independently (GPU allocation, model caching)
  - Can run on different machines/containers for distributed processing
  - Can use specialized Python ML optimizations (PyTorch JIT, ONNX Runtime)

### 3. **Resource Management**
- **Rust Core**: Lightweight, handles thousands of concurrent connections efficiently
- **Python Services**: Can be scaled horizontally based on ML workload
- **Memory Isolation**: Python services can be restarted without affecting Rust core
- **GPU Isolation**: Python services can have dedicated GPU access

### 4. **Development Workflow**
- **Faster Iteration**: Rust core compiles quickly, Python services can hot-reload
- **Better Testing**: Test Rust and Python components independently
- **Easier Debugging**: Clear separation makes issues easier to isolate
- **Version Management**: Update ML models without touching core infrastructure

### 5. **Deployment Flexibility**
- **Monolithic**: Can run everything in one process (Tauri app)
- **Microservices**: Can split into separate services for production
- **Hybrid**: Mix and match based on deployment needs
- **Cloud-Native**: Easy to containerize and deploy to Kubernetes

### 6. **Technology Ecosystem**
- **Rust**: Access to high-performance Rust ecosystem (tokio, axum, etc.)
- **Python**: Access to entire Python ML ecosystem (PyTorch, transformers, etc.)
- **No Compromises**: Don't have to choose one over the other

### 7. **Future-Proofing**
- **ML Model Updates**: Update Python services without touching Rust code
- **Performance Tuning**: Optimize Rust core independently from ML services
- **New ML Libraries**: Easy to integrate new Python ML libraries
- **Rust Improvements**: Benefit from Rust ecosystem improvements

---

## Dockerization Benefits

### Current Docker Challenges

The current monolithic Python Docker setup has several limitations:

1. **Large Image Size**: 
   - Current Dockerfile includes CUDA, PyTorch, all ML dependencies
   - Image size: ~5-10GB+
   - Slow builds and deployments

2. **Single Point of Failure**:
   - If ML service crashes, entire backend goes down
   - Can't scale components independently
   - Resource contention between services

3. **Deployment Complexity**:
   - Must rebuild entire image for any change
   - Can't update ML models without redeploying backend
   - Difficult to A/B test different ML models

4. **Resource Allocation**:
   - Can't allocate GPU resources separately
   - Memory usage not optimized (Python GIL limitations)
   - CPU resources shared between all components

### Hybrid Architecture Dockerization

The hybrid structure makes Dockerization **significantly better**:

#### 1. **Multi-Stage Builds & Smaller Images**

**Rust Core Container** (Lightweight):
```dockerfile
# Dockerfile.rust
FROM rust:1.75-slim AS builder
WORKDIR /app
COPY Cargo.toml Cargo.lock ./
COPY src ./src
RUN cargo build --release

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=builder /app/target/release/vaidol-backend /usr/local/bin/
EXPOSE 12393
CMD ["vaidol-backend"]
```
- **Size**: ~50-100MB (vs 5-10GB current)
- **Build Time**: ~2-5 minutes (vs 30-60 minutes current)
- **Startup Time**: <100ms (vs 5-10 seconds current)

**Python ML Services Container** (Specialized):
```dockerfile
# Dockerfile.python-ml
FROM nvidia/cuda:12.6.0-cudnn-runtime-ubuntu22.04
# ... Python ML dependencies only ...
```
- **Size**: ~3-5GB (only ML dependencies)
- **Can be cached**: Rebuild only when ML dependencies change
- **GPU Support**: Dedicated GPU access

#### 2. **Docker Compose Architecture**

```yaml
# docker-compose.yml
version: '3.8'

services:
  # Rust Core Backend (Lightweight, Fast)
  rust-backend:
    build:
      context: ./rust-backend
      dockerfile: Dockerfile
    ports:
      - "12393:12393"
    environment:
      - PYTHON_SERVICE_URL=http://python-ml:8000
    depends_on:
      - python-ml
    restart: unless-stopped
    # Small resource footprint
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 512M

  # Python ML Services (Heavy, GPU-enabled)
  python-ml:
    build:
      context: ./python-services
      dockerfile: Dockerfile
    ports:
      - "8000:8000"
    environment:
      - CUDA_VISIBLE_DEVICES=0
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
        limits:
          cpus: '4'
          memory: 8G
    restart: unless-stopped

  # Optional: Separate services for different ML tasks
  python-tts:
    build:
      context: ./python-services
      dockerfile: Dockerfile.tts
    # ... TTS-specific configuration ...
  
  python-rvc:
    build:
      context: ./python-services
      dockerfile: Dockerfile.rvc
    # ... RVC-specific configuration ...
```

**Benefits:**
- ✅ **Independent Scaling**: Scale Rust backend and Python services separately
- ✅ **Resource Isolation**: GPU resources dedicated to ML services
- ✅ **Faster Deployments**: Only rebuild changed services
- ✅ **Better Resource Usage**: Allocate resources based on actual needs

#### 3. **Development vs Production**

**Development (Docker Compose)**:
- Run everything locally with `docker-compose up`
- Hot-reload for both Rust and Python
- Easy to test different configurations

**Production (Kubernetes)**:
```yaml
# kubernetes deployment example
apiVersion: apps/v1
kind: Deployment
metadata:
  name: rust-backend
spec:
  replicas: 3  # Scale Rust backend independently
  template:
    spec:
      containers:
      - name: backend
        image: vaidol/rust-backend:latest
        resources:
          requests:
            memory: "256Mi"
            cpu: "500m"
          limits:
            memory: "512Mi"
            cpu: "2000m"
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: python-ml
spec:
  replicas: 2  # Scale ML services independently
  template:
    spec:
      containers:
      - name: ml-service
        image: vaidol/python-ml:latest
        resources:
          requests:
            memory: "4Gi"
            cpu: "2000m"
            nvidia.com/gpu: 1
          limits:
            memory: "8Gi"
            cpu: "4000m"
            nvidia.com/gpu: 1
```

#### 4. **Build Optimization**

**Current (Monolithic)**:
- Build time: 30-60 minutes
- Rebuild entire image for any change
- Large image size: 5-10GB
- Slow deployments

**Hybrid (Separate Services)**:
- **Rust Core**: Build time: 2-5 minutes, Image: 50-100MB
- **Python ML**: Build time: 10-20 minutes, Image: 3-5GB
- **Total**: Can build in parallel, faster overall
- **Caching**: Better Docker layer caching (Rust changes don't rebuild Python)

#### 5. **Deployment Strategies**

**Option A: Single Container (Tauri Desktop App)**
- Rust core + Python services in one container
- Good for desktop applications
- Simpler deployment

**Option B: Multi-Container (Microservices)**
- Separate containers for Rust and Python
- Better for cloud/server deployments
- Independent scaling and updates

**Option C: Hybrid (Best of Both)**
- Rust core in main container
- Python services as sidecar containers
- Flexible deployment options

#### 6. **CI/CD Improvements**

**Current**:
```yaml
# .github/workflows/docker.yml (current)
- Build entire monolithic image (30-60 min)
- Push large image (5-10GB)
- Deploy everything together
```

**Hybrid**:
```yaml
# .github/workflows/docker.yml (hybrid)
- Build Rust backend (2-5 min) → Small image (50-100MB)
- Build Python ML service (10-20 min) → Cached layers
- Build in parallel → Faster overall
- Deploy independently → More flexible
```

#### 7. **Resource Efficiency**

**Current Monolithic Container**:
- Memory: 2-4GB (Python + all services)
- CPU: Shared between all components
- GPU: Shared, potential conflicts
- Startup: 5-10 seconds

**Hybrid Containers**:
- **Rust Core**: Memory: 50-200MB, CPU: 1-2 cores, Startup: <100ms
- **Python ML**: Memory: 2-4GB, CPU: 2-4 cores, GPU: Dedicated, Startup: 3-5 seconds
- **Total**: Better resource utilization, faster startup for core

#### 8. **Monitoring & Observability**

**Current**:
- Single container, harder to monitor individual components
- Resource usage mixed together

**Hybrid**:
- Separate metrics for Rust core and Python services
- Better observability (Prometheus, Grafana)
- Easier to identify bottlenecks
- Independent health checks

#### 9. **Security Benefits**

- **Isolation**: Python services can run with restricted permissions
- **Attack Surface**: Rust core has smaller attack surface
- **Updates**: Update Python ML services without touching Rust core
- **Secrets**: Manage secrets separately for each service

#### 10. **Testing & Quality Assurance**

**Current**:
- Must test entire system together
- Hard to mock individual components
- Slow integration tests

**Hybrid**:
- Test Rust core independently (unit tests, integration tests)
- Test Python services independently
- Mock Python services when testing Rust core
- Faster test execution

---

## Docker Architecture Recommendations

### Recommended Structure

```
vaidol/
├── docker/
│   ├── rust-backend/
│   │   └── Dockerfile          # Lightweight Rust backend
│   ├── python-ml/
│   │   ├── Dockerfile          # Python ML services
│   │   ├── Dockerfile.tts      # TTS-specific (optional)
│   │   └── Dockerfile.rvc      # RVC-specific (optional)
│   └── docker-compose.yml      # Development setup
├── docker-compose.prod.yml     # Production setup
└── k8s/                        # Kubernetes manifests (optional)
    ├── rust-backend.yaml
    └── python-ml.yaml
```

### Development Docker Compose

```yaml
# docker-compose.yml (Development)
version: '3.8'

services:
  rust-backend:
    build:
      context: ./rust-backend
      dockerfile: docker/rust-backend/Dockerfile
    ports:
      - "12393:12393"
    volumes:
      - ./rust-backend/src:/app/src  # Hot reload
      - ./config:/app/config
    environment:
      - RUST_LOG=debug
      - PYTHON_SERVICE_URL=http://python-ml:8000
    depends_on:
      - python-ml

  python-ml:
    build:
      context: ./python-services
      dockerfile: docker/python-ml/Dockerfile
    ports:
      - "8000:8000"
    volumes:
      - ./python-services:/app  # Hot reload
      - ./models:/app/models
      - ./cache:/app/cache
    environment:
      - PYTHONUNBUFFERED=1
    # GPU support (if available)
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
```

### Production Docker Compose

```yaml
# docker-compose.prod.yml (Production)
version: '3.8'

services:
  rust-backend:
    image: vaidol/rust-backend:${VERSION:-latest}
    restart: always
    ports:
      - "12393:12393"
    environment:
      - PYTHON_SERVICE_URL=http://python-ml:8000
    deploy:
      replicas: 2
      resources:
        limits:
          cpus: '2'
          memory: 512M
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:12393/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  python-ml:
    image: vaidol/python-ml:${VERSION:-latest}
    restart: always
    ports:
      - "8000:8000"
    deploy:
      replicas: 1
      resources:
        limits:
          cpus: '4'
          memory: 8G
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
```

---

## Conclusion

**Feasibility: ✅ Highly Feasible**

The hybrid approach (Rust core + Python ML services) is the **optimal strategy** because:

1. ✅ **Leverages Rust strengths**: Performance, safety, concurrency
2. ✅ **Keeps Python ML ecosystem**: No need to rewrite complex ML code
3. ✅ **Tauri integration**: Native desktop app with web frontend
4. ✅ **Incremental migration**: Can be done gradually
5. ✅ **Best of both worlds**: Rust performance + Python ML libraries
6. ✅ **Better Dockerization**: Smaller images, faster builds, independent scaling
7. ✅ **Production-ready**: Microservices architecture, cloud-native
8. ✅ **Developer experience**: Faster iteration, better testing, easier debugging

**Dockerization Benefits Summary:**
- 🐳 **90% smaller Rust images** (50-100MB vs 5-10GB)
- ⚡ **10x faster builds** (2-5 min vs 30-60 min for core)
- 🚀 **100x faster startup** (<100ms vs 5-10 seconds)
- 📦 **Independent scaling** of components
- 🔧 **Better resource management** (GPU isolation, memory optimization)
- 🧪 **Easier testing** (test components independently)
- 🔒 **Better security** (isolation, smaller attack surface)

**Recommended Next Steps:**
1. Create proof-of-concept Rust WebSocket server
2. Set up Python service API
3. Test communication between Rust and Python
4. Create Docker setup with separate containers
5. Begin incremental porting of core logic
6. Integrate frontend into Tauri

**Estimated Timeline**: 7-11 weeks for full migration (depending on experience level)

