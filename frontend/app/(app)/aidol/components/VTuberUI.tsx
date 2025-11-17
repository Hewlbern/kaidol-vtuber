'use client';

import React, { useRef, useState, useEffect } from 'react';
import ConfigPanel from './ui/ConfigPanel';
import ChatInput from './ui/ChatInput';
import ModelUI from './ModelUI';
import { ChatMessage, WebSocketMessage } from './contexts/types/VTuberTypes';
import { useModel } from './contexts/ModelContext';
import { useWebSocket } from './contexts/WebSocketContext';
import { ModelProvider } from './contexts/ModelContext';
import { initializeModelLoading } from './contexts/loaders/ModelLoader';
import { Live2DModel } from 'pixi-live2d-display-lipsyncpatch';

interface AudioData {
  data: ArrayBuffer | string;
  format?: string;
  timestamp?: number;
  duration?: number;
  volumes?: number[];
  slice_length?: number;
  display_text?: { text: string; name?: string; avatar?: string };
  actions?: Record<string, unknown>;
}

// Inner component that uses useModel
function VTuberUIContent() {
  const { isConnected, sendMessage, clientId, connectionError } = useWebSocket();
  
  const {
    modelScale,
    modelPosition,
    positionState,
    showSubtitles,
    isPointerInteractive,
    isScrollToResizeEnabled,
    isBackgroundLoaded,
    backgroundError,
    handleScaleChange,
    handlePositionChange,
    handleSubtitleToggle,
    handlePointerInteractiveToggle,
    handleScrollToResizeToggle,
    handleBackgroundChange,
    handleBackgroundLoad,
    handleBackgroundError,
    characterHandler,
    handleAudioUpdate,
    handleMicrophoneToggle,
    isModelLoading,
    isAudioReady,
    isRecording
  } = useModel();
  
  // Add logging to track modelPosition from context
  
  // State management
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentAudio, setCurrentAudio] = useState<AudioData | undefined>(undefined);
  const [isClient, setIsClient] = useState(false);
  const [currentVolume, setCurrentVolume] = useState(0);
  
  // Refs for scale and position to avoid stale closures
  const scaleRef = useRef(modelScale);
  const positionRef = useRef(modelPosition);
  
  // Audio queue for audio received before model is ready
  const audioQueueRef = useRef<AudioData[]>([]);
  
  // Add state for mobile config panel visibility
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  
  // Add effect to handle window resize
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768) { // md breakpoint
        setIsConfigOpen(true);
      }
    };
    
    // Set initial state based on screen size
    handleResize();
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  // Initialize audio context on client side
  useEffect(() => {
    if (isClient) {
      // Request audio permissions from the browser
      const requestPermissions = async () => {
        try {
          // Check if we already have permissions
          const result = await navigator.permissions.query({ name: 'microphone' as PermissionName });
          
          // If not granted, request them
          if (result.state !== 'granted') {
            console.log('[VTuberUI] Requesting microphone permissions');
            await navigator.mediaDevices.getUserMedia({ audio: true });
          }
          
          // console.log('[VTuberUI] Audio permissions granted');
        } catch (error) {
          console.error('[VTuberUI] Error requesting audio permissions:', error);
        }
      };
      
      requestPermissions();
    }
  }, [isClient]);
  
  // Effect to check if we're on client-side
  useEffect(() => {
    // console.log('[VTuberUI] Setting client-side flag');
    setIsClient(true);
  }, []);
  
  // Process audio queue when model becomes ready (more lenient with audio context)
  useEffect(() => {
    if (isClient && characterHandler && audioQueueRef.current.length > 0) {
      console.log(`[VTuberUI] Processing ${audioQueueRef.current.length} queued audio items (CENTRALIZED AUDIO PROCESSING)`);
      
      // Process each queued audio item
      while (audioQueueRef.current.length > 0) {
        const audioData = audioQueueRef.current.shift();
        if (audioData) {
          console.log('[VTuberUI] Processing queued audio item:', {
            format: audioData.format,
            timestamp: audioData.timestamp
          });
          handleAudioUpdate(audioData).catch((err) => {
            console.error('[VTuberUI] Error processing queued audio:', err);
          });
        }
      }
    }
  }, [isClient, characterHandler, handleAudioUpdate]);

  // Additional effect to process audio queue when model loading completes
  useEffect(() => {
    const handleModelLoadComplete = () => {
      console.log('[VTuberUI] Model load complete - checking for queued audio');
      if (isClient && characterHandler && audioQueueRef.current.length > 0) {
        console.log(`[VTuberUI] Model ready - processing ${audioQueueRef.current.length} queued audio items`);
        
        // Process each queued audio item with a small delay to ensure everything is ready
        setTimeout(() => {
          while (audioQueueRef.current.length > 0) {
            const audioData = audioQueueRef.current.shift();
            if (audioData) {
              console.log('[VTuberUI] Processing queued audio item after model load:', {
                format: audioData.format,
                timestamp: audioData.timestamp
              });
              handleAudioUpdate(audioData).catch((err) => {
                console.error('[VTuberUI] Error processing queued audio after model load:', err);
              });
            }
          }
        }, 100); // Small delay to ensure model is fully ready
      }
    };

    window.addEventListener('model-load-complete', handleModelLoadComplete);
    return () => {
      window.removeEventListener('model-load-complete', handleModelLoadComplete);
    };
  }, [isClient, characterHandler, handleAudioUpdate]);

  // Periodic check to process audio queue (fallback mechanism)
  useEffect(() => {
    if (!isClient || !characterHandler) return;

    const checkAudioQueue = () => {
      if (audioQueueRef.current.length > 0) {
        console.log(`[VTuberUI] Periodic check - processing ${audioQueueRef.current.length} queued audio items`);
        
        // Process each queued audio item
        while (audioQueueRef.current.length > 0) {
          const audioData = audioQueueRef.current.shift();
          if (audioData) {
            console.log('[VTuberUI] Processing queued audio item (periodic check):', {
              format: audioData.format,
              timestamp: audioData.timestamp
            });
            handleAudioUpdate(audioData).catch((err) => {
              console.error('[VTuberUI] Error processing queued audio (periodic check):', err);
            });
          }
        }
      }
    };

    // Check every 2 seconds
    const interval = setInterval(checkAudioQueue, 2000);
    
    return () => {
      clearInterval(interval);
    };
  }, [isClient, characterHandler, handleAudioUpdate]);

  // Handle sending messages
  const handleSendMessage = (text: string) => {
    // Add user message to chat
    setMessages(prev => [...prev, { text, role: 'user' }]);
    
    // Send to server
    sendMessage({
      type: 'text-input',
      text: text
    } as WebSocketMessage);
  };

  // Listen for AI responses and autonomous chat messages
  useEffect(() => {
    if (!isConnected) return;

    const handleTextResponse = (event: CustomEvent<{ text: string; type: string }>) => {
      const { text, type } = event.detail;
      console.log('[VTuberUI] Handling text response:', { type, text });
      
      // Add message to chat with appropriate role
      setMessages(prev => {
        const newMessage: ChatMessage = { 
          text, 
          role: type === 'user-input-transcription' ? 'user' : 'ai' as const
        };
        console.log('[VTuberUI] Adding message to chat:', newMessage);
        console.log('[VTuberUI] Previous messages:', prev);
        console.log('[VTuberUI] New messages array:', [...prev, newMessage]);
        return [...prev, newMessage];
      });
    };

    const handleAutonomousChat = (event: CustomEvent<{ text: string; type: string; timestamp?: number; source?: string }>) => {
      const { text, source } = event.detail;
      console.log('[VTuberUI] Handling autonomous chat message:', { text, source });
      
      // Add autonomous message to chat
      setMessages(prev => {
        const newMessage: ChatMessage = { 
          text, 
          role: 'ai' as const
        };
        console.log('[VTuberUI] Adding autonomous chat message:', newMessage);
        return [...prev, newMessage];
      });
    };

    window.addEventListener('text-response', handleTextResponse as EventListener);
    window.addEventListener('autonomous-chat', handleAutonomousChat as EventListener);
    
    return () => {
      window.removeEventListener('text-response', handleTextResponse as EventListener);
      window.removeEventListener('autonomous-chat', handleAutonomousChat as EventListener);
    };
  }, [isConnected]);

  // Handle audio responses
  useEffect(() => {
    if (!isConnected) return;

    const handleAudioResponse = async (data: {
      data: ArrayBuffer | string;
      format?: string;
      timestamp?: number;
      duration?: number;
      volumes?: number[];
      slice_length?: number;
      display_text?: { text: string; name?: string; avatar?: string };
      actions?: Record<string, unknown>;
    }) => {
      // Log the audio response data
      console.log('[VTuberUI] Audio response received (CENTRALIZED AUDIO PROCESSING):', {
        format: data.format,
        timestamp: data.timestamp,
        duration: data.duration,
        hasAudio: !!data.data,
        audioType: typeof data.data,
        audioLength: data.data instanceof ArrayBuffer ? data.data.byteLength : data.data?.length,
        volumes: data.volumes,
        sliceLength: data.slice_length,
        displayText: data.display_text?.text,
        displayName: data.display_text?.name,
        displayAvatar: data.display_text?.avatar,
        actions: data.actions
      });

      // Add AI message to chat with the display text from the audio response
      if (data.display_text && typeof data.display_text === 'object' && 'text' in data.display_text) {
        setMessages(prev => [...prev, { text: data.display_text!.text, role: 'ai' }]);
      }

      // Handle audio data if present
      if (data.data) {
        // Ensure audio data is in the correct format
        let processedAudioData: ArrayBuffer | string;
        
        if (data.data instanceof ArrayBuffer) {
          processedAudioData = data.data;
        } else if (typeof data.data === 'string') {
          processedAudioData = data.data;
        } else {
          console.error('[VTuberUI] Invalid audio data format:', typeof data.data);
          return;
        }
        
        // Create audio data object
        const audioData: AudioData = {
          data: processedAudioData,
          format: data.format || 'mp3',
          timestamp: data.timestamp,
          duration: data.duration,
          volumes: data.volumes,
          slice_length: data.slice_length,
          display_text: data.display_text,
          actions: data.actions
        };
        
        // Update the current audio state for UI
        setCurrentAudio(audioData);
        
        // Store volume information for model animation
        if (data.volumes && data.volumes.length > 0) {
          setCurrentVolume(data.volumes[0]);
        }
        
        // If character handler is ready, process the audio
        // Be more lenient with audio context - if model is loaded, try to process
        if (characterHandler && !isModelLoading) {
          console.log('[VTuberUI] Processing audio immediately (CENTRALIZED AUDIO PROCESSING)');
          try {
            await handleAudioUpdate(audioData);
          } catch (error) {
            console.error('[VTuberUI] Error processing audio immediately:', error);
            // If immediate processing fails, queue it for later
            console.log('[VTuberUI] Queueing audio for later processing after immediate failure');
            audioQueueRef.current.push(audioData);
          }
        } else {
          console.log('[VTuberUI] Queueing audio for later processing - conditions not met:', {
            hasCharacterHandler: !!characterHandler,
            isAudioReady,
            isModelLoading,
            queueSize: audioQueueRef.current.length
          });
          audioQueueRef.current.push(audioData);
        }
      }
    };
    
    // Create a wrapper function that doesn't return a promise
    const audioHandlerWrapper = (e: CustomEvent<{
      data: ArrayBuffer | string;
      format?: string;
      timestamp?: number;
      duration?: number;
      volumes?: number[];
      slice_length?: number;
      display_text?: { text: string; name?: string; avatar?: string };
      actions?: Record<string, unknown>;
    }>) => {
      // Call the async function without awaiting it
      handleAudioResponse(e.detail).catch(error => {
        console.error('[VTuberUI] Error handling audio event:', error);
      });
    };
    
    // Register event listeners with proper casting (text-response is handled in the earlier useEffect)
    window.addEventListener('audio', audioHandlerWrapper as EventListener);
    
    return () => {
      window.removeEventListener('audio', audioHandlerWrapper as EventListener);
    };
  }, [isConnected, sendMessage, characterHandler, isAudioReady, isModelLoading, handleAudioUpdate]);

  // Handle microphone toggle
  const handleMicToggle = async () => {
    await handleMicrophoneToggle();
  };
  
  // Get the last AI message for subtitles
  const lastAiMessage = messages.length > 0 
    ? messages.filter(msg => msg.role === 'ai').slice(-1)[0] 
    : null;
  
  // Add this effect after the audio context effect
  useEffect(() => {
    if (!isClient) return;
    
    console.log('[VTuberUI] Setting up model-ready event listener');
    
    // Track if we've already loaded a model to prevent duplicates
    let modelInitialized = false;
    
    const handleModelReady = (event: CustomEvent<{
      containerRef: HTMLDivElement;
      dimensions: { width: number; height: number };
      modelPath: string;
    }>) => {
      // console.log('[VTuberUI] Received model-ready event, initializing model:', event.detail);
      
      // Only initialize if we haven't already
      if (modelInitialized) {
        console.log('[VTuberUI] Model already initialized, skipping duplicate initialization');
        return;
      }
      
      // Initialize model loading with the received container information
      if (event.detail.containerRef && event.detail.modelPath) {
        console.log('[VTuberUI] Calling initializeModelLoading with:', {
          containerRef: event.detail.containerRef,
          modelPath: event.detail.modelPath,
          dimensions: event.detail.dimensions
        });
        
        // Dispatch model-load-start event
        window.dispatchEvent(new CustomEvent('model-load-start'));
        
        // Set flag to prevent duplicate initialization
        modelInitialized = true;
        
        // Initialize model loading
        initializeModelLoading({
          containerRef: { current: event.detail.containerRef },
          modelPath: event.detail.modelPath,
          width: event.detail.dimensions.width,
          height: event.detail.dimensions.height,
          scale: modelScale,
          position: positionState,
          onModelLoaded: (loadedModel, app) => {
            console.log('[VTuberUI] Model loaded successfully:', loadedModel);
            
            // Notify about successful model loading
            window.dispatchEvent(new CustomEvent('model-load-complete', {
              detail: { model: loadedModel, app }
            }));
            
            // Update character handler with the loaded model if needed
            if (characterHandler && typeof characterHandler.setModel === 'function') {
              console.log('[VTuberUI] Setting model in character handler');
              characterHandler.setModel(loadedModel as unknown as Live2DModel);
            }
          },
          onModelLoadFailed: (err) => {
            console.error('[VTuberUI] Failed to load model:', err);
            window.dispatchEvent(new CustomEvent('model-load-error', {
              detail: { message: err.message }
            }));
            // Reset flag to allow retry
            modelInitialized = false;
          }
        }).catch(err => {
          console.error('[VTuberUI] Error in model initialization:', err);
          // Reset flag to allow retry
          modelInitialized = false;
        });
      }
    };
    
    window.addEventListener('model-ready', handleModelReady as EventListener);
    
    return () => {
      window.removeEventListener('model-ready', handleModelReady as EventListener);
    };
  }, [isClient, characterHandler, modelScale, positionState]);

  return (
    <div className="h-screen flex flex-col bg-gray-900">
      {/* Main content wrapper - takes up the whole screen except for chat area */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* Left sidebar - Config Panel with Chat */}
        <div 
          className={`absolute md:relative inset-0 z-30 md:z-auto transform transition-transform duration-300 ease-in-out ${
            isConfigOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
          }`}
        >
          <ConfigPanel
            isConnected={isConnected}
            connectionError={connectionError || ""}
            backgroundError={backgroundError}
            clientId={clientId}
            onBackgroundChange={handleBackgroundChange}
            onScaleChange={(scale) => {
              scaleRef.current = scale;
              handleScaleChange(scale);
            }}
            onPositionChange={(x, y) => {
              positionRef.current = { x, y };
              handlePositionChange({ x, y });
            }}
            onSubtitleToggle={handleSubtitleToggle}
            onPointerInteractiveChange={handlePointerInteractiveToggle}
            onScrollToResizeChange={handleScrollToResizeToggle}
            currentScale={modelScale}
            currentPosition={positionState}
            isPointerInteractive={isPointerInteractive}
            isScrollToResizeEnabled={isScrollToResizeEnabled}
            messages={messages}
          />
        </div>
        
        {/* Main content area */}
        <div className="flex-1 relative w-full">
          {/* Mobile config toggle button */}
          <button
            onClick={() => setIsConfigOpen(!isConfigOpen)}
            className="md:hidden absolute top-2 left-2 z-40 bg-[#2d2e47]/90 text-white p-2 rounded-lg shadow-lg"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          
          <ModelUI
            modelScale={modelScale}
            modelPosition={positionState}
            isPointerInteractive={isPointerInteractive}
            isScrollToResizeEnabled={isScrollToResizeEnabled}
            showSubtitles={showSubtitles}
            lastAiMessage={lastAiMessage}
            isClient={isClient}
            onBackgroundLoad={handleBackgroundLoad}
            onBackgroundError={() => handleBackgroundError(backgroundError)}
            isBackgroundLoaded={isBackgroundLoaded}
            backgroundError={backgroundError}
            currentAudio={currentAudio}
            currentVolume={currentVolume}
            onAudioComplete={() => setCurrentAudio(undefined)}
          />
        </div>
      </div>
      
      {/* Bottom Chat Area */}
      <div className="flex flex-col">   
        {/* Chat Input */}
        <ChatInput 
          onSendMessage={handleSendMessage} 
          isRecording={isRecording}
          onMicrophoneToggle={handleMicToggle}
        />
      </div>
    </div>
  );
}

// Main component that provides the ModelContext
export default function VTuberUI() {
  // Create AudioContext early to ensure it's available throughout the app
  const [audioContext, setAudioContext] = useState<AudioContext | null>(null);
  const { isConnected, sendMessage } = useWebSocket();
  
  // Initialize AudioContext on client side
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        // Create AudioContext
        const AudioContextClass = window.AudioContext || 
          ((window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
        
        // Create and initialize context
        const context = new AudioContextClass();
        
        // Set the context immediately, then try to resume
        setAudioContext(context);
        console.log('[VTuberUI] AudioContext created, attempting to resume...');
        
        // Resume context (important for some browsers)
        context.resume().then(() => {
          console.log('[VTuberUI] AudioContext initialized and resumed successfully');
        }).catch(error => {
          console.error('[VTuberUI] Failed to resume AudioContext:', error);
          // Context is still usable even if resume fails
          console.log('[VTuberUI] AudioContext available despite resume failure');
        });
      } catch (error) {
        console.error('[VTuberUI] Failed to create AudioContext:', error);
        // Create a fallback context even if the main one fails
        try {
          const fallbackContext = new (window as any).webkitAudioContext();
          setAudioContext(fallbackContext);
          console.log('[VTuberUI] Using fallback AudioContext');
        } catch (fallbackError) {
          console.error('[VTuberUI] Fallback AudioContext also failed:', fallbackError);
        }
      }
    }
  }, []);
  
  return (
    <ModelProvider 
      isConnected={isConnected}
      sendMessage={sendMessage}
      audioContext={audioContext}
    >
      <VTuberUIContent />
    </ModelProvider>
  );
} 