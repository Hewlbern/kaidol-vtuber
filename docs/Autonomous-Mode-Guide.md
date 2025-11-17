# Autonomous Mode Guide

## Overview

Autonomous mode enables the VTuber character to automatically generate responses and send random messages without user input. This creates a more interactive and engaging experience.

## Features

1. **Automatic Responses**: The character automatically responds to user messages sent via WebSocket (`text-input` messages)
2. **Random Messages**: Periodically generates and sends random chat messages (default: every 30 seconds)
3. **Configurable**: Can be enabled/disabled and interval adjusted via API

## How It Works

### Automatic Responses

When autonomous mode is active, the character automatically responds to:
- Text messages sent via WebSocket (`type: "text-input"`)
- Microphone audio input (when audio processing completes)

The system processes these inputs through the agent engine and generates appropriate responses with TTS (Text-to-Speech) and character animations.

### Random Message Generation

The autonomous message generator periodically:
1. Selects a random prompt from a predefined list
2. Generates a response using the agent engine
3. Sends the message to all connected WebSocket clients
4. The message appears in the UI chat interface

**Interval**: Messages are generated at random intervals between:
- **Minimum**: 2 minutes (120 seconds)
- **Maximum**: 4 minutes (240 seconds)

This creates a more natural, less predictable conversation flow.

## Activation

### Default Behavior

Autonomous mode is **disabled by default** and must be activated manually. The autonomous message generator:
- Starts on server startup but remains disabled
- Does not generate random messages until activated
- Automatic responses to user messages still work (this is always enabled)

### Activating Autonomous Mode

To activate autonomous mode and enable random message generation:

```bash
curl -X POST http://localhost:12393/api/autonomous/control \
  -H "Content-Type: application/json" \
  -d '{"enabled": true}'
```

This will enable the random message generator, which will start generating messages at random intervals between 2-4 minutes (configurable).

### Checking Status

Check the current status of autonomous mode:

```bash
curl http://localhost:12393/api/autonomous/status
```

Response:
```json
{
  "mode": "autonomous",
  "active": true,
  "character": "Your Character Name",
  "character_id": "character-uid",
  "autonomous_generator_enabled": true,
  "autonomous_generator_interval": 30.0,
  "auto_responses_enabled": true
}
```

### Controlling Autonomous Mode

#### Enable/Disable Random Messages

Disable random message generation:
```bash
curl -X POST http://localhost:12393/api/autonomous/control \
  -H "Content-Type: application/json" \
  -d '{"enabled": false}'
```

Enable random message generation:
```bash
curl -X POST http://localhost:12393/api/autonomous/control \
  -H "Content-Type: application/json" \
  -d '{"enabled": true}'
```

#### Change Message Interval Range

Set the minimum and maximum intervals between random messages (in seconds):
```bash
curl -X POST http://localhost:12393/api/autonomous/control \
  -H "Content-Type: application/json" \
  -d '{"min_interval": 180.0, "max_interval": 360.0}'
```

This sets the interval range to 3-6 minutes (180-360 seconds).

#### Combined Control

You can set enabled state and interval range in one request:
```bash
curl -X POST http://localhost:12393/api/autonomous/control \
  -H "Content-Type: application/json" \
  -d '{"enabled": true, "min_interval": 120.0, "max_interval": 300.0}'
```

This enables autonomous mode with messages every 2-5 minutes.

## Usage Examples

### Example 1: User Sends Text Message

1. User sends a message via WebSocket:
```json
{
  "type": "text-input",
  "text": "Hello, how are you?"
}
```

2. System automatically:
   - Processes the message through the agent engine
   - Generates an appropriate response
   - Converts response to speech (TTS)
   - Sends audio and text back to the client
   - Character speaks and animates

3. Response appears in the UI chat interface

### Example 2: Random Message Generation

1. Every 30 seconds (or configured interval), the system:
   - Selects a random prompt (e.g., "Say something interesting about yourself")
   - Generates a response
   - Sends it to all connected clients

2. The message appears in the chat UI as an autonomous message

### Example 3: Microphone Input

1. User speaks into microphone
2. Audio is processed and transcribed
3. System automatically generates a response
4. Character responds with speech and animation

## API Endpoints

### GET `/api/autonomous/status`

Get the current status of autonomous mode.

**Response:**
```json
{
  "mode": "autonomous",
  "active": true,
  "character": "Character Name",
  "character_id": "character-uid",
  "autonomous_generator_enabled": true,
  "autonomous_generator_interval": 120.0,
  "min_interval_seconds": 120.0,
  "max_interval_seconds": 240.0,
  "auto_responses_enabled": true
}
```

### POST `/api/autonomous/control`

Control autonomous mode settings.

**Request Body:**
```json
{
  "enabled": true,         // Optional: Enable/disable random message generator
  "interval": 120.0,       // Optional: Set base interval in seconds
  "min_interval": 120.0,   // Optional: Set minimum interval (default: 120 seconds)
  "max_interval": 240.0    // Optional: Set maximum interval (default: 240 seconds)
}
```

**Response:**
```json
{
  "status": "success",
  "enabled": true,
  "interval": 120.0,
  "min_interval": 120.0,
  "max_interval": 240.0
}
```

### POST `/api/autonomous/generate`

Generate text autonomously using the agent engine.

**Request Body:**
```json
{
  "prompt": "Say something interesting",
  "context": {}  // Optional: Additional context
}
```

**Response:**
```json
{
  "text": "Generated response text...",
  "metadata": {
    "character": "Character Name",
    "model": "model-name"
  }
}
```

### POST `/api/autonomous/speak`

Send a pre-generated message for the character to speak (external API endpoint).

**Request Body:**
```json
{
  "text": "Hello everyone!",
  "expressions": [3],
  "motions": [{"group": "idle", "index": 0}],
  "client_uid": "default",
  "skip_tts": false
}
```

## Configuration

### Server Configuration

The autonomous message generator is configured in `server.py`:

```python
self.autonomous_generator = AutonomousMessageGenerator(
    default_context=default_context_cache,
    ws_handler=ws_handler,
    interval_seconds=30.0,  # Interval between messages
    enabled=True           # Enabled by default
)
```

### Customizing Prompts

Edit `autonomous_message_generator.py` to customize the random prompts:

```python
self.prompts = [
    "Say something interesting about yourself",
    "Share a random thought",
    "What's on your mind?",
    # Add your custom prompts here
]
```

## Troubleshooting

### Random Messages Not Appearing

1. Check if autonomous mode is enabled:
   ```bash
   curl http://localhost:12393/api/autonomous/status
   ```

2. Verify `autonomous_generator_enabled` is `true`

3. Check server logs for errors

### Automatic Responses Not Working

1. Ensure WebSocket connection is established
2. Verify messages are being sent with `type: "text-input"`
3. Check server logs for processing errors
4. Verify agent engine is properly configured

### Adjusting Message Frequency

- **More frequent**: Reduce min/max intervals (e.g., `{"min_interval": 60.0, "max_interval": 120.0}`)
- **Less frequent**: Increase min/max intervals (e.g., `{"min_interval": 300.0, "max_interval": 600.0}`)
- **Disable**: Set `{"enabled": false}`

**Note**: The system uses random intervals between min and max, so messages won't be perfectly predictable.

## Notes

- Automatic responses are **always enabled** when autonomous mode is active
- Random message generation can be toggled independently
- Messages are sent to **all connected WebSocket clients**
- The character uses the configured agent engine and TTS engine for responses
- Random messages use prompts designed to generate engaging, character-appropriate responses

