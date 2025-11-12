# AIdol-Vtuber Architecture Documentation

This document provides detailed architecture information for the AIdol-Vtuber platform.

## Table of Contents

- [State Management](#state-management)
- [Model Management Flow](#model-management-flow)
- [Live2D Model State Management](#live2d-model-state-management)
- [Microphone Audio Streaming System](#microphone-audio-streaming-system)

---

## State Management

### Architecture Overview

The VTuber app uses a centralized state management approach with React Context. The main state is managed by `ModelContext`, while configuration fetching is handled by `ConfigClient`.

```mermaid
graph TD
    A[ConfigClient.ts] -->|Fetches Config| B[InitConfigManager]
    B -->|Initializes| C[ModelContext]
    C -->|Provides State| D[VTuber Components]
    C -->|State & Methods| E[Character Components]
    C -->|State & Methods| F[Background Components]
    
    subgraph ModelContext
        G[App Config State]
        H[Model State]
        I[Helper Methods]
    end
    
    subgraph ConfigClient
        J[API Methods]
        K[Type Definitions]
    end
    
    C --- ModelContext
    A --- ConfigClient
```

### State Management Flow

1. **Initial Load**:
   - `InitConfigManager` fetches base configuration using `ConfigClient`
   - Configuration is passed to `ModelContext`
   - `ModelContext` becomes the source of truth for app state

2. **State Updates**:
   - Components receive state and update methods from `ModelContext`
   - All state modifications go through `ModelContext`
   - External API calls remain in `ConfigClient`

3. **Helper Methods**:
   - Utility functions like `findModelByName` and `findCharacterById` moved to `ModelContext`
   - These methods operate on the stored state

### Type Structure

```typescript
// Core state interfaces in ModelContext
interface ModelContextState {
  config: AppConfig;
  modelPath: string;
  characterId: string;
  backgroundPath: string;
}

// Methods provided by context
interface ModelContextValue extends ModelContextState {
  handleCharacterChange: (characterId: string, modelPath: string) => void;
  handleBackgroundChange: (backgroundPath: string) => void;
  findModelByName: (name: string) => Model | undefined;
  findCharacterById: (id: string) => Character | undefined;
}
```

### Key Components

- **ModelContext**: Central state management
- **ConfigClient**: External API communication
- **InitConfigManager**: Configuration initialization
- **VTuber Components**: State consumers

---

## Model Management Flow

### Architecture Overview

The VTuber app uses a centralized model loading system with character selection managed through context. Here's how the components interact:

```mermaid
graph TD
    A[ModelContext] -->|Manages| B[Character Selection]
    A -->|Provides| C[Model State]
    D[ModelLoader] -->|Handles| E[Live2D Model Loading]
    D -->|Manages| F[PIXI Application]
    
    subgraph Character Selection Flow
        G[CharacterTab] -->|Select Character| A
        A -->|Update State| C
        C -->|Trigger| D
    end
    
    subgraph Model Loading Flow
        D -->|Load Model| E
        D -->|Setup Canvas| F
        E -->|Render| F
    end
    
    subgraph State Management
        A -->|Config| H[AppConfig]
        A -->|Model Path| I[ModelPath]
        A -->|Character ID| J[CharacterId]
    end
```

### Component Responsibilities

#### ModelContext
- Manages character selection state
- Provides character selection methods
- Maintains model configuration
- Triggers model loading through state changes

#### ModelLoader
- Handles Live2D model initialization
- Manages PIXI application lifecycle
- Handles model loading/unloading
- Manages model positioning and scaling

#### CharacterTab
- Displays available characters
- Handles character selection UI
- Triggers character changes through context

### State Flow

1. **Character Selection**:
   ```
   CharacterTab
   └── Select Character
       └── ModelContext
           └── Update State
               └── ModelLoader
                   └── Load New Model
   ```

2. **Model Loading**:
   ```
   ModelLoader
   ├── Unload Current Model
   ├── Cleanup PIXI App
   ├── Initialize New PIXI App
   └── Load New Model
   ```

3. **State Management**:
   ```
   ModelContext
   ├── Character Selection
   ├── Model Configuration
   └── Model State
   ```

### Key Interactions

1. **Character Change**:
   - User selects character in CharacterTab
   - ModelContext updates state
   - ModelLoader detects state change
   - ModelLoader handles model transition

2. **Model Loading**:
   - ModelLoader manages PIXI application
   - Handles model loading/unloading
   - Manages model positioning and scaling
   - Provides model interaction capabilities

3. **State Synchronization**:
   - ModelContext maintains source of truth
   - ModelLoader responds to state changes
   - CharacterTab reflects current selection

---

## Live2D Model State Management

This document explains how state is managed and data flows between the Live2D model components.

### Component Architecture

```mermaid
graph TD
    A[ModelContext] -->|Provides State & Handlers| B[useLive2DModel Hook]
    B -->|Manages Model Lifecycle| C[ModelLoader]
    C -->|Handles Live2D Model| D[Live2D Model Instance]
    
    subgraph "State Management"
        A -->|Config State| E[AppConfig]
        A -->|Audio State| F[AudioContext]
        A -->|Character State| G[CharacterHandler]
    end
    
    subgraph "Model Lifecycle"
        B -->|Initialization| H[Model Loading]
        B -->|Updates| I[Model Transform]
        B -->|Cleanup| J[Model Destruction]
    end
```

### Data Flow

```mermaid
sequenceDiagram
    participant MC as ModelContext
    participant ULM as useLive2DModel
    participant ML as ModelLoader
    participant CH as CharacterHandler
    participant LM as Live2D Model

    MC->>ULM: Initialize with config
    ULM->>ML: Request model loading
    ML->>LM: Load model instance
    LM-->>ML: Model loaded
    ML-->>ULM: Model ready
    ULM->>CH: Set up character handler
    CH->>LM: Configure model
    
    loop Model Updates
        ULM->>CH: Update model state
        CH->>LM: Apply updates
        LM-->>CH: Update complete
        CH-->>ULM: State updated
    end
```

### State Management

#### ModelContext
- Central state management for the application
- Manages:
  - Model configuration
  - Audio context
  - Character handler
  - Global state updates

#### useLive2DModel Hook
- Manages model lifecycle
- Handles:
  - Model loading/unloading
  - Transform updates
  - Animation state
  - Mouse interaction

#### ModelLoader
- Handles technical aspects of Live2D model
- Manages:
  - Model instantiation
  - Resource loading
  - PIXI.js integration
  - Model cleanup

### Current Complexity

The current implementation has several areas of complexity:

1. **Multiple State Sources**
   - State is split between context and hook
   - Redundant state tracking
   - Complex state synchronization

2. **Prop Drilling**
   - Many props passed through components
   - Complex prop types
   - Difficult to track state changes

3. **Complex Lifecycle Management**
   - Multiple initialization points
   - Complex cleanup procedures
   - Difficult to debug state issues

### Suggested Simplifications

1. **Unified State Management**
```mermaid
graph LR
    A[ModelState] -->|Single Source| B[ModelContext]
    B -->|Simplified Props| C[useLive2DModel]
    C -->|Clean Interface| D[ModelLoader]
```

2. **Simplified Data Flow**
```mermaid
sequenceDiagram
    participant MS as ModelState
    participant ULM as useLive2DModel
    participant ML as ModelLoader
    
    MS->>ULM: Initialize
    ULM->>ML: Load Model
    ML-->>ULM: Model Ready
    ULM-->>MS: Update State
    
    loop Updates
        MS->>ULM: State Change
        ULM->>ML: Apply Update
        ML-->>ULM: Update Complete
        ULM-->>MS: State Updated
    end
```

### Proposed Changes

1. **Centralize State**
   - Move all state to ModelContext
   - Use reducers for state updates
   - Implement proper state immutability

2. **Simplify Props**
   - Reduce prop drilling
   - Use context for shared state
   - Implement proper TypeScript types

3. **Streamline Lifecycle**
   - Single initialization point
   - Clear cleanup procedures
   - Better error handling

4. **Improve Type Safety**
   - Remove any types
   - Implement proper interfaces
   - Add runtime type checking

### Example Implementation

```typescript
// Simplified ModelState
interface ModelState {
  config: ModelConfig;
  model: Live2DModel | null;
  transform: ModelTransform;
  audio: AudioState;
  character: CharacterState;
}

// Simplified Context
const ModelContext = createContext<ModelState>(null);

// Simplified Hook
function useLive2DModel() {
  const state = useContext(ModelContext);
  const dispatch = useReducer(modelReducer, initialState);
  
  // Simplified lifecycle
  useEffect(() => {
    initializeModel();
    return cleanupModel;
  }, []);
  
  return {
    ...state,
    updateTransform: (transform: ModelTransform) => 
      dispatch({ type: 'UPDATE_TRANSFORM', payload: transform }),
    // ... other actions
  };
}
```

### Benefits of Simplification

1. **Better Maintainability**
   - Clear state management
   - Easier debugging
   - Better type safety

2. **Improved Performance**
   - Reduced re-renders
   - Better resource management
   - Optimized updates

3. **Enhanced Developer Experience**
   - Clearer API
   - Better documentation
   - Easier testing

4. **Reduced Complexity**
   - Fewer moving parts
   - Clearer data flow
   - Better error handling

---

## Microphone Audio Streaming System

### Overview

This system handles microphone input, processes it through the WebSocket connection, and manages the audio context for the VTuber application.

### System Flow

```mermaid
sequenceDiagram
    participant User
    participant ChatInput
    participant VTuberUI
    participant ModelContext
    participant CharacterHandler
    participant WebSocket
    participant Server

    User->>ChatInput: Click Microphone Button
    ChatInput->>VTuberUI: Toggle Microphone
    VTuberUI->>ModelContext: Request Microphone Access
    ModelContext->>CharacterHandler: Initialize Audio Context
    CharacterHandler->>WebSocket: Start Audio Stream
    loop Audio Processing
        CharacterHandler->>WebSocket: Stream Audio Chunks
        WebSocket->>Server: Send Audio Data
        Server->>WebSocket: Process & Respond
    end
    User->>ChatInput: Click Microphone Button
    ChatInput->>VTuberUI: Stop Microphone
    VTuberUI->>ModelContext: Stop Audio Stream
    ModelContext->>CharacterHandler: Cleanup Audio Context
    CharacterHandler->>WebSocket: End Audio Stream
```

### Key Components

1. **ChatInput Component**
   - Handles microphone button UI
   - Toggles recording state
   - Provides visual feedback

2. **VTuberUI Component**
   - Manages microphone state
   - Coordinates between UI and audio processing
   - Handles WebSocket communication

3. **ModelContext**
   - Manages audio context
   - Handles microphone permissions
   - Coordinates with CharacterHandler

4. **CharacterHandler**
   - Processes audio data
   - Manages audio context
   - Streams data to WebSocket

5. **WebSocket Context**
   - Handles real-time communication
   - Streams audio data to server
   - Manages connection state

### Implementation Notes

- Audio is processed in chunks for real-time streaming
- WebSocket connection is maintained throughout the session
- Audio context is managed separately from character audio
- System includes comprehensive logging for debugging
- Error handling at each step of the process

### Debug Logging

Key points for logging:
1. Microphone permission status
2. Audio context initialization
3. WebSocket connection state
4. Audio chunk processing
5. Stream start/stop events
6. Error conditions

