/**
 * ModelUI Component
 * 
 * This component combines the functionality of Live2D model rendering and background display
 * into a single unified component.
 */

'use client';

import React, { useEffect, useState, useRef, useMemo } from 'react';
import { ChatMessage } from './contexts/types/VTuberTypes';
import { useModel } from './contexts/ModelContext';
import Image from 'next/image';

/**
 * Interface for combined ModelUI props
 */
interface ModelUIProps {
  modelScale: number;
  modelPosition: { x: number; y: number };
  isPointerInteractive?: boolean;
  isScrollToResizeEnabled?: boolean;
  showSubtitles?: boolean;
  lastAiMessage?: ChatMessage | null;
  isClient: boolean;
  onBackgroundLoad: () => void;
  onBackgroundError: () => void;
  isBackgroundLoaded: boolean;
  backgroundError: string | null;
  currentVolume?: number;
  currentAudio?: {
    data: ArrayBuffer | string;
    format?: string;
    timestamp?: number;
    duration?: number;
    volumes?: number[];
    slice_length?: number;
    display_text?: { text: string; name?: string; avatar?: string };
    actions?: Record<string, unknown>;
  };
  onAudioComplete?: () => void;
}

// Add types for Live2D model and app
interface Live2DModel {
  position: {
    set: (x: number, y: number) => void;
  };
}

interface Live2DApp {
  screen: {
    width: number;
    height: number;
  };
}

/**
 * Combined component for rendering Live2D model with background
 */
const ModelUI: React.FC<ModelUIProps> = ({
  modelScale,
  modelPosition,
  isPointerInteractive = false,
  isScrollToResizeEnabled = false,
  showSubtitles = false,
  lastAiMessage,
  isClient,
  onBackgroundLoad,
  onBackgroundError,
  isBackgroundLoaded,
  backgroundError,
  currentAudio,
}) => {
  const { 
    modelPath, 
    backgroundPath,
    containerRef,
    containerDimensions,
    characterHandler
  } = useModel();
  
  // Track if libraries are loaded
  const [librariesLoaded, setLibrariesLoaded] = useState(false);
  const [modelLoaded, setModelLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const modelContainerRef = useRef<HTMLDivElement>(null);
  
  // Add refs for model and app
  const modelRef = useRef<Live2DModel | null>(null);
  const appRef = useRef<Live2DApp | null>(null);
  
  // Add safety check for modelPosition with useMemo
  const safeModelPosition = useMemo(() => modelPosition || { x: 0.5, y: 0.5 }, [modelPosition]);
  const safeModelScale = modelScale !== undefined ? modelScale : .2;
  
  // Check for Live2D libraries
  useEffect(() => {
    if (!isClient) return;
    
    const checkLibraries = () => {
      try {
        
        if (
          typeof window !== 'undefined' &&
          window.Live2DCubismCore !== undefined &&
          Object.keys(window.Live2DCubismCore).length > 0 &&
          window.PIXI !== undefined
        ) {
          console.log('[ModelUI] DEBUG: Live2D libraries confirmed loaded and ready');
          setLibrariesLoaded(true);
        } else {
          console.log('[ModelUI] DEBUG: Waiting for Live2D libraries - not fully loaded yet');
          setTimeout(checkLibraries, 200);
        }
      } catch (e) {
        console.error('[ModelUI] DEBUG: Error checking libraries:', e);
        setTimeout(checkLibraries, 500);
      }
    };
    
    console.log('[ModelUI] DEBUG: Starting library check process');
    checkLibraries();
  }, [isClient]);
  
  // Handle loading events
  useEffect(() => {
    if (!isClient) return;
    
    const handleModelLoadStart = () => {
      console.log('[ModelUI] DEBUG: 🔄 EVENT: model-load-start triggered');
      setIsLoading(true);
      setModelLoaded(false);
      setError(null);
    };
    
    const handleModelLoadComplete = () => {
      console.log('[ModelUI] DEBUG: ✅ EVENT: model-load-complete triggered');
      setIsLoading(false);
      setModelLoaded(true);
    };
    
    const handleModelLoadError = (event: CustomEvent<{message?: string}>) => {
      // console.log('[ModelUI] DEBUG: ❌ EVENT: model-load-error triggered', event.detail);
      setIsLoading(false);
      setError(new Error(event.detail?.message || 'Failed to load model'));
    };
    
    console.log('[ModelUI] DEBUG: Setting up model loading event listeners');
    window.addEventListener('model-load-start', handleModelLoadStart);
    window.addEventListener('model-load-complete', handleModelLoadComplete);
    window.addEventListener('model-load-error', handleModelLoadError as EventListener);
    
    return () => {
      console.log('[ModelUI] DEBUG: Removing model loading event listeners');
      window.removeEventListener('model-load-start', handleModelLoadStart);
      window.removeEventListener('model-load-complete', handleModelLoadComplete);
      window.removeEventListener('model-load-error', handleModelLoadError as EventListener);
    };
  }, [isClient]);
  
  // Initialize the model when libraries are loaded
  useEffect(() => {
    if (!isClient || !librariesLoaded || !characterHandler || 
        !containerDimensions.width || !containerDimensions.height || 
        !modelContainerRef.current) {
      return;
    }
    
    // Tell the character handler about the Live2D environment
    try {
      const isModelElementPresent = document.querySelector('canvas');
      if (isModelElementPresent) {
        console.log('[ModelUI] DEBUG: Canvas element already exists, not dispatching duplicate model-ready event');
        return;
      }
      
      window.dispatchEvent(new CustomEvent('model-ready', { 
        detail: { 
          containerRef: modelContainerRef.current,
          dimensions: containerDimensions,
          modelPath
        } 
      }));
      
      console.log('[ModelUI] DEBUG: Model initialization process started');
    } catch (error) {
      console.error('[ModelUI] DEBUG: ❌ Failed to initialize model:', error);
      setError(error instanceof Error ? error : new Error(String(error)));
    }
  }, [
    isClient, 
    librariesLoaded, 
    characterHandler, 
    containerDimensions, // Include the entire containerDimensions object
    modelPath
  ]);
  
  // Audio processing has been moved to VTuberUI
  useEffect(() => {
    if (currentAudio) {
      console.log('[ModelUI] DEBUG: Audio data received but processing is now handled by VTuberUI');
    }
  }, [currentAudio]);
  
  // Add effect to handle background changes
  useEffect(() => {
    const handleBackgroundChange = (event: CustomEvent) => {
      console.log('[ModelUI] DEBUG: Background change detected:', event.detail.backgroundPath);
      // Reset loading state when background changes
      onBackgroundLoad();
    };

    window.addEventListener('background-path-change', handleBackgroundChange as EventListener);
    return () => {
      window.removeEventListener('background-path-change', handleBackgroundChange as EventListener);
    };
  }, [onBackgroundLoad]);

  // Debug effect to monitor key state changes
  useEffect(() => {
    console.log('[ModelUI] DEBUG: Model loading status update:', { 
      librariesLoaded, 
      isLoading,
      modelLoaded,
      modelPath,
      error: error?.message,
      containerDimensionsReady: containerDimensions.width > 0 && containerDimensions.height > 0
    });
    
    // Check which event dispatched the model-load-start
    if (isLoading && !modelLoaded) {
      console.log('[ModelUI] DEBUG: Model load in progress - checking for events');
      const modelReadyEvent = new CustomEvent('model-ready-check');
      window.dispatchEvent(modelReadyEvent);
    }
  }, [librariesLoaded, isLoading, modelLoaded, error, containerDimensions, modelPath]);

  // Update model position when it changes
  useEffect(() => {
    if (modelRef.current && appRef.current) {
      const position = typeof modelPosition === 'object' && modelPosition !== null
        ? modelPosition
        : { x: 0.5, y: 0.5 };
      
      modelRef.current.position.set(
        position.x * appRef.current.screen.width,
        position.y * appRef.current.screen.height
      );
    }
  }, [modelPosition, safeModelPosition]); // Include safeModelPosition in dependencies

  return (
    <div ref={containerRef} className="flex-1 relative w-full h-full overflow-hidden bg-gray-900">
      {/* Background image with improved styling */}
      {backgroundPath && isClient && (
        <div className="absolute inset-0 w-full h-full z-0">
          <Image 
            src={backgroundPath} 
            alt="Background" 
            fill
            className="object-cover"
            onLoad={onBackgroundLoad}
            onError={onBackgroundError}
            priority
          />
          
          {/* Background loading overlay */}
          {!isBackgroundLoaded && !backgroundError && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-200 bg-opacity-50">
              <div className="text-gray-700 flex flex-col items-center">
                <div className="animate-spin h-6 w-6 md:h-8 md:w-8 border-4 border-blue-500 rounded-full border-t-transparent"></div>
                <p className="mt-2 text-sm md:text-base">Loading background...</p>
              </div>
            </div>
          )}
        </div>
      )}
      
      {/* Live2D Model Container */}
      <div className="absolute inset-0 z-10 w-full h-full flex items-center justify-center">
        {/* Model container */}
        <div 
          ref={modelContainerRef}
          className="w-full h-full max-w-[100vw] md:max-w-none"
          id="live2d-container"
        />
        
        {/* Loading state */}
        {isClient && (!librariesLoaded || isLoading) && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-800 bg-opacity-50 z-20">
            <div className="text-white text-center">
              <div className="animate-spin h-8 w-8 md:h-10 md:w-10 border-4 border-blue-500 rounded-full border-t-transparent mx-auto mb-2"></div>
              <p className="text-sm md:text-base">{!librariesLoaded ? "Initializing Live2D libraries..." : "Loading model..."}</p>
              <p className="text-xs mt-2 text-gray-300">{modelPath.split('/').pop()}</p>
            </div>
          </div>
        )}
        
        {/* Error state */}
        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200 p-4 text-center z-20">
            <h3 className="text-base md:text-lg font-bold mb-2">Failed to load Live2D model</h3>
            <p className="mb-4 text-sm md:text-base">{error.message}</p>
            <div className="text-xs md:text-sm">
              <p className="mb-2">Model path: {modelPath}</p>
              <p className="mb-2">Make sure the model file exists in the public directory or use a valid URL.</p>
              <p>If using a remote URL, ensure CORS is properly configured.</p>
            </div>
            <div className="mt-4 p-2 bg-red-200 dark:bg-red-800 rounded text-xs overflow-auto max-h-32 w-full">
              <pre>{error.stack || error.message}</pre>
            </div>
            <button 
              className="mt-4 bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 md:px-4 md:py-2 rounded text-sm md:text-base active:scale-95"
              onClick={() => window.location.reload()}
            >
              Reload Page
            </button>
          </div>
        )}

        {/* Subtitles display */}
        {showSubtitles && lastAiMessage && (
          <div className="absolute bottom-8 left-0 right-0 z-30 p-2 text-center">
            <div className="mx-auto inline-block bg-black bg-opacity-50 text-white px-4 py-2 md:px-6 md:py-3 rounded-lg max-w-[90%] text-sm md:text-lg">
              {lastAiMessage.text}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ModelUI; 