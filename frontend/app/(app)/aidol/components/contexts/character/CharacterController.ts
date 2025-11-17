/**
 * Character Controller Module
 * 
 * This module provides the core functionality for managing Live2D character interactions,
 * including audio playback, lip-sync, expressions, and motion control. It serves as the
 * central coordination point between the Live2D model and various audio/visual features.
 * 
 * Key Features:
 * - Audio playback and streaming management
 * - Real-time lip-sync animation
 * - Expression and motion control
 * - Mouse tracking for eye movement
 * - Microphone input processing
 * - Audio queue management
 * 
 * @module CharacterController
 */

import { RefObject } from 'react';
import type { Live2DModel } from 'pixi-live2d-display-lipsyncpatch';
import { MotionHandler } from './handler/MotionHandler';
import { MouseTrackingHandler } from './handler/MouseTrackingHandler';
import { ExpressionHandler } from './handler/ExpressionHandler';
import { ModelConfigHandler, ModelConfig } from './handler/ModelConfigHandler';
import { WebSocketMessage } from '../types/VTuberTypes';

/**
 * Interface representing audio data for character playback
 * Contains audio buffer, format information, and optional metadata for lip sync and expressions
 * 
 * @interface AudioData
 * @property {ArrayBuffer | string} data - The audio data in binary or base64 string format
 * @property {string} [format] - The audio format (e.g., 'wav', 'mp3')
 * @property {number} [timestamp] - Timestamp of the audio data
 * @property {number} [duration] - Duration of the audio in milliseconds
 * @property {number[]} [volumes] - Array of volume values for lip-sync animation
 * @property {number} [slice_length] - Length of each volume slice in milliseconds
 * @property {{ text: string; name?: string; avatar?: string }} [display_text] - Text to display with audio
 * @property {{ expressions?: Array<number | string>; [key: string]: unknown }} [actions] - Actions to perform during playback
 */
interface AudioData {
  data: ArrayBuffer | string;
  format?: string;
  timestamp?: number;
  duration?: number;
  volumes?: number[];
  slice_length?: number;
  display_text?: { text: string; name?: string; avatar?: string };
  actions?: {
    expressions?: Array<number | string>;
    [key: string]: unknown;
  };
}

/**
 * Props interface for the CharacterHandler class
 * Contains references to audio context, sources, and state management functions
 * 
 * @interface CharacterHandlerProps
 * @property {RefObject<AudioContext | null>} audioContextRef - Reference to the Web Audio context
 * @property {RefObject<MediaElementAudioSourceNode | null>} audioSourceRef - Reference to the audio source node
 * @property {RefObject<Array<AudioData>>} audioQueueRef - Reference to the audio queue
 * @property {RefObject<boolean>} isPlayingRef - Reference to the playing state
 * @property {RefObject<string | null>} audioUrlRef - Reference to the current audio URL
 * @property {Function} setCurrentAudio - Function to set the current audio data
 * @property {Function} setAudioPermissionGranted - Function to set audio permission state
 * @property {Function} setAudioStream - Function to set the audio stream
 * @property {Function} setIsRecording - Function to set recording state
 * @property {Function} setVolume - Function to set audio volume
 * @property {ModelConfig | null} modelConfig - Configuration for the Live2D model
 * @property {boolean} isConnected - Whether the WebSocket is connected
 * @property {Function} sendMessage - Function to send WebSocket messages
 * @property {Function} setIsSpeaking - Function to set speaking state
 */
export interface CharacterHandlerProps {
  audioContextRef: RefObject<AudioContext | null>;
  audioSourceRef: RefObject<MediaElementAudioSourceNode | null>;
  audioQueueRef: RefObject<Array<AudioData>>;
  isPlayingRef: RefObject<boolean>;
  audioUrlRef: RefObject<string | null>;
  setCurrentAudio: (audio: AudioData | null) => void;
  setAudioPermissionGranted: (granted: boolean) => void;
  setAudioStream: (stream: MediaStream | null) => void;
  setIsRecording: (recording: boolean) => void;
  setVolume: (volume: number) => void;
  modelConfig: ModelConfig | null;
  isConnected: boolean;
  sendMessage: (message: WebSocketMessage) => void;
  setIsSpeaking: (speaking: boolean) => void;
}

/**
 * Interface for Live2D internal model focus controller
 * Controls where the character is looking
 * 
 * @interface Live2DFocusController
 * @property {Function} focus - Function to set the focus point (x, y coordinates)
 */
interface Live2DFocusController {
  focus: (x: number, y: number) => void;
}

/**
 * Interface for Live2D internal model core
 * Provides access to model parameters and values
 * 
 * @interface Live2DCoreModel
 * @property {Function} [getParameterIndex] - Get parameter index by ID
 * @property {Function} [getParameterValueById] - Get parameter value by ID
 * @property {Function} [getParameterValueByIndex] - Get parameter value by index
 * @property {Function} [setParameterValueById] - Set parameter value by ID
 * @property {Function} [setParameterValueByIndex] - Set parameter value by index
 */
interface Live2DCoreModel {
  getParameterIndex?: (id: string) => number;
  getParameterValueById?: (id: string) => number;
  getParameterValueByIndex?: (index: number) => number;
  setParameterValueById?: (id: string, value: number) => void;
  setParameterValueByIndex?: (index: number, value: number) => void;
}

/**
 * Interface for Live2D internal model motion manager
 * Controls character animations and motions
 * 
 * @interface Live2DMotionManager
 * @property {Object} definitions - Motion definitions including idle animation
 * @property {Function} startMotion - Start a motion with given name, priority, and index
 */
interface Live2DMotionManager {
  definitions: {
    idle?: unknown;
  };
  startMotion: (name: string, priority: number, index: number) => void;
}

/**
 * Interface for Live2D internal model
 * Contains the core components of a Live2D model
 * 
 * @interface Live2DInternalModel
 * @property {Live2DFocusController} [focusController] - Controller for eye focus
 * @property {Live2DCoreModel} [coreModel] - Core model for parameter access
 * @property {Live2DMotionManager} [motionManager] - Manager for motion control
 */
interface Live2DInternalModel {
  focusController?: Live2DFocusController;
  coreModel?: Live2DCoreModel;
  motionManager?: Live2DMotionManager;
}

/**
 * Interface for speak options when playing audio through the model
 * 
 * @interface SpeakOptions
 * @property {number} [volume] - Audio volume (0-1)
 * @property {number | string} [expression] - Expression ID or name to apply
 * @property {boolean} [resetExpression] - Whether to reset expression after playback
 * @property {string} [crossOrigin] - Cross-origin setting for audio
 * @property {Function} [onStart] - Callback when audio starts
 * @property {Function} [onFinish] - Callback when audio finishes
 * @property {Function} [onError] - Callback when error occurs
 */
interface SpeakOptions {
  volume?: number;
  expression?: number | string;
  resetExpression?: boolean;
  crossOrigin?: string;
  onStart?: () => void;
  onFinish?: () => void;
  onError?: (error: Error) => void;
}

/**
 * CharacterHandler class manages the interaction between audio playback and Live2D model animations
 * 
 * This class serves as the central coordinator for all character interactions, providing:
 * - Audio playback and lip-sync for Live2D models
 * - Model expressions and animations
 * - Mouse tracking for eye movement
 * - Audio queue management
 * - Microphone access for user input
 * 
 * It maintains internal state for audio processing, model configuration, and animation control,
 * while providing a clean interface for external components to interact with the character.
 * 
 * @class CharacterHandler
 */
export class CharacterHandler {
  private props: CharacterHandlerProps;
  private currentAudioUrl: string | null = null;
  private volumeInterval: NodeJS.Timeout | null = null;
  private isPlayingAudio: boolean = false;
  private audioContext: AudioContext | null = null;
  private model: Live2DModel | null = null;
  private audioQueue: AudioData[] = [];
  private audioQueueProcessing: boolean = false;
  private motionHandler: MotionHandler;
  private mouseTrackingHandler: MouseTrackingHandler;
  private expressionHandler: ExpressionHandler;
  private modelConfigHandler: ModelConfigHandler;
  private streamProcessor: ScriptProcessorNode | null = null;
  private audioBuffer: Float32Array[] = [];
  private bufferSize: number = 4096; // Fixed buffer size
  private sampleRate: number = 16000; // Standard sample rate
  private isProcessing: boolean = false;
  private silenceThreshold: number = 0.005; // Reduced from 0.01 to be less sensitive
  private silenceDuration: number = 1500; // Increased from 1000ms to 3000ms (3 seconds)
  private lastAudioTime: number = 0;
  private volumeHistory: number[] = [];
  private volumeHistorySize: number = 10; // Number of samples to keep for moving average
  private silenceCheckInterval: number = 200; // Increased from 100ms to 200ms to reduce checks
  private silenceCheckTimer: NodeJS.Timeout | null = null;

  /**
   * Creates a new CharacterHandler instance
   * 
   * @param props - The props containing references to audio context and state management functions
   */
  constructor(props: CharacterHandlerProps) {
    this.props = props;
    this.motionHandler = new MotionHandler();
    this.mouseTrackingHandler = new MouseTrackingHandler();
    this.expressionHandler = new ExpressionHandler();
    this.modelConfigHandler = new ModelConfigHandler();
    
    if (props.audioContextRef && props.audioContextRef.current) {
      this.audioContext = props.audioContextRef.current;
      console.log('[CharacterHandler] AudioContext set from props');
    }

    // Set initial model config
    if (props.modelConfig) {
      this.setModelConfig(props.modelConfig);
    }
  }

  /**
   * Sets the Live2D model reference and processes any queued audio
   * 
   * @param model - The Live2D model to set
   * @param modelPath - Optional model path for expression loading
   */
  setModel(model: Live2DModel | null, modelPath?: string): void {
    this.model = model;
    this.motionHandler.setModel(model);
    this.mouseTrackingHandler.setModel(model);
    this.expressionHandler.setModel(model);
    this.modelConfigHandler.setModel(model);
    
    // Set model path for expression loading if provided
    if (modelPath && model) {
      (model as any).modelPath = modelPath;
      console.log('[CharacterHandler] Model path set for expressions:', modelPath);
    }
    
    console.log('[CharacterHandler] Model set:', model ? 'available' : 'null');
    
    if (model && this.audioQueue.length > 0) {
      this.processAudioQueue();
    }
  }

  /**
   * Sets the model configuration
   * @param modelConfig - The model configuration to set
   */
  setModelConfig(modelConfig: ModelConfig): void {
    this.modelConfigHandler.setConfig(modelConfig);
    this.expressionHandler.setModelConfig(modelConfig);
    this.props.modelConfig = modelConfig;
  }

  /**
   * Gets the current model configuration
   * @returns The current model configuration
   */
  getModelConfig(): ModelConfig | null {
    return this.modelConfigHandler.getConfig();
  }

  /**
   * Requests microphone permissions from the user
   * Initializes the audio context if needed
   * 
   * @returns A promise that resolves when permissions are granted
   * @throws An error if permissions are denied or audio context cannot be initialized
   */
  async requestAudioPermissions(): Promise<void> {
    try {
      const result = await navigator.permissions.query({ name: 'microphone' as PermissionName });
      
      if (result.state === 'granted') {
        console.log('[CharacterHandler] Audio permissions already granted');
        this.props.setAudioPermissionGranted(true);
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      console.log('[CharacterHandler] Audio permissions granted');
      this.props.setAudioPermissionGranted(true);
      this.props.setAudioStream(stream);
      
      // Initialize AudioContext if not already initialized
      if (!this.props.audioContextRef.current) {
        console.log('[CharacterHandler] Creating new AudioContext');
        const AudioContextClass = window.AudioContext || ((window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
        if (!AudioContextClass) {
          throw new Error('AudioContext not supported in this browser');
        }
        
        const audioContext = new AudioContextClass();
        this.props.audioContextRef.current = audioContext;
        
        // Resume the context immediately
        try {
          await audioContext.resume();
          console.log('[CharacterHandler] AudioContext resumed successfully');
        } catch (error) {
          console.error('[CharacterHandler] Error resuming AudioContext:', error);
          throw error;
        }
      }
    } catch (error) {
      console.error('[CharacterHandler] Error requesting audio permissions:', error);
      this.props.setAudioPermissionGranted(false);
      throw error;
    }
  }

  /**
   * Handles audio updates for the character
   * Processes audio data and triggers lip sync if needed
   * 
   * @param audioData - The audio data to process
   * @returns A promise that resolves when the audio is processed
   */
  async handleAudioUpdate(audioData: AudioData): Promise<void> {
    console.log('[CharacterHandler] Processing audio update:', {
      hasAudio: !!audioData.data,
      format: audioData.format,
      timestamp: audioData.timestamp,
      duration: audioData.duration,
      volumes: audioData.volumes?.length || 0,
      modelAvailable: !!this.model,
      isPlaying: this.isPlayingAudio,
      expressions: audioData.actions?.expressions
    }
  );

    // If already playing, queue the audio for later
    if (this.isPlayingAudio || this.props.isPlayingRef.current) {
      console.log('[CharacterHandler] Already playing audio, queueing for later');
      this.queueAudioForLater(audioData);
      return;
    }

    // If model is not available, queue the audio for later
    if (!this.model) {
      console.log('[CharacterHandler] Model not available, queueing audio');
      this.queueAudioForLater(audioData);
      return;
    }

    // If audio context is not available, try to get it from props
    if (!this.audioContext && this.props.audioContextRef && this.props.audioContextRef.current) {
      this.audioContext = this.props.audioContextRef.current;
      console.log('[CharacterHandler] AudioContext set from props reference');
    }

    // If still no audio context, try to create one
    if (!this.audioContext) {
      try {
        const AudioContextClass = window.AudioContext || ((window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
        this.audioContext = new AudioContextClass();
        console.log('[CharacterHandler] Created new AudioContext for audio processing');
      } catch (error) {
        console.warn('[CharacterHandler] Could not create AudioContext, proceeding without it:', error);
      }
    }

    try {
      // Process audio data
      if (audioData.data) {
        console.log('[CharacterHandler] Processing audio data with model available');
        await this.processAudio(audioData);
      } else {
        console.warn('[CharacterHandler] No audio data to process');
        // If no audio data but volumes are provided, handle lip sync
        if (audioData.volumes && audioData.volumes.length > 0) {
          console.log('[CharacterHandler] Handling lip sync with volumes:', {
            volumes: audioData.volumes,
            sliceLength: audioData.slice_length || 20,
            expressions: audioData.actions?.expressions
          });
          await this.handleLipSyncVolumes(audioData.volumes, audioData.slice_length || 20, audioData.actions?.expressions?.[0] as number | string);
        }
      }

      // Handle display text if present
      if (audioData.display_text) {
        const text = typeof audioData.display_text === 'object' ? audioData.display_text.text : audioData.display_text;
        if (text) {
          console.log('[CharacterHandler] Display text:', text);
        }
      }
    } catch (error) {
      console.error('[CharacterHandler] Error processing audio update:', error);
      // Try next audio
      this.isPlayingAudio = false;
      this.props.isPlayingRef.current = false;
      this.processNextAudio();
    }
  }

  /**
   * Processes audio data by converting it to a playable format
   * 
   * @param audioData - The audio data to process
   * @returns A promise that resolves when the audio is processed
   */
  private async processAudio(audioData: AudioData): Promise<void> {
    try {
      console.log('[CharacterHandler] Starting audio processing:', {
        dataType: typeof audioData.data,
        dataSize: audioData.data instanceof ArrayBuffer ? audioData.data.byteLength : audioData.data?.length,
        format: audioData.format
      });

      // Convert string data to ArrayBuffer if needed
      let audioBuffer: ArrayBuffer;
      if (typeof audioData.data === 'string') {
        console.log('[CharacterHandler] Converting base64 string to ArrayBuffer');
        // Handle base64 string
        const binaryString = atob(audioData.data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        audioBuffer = bytes.buffer;
        console.log('[CharacterHandler] Base64 conversion complete:', {
          originalLength: audioData.data.length,
          bufferLength: audioBuffer.byteLength
        });
      } else {
        audioBuffer = audioData.data;
        console.log('[CharacterHandler] Using ArrayBuffer directly:', {
          bufferLength: audioBuffer.byteLength
        });
      }

      // Validate audio buffer
      if (!audioBuffer || audioBuffer.byteLength === 0) {
        console.error('[CharacterHandler] Invalid audio buffer:', {
          hasBuffer: !!audioBuffer,
          bufferLength: audioBuffer?.byteLength || 0
        });
        return;
      }

      // Create audio blob and URL
      const blob = new Blob([audioBuffer], { type: `audio/${audioData.format || 'mp3'}` });
      const url = URL.createObjectURL(blob);
      this.currentAudioUrl = url;
      
      console.log('[CharacterHandler] Created audio blob and URL:', {
        blobSize: blob.size,
        blobType: blob.type,
        url: url.substring(0, 50) + '...'
      });

      // Create and load audio element
      const audio = new Audio(url);
      audio.onloadeddata = () => {
        console.log('[CharacterHandler] Audio loaded successfully');
      };
      audio.onerror = (error) => {
        console.error('[CharacterHandler] Error loading audio:', error);
      };

      // Play audio via the model's speak method
      console.log('[CharacterHandler] Starting audio playback');
      await this.playAudio(audio, audioData);
    } catch (error) {
      console.error('[CharacterHandler] Error processing audio:', error);
      throw error; // Re-throw to be caught by the caller
    }
  }

  /**
   * Plays audio through the Live2D model's speak method
   * Handles lip sync and expressions during playback
   * 
   * @param audio - The audio element to play
   * @param audioData - The audio data containing metadata
   * @returns A promise that resolves when the audio starts playing
   */
  private async playAudio(audio: HTMLAudioElement, audioData: AudioData): Promise<void> {
    // Early return if model is not available
    if (!this.model) {
      console.error('[CharacterHandler] Cannot play audio: model not available');
      this.queueAudioForLater(audioData);
      return;
    }

    try {
      // Get audio URL and prepare options for the speak method
      const audioUrl = audio.src;
      
      // Make sure we're not already playing audio
      if (this.isPlayingAudio || this.props.isPlayingRef.current) {
        console.log('[CharacterHandler] Already playing audio, queueing this audio for later');
        this.queueAudioForLater(audioData);
        return;
      }
      
      // Extract expression information from audioData
      const expression = audioData.actions?.expressions?.[0];
      console.log('[CharacterHandler] Preparing to play audio with expression:', {
        audioUrl,
        expression,
        hasModel: !!this.model,
        modelConfig: this.getModelConfig()
      });
      
      const options: SpeakOptions = {
        volume: 1,
        crossOrigin: "anonymous",
        onStart: () => {
          console.log('[CharacterHandler] Audio playback started');
          // Dispatch character start speaking event
          window.dispatchEvent(new CustomEvent('character-start-speaking'));
          // Set speaking state
          this.props.setIsSpeaking(true);
        },
        onFinish: () => {
          console.log('[CharacterHandler] Audio playback finished');
          this.isPlayingAudio = false;
          this.props.isPlayingRef.current = false;
          this.cleanup();
          
          // Dispatch character stop speaking event
          window.dispatchEvent(new CustomEvent('character-stop-speaking'));
          // Clear speaking state
          this.props.setIsSpeaking(false);
          
          // Process next audio in queue
          this.processNextAudio();
        },
        onError: (err: Error) => {
          console.error('[CharacterHandler] Error playing audio:', err);
          this.handleAudioError(err);
          
          // Dispatch character stop speaking event on error
          window.dispatchEvent(new CustomEvent('character-stop-speaking'));
          // Clear speaking state on error
          this.props.setIsSpeaking(false);
          
          // Even on error, try to process the next audio
          this.isPlayingAudio = false;
          this.props.isPlayingRef.current = false;
          this.processNextAudio();
        }
      };
      
      // Add expression if provided in audioData
      if (expression !== undefined) {
        options.expression = expression;
        options.resetExpression = true;
        console.log('[CharacterHandler] Added expression to speak options:', {
          expression,
          resetExpression: options.resetExpression
        });
      }
      
      // Set playing state
      this.isPlayingAudio = true;
      this.props.isPlayingRef.current = true;
      
      // Use the model's speak method to handle audio playback and lip sync
      console.log('[CharacterHandler] Starting audio playback via model.speak with options:', options);
      await this.model.speak(audioUrl, options);
      
      console.log('[CharacterHandler] Audio started playing via model.speak');
    } catch (error) {
      console.error('[CharacterHandler] Error setting up audio playback:', error);
      this.handleAudioError(error instanceof Error ? error : new Error(String(error)));
      
      // On error, try to process the next audio
      this.isPlayingAudio = false;
      this.props.isPlayingRef.current = false;
      this.processNextAudio();
    }
  }

  /**
   * Updates the model's mouth based on audio volume
   * Handles lip sync animation for the character
   * 
   * @param volumes - Array of volume values for lip sync
   * @param sliceLength - Length of each volume slice in milliseconds
   * @param expression - Optional expression to apply during lip sync
   * @returns A promise that resolves when lip sync is complete
   */
  private async handleLipSyncVolumes(volumes: number[], sliceLength: number, expression?: number | string): Promise<void> {
    if (!this.model) {
      console.error('[CharacterHandler] Cannot handle lip sync: model not available');
      return;
    }

    try {
      console.log('[CharacterHandler] Lip sync volumes:', { 
        volumes: volumes,
        sliceLength: sliceLength,
        expression: expression
      });
      
      // Handle lip sync using the expression handler
      if (volumes.length > 0) {
        this.expressionHandler.updateMouth(volumes[0], expression);
      }
    } catch (error) {
      console.error('[CharacterHandler] Error handling lip sync:', error);
    }
  }

  /**
   * Animates the model based on mouse movement and audio volume
   * Controls eye focus and mouth movement
   * 
   * @param model - The Live2D model to animate
   * @param deltaTime - Time since last animation frame
   * @param currentVolume - Optional current audio volume for lip sync
   */
  animateModel(
    model: Live2DModel,
    deltaTime: number,
    currentVolume?: number
  ): void {
    if (!model) return;
    
    try {
      // Update mouse tracking focus
      this.mouseTrackingHandler.updateFocus(deltaTime);

      // Handle mouth movement based on volume
      if (typeof currentVolume === 'number' && !this.isPlayingAudio) {
        this.handleLipSyncVolumes([currentVolume], 20, this.props.modelConfig?.expressions?.[0]?.parameters?.[0].value as number | string);
      }
    } catch (error) {
      console.warn('[CharacterHandler] Error animating model:', error);
    }
  }

  /**
   * Sets up animation loop for the model
   * Initializes idle animations if available
   * 
   * @param model - The Live2D model to set up animation for
   */
  setupAnimation(model: Live2DModel): void {
    if (!model) {
      // console.warn('[CharacterHandler] Cannot set up animation for undefined model');
      return;
    }
    
    // console.log('[CharacterHandler] Setting up animation loop for model');
    
    // Set up any model-specific animation parameters
    const internalModel = model.internalModel as Live2DInternalModel;
    if (internalModel?.motionManager) {
      // Start idle animation if available
      if (internalModel.motionManager.definitions.idle) {
        internalModel.motionManager.startMotion('idle', 0, 0);
      }
    }
  }

  /**
   * Sets the model's expression with smooth interpolation
   * @param expressionId - The ID of the expression to set
   * @param duration - Duration of the expression transition in milliseconds
   */
  setModelExpression(expressionId: number, duration: number = 3000): void {
    this.expressionHandler.setExpression(expressionId, duration);
  }

  /**
   * Plays a motion on the model
   * @param categoryName - The category of the motion
   * @param animationIndex - The index of the animation within the category
   * @param priorityNumber - The priority of the animation (higher numbers override lower ones)
   * @param options - Additional options for the motion
   */
  playModelMotion(
    categoryName: string,
    animationIndex: number,
    priorityNumber: number = 3,
    options: {
      sound?: string;
      volume?: number;
      expression?: number;
      resetExpression?: boolean;
      onFinish?: () => void;
    } = {}
  ): void {
    this.motionHandler.playMotion(categoryName, animationIndex, priorityNumber, options);
  }

  /**
   * Sets up mouse tracking for the model
   * @param containerRef - Reference to the container element
   * @param isEnabled - Whether mouse tracking is enabled
   * @returns A cleanup function to remove event listeners
   */
  setupMouseTracking(
    containerRef: RefObject<HTMLDivElement>,
    isEnabled: boolean = true
  ): () => void {
    return this.mouseTrackingHandler.setupTracking(containerRef, isEnabled);
  }

  /**
   * Updates the enabled state of mouse tracking
   * @param isEnabled - Whether mouse tracking is enabled
   */
  setMouseTrackingEnabled(isEnabled: boolean): void {
    this.mouseTrackingHandler.setEnabled(isEnabled);
  }

  /**
   * Handles audio errors during playback
   * 
   * @param error - The error that occurred
   */
  private handleAudioError(error: Error | Event): void {
    console.error('[CharacterHandler] Audio error:', {
      error,
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      type: error instanceof Event ? error.type : undefined
    });
    
    this.props.isPlayingRef.current = false;
    this.isPlayingAudio = false;
    this.cleanup();
    
    // Try to process the next audio after error
    this.processNextAudio();
  }

  /**
   * Handles audio completion
   * Cleans up resources and processes the next audio in the queue
   */
  private handleAudioComplete(): void {
    this.cleanup();
    this.props.setCurrentAudio(null);

    if (this.props.audioQueueRef.current && this.props.audioQueueRef.current.length > 0) {
      const nextAudio = this.props.audioQueueRef.current.shift();
      if (nextAudio) {
        this.props.setCurrentAudio(nextAudio);
      }
    }
  }

  /**
   * Cleans up audio URL resources
   */
  private cleanupAudioUrl(): void {
    if (this.currentAudioUrl) {
      URL.revokeObjectURL(this.currentAudioUrl);
      this.currentAudioUrl = null;
    }
  }

  /**
   * Cleans up resources and resets state
   */
  cleanup(): void {
    console.log('[CharacterHandler] Cleaning up character handler');
    
    if (this.volumeInterval) {
      clearInterval(this.volumeInterval);
      this.volumeInterval = null;
    }
    
    if (this.silenceCheckTimer) {
      clearTimeout(this.silenceCheckTimer);
      this.silenceCheckTimer = null;
    }
    
    // Clean up handlers
    this.expressionHandler.cleanup();
    
    this.cleanupAudioUrl();
    this.isPlayingAudio = false;
    this.props.isPlayingRef.current = false;
    
    console.log('[CharacterHandler] Cleanup complete');
  }

  /**
   * Checks if audio is currently playing
   * 
   * @returns Whether audio is currently playing
   */
  isPlaying(): boolean {
    return this.isPlayingAudio;
  }

  /**
   * Sets the playing state
   * 
   * @param playing - Whether audio is playing
   */
  setPlaying(playing: boolean): void {
    this.isPlayingAudio = playing;
  }

  /**
   * Handles microphone toggle for user input
   * 
   * @param isRecording - Whether recording is currently active
   * @param audioPermissionGranted - Whether audio permissions are granted
   * @param audioStream - The current audio stream
   * @returns A promise that resolves when the microphone state is updated
   */
  async handleMicrophoneToggle(isRecording: boolean, audioPermissionGranted: boolean, audioStream: MediaStream | null): Promise<void> {
    try {
      if (!isRecording) {
        if (!audioPermissionGranted) {
          console.log('[CharacterHandler] Requesting microphone permissions');
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          this.props.setAudioPermissionGranted(true);
          this.props.setAudioStream(stream);
          await this.setupAudioProcessing(stream);
        } else if (audioStream) {
          await this.setupAudioProcessing(audioStream);
        }
        this.props.setIsRecording(true);
      } else {
        this.stopAudioProcessing();
        if (audioStream) {
          audioStream.getTracks().forEach(track => track.stop());
          this.props.setAudioStream(null);
        }
        this.props.setIsRecording(false);
      }
    } catch (error) {
      console.error('[CharacterHandler] Error accessing microphone:', error);
      this.props.setIsRecording(false);
      this.props.setAudioPermissionGranted(false);
    }
  }

  private async setupAudioProcessing(stream: MediaStream): Promise<void> {
    console.log('[CharacterHandler] Setting up audio processing');
    
    try {
      // Clean up any existing audio processing first
      this.stopAudioProcessing();
      
      // Use existing AudioContext from props if available, otherwise create new one
      if (!this.audioContext) {
        if (this.props.audioContextRef?.current) {
          this.audioContext = this.props.audioContextRef.current;
          console.log('[CharacterHandler] Using AudioContext from props');
        } else {
          console.log('[CharacterHandler] Creating new AudioContext');
          const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
          if (!AudioContextClass) {
            throw new Error('AudioContext not supported in this browser');
          }
          this.audioContext = new AudioContextClass({
            sampleRate: this.sampleRate
          });
          
          // Update the ref if it exists
          if (this.props.audioContextRef) {
            this.props.audioContextRef.current = this.audioContext;
          }
        }
      }

      // Ensure AudioContext is resumed (it might be suspended)
      if (this.audioContext.state === 'suspended') {
        console.log('[CharacterHandler] Resuming suspended AudioContext');
        await this.audioContext.resume();
      }

      // Validate stream
      if (!stream || stream.getTracks().length === 0) {
        throw new Error('Invalid audio stream: no tracks available');
      }

      // Check if stream is still active
      const audioTrack = stream.getAudioTracks()[0];
      if (!audioTrack || audioTrack.readyState === 'ended') {
        throw new Error('Audio stream track has ended');
      }

      const source = this.audioContext.createMediaStreamSource(stream);
      this.streamProcessor = this.audioContext.createScriptProcessor(this.bufferSize, 1, 1);

      this.streamProcessor.onaudioprocess = (e) => {
        if (!this.isProcessing) {
          this.isProcessing = true;
          
          try {
            const inputData = e.inputBuffer.getChannelData(0);
            const float32Array = new Float32Array(inputData);
            
            // Calculate current volume
            const currentVolume = this.calculateVolume(float32Array);
            this.updateVolumeHistory(currentVolume);
            
            // Add to buffer
            this.audioBuffer.push(float32Array);
            
            // Process buffer if it reaches a certain size (reduced from 4 to 2 for more frequent sending)
            if (this.audioBuffer.length >= 2) { // Process every 2 chunks (8192 samples) for more frequent voice data
              this.processAudioBuffer();
            }
          } catch (error) {
            console.error('[CharacterHandler] Error in audio processing callback:', error);
          } finally {
            this.isProcessing = false;
          }
        }
      };

      source.connect(this.streamProcessor);
      this.streamProcessor.connect(this.audioContext.destination);

      // Start silence detection
      this.startSilenceDetection();
      
      console.log('[CharacterHandler] Audio processing setup complete');
    } catch (error) {
      console.error('[CharacterHandler] Error setting up audio processing:', error);
      this.stopAudioProcessing();
      throw error;
    }
  }

  private calculateVolume(audioData: Float32Array): number {
    let sum = 0;
    for (let i = 0; i < audioData.length; i++) {
      sum += Math.abs(audioData[i]);
    }
    return sum / audioData.length;
  }

  private updateVolumeHistory(volume: number): void {
    this.volumeHistory.push(volume);
    if (this.volumeHistory.length > this.volumeHistorySize) {
      this.volumeHistory.shift();
    }
  }

  private getMovingAverageVolume(): number {
    if (this.volumeHistory.length === 0) return 0;
    const sum = this.volumeHistory.reduce((a, b) => a + b, 0);
    return sum / this.volumeHistory.length;
  }

  private startSilenceDetection(): void {
    this.lastAudioTime = Date.now();
    this.silenceCheckTimer = setInterval(() => {
      const currentTime = Date.now();
      const movingAverage = this.getMovingAverageVolume();
      
      if (movingAverage < this.silenceThreshold) {
        if (currentTime - this.lastAudioTime >= this.silenceDuration) {
          // Send mic-audio-end message
          this.sendMicAudioEnd();
        }
      } else {
        this.lastAudioTime = currentTime;
      }
    }, this.silenceCheckInterval);
  }

  private sendMicAudioEnd(): void {
    if (!this.props.isConnected) {
      console.warn('[CharacterHandler] Cannot send mic-audio-end: WebSocket not connected');
      return;
    }

    console.log('[CharacterHandler] Sending mic-audio-end message');
    this.props.sendMessage({
      type: 'mic-audio-end'
    } as WebSocketMessage);

    // Pause audio input and update recording state
    this.stopAudioProcessing();
    this.props.setIsRecording(false);
  }

  private processAudioBuffer(): void {
    if (this.audioBuffer.length === 0) return;

    console.log('[CharacterHandler] Processing audio buffer:', {
      chunks: this.audioBuffer.length,
      totalSamples: this.audioBuffer.length * this.bufferSize,
      bufferState: 'before-processing'
    });

    // Combine chunks into a single array
    const totalLength = this.audioBuffer.length * this.bufferSize;
    const combinedBuffer = new Float32Array(totalLength);
    
    let offset = 0;
    for (const chunk of this.audioBuffer) {
      combinedBuffer.set(chunk, offset);
      offset += chunk.length;
    }

    // Send the combined buffer
    this.sendAudioData(combinedBuffer);

    // Clear the buffer and log the state
    const previousBufferSize = this.audioBuffer.length;
    this.audioBuffer = [];
    
    console.log('[CharacterHandler] Buffer cleared after processing:', {
      previousChunks: previousBufferSize,
      currentChunks: this.audioBuffer.length,
      bufferState: 'after-processing'
    });
  }

  private sendAudioData(audioData: Float32Array): void {
    if (!this.props.isConnected) {
      console.warn('[CharacterHandler] Cannot send audio data: WebSocket not connected');
      return;
    }

    // Normalize audio data to ensure consistent values
    const normalizedData = this.normalizeAudioData(audioData);
    
    // Convert to regular array for JSON serialization
    const audioArray = Array.from(normalizedData);
    
    console.log('[CharacterHandler] Sending audio data:', {
      sampleCount: audioData.length,
      normalizedSampleCount: normalizedData.length,
      bufferState: 'sending'
    });
    
    // Send audio data through WebSocket
    this.props.sendMessage({
      type: 'mic-audio-data',
      audio: audioArray,
      sampleRate: this.sampleRate,
      bufferSize: this.bufferSize
    });

    // Log after sending
    console.log('[CharacterHandler] Audio data sent:', {
      sampleCount: audioData.length,
      bufferState: 'sent'
    });
  }

  private normalizeAudioData(audioData: Float32Array): Float32Array {
    // Find the maximum absolute value
    let max = 0;
    for (let i = 0; i < audioData.length; i++) {
      const absValue = Math.abs(audioData[i]);
      if (absValue > max) max = absValue;
    }

    // Normalize if max is greater than 1
    if (max > 1) {
      const normalized = new Float32Array(audioData.length);
      for (let i = 0; i < audioData.length; i++) {
        normalized[i] = audioData[i] / max;
      }
      return normalized;
    }

    return audioData;
  }

  private stopAudioProcessing(): void {
    console.log('[CharacterHandler] Stopping audio processing:', {
      remainingChunks: this.audioBuffer.length,
      bufferState: 'before-stop'
    });
    
    // Process any remaining audio data
    if (this.audioBuffer.length > 0) {
      this.processAudioBuffer();
    }
    
    // Stop silence detection
    if (this.silenceCheckTimer) {
      clearInterval(this.silenceCheckTimer);
      this.silenceCheckTimer = null;
    }
    
    if (this.streamProcessor) {
      this.streamProcessor.disconnect();
      this.streamProcessor = null;
    }
    
    this.audioBuffer = [];
    this.volumeHistory = [];
    this.isProcessing = false;

    console.log('[CharacterHandler] Audio processing stopped:', {
      bufferState: 'after-stop',
      isProcessing: this.isProcessing
    });
  }

  /**
   * Processes the audio queue
   * Handles one audio item at a time
   * 
   * @returns A promise that resolves when the audio queue is processed
   */
  private async processAudioQueue(): Promise<void> {
    if (this.audioQueueProcessing || this.audioQueue.length === 0 || !this.model) {
      return;
    }

    console.log(`[CharacterHandler] Processing ${this.audioQueue.length} queued audio items`);
    this.audioQueueProcessing = true;

    try {
      // Process just the first item in the queue
      // The rest will be processed via callbacks
        const audioData = this.audioQueue.shift();
        if (audioData) {
          await this.handleAudioUpdate(audioData);
      }
    } catch (error) {
      console.error('[CharacterHandler] Error processing audio queue:', error);
      
      // On error, make sure we're not stuck in processing state
      this.isPlayingAudio = false;
      this.props.isPlayingRef.current = false;
      
      // Try the next audio
      this.processNextAudio();
    } finally {
      this.audioQueueProcessing = false;
    }
  }

  /**
   * Queues audio data for later processing
   * 
   * @param audioData - The audio data to queue
   */
  private queueAudioForLater(audioData: AudioData): void {
    // Only add to the internal queue, not to the props queue
    this.audioQueue.push(audioData);
    
    console.log(`[CharacterHandler] Audio queued. Queue size: ${this.audioQueue.length}`);
  }

  /**
   * Processes the next audio in the queue
   */
  private processNextAudio(): void {
    if (this.isPlayingAudio || this.props.isPlayingRef.current) {
      console.log('[CharacterHandler] Cannot process next audio: already playing');
      return;
    }
    
    // Only check our internal queue
    if (this.audioQueue.length > 0) {
      const nextAudio = this.audioQueue.shift();
      if (nextAudio) {
        console.log('[CharacterHandler] Processing next audio from queue');
        // Use setTimeout to avoid potential call stack issues
        setTimeout(() => {
          this.handleAudioUpdate(nextAudio);
        }, 50);
      }
    }
  }

  /**
   * Updates the model's scale
   * 
   * @param scale - The new scale value
   */
  updateModelScale(scale: number): void {
    if (!this.model) {
      console.log('[CharacterHandler] Cannot update scale: model not available');
      return;
    }
    
    console.log('[CharacterHandler] Updating model scale:', {
      newScale: scale,
      currentScale: this.model.scale.x
    });
    
    // Apply scale to the model
    this.model.scale.set(scale);
  }

  public async handleLipSync(model: Live2DModel, volume: number): Promise<void> {
    if (!model) return;
    await this.handleLipSyncVolumes([volume], 20);
  }
} 