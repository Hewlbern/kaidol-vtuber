'use client';

import React, { createContext, useContext, useState, useCallback, useEffect, useRef, useReducer } from 'react';
import { WebSocketMessage, AudioData, ModelPosition } from './types/VTuberTypes';
import { AppConfig, Model, Character, Background } from './loaders/ConfigClient';
import { CharacterHandler } from './character/CharacterController';
import type { Live2DModel } from 'pixi-live2d-display-lipsyncpatch';
import { MODEL_CONFIGS } from './types/types';

// Import reducers and action types
import { 
  scaleReducer,
  positionReducer,
  motionReducer
} from './types/modelReducers';

// Import context types
import { 
  ModelContextState, 
  ModelContextValue, 
  ModelProviderProps 
} from './types/modelContextTypes';

const DEFAULT_MODEL_PATH = '/model/Wintherscris/Wintherscris1.model3.json' ;
const DEFAULT_BACKGROUND_PATH = '/backgrounds/moon-over-mountain.jpeg' ;
const DEFAULT_CHARACTER_ID = 'wintherscris' ;
const INITIAL_SCALE = 0.4 ; // Clear initial scale configuration

const ModelContext = createContext<ModelContextValue | undefined>(undefined);

export const ModelProvider: React.FC<ModelProviderProps> = ({ children, isConnected, sendMessage, initialConfig, audioContext }) => {
  
  // Audio refs
  const audioContextRef = useRef<AudioContext | null>(audioContext || null);
  const audioSourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const audioQueueRef = useRef<Array<AudioData>>([]);
  const isPlayingRef = useRef<boolean>(false);
  const audioUrlRef = useRef<string | null>(null);
  const characterHandlerRef = useRef<CharacterHandler | null>(null);

  // Audio state
  const [currentAudio, setCurrentAudio] = useState<AudioData | null>(null);
  const [audioPermissionGranted, setAudioPermissionGranted] = useState<boolean>(false);
  const [audioStream, setAudioStream] = useState<MediaStream | null>(null);
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [volume, setVolume] = useState<number>(1.0);
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);
  
  // Scale state with reducer
  const [scaleState, scaleDispatch] = useReducer(scaleReducer, { currentScale: INITIAL_SCALE, isScaling: false });
  
  // Position state with reducer
  const [positionState, positionDispatch] = useReducer(positionReducer, { x: 0.5, y: 0.5 });

  // Add position state
  const [modelPosition, setModelPosition] = useState<{ x: number; y: number }>({ x: 0.5, y: 0.5 });

  // Motion state with reducer
  const [motionState, motionDispatch] = useReducer(motionReducer, { 
    expressionId: 0, 
    motionGroup: 'idle', 
    motionIndex: 0, 
    isPlaying: false 
  });

  // Initialize CharacterHandler
  useEffect(() => {
    if (!characterHandlerRef.current) {
      console.log('[ModelContext] Initializing CharacterHandler');
      
      // Extract model name from path
      const modelPath = DEFAULT_MODEL_PATH;
      const fileName = modelPath.split('/').pop()?.split('.')[0] || '';
      // Try to match by filename first, then by folder name, then fallback
      const folderName = modelPath.split('/').slice(-2, -1)[0]?.toLowerCase() || '';
      const modelName = MODEL_CONFIGS[fileName] ? fileName : 
                       (MODEL_CONFIGS[folderName] ? folderName : fileName);
      const modelConfig = MODEL_CONFIGS[modelName] || MODEL_CONFIGS[folderName] || MODEL_CONFIGS.vanilla;
      
      characterHandlerRef.current = new CharacterHandler({
        audioContextRef,
        audioSourceRef,
        audioQueueRef,
        isPlayingRef,
        audioUrlRef,
        setCurrentAudio,
        setAudioPermissionGranted,
        setAudioStream,
        setIsRecording,
        setVolume,
        modelConfig,
        isConnected,
        sendMessage,
        setIsSpeaking
      });
    }

    // Cleanup function
    return () => {
      if (characterHandlerRef.current) {
        console.log('[ModelContext] Cleaning up CharacterHandler');
        characterHandlerRef.current.cleanup();
      }
    };
  }, [initialConfig, isConnected, sendMessage]);

  const [modelState, setModelState] = useState<ModelContextState>(() => {
    return {
      config: initialConfig || null,
      modelPath: DEFAULT_MODEL_PATH,
      characterId: initialConfig?.character?.id || DEFAULT_CHARACTER_ID,
      backgroundPath: DEFAULT_BACKGROUND_PATH,
      isModelLoading: false,
      modelScale: INITIAL_SCALE,
      modelPosition: { x: 0.5, y: 0.5 },
      containerDimensions: { width: 0, height: 0 },
      showSubtitles: true,
      isPointerInteractive: true,
      isScrollToResizeEnabled: false,
      isBackgroundLoaded: false,
      backgroundError: null,
      // Audio state
      currentVolume: 0,
      isPlaying: false,
      audioPermissionGranted: false,
      audioStream: null,
      isRecording: false,
      isSpeaking: false,
      isAudioReady: !!audioContext,
      scaleState: {
        currentScale: scaleState.currentScale,
        isScaling: false
      },
      positionState: positionState,
      setModelPosition,
      motionState: {
        expressionId: 0,
        motionGroup: 'idle',
        motionIndex: 0,
        isPlaying: false
      },
      modelRef: null,
    };
  });

  const containerRef = useRef<HTMLDivElement>(null);

  // Effect to update container dimensions
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        setModelState(prev => ({
          ...prev,
          containerDimensions: {
            width: containerRef.current!.offsetWidth,
            height: containerRef.current!.offsetHeight
          }
        }));
      }
    };
    
    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  // Effect to handle model loading state
  useEffect(() => {
    const handleModelLoadStart = () => {
      console.log('[ModelContext] Model load started');
      setModelState(prev => {
        console.log('[ModelContext] Updating loading state to true');
        return { ...prev, isModelLoading: true };
      });
    };

    const handleModelLoadComplete = (event: CustomEvent) => {
      console.log('[ModelContext] Model load completed');
      const model = event.detail?.model || null;
      
      // Set the model in the CharacterHandler
      if (characterHandlerRef.current && model) {
        console.log('[ModelContext] Setting model in CharacterHandler');
        characterHandlerRef.current.setModel(model, modelState.modelPath);
      }
      
      setModelState(prev => {
        // console.log('[ModelContext] Updating loading state to false and setting model reference');
        return { 
          ...prev, 
          isModelLoading: false,
          modelRef: model
        };
      });
    };

    const handleModelLoadError = (event: CustomEvent) => {
      console.error('[ModelContext] Model load error:', event.detail);
      setModelState(prev => {
        console.log('[ModelContext] Updating loading state to false after error');
        return { ...prev, isModelLoading: false };
      });
    };

    window.addEventListener('model-load-start', handleModelLoadStart);
    window.addEventListener('model-load-complete', handleModelLoadComplete as EventListener);
    window.addEventListener('model-load-error', handleModelLoadError as EventListener);

    return () => {
      window.removeEventListener('model-load-start', handleModelLoadStart);
      window.removeEventListener('model-load-complete', handleModelLoadComplete as EventListener);
      window.removeEventListener('model-load-error', handleModelLoadError as EventListener);
    };
  }, []);

  // Update audioContextRef when audioContext prop changes
  useEffect(() => {
    if (audioContext && !audioContextRef.current) {
      console.log('[ModelContext] Setting AudioContext from props');
      audioContextRef.current = audioContext;
      
      // Update audio ready state
      setModelState(prev => ({
        ...prev,
        isAudioReady: true
      }));
    }
  }, [audioContext]);

  const handleConfigUpdate = useCallback((newConfig: AppConfig) => {
    setModelState(prev => ({
      ...prev,
      config: newConfig,
      characterId: newConfig?.character?.id || prev.characterId
    }));
  }, []);

  const findModelByName = useCallback((name: string): Model | undefined => {
    return modelState.config?.models.find(model => model.name === name);
  }, [modelState.config]);

  const findCharacterById = useCallback((id: string): Character | undefined => {
    return modelState.config?.characters.find(character => character.id === id);
  }, [modelState.config]);

  const findBackgroundByPath = useCallback((path: string): Background | undefined => {
    return modelState.config?.backgrounds.find(background => background.path === path);
  }, [modelState.config]);

  const getAvailableCharacters = useCallback((): Character[] => {
    return modelState.config?.characters || [];
  }, [modelState.config]);

  const getAvailableBackgrounds = useCallback((): Background[] => {
    return modelState.config?.backgrounds || [];
  }, [modelState.config]);

  const getAvailableModels = useCallback((): Model[] => {
    return modelState.config?.models || [];
  }, [modelState.config]);

  const handleCharacterChange = useCallback((characterId: string, modelPath: string) => {
    console.log('[ModelContext] State Sync - Character Change:', {
      previousCharacterId: modelState.characterId,
      newCharacterId: characterId,
      previousModelPath: modelState.modelPath,
      newModelPath: modelPath,
      timestamp: new Date().toISOString()
    });
    
    if (!modelPath || modelPath.trim() === '') {
      console.warn('[ModelContext] State Sync - Invalid model path, using fallback');
      setModelState(prev => ({
        ...prev,
        modelPath: DEFAULT_MODEL_PATH,
        characterId
      }));
      return;
    }
    
    // Extract model name from path and update the model config in CharacterHandler
    const fileName = modelPath.split('/').pop()?.split('.')[0] || '';
    // Try to match by filename first, then by folder name, then fallback
    const folderName = modelPath.split('/').slice(-2, -1)[0]?.toLowerCase() || '';
    const modelName = MODEL_CONFIGS[fileName] ? fileName : 
                     (MODEL_CONFIGS[folderName] ? folderName : fileName);
    const modelConfig = MODEL_CONFIGS[modelName] || MODEL_CONFIGS[folderName] || MODEL_CONFIGS.vanilla;
    
    if (characterHandlerRef.current) {
      console.log('[ModelContext] State Sync - Updating model config:', {
        modelName,
        modelConfig,
        timestamp: new Date().toISOString()
      });
      characterHandlerRef.current.setModelConfig(modelConfig);
    }
    
    // Dispatch custom event to trigger model loading
    const event = new CustomEvent('model-path-change', {
      detail: { modelPath, characterId }
    });
    console.log('[ModelContext] State Sync - Dispatching model-path-change event:', {
      modelPath,
      characterId,
      timestamp: new Date().toISOString()
    });
    window.dispatchEvent(event);
    
    setModelState(prev => {
      console.log('[ModelContext] State Sync - Updating model state:', {
        prevModelPath: prev.modelPath,
        newModelPath: modelPath,
        prevCharacterId: prev.characterId,
        newCharacterId: characterId,
        timestamp: new Date().toISOString()
      });
      return {
        ...prev,
        modelPath,
        characterId
      };
    });
    
    if (isConnected) {
      console.log('[ModelContext] State Sync - Sending switch-config message:', {
        config_id: characterId,
        timestamp: new Date().toISOString()
      });
      sendMessage({
        type: 'switch-config',
        config_id: characterId
      } as WebSocketMessage);
    }
  }, [isConnected, sendMessage]);

  const handleBackgroundChange = useCallback((backgroundPath: string) => {
    console.log('[ModelContext] Background change requested:', backgroundPath);
    
    // Dispatch custom event to notify background change
    const event = new CustomEvent('background-path-change', {
      detail: { backgroundPath }
    });
    window.dispatchEvent(event);
    
    setModelState(prev => ({
      ...prev,
      backgroundPath: backgroundPath || DEFAULT_BACKGROUND_PATH
    }));
  }, []);

  const handlePositionChange = useCallback((position: ModelPosition) => {
    console.log('[ModelContext] Position change received:', {
      newPosition: position,
      currentPosition: positionState
    });
    
    // Update position state via reducer (ground truth)
    positionDispatch({ type: 'SET_POSITION', payload: position });
    
    // Also update the model state for backward compatibility
    setModelState(prev => ({
      ...prev,
      modelPosition: position
    }));
  }, [positionState]);

  const handleScaleChange = useCallback((scale: number) => {
    console.log('[ModelContext] Scale change received:', {
      newScale: scale,
      currentScale: scaleState.currentScale,
      modelState: {
        modelScale: modelState.modelScale,
        isScrollToResizeEnabled: modelState.isScrollToResizeEnabled
      }
    });
    
    // Update scale state via reducer
    scaleDispatch({ type: 'SET_SCALE', payload: scale });
    
    // Also update the model state for backward compatibility
    setModelState(prev => {
      console.log('[ModelContext] Updating model state scale:', {
        prevScale: prev.modelScale,
        newScale: scale
      });
      return {
        ...prev,
        modelScale: scale
      };
    });
  }, [scaleState.currentScale, modelState.modelScale, modelState.isScrollToResizeEnabled]);

  const handleSubtitleToggle = useCallback((show: boolean) => {
    setModelState(prev => ({
      ...prev,
      showSubtitles: show
    }));
  }, []);

  const handlePointerInteractiveToggle = useCallback((enabled: boolean) => {
    setModelState(prev => ({
      ...prev,
      isPointerInteractive: enabled,
      isScrollToResizeEnabled: enabled ? false : prev.isScrollToResizeEnabled
    }));
  }, []);

  const handleScrollToResizeToggle = useCallback((enabled: boolean) => {
    setModelState(prev => ({
      ...prev,
      isScrollToResizeEnabled: enabled,
      isPointerInteractive: enabled ? false : prev.isPointerInteractive
    }));
  }, []);

  const handleBackgroundLoad = useCallback(() => {
    setModelState(prev => ({
      ...prev,
      isBackgroundLoaded: true
    }));
  }, []);

  const handleBackgroundError = useCallback((error: string | null) => {
    setModelState(prev => ({
      ...prev,
      backgroundError: error
    }));
  }, []);

  // Audio methods
  const handleAudioUpdate = useCallback(async (audioData: AudioData) => {
    if (characterHandlerRef.current) {
      await characterHandlerRef.current.handleAudioUpdate(audioData);
    }
  }, []);

  const handleMicrophoneToggle = useCallback(async () => {
    if (characterHandlerRef.current) {
      await characterHandlerRef.current.handleMicrophoneToggle(
        isRecording,
        audioPermissionGranted,
        audioStream
      );
      setIsRecording(!isRecording);
    }
  }, [isRecording, audioPermissionGranted, audioStream]);

  const cleanupAudio = useCallback(() => {
    if (characterHandlerRef.current) {
      characterHandlerRef.current.cleanup();
    }
  }, []);

  const handleLipSync = useCallback(async (model: Live2DModel, volume: number) => {
    if (characterHandlerRef.current) {
      try {
        await characterHandlerRef.current.handleLipSync(model, volume);
      } catch (error) {
        console.error('[ModelContext] Error handling lip sync:', error);
      }
    }
  }, []);

  // Handle audio events - centralized in VTuberUI now
  useEffect(() => {
    const handleAudioEvent = (event: CustomEvent<AudioData>) => {
      console.log('[ModelContext] Audio event received but processing is now handled by VTuberUI:', 
        {
        hasAudio: !!event.detail.data,
        format: event.detail.format,
        timestamp: event.detail.timestamp
      }
    );
      
      // Audio processing is now centralized in VTuberUI
      // This listener is kept for logging purposes only
    };

    window.addEventListener('audio', handleAudioEvent as EventListener);
    return () => {
      window.removeEventListener('audio', handleAudioEvent as EventListener);
    };
  }, []);

  // Handle current audio updates - centralized in VTuberUI now
  useEffect(() => {
    if (currentAudio) {
      console.log('[ModelContext] Current audio state updated but processing is now handled by VTuberUI:', 
        {
        hasAudio: !!currentAudio.data,
        format: currentAudio.format,
        timestamp: currentAudio.timestamp
      }
    );
      
      // Audio processing is now centralized in VTuberUI
      // This effect is kept for logging purposes only
    }
  }, [currentAudio]);

  // Add lifecycle tracking logs
  useEffect(() => {
    console.log('[ModelContext] Lifecycle - Component Mount:', {
      hasInitialConfig: !!initialConfig,
      hasAudioContext: !!audioContext,
      timestamp: new Date().toISOString()
    });

    // Cleanup function
    return () => {
      console.log('[ModelContext] Lifecycle - Component Unmount:', {
        hasCharacterHandler: !!characterHandlerRef.current,
        timestamp: new Date().toISOString()
      });
      if (characterHandlerRef.current) {
        console.log('[ModelContext] Lifecycle - Cleaning up CharacterHandler');
        characterHandlerRef.current.cleanup();
      }
    };
  }, [initialConfig]);

  // Add state update tracking
  useEffect(() => {
  }, [modelState]);

  // Add scroll event handling for scaling
  useEffect(() => {
    if (!modelState.isScrollToResizeEnabled) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      
      // Calculate new scale based on wheel delta
      const scaleDelta = -e.deltaY * 0.001; // Adjust sensitivity as needed
      const newScale = Math.max(0.1, Math.min(2.0, scaleState.currentScale + scaleDelta));
      
      // Only update if scale actually changed
      if (newScale !== scaleState.currentScale) {
        handleScaleChange(newScale);
      }
    };

    // Add event listener to the container
    const container = document.getElementById('live2d-container');
    if (container) {
      container.addEventListener('wheel', handleWheel, { passive: false });
    }

    return () => {
      if (container) {
        container.removeEventListener('wheel', handleWheel);
      }
    };
  }, [modelState.isScrollToResizeEnabled, scaleState.currentScale, handleScaleChange]);

  // Add effect to update CharacterHandler when scale changes
  useEffect(() => {
    if (characterHandlerRef.current) {
      console.log('[ModelContext] Updating CharacterHandler scale:', {
        scale: scaleState.currentScale,
        modelScale: modelState.modelScale
      });
      
      // Update the model scale in the CharacterHandler
      characterHandlerRef.current.updateModelScale(scaleState.currentScale);
    }
  }, [scaleState.currentScale, modelState.modelScale]);

  // Sync positionState reducer to modelState.modelPosition when positionState changes
  useEffect(() => {
    console.log('[ModelContext] Position state updated:', {
      positionState,
      previousPosition: modelState.modelPosition
    });
    
    // Update model state to keep it in sync with reducer (ground truth)
    setModelState(prev => ({
      ...prev,
      modelPosition: positionState
    }));
  }, [positionState]);

  // Handle expression change
  const handleExpressionChange = useCallback((expressionId: number) => {
    console.log("this handle expression change in model context is setup.")
    motionDispatch({ type: 'SET_EXPRESSION', payload: expressionId });
    console.log("handler is used.")
    // Update model state for backward compatibility
    setModelState(prev => ({
      ...prev,
      motionState: {
        ...prev.motionState,
        expressionId
      }
    }));
  }, [motionDispatch, setModelState]);
  
  // Handle motion group change
  const handleMotionGroupChange = useCallback((motionGroup: string) => {
    motionDispatch({ type: 'SET_MOTION_GROUP', payload: motionGroup });
    
    // Update model state for backward compatibility
    setModelState(prev => ({
      ...prev,
      motionState: {
        ...prev.motionState,
        motionGroup
      }
    }));
  }, []);
  
  // Handle motion index change
  const handleMotionIndexChange = useCallback((motionIndex: number) => {
    motionDispatch({ type: 'SET_MOTION_INDEX', payload: motionIndex });
    
    // Update model state for backward compatibility
    setModelState(prev => ({
      ...prev,
      motionState: {
        ...prev.motionState,
        motionIndex
      }
    }));
  }, []);
  
  // Handle play motion
  const handlePlayMotion = useCallback(() => {
    if (characterHandlerRef.current && modelState.modelRef) {
      
      // Update the motion state
      motionDispatch({ type: 'SET_IS_PLAYING', payload: true });
      
      // Use the character handler's playModelMotion method
      characterHandlerRef.current.playModelMotion(
        motionState.motionGroup,
        motionState.motionIndex,
        6 // Priority 3 for forced execution
      );
      motionDispatch({ type: 'SET_IS_PLAYING', payload: false });
    } else {
      console.warn('[ModelContext] Cannot play motion: character handler or model not available');
    }
  }, [motionState, modelState.modelRef]);

  // Handle model expression
  const handleModelExpression = useCallback((params: { expressionId: number; duration: number }) => {
    console.log('[ModelContext] Handling model expression:', params);
    console.log('[ModelContext] Current state:', {
      hasCharacterHandler: !!characterHandlerRef.current,
      hasModelRef: !!modelState.modelRef,
      modelPath: modelState.modelPath,
      currentExpressionId: motionState.expressionId
    });
    
    if (!characterHandlerRef.current || !modelState.modelRef) {
      console.warn('[ModelContext] Character handler or model not available for expression');
      return;
    }

    try {
      const { expressionId, duration } = params;
      
      // Update the motion state
      motionDispatch({ type: 'SET_EXPRESSION', payload: expressionId });
      console.log('[ModelContext] Updated motion state with expression:', expressionId);
      
      // Update model state for backward compatibility
      setModelState(prev => ({
        ...prev,
        motionState: {
          ...prev.motionState,
          expressionId
        }
      }));
      
      // Get the model and apply the expression
      const model = modelState.modelRef as Live2DModel;
      if (model && characterHandlerRef.current) {
        // Extract model name from path for config
        const fileName = modelState.modelPath.split('/').pop()?.split('.')[0] || '';
        const folderName = modelState.modelPath.split('/').slice(-2, -1)[0]?.toLowerCase() || '';
        const modelName = MODEL_CONFIGS[fileName] ? fileName : 
                         (MODEL_CONFIGS[folderName] ? folderName : fileName);
        const modelConfig = MODEL_CONFIGS[modelName] || MODEL_CONFIGS[folderName] || MODEL_CONFIGS.vanilla;
        
        console.log('[ModelContext] Applying expression to model:', {
          modelName,
          expressionId,
          duration,
          hasModelConfig: !!modelConfig
        });
        
        // Apply the expression
        characterHandlerRef.current.setModelExpression(
          expressionId,
          duration
        );
      }
    } catch (error) {
      console.error('[ModelContext] Error handling model expression:', error);
    }
  }, [modelState.modelRef, modelState.modelPath]);

  // Update model state when volume changes
  useEffect(() => {
    setModelState(prev => ({
      ...prev,
      currentVolume: volume
    }));
  }, [volume]);

  const contextValue: ModelContextValue = {
    ...modelState,
    containerRef,
    modelState,
    handleCharacterChange,
    handleBackgroundChange,
    handleConfigUpdate,
    handlePositionChange,
    handleScaleChange,
    handleSubtitleToggle,
    handlePointerInteractiveToggle,
    handleScrollToResizeToggle,
    handleBackgroundLoad,
    handleBackgroundError,
    findModelByName,
    findCharacterById,
    findBackgroundByPath,
    getAvailableCharacters,
    getAvailableBackgrounds,
    getAvailableModels,
    handleAudioUpdate,
    handleMicrophoneToggle,
    cleanupAudio,
    handleLipSync,
    characterHandler: characterHandlerRef.current,
    isAudioReady: modelState.isAudioReady,
    scaleState,
    positionState,
    setModelPosition,
    motionState,
    handleExpressionChange,
    handleMotionGroupChange,
    handleMotionIndexChange,
    handlePlayMotion,
    handleModelExpression,
    isSpeaking,
    setIsSpeaking,
    isRecording
  };

  return (
    <ModelContext.Provider value={contextValue}>
      {children}
    </ModelContext.Provider>
  );
};

export function useModel() {
  const context = useContext(ModelContext);
  if (context === undefined) {
    throw new Error('useModel must be used within a ModelProvider');
  }
  return context;
} 