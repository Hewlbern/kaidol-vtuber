# Backend-Frontend Expression Integration

## Overview

This document explains how backend expressions, chat, and autonomous livestream mode interact with the frontend through WebSocket communication and the character system.

## System Architecture

```mermaid
graph TB
    subgraph "Backend"
        A[REST API<br/>POST /api/expression] --> B[WebSocketHandler]
        C[WebSocket<br/>expression-command] --> B
        D[Autonomous Mode<br/>Chat Message] --> E[Message Selector]
        E --> F[Response Selector]
        F --> G[Agent Engine]
        G --> H[Actions Object]
        H --> B
        I[OrphiqAdapter] --> B
    end
    
    subgraph "WebSocket Communication"
        B --> J[WebSocket Server<br/>ws://localhost:12393/client-ws]
        J --> K[WebSocket Message<br/>type: 'audio'<br/>actions: {expressions: [...]}]
    end
    
    subgraph "Frontend"
        K --> L[WebSocketContext<br/>onmessage handler]
        L --> M[Custom Event<br/>'audio']
        M --> N[VTuberUI<br/>handleAudioResponse]
        N --> O[CharacterController<br/>handleAudioUpdate]
        O --> P[ExpressionHandler<br/>setExpression]
        P --> Q[Live2D Model<br/>Apply Expression]
    end
    
    style A fill:#4ecdc4
    style D fill:#ff6b6b
    style J fill:#95e1d3
    style L fill:#6bcf7f
    style Q fill:#ffd93d
```

## Expression Flow: Backend to Frontend

### Complete Expression Flow

```mermaid
sequenceDiagram
    participant REST as REST API
    participant WS as WebSocketHandler
    participant Adapter as OrphiqAdapter
    participant WS_Server as WebSocket Server
    participant WS_Context as WebSocketContext
    participant VTuberUI as VTuberUI
    participant Controller as CharacterController
    participant ExprHandler as ExpressionHandler
    participant Model as Live2D Model
    
    Note over REST,Model: REST API Expression Request
    REST->>WS: POST /api/expression<br/>{expressionId: 3, duration: 5000}
    WS->>Adapter: trigger_expression(3, 5000, 0)
    Adapter->>Adapter: Create Actions object<br/>{expressions: [3]}
    Adapter->>WS_Server: Send WebSocket payload<br/>{type: "audio", actions: {expressions: [3]}}
    
    Note over WS_Server,Model: WebSocket Message Delivery
    WS_Server->>WS_Context: WebSocket message received
    WS_Context->>WS_Context: Parse JSON message
    WS_Context->>WS_Context: Check type === 'audio'
    WS_Context->>VTuberUI: Dispatch 'audio' event<br/>{actions: {expressions: [3]}}
    
    Note over VTuberUI,Model: Frontend Processing
    VTuberUI->>VTuberUI: handleAudioResponse(data)
    VTuberUI->>Controller: handleAudioUpdate(audioData)
    Controller->>Controller: Extract expressions from actions
    Controller->>ExprHandler: setExpression(3, 5000)
    ExprHandler->>ExprHandler: Load expression file<br/>exp_03.exp3.json
    ExprHandler->>Model: Apply expression parameters
    Model->>Model: Update Live2D parameters
    Model-->>VTuberUI: Expression applied visually
```

## WebSocket Communication

### WebSocket Message Structure

**Backend sends**:
```json
{
  "type": "audio",
  "audio": null,  // or base64 audio data
  "volumes": [],
  "slice_length": 20,
  "display_text": {
    "text": "Expression 3",
    "name": "CharacterName",
    "avatar": "/avatars/character.png"
  },
  "actions": {
    "expressions": [3]
  },
  "forwarded": false
}
```

**Frontend receives**:
```typescript
// In WebSocketContext.tsx
newSocket.onmessage = (event) => {
  const data = JSON.parse(event.data);
  
  if (data.type === 'audio') {
    const audioData = {
      data: data.audio,
      format: data.format || 'mp3',
      volumes: data.volumes,
      slice_length: data.slice_length,
      display_text: data.display_text,
      actions: data.actions  // Contains expressions
    };
    
    // Dispatch custom event
    window.dispatchEvent(new CustomEvent('audio', { 
      detail: audioData
    }));
  }
};
```

### WebSocket Connection Flow

```mermaid
graph LR
    A[WebSocketProvider] --> B[Connect to<br/>ws://localhost:12393/client-ws]
    B --> C{Connection<br/>Status}
    C -->|Success| D[Set isConnected = true]
    C -->|Failure| E[Schedule Reconnect]
    D --> F[Send Message Queue]
    F --> G[Receive Messages]
    G --> H[Parse Message Type]
    H --> I[audio]
    H --> J[text]
    H --> K[full-text]
    I --> L[Dispatch 'audio' Event]
    J --> M[Dispatch 'text-response' Event]
    K --> M
    
    style A fill:#6bcf7f
    style D fill:#4ecdc4
    style L fill:#ffd93d
```

## Expression Processing in Frontend

### ExpressionHandler Architecture

```mermaid
graph TD
    A[CharacterController] --> B[ExpressionHandler]
    B --> C{Model<br/>Available?}
    C -->|Yes| D[Get Expression File Path]
    C -->|No| E[Log Warning]
    D --> F[Load Expression File<br/>.exp3.json]
    F --> G[Parse Expression Parameters]
    G --> H[Apply to Live2D Model]
    H --> I[Set Parameter Values]
    I --> J[Update Visual Expression]
    
    K[Duration > 0?] --> L[Set Timeout]
    L --> M[Reset Expression]
    
    style B fill:#ffd93d
    style H fill:#4ecdc4
    style J fill:#a8e6cf
```

### Expression File Loading

```mermaid
sequenceDiagram
    participant EH as ExpressionHandler
    participant Model as Live2D Model
    participant FS as File System
    participant Core as Core Model
    
    EH->>EH: setExpression(expressionId: 3)
    EH->>EH: getExpressionFilePath(3)
    EH->>EH: Determine model type<br/>(mao_pro, Wintherscris, etc.)
    EH->>FS: Load expression file<br/>/expressions/exp_03.exp3.json
    FS-->>EH: Expression JSON
    EH->>EH: Parse Parameters
    EH->>Model: Get internalModel.coreModel
    Model-->>EH: Core Model Reference
    EH->>Core: For each parameter:<br/>getParameterIndex(id)
    Core-->>EH: Parameter Index
    EH->>Core: setParameterValueByIndex(index, value)
    Core->>Model: Update Visual Expression
```

## Chat Integration

### Chat Message Flow

```mermaid
graph TB
    subgraph "User Input"
        A[User Types Message] --> B[ChatInput Component]
        B --> C[VTuberUI<br/>handleSendMessage]
    end
    
    subgraph "WebSocket Send"
        C --> D[WebSocketContext<br/>sendMessage]
        D --> E[WebSocket.send<br/>{type: 'text-input', text: '...'}]
    end
    
    subgraph "Backend Processing"
        E --> F[WebSocketHandler<br/>_handle_conversation_trigger]
        F --> G[Agent Engine<br/>chat]
        G --> H[Generate Response]
        H --> I[Extract Expressions<br/>from text tags]
        I --> J[Create Actions Object]
    end
    
    subgraph "Response Delivery"
        J --> K[Send WebSocket Message<br/>with actions]
        K --> L[Frontend Receives]
        L --> M[Apply Expressions]
        M --> N[Display in Chat]
    end
    
    style A fill:#ff6b6b
    style G fill:#4ecdc4
    style J fill:#ffd93d
    style M fill:#a8e6cf
```

### Chat with Expression Tags

**Backend generates text with emotion tags**:
```
"I'm so [joy] happy to see you! [smirk]"
```

**Backend extracts expressions**:
```python
# In Live2dModel.extract_emotion()
expressions = model.extract_emotion(text)  # Returns [3, 3]
actions = Actions(expressions=[3, 3])
```

**Frontend receives and applies**:
```typescript
// In CharacterController.handleAudioUpdate()
if (audioData.actions?.expressions) {
  for (const exprId of audioData.actions.expressions) {
    await this.expressionHandler.setExpression(exprId, duration);
  }
}
```

## Autonomous Livestream Mode

### Autonomous Mode Flow

```mermaid
graph TB
    subgraph "Chat Platform"
        A[Twitch/pump.fun<br/>Chat Message] --> B[ChatPlatform<br/>on_message callback]
    end
    
    subgraph "Backend Processing"
        B --> C[_process_chat_message_for_autonomous]
        C --> D[Message Selector<br/>Quality Score Check]
        D -->|Score >= 0.3| E[Response Selector<br/>Generate 3 Options]
        D -->|Score < 0.3| F[Skip Message]
        E --> G[Select Best Response]
        G --> H[Agent Engine<br/>Generate with Context]
        H --> I[Extract Expressions<br/>from Response]
        I --> J[Create Actions Object]
    end
    
    subgraph "WebSocket Delivery"
        J --> K[Send to WebSocket Clients]
        K --> L[Frontend Receives]
        L --> M[Apply Expressions]
        M --> N[Play Audio]
        N --> O[Display in Chat]
    end
    
    style A fill:#9146ff
    style D fill:#ffd93d
    style H fill:#4ecdc4
    end
```

### Autonomous Mode with Expressions

```mermaid
sequenceDiagram
    participant Chat as Chat Platform
    participant Backend as Backend
    participant Selector as Message Selector
    participant Agent as Agent Engine
    participant WS as WebSocket
    participant Frontend as Frontend
    
    Chat->>Backend: "Hey! [joy] What's up?"
    Backend->>Selector: should_respond(message)
    Selector->>Selector: Calculate quality score<br/>(length, question, mention, etc.)
    Selector-->>Backend: should_respond = true, score = 0.8
    
    Backend->>Agent: Generate response<br/>with emotion tags
    Agent->>Agent: Process text<br/>"[joy] I'm doing great!"
    Agent-->>Backend: SentenceOutput<br/>{text: "...", actions: {expressions: [3]}}
    
    Backend->>Backend: Extract expressions<br/>from actions
    Backend->>WS: Send WebSocket message<br/>{type: "audio", actions: {expressions: [3]}}
    
    WS->>Frontend: WebSocket message
    Frontend->>Frontend: Parse actions.expressions
    Frontend->>Frontend: Apply expression 3 (joy)
    Frontend->>Frontend: Display text in chat
    Frontend->>Frontend: Play audio with expression
```

## Character System Integration

### Character Controller Architecture

```mermaid
graph TB
    A[ModelContext] --> B[CharacterController]
    B --> C[ExpressionHandler]
    B --> D[MotionHandler]
    B --> E[MouseTrackingHandler]
    B --> F[ModelConfigHandler]
    
    G[WebSocket Message] --> H[VTuberUI]
    H --> I[handleAudioResponse]
    I --> B[handleAudioUpdate]
    
    B --> J{Extract Actions}
    J -->|expressions| C
    J -->|motions| D
    
    C --> K[Load Expression File]
    K --> L[Apply Parameters]
    L --> M[Live2D Model]
    
    style B fill:#ffd93d
    style C fill:#4ecdc4
    style M fill:#a8e6cf
```

### Expression Application Process

```typescript
// In CharacterController.handleAudioUpdate()
async handleAudioUpdate(audioData: AudioData): Promise<void> {
  // Extract expressions from actions
  if (audioData.actions?.expressions) {
    const expressions = audioData.actions.expressions;
    
    // Apply each expression
    for (const expressionId of expressions) {
      const duration = audioData.duration || 0;
      await this.expressionHandler.setExpression(
        typeof expressionId === 'number' ? expressionId : 0,
        duration
      );
    }
  }
  
  // Process audio for lip sync
  if (audioData.volumes) {
    // Update mouth based on volume
    this.expressionHandler.updateMouth(volume);
  }
}
```

## REST API to Frontend Flow

### REST API Expression Request

```mermaid
sequenceDiagram
    participant Client as External Client
    participant REST as REST API
    participant WS_Handler as WebSocketHandler
    participant Adapter as OrphiqAdapter
    participant WS_Server as WebSocket Server
    participant Frontend as Frontend
    
    Client->>REST: POST /api/expression<br/>{expressionId: 3}
    REST->>WS_Handler: Get adapter for client
    WS_Handler->>Adapter: trigger_expression(3)
    Adapter->>Adapter: Create Actions object
    Adapter->>WS_Server: Send WebSocket payload
    REST-->>Client: {status: "success", expression_id: 3}
    
    Note over WS_Server,Frontend: Same flow as WebSocket command
    WS_Server->>Frontend: WebSocket message
    Frontend->>Frontend: Apply expression
```

## Expression File Structure

### Model-Specific Expression Mapping

```mermaid
graph LR
    A[Expression ID] --> B{Model Type}
    B -->|mao_pro| C[expressions/exp_01.exp3.json<br/>expressions/exp_02.exp3.json<br/>...]
    B -->|Wintherscris| D[wink.exp3.json<br/>cute frown.exp3.json<br/>laught smile.exp3.json]
    B -->|woodDog| E[Sad.exp3.json<br/>Angy.exp3.json<br/>Blush.exp3.json]
    
    C --> F[Load Expression File]
    D --> F
    E --> F
    
    F --> G[Parse Parameters]
    G --> H[Apply to Model]
    
    style A fill:#ff6b6b
    style F fill:#4ecdc4
    style H fill:#a8e6cf
```

## Expression Duration Management

### Timed Expression Flow

```mermaid
sequenceDiagram
    participant Backend as Backend
    participant Frontend as Frontend
    participant Handler as ExpressionHandler
    participant Model as Live2D Model
    participant Timer as setTimeout
    
    Backend->>Frontend: Expression with duration: 5000ms
    Frontend->>Handler: setExpression(3, 5000)
    Handler->>Model: Apply expression 3
    Handler->>Timer: setTimeout(resetExpression, 5000)
    
    Note over Timer: After 5000ms
    Timer->>Handler: resetExpression()
    Handler->>Model: Reset to default expression
    Model-->>Frontend: Expression reset visually
```

## Integration Points Summary

### Key Integration Points

1. **WebSocket Message Format**:
   - Type: `"audio"`
   - Actions: `{expressions: [number[]]}`
   - Display text: `{text: string, name: string}`

2. **Frontend Event System**:
   - `'audio'` event: Dispatched from WebSocketContext
   - `'text-response'` event: Dispatched for text messages
   - Handled in VTuberUI component

3. **Character Controller**:
   - Receives audio data with actions
   - Extracts expressions from actions
   - Delegates to ExpressionHandler

4. **ExpressionHandler**:
   - Loads expression files (.exp3.json)
   - Applies parameters to Live2D model
   - Manages expression duration and reset

5. **Live2D Model**:
   - Receives parameter updates
   - Renders expression visually
   - Supports smooth transitions

## Error Handling

### Error Flow

```mermaid
graph TD
    A[Backend Error] --> B{Error Type}
    B -->|Validation| C[400 Bad Request]
    B -->|Server| D[500 Internal Error]
    C --> E[Return Error Response]
    D --> E
    
    F[Frontend Error] --> G{Error Type}
    G -->|Expression File Not Found| H[Log Warning<br/>Skip Expression]
    G -->|Model Not Available| I[Queue for Later]
    G -->|Parameter Not Found| J[Log Warning<br/>Continue]
    
    style A fill:#ff6b6b
    style F fill:#ff6b6b
    style E fill:#ffd93d
```

## Performance Considerations

1. **Expression File Caching**: ExpressionHandler caches loaded expression files
2. **Parameter Updates**: Batch parameter updates for efficiency
3. **WebSocket Batching**: Multiple expressions in single message
4. **Duration Management**: Efficient timeout handling for expression reset

## Future Enhancements

1. **Expression Blending**: Smooth transitions between expressions
2. **Priority System**: Expression priority queue (backend planned)
3. **Expression Intensity**: Variable expression strength
4. **Custom Expressions**: User-defined expression triggers
5. **Expression Sequences**: Chain multiple expressions together

