# Vaidol Python ML Service

HTTP API service providing TTS, RVC, ASR, Agent, and VAD functionality for Vaidol.

## Endpoints

- `POST /tts/synthesize` - Text-to-speech synthesis
- `POST /rvc/convert` - Voice conversion
- `POST /asr/transcribe` - Speech recognition
- `POST /agent/chat` - LLM chat
- `GET /health` - Health check

## Running

```bash
# Install dependencies
pip install -r requirements.txt

# Run
python main.py
```

## Docker

See `../docker-compose.yml` for full setup.

