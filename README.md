# AIdol-Vtuber: VTuber Platform

**⚠️ Work in Progress (WIP)** - This project is actively under development.

AIdol-Vtuber is an AI-powered VTuber platform designed to integrate with Twitch and other livestreaming services. The platform provides Live2D character support, real-time WebSocket communication, and comprehensive livestreaming capabilities for creating interactive AI VTuber experiences.

## Platform Overview

This platform is designed to hook into Twitch and other livestreaming services, providing a complete solution for AI-driven VTuber interactions. It integrates with the [Hiero network](https://character.hiero.gl) (integration status: TBD), enabling seamless character interactions across the network.

### Related Projects

- **[character.hiero.gl](https://character.hiero.gl)** - Example implementation and character showcase
- **[szar.ourosociety.com](https://szar.ourosociety.com)** - Project resources and documentation
- **[ourosociety.com](https://ourosociety.com)** - Main project website
- **[Voice Model Platform](https://v0-voice-model-ux.vercel.app/)** - Voice model marketplace and management

### Coming Soon

- **Character Models Marketplace**: Browse and purchase Live2D character models designed specifically for the AIdol-Vtuber platform
- **Voice Library**: Access a curated collection of voice models and TTS options optimized for VTuber interactions

### Important Notice

**⚠️ Proprietary Models**: The Live2D models and character assets included in this repository are proprietary and protected by copyright. These models may not be copied, distributed, or used without explicit consent and payment. Unauthorized use of these models is strictly prohibited.

## Quick Start

### Run Both Services (Recommended)

Use the provided script to run both frontend and backend together:

```bash
python run_dev.py
```

This will start:
- Frontend at `http://localhost:3000`
- Backend WebSocket at `ws://localhost:12393/client-ws`

Press `Ctrl+C` to stop both services.

### Run Services Separately

#### Frontend

```bash
cd frontend
npm install
npm run dev
```

The frontend will be available at `http://localhost:3000`

#### Backend

The backend (orphiq) is located in the `backend/` directory. See `backend/README.md` for details.

```bash
cd backend
python cli.py run
```

The backend WebSocket server runs at `ws://localhost:12393/client-ws`

## Features

- **Live2D Character Rendering**: Full support for Live2D models with expressions and motions
- **Real-time Communication**: WebSocket-based communication with backend
- **Character Control**: Expression and motion control via API
- **Audio Integration**: TTS, ASR, and lip-sync support
- **Twitch Streaming**: Architecture for Twitch livestreaming (see docs)

## Project Structure

```
vaidol/
├── frontend/          # Next.js frontend application
├── backend/           # Backend services (orphiq reference)
└── docs/              # Documentation
```

## Documentation

### Architecture

- [Architecture Overview](docs/ARCHITECTURE.md) - Complete system architecture and component interactions

### Feature Documentation

- [Twitch Livestreaming Architecture](docs/Twitch-Livestreaming-Architecture.md) - Complete architecture for Twitch integration
- [Expression and Motion System](docs/ExpressionAndMotion.md) - Character animation system
- [Audio Processing Architecture](docs/Audio-Processing-Architecture.md) - Audio system documentation
- [Live2D Model Loading](docs/Live2D-Model-Loading-Architecture.md) - Model loading system

## License

[Apache License 2.0](LICENSE) - Copyright 2024 Michael Holborn (mikeholborn1990@gmail.com)

This project is licensed under the Apache License 2.0, which means you can:
- Use the software for commercial purposes
- Modify the software and create derivative works
- Distribute copies and modifications
- Place warranty on the software

The complete license text can be found in the [LICENSE](LICENSE) file.

**Note**: While the software code is licensed under Apache 2.0, the Live2D models and character assets remain proprietary and are not covered by this license. See the [Important Notice](#important-notice) above for details.
