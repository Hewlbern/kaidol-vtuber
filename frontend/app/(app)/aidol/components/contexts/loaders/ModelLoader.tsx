/**
 * ModelLoader Component
 * 
 * This component handles the loading and initialization of Live2D models.
 * It provides utilities for loading models, managing their lifecycle, and handling
 * positioning and scaling.
 */

'use client';

import React from 'react';
import * as PIXI from 'pixi.js';

// Define type for dynamic imports
type Live2DModelConstructor = {
  Live2DModel: {
    from: (path: string) => Promise<Live2DDisplayObject>;
  };
};

// Use dynamic imports instead of static imports
let Live2DModelCubism4: Live2DModelConstructor['Live2DModel'] | null = null;
let Live2DModelCubism2: Live2DModelConstructor['Live2DModel'] | null = null;

// Ensure libraries are loaded only on client side
if (typeof window !== 'undefined') {
  // Add global error handler for WebGL context issues
  window.addEventListener('error', (event) => {
    if (event.error && event.error.message && event.error.message.includes('_currentFrameNo')) {
      console.error('[ModelLoader] GLOBAL ERROR: WebGL Context Issue Detected!', {
        error: event.error.message,
        stack: event.error.stack,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        possibleSolutions: [
          'Check if WebGL is supported in your browser',
          'Try refreshing the page to reset WebGL context',
          'Check if other WebGL applications are running',
          'Verify model texture size is within WebGL limits',
          'Check browser console for WebGL extension errors'
        ]
      });
    }
  });
  
  import('pixi-live2d-display-lipsyncpatch/cubism4').then(module => {
    Live2DModelCubism4 = {
      from: async (path: string) => {
        const model = await module.Live2DModel.from(path);
        return model as unknown as Live2DDisplayObject;
      }
    };
  });
  import('pixi-live2d-display-lipsyncpatch/cubism2').then(module => {
    Live2DModelCubism2 = {
      from: async (path: string) => {
        const model = await module.Live2DModel.from(path);
        return model as unknown as Live2DDisplayObject;
      }
    };
  });
}

// Define types for Live2D model internals
interface Live2DInternalModel {
  tag: string;
  internalModel: unknown;
  textures: unknown;
  transform: unknown;
  glContextID: number;
  elapsedTime: number;
  deltaTime: number;
  _autoUpdate: boolean;
  update(deltaTime: number): void;
  render(renderer: PIXI.Renderer): void;
}

// Define generic Live2D model type for better TypeScript compatibility
export interface Live2DDisplayObject extends Live2DInternalModel {
  width: number;
  height: number;
  scale: PIXI.Point;
  position: PIXI.Point;
  anchor?: PIXI.ObservablePoint;
  visible: boolean;
  alpha: number;
  parent?: PIXI.Container;
  interactive?: boolean;
  destroy(): void;
}

// Interface for the Live2DModel static class
export interface Live2DModelStatic {
  from(modelPath: string): Promise<Live2DDisplayObject>;
}

// Will be populated in useEffect
let Live2DModelInstance: Live2DModelStatic | null = null;

// Update getModelLoader to handle SSR safely
const getModelLoader = async (modelPath: string): Promise<Live2DModelStatic> => {
  console.log('[ModelLoader] DEBUG: getModelLoader called with:', modelPath);
  // Guard against server-side rendering
  if (typeof window === 'undefined') {
    throw new Error('Live2D models can only be loaded in the browser');
  }
  
  // Ensure the Live2D models are loaded
  console.log('[ModelLoader] DEBUG: Checking library loading status:', {
    hasCubism4: !!Live2DModelCubism4,
    hasCubism2: !!Live2DModelCubism2,
    timestamp: new Date().toISOString()
  });
  
  if (!Live2DModelCubism4 || !Live2DModelCubism2) {
    console.log('[ModelLoader] DEBUG: Waiting for libraries to load...');
    await new Promise<void>(resolve => {
      const checkLoaded = () => {
        if (Live2DModelCubism4 && Live2DModelCubism2) {
          console.log('[ModelLoader] DEBUG: Libraries loaded successfully');
          resolve();
        } else {
          console.log('[ModelLoader] DEBUG: Still waiting for libraries...', {
            hasCubism4: !!Live2DModelCubism4,
            hasCubism2: !!Live2DModelCubism2
          });
          setTimeout(checkLoaded, 100);
        }
      };
      checkLoaded();
    });
  }
  
  try {
    console.log('[ModelLoader] DEBUG: Determining model type for:', modelPath);
    // Try to load as Cubism 4 first
    const response = await fetch(modelPath);
    console.log('[ModelLoader] DEBUG: Model file fetch response:', {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
      url: response.url
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch model file: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    console.log('[ModelLoader] DEBUG: Model file parsed successfully:', {
      version: data.Version,
      hasFileReferences: !!data.FileReferences,
      fileReferences: data.FileReferences,
      hasGroups: !!data.Groups,
      groups: data.Groups
    });
    
    // Check if it's a Cubism 4 model by looking for Version field
    if (data.Version === 3 || data.Version === 4) {
      console.log('[ModelLoader] DEBUG: Detected Cubism 4 model (Version:', data.Version, ')');
      return Live2DModelCubism4 as unknown as Live2DModelStatic;
    }
    
    // If not Cubism 4, try Cubism 2
    console.log('[ModelLoader] DEBUG: Detected Cubism 2 model (Version:', data.Version, ')');
    return Live2DModelCubism2 as unknown as Live2DModelStatic;
  } catch (error) {
    console.error('[ModelLoader] DEBUG: Error determining model version:', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      modelPath
    });
    // Default to Cubism 4 if we can't determine the version
    return Live2DModelCubism4 as unknown as Live2DModelStatic;
  }
};

// Update the fallback paths to include the correct model directory
export const DEFAULT_FALLBACK_PATHS = [
  '/model/vanilla/',
  '/model/shizuku/',
  '/model/',
  '/models/default/',
  '/models/',
  '/'
];

// Define interface for model loading result
export interface LoadLive2DModelResult {
  success: boolean;
  model?: Live2DDisplayObject;
  pixiApp?: PIXI.Application;
  error?: Error;
  cleanup: () => void;
}

// Check if libraries are available
export const waitForLibraries = (timeout = 10000): Promise<void> => {
  return new Promise<void>((resolve, reject) => {
    // Set a timeout to avoid waiting forever
    const timeoutId = setTimeout(() => {
      reject(new Error('Timeout waiting for Live2D libraries'));
    }, timeout);
    
    const checkLibs = () => {
      if (
        typeof window !== 'undefined' && 
        window.Live2DCubismCore && 
        window.PIXI
      ) {
        clearTimeout(timeoutId);
        resolve();
      } else {
        setTimeout(checkLibs, 100);
      }
    };
    checkLibs();
  });
};

// Function to destroy a Live2D model and clean up resources
export const destroyLive2DModel = (model: Live2DDisplayObject | null, app: PIXI.Application | null) => {
  console.log('[ModelLoader] Starting model destruction:', { 
    hasModel: !!model, 
    hasApp: !!app,
    modelType: model ? typeof model : 'null',
    appType: app ? typeof app : 'null',
    modelProperties: model ? Object.keys(model) : [],
    appProperties: app ? Object.keys(app) : []
  });

  if (model) {
    try {
      console.log('[ModelLoader] Removing model from stage...');
      
      // Remove from stage if it has a parent
      if (model.parent) {
        console.log('[ModelLoader] Model has parent, removing from stage');
        try {
          (model.parent as PIXI.Container).removeChild(model as unknown as PIXI.DisplayObject);
        } catch (e) {
          console.warn('[ModelLoader] Error removing model from parent:', e);
        }
      }
      
      // Check if model has destroy method before calling it
      if (typeof model.destroy === 'function') {
        console.log('[ModelLoader] Calling model.destroy()');
        try {
          model.destroy();
        } catch (e) {
          console.warn('[ModelLoader] Error in model.destroy():', e);
        }
      } else {
        console.warn('[ModelLoader] Model does not have destroy method');
      }
    } catch (e) {
      console.error('[ModelLoader] Error destroying Live2D model:', e);
    }
  }
  
  if (app) {
    try {
      console.log('[ModelLoader] Destroying PIXI application...');
      // Check if app has destroy method before calling it
      if (typeof app.destroy === 'function') {
        try {
          // Remove all children from stage first
          if (app.stage) {
            console.log('[ModelLoader] Removing all children from stage');
            app.stage.removeChildren();
          }
          app.destroy(true, { children: true, texture: true, baseTexture: true });
        } catch (e) {
          console.warn('[ModelLoader] Error in app.destroy():', e);
        }
      } else {
        console.warn('[ModelLoader] App does not have destroy method');
      }
    } catch (e) {
      console.error('[ModelLoader] Error destroying PIXI application:', e);
    }
  }
};

// Function to center model on stage
export const centerModelOnStage = (model: Live2DDisplayObject, app: PIXI.Application, customPosition?: { x: number, y: number }) => {
  if (!model || !app) return;
  
  console.log('Positioning model on stage...');
  
  // Set anchor to center if available
  if (model.anchor) {
    model.anchor.set(0.5, 0.5);
  }
  
  // Calculate the scale factor to fit the container while maintaining aspect ratio
  const containerAspect = app.renderer.width / app.renderer.height;
  const modelAspect = model.width / model.height;
  
  let scaleFactor;
  if (containerAspect > modelAspect) {
    // Container is wider than model - fit to height
    scaleFactor = app.renderer.height / model.height;
  } else {
    // Container is taller than model - fit to width
    scaleFactor = app.renderer.width / model.width;
  }
  
  // Apply base scale
  model.scale.set(scaleFactor);
  
  // If custom position is provided, use it (in 0-1 range)
  if (customPosition) {
    const xPos = customPosition.x * app.renderer.width;
    const yPos = customPosition.y * app.renderer.height;
    model.position.set(xPos, yPos);
    console.log('Model positioned at custom position:', xPos, yPos);
  } else {
    // Otherwise center the model
    model.position.set(
      app.renderer.width / 2,
      app.renderer.height / 2
    );
    console.log('Model centered. Position:', model.position);
  }
};

// Define interface for model loading options
export interface ModelLoadingOptions {
  containerRef: React.RefObject<HTMLDivElement | null>;
  modelPath: string;
  width: number;
  height: number;
  scale?: number;
  position?: { x: number; y: number };
  fallbackPaths?: string[];
  onModelLoaded?: (model: Live2DDisplayObject, app: PIXI.Application) => void;
  onModelLoadFailed?: (error: Error) => void;
  onModelUnloaded?: () => void;
}

// Function to unload a model
export const unloadLive2DModel = (
  model: Live2DDisplayObject | null,
  app: PIXI.Application | null,
  onModelUnloaded?: () => void
) => {
  console.log('[ModelLoader] Starting model unload:', {
    hasModel: !!model,
    hasApp: !!app,
    modelPath: model ? (model as unknown as { modelPath: string }).modelPath : 'unknown'
  });

  if (model) {
    console.log('[ModelLoader] Unloading Live2D model...');
    destroyLive2DModel(model, app);
    model = null;
    app = null;
    onModelUnloaded?.();
  }
};

// Add current model and app references
let currentModel: Live2DDisplayObject | null = null;
let currentApp: PIXI.Application | null = null;

// Function to handle model path changes
export const handleModelPathChange = async (
  newPath: string,
  currentPath: string,
  options: ModelLoadingOptions,
  onPathChange: (path: string) => void
) => {
  if (newPath === currentPath) return;

  console.log(`Model path changed from ${currentPath} to ${newPath}`);
  onPathChange(newPath);
};

// Function to initialize model loading
export const initializeModelLoading = async (
  options: ModelLoadingOptions
): Promise<LoadLive2DModelResult> => {
  const {
    containerRef,
    modelPath,
    width,
    height,
    scale = 0.5,
    position = { x: 0.5, y: 0.5 },
    fallbackPaths = DEFAULT_FALLBACK_PATHS,
    onModelLoaded,
    onModelLoadFailed
  } = options;

  console.log('[ModelLoader] DEBUG: initializeModelLoading starting with:', {
    modelPath,
    width,
    height,
    scale,
    position,
    containerRefExists: !!containerRef?.current
  });

  // Ensure we're on the client side
  if (typeof window === 'undefined') {
    throw new Error('Model loading can only be initialized on the client side');
  }

  // Add global PIXI reference for compatibility
  window.PIXI = PIXI;
  console.log('[ModelLoader] DEBUG: PIXI assigned to window:', !!window.PIXI);

  // Set up event listener for model path changes
  const handleModelPathChange = async (event: Event) => {
    const customEvent = event as CustomEvent<{ modelPath: string; characterId: string }>;
    const { modelPath: newPath, characterId } = customEvent.detail;
    console.log(`[ModelLoader] DEBUG: Model path changed to: ${newPath} for character: ${characterId}`);
    
    // Dispatch loading start event
    window.dispatchEvent(new CustomEvent('model-load-start'));
    
    try {
      // Unload current model if it exists
      if (currentModel) {
        await unloadLive2DModel(currentModel, currentApp, () => {
          console.log('[ModelLoader] DEBUG: Current model unloaded successfully');
        });
      }
      
      // Load new model
      const result = await loadLive2DModel({
        containerRef,
        modelPath: newPath,
        fallbackPaths,
        width,
        height,
        scale,
        position,
        onModelLoaded: (model, app) => {
          currentModel = model;
          currentApp = app;
          onModelLoaded?.(model, app);
          // Dispatch loading complete event with model reference
          window.dispatchEvent(new CustomEvent('model-load-complete', {
            detail: { model, app }
          }));
        },
        onModelLoadFailed: (error) => {
          console.error('[ModelLoader] DEBUG: Failed to load model:', error);
          onModelLoadFailed?.(error);
          // Dispatch loading complete event even on failure
          window.dispatchEvent(new CustomEvent('model-load-complete'));
        }
      });
      
      return result;
    } catch (error) {
      console.error('[ModelLoader] DEBUG: Error during model path change:', error);
      // Dispatch loading complete event on error
      window.dispatchEvent(new CustomEvent('model-load-complete'));
      throw error;
    }
  };

  // Add event listener with proper type casting
  window.addEventListener('model-path-change', handleModelPathChange as EventListener);
  console.log('[ModelLoader] DEBUG: Added model-path-change event listener');

  // Initial model load
  console.log('[ModelLoader] DEBUG: Starting initial model load for:', modelPath);
  const result = await loadLive2DModel({
    containerRef,
    modelPath,
    fallbackPaths,
    width,
    height,
    scale,
    position,
    onModelLoaded: (model, app) => {
      console.log('[ModelLoader] DEBUG: Model loaded successfully in initializeModelLoading');
      currentModel = model;
      currentApp = app;
      onModelLoaded?.(model, app);
      // Dispatch loading complete event with model reference
      window.dispatchEvent(new CustomEvent('model-load-complete', {
        detail: { model, app }
      }));
    },
    onModelLoadFailed: (error) => {
      console.error('[ModelLoader] DEBUG: Model load failed in initializeModelLoading:', error);
      onModelLoadFailed?.(error);
      // Dispatch loading complete event even on failure
      window.dispatchEvent(new CustomEvent('model-load-complete'));
    }
  });

  // Cleanup function
  const cleanup = () => {
    window.removeEventListener('model-path-change', handleModelPathChange as EventListener);
    if (currentModel) {
      unloadLive2DModel(currentModel, currentApp);
    }
  };

  console.log('[ModelLoader] DEBUG: initializeModelLoading completed with status:', result.success);
  // Return result with cleanup function
  return {
    ...result,
    cleanup
  };
};

// Function to load a Live2D model
export const loadLive2DModel = async ({
  containerRef,
  modelPath,
  fallbackPaths = DEFAULT_FALLBACK_PATHS,
  width,
  height,
  scale = 0.5,
  position = { x: 0.5, y: 0.5 },
  onModelLoaded,
  onModelLoadFailed
}: {
  containerRef: React.RefObject<HTMLDivElement | null>;
  modelPath: string;
  fallbackPaths?: string[];
  width: number;
  height: number;
  scale?: number;
  position?: { x: number, y: number };
  onModelLoaded?: (model: Live2DDisplayObject, app: PIXI.Application) => void;
  onModelLoadFailed?: (error: Error) => void;
}): Promise<LoadLive2DModelResult> => {
  console.log('[ModelLoader] Lifecycle - Starting Model Load:', {
    modelPath,
    containerExists: !!containerRef.current,
    width,
    height,
    scale,
    position,
    timestamp: new Date().toISOString()
  });

  // Guard against server-side rendering
  if (typeof window === 'undefined') {
    const error = new Error('Live2D models can only be loaded in the browser');
    console.error('[ModelLoader] Lifecycle - Server-side Rendering Error:', {
      error: error.message,
      timestamp: new Date().toISOString()
    });
    if (onModelLoadFailed) onModelLoadFailed(error);
    return { success: false, error, cleanup: () => {} };
  }

  let model: Live2DDisplayObject | null = null;
  let app: PIXI.Application | null = null;
  let loaded = false;
  let errorObj: Error | null = null;

  // Get the appropriate model loader based on the model version
  console.log('[ModelLoader] State Sync - Determining Model Loader:', {
    modelPath,
    timestamp: new Date().toISOString()
  });
  
  Live2DModelInstance = await getModelLoader(modelPath);
  if (!Live2DModelInstance) {
    const error = new Error('Failed to load Live2D library');
    console.error('[ModelLoader] State Sync - Library Load Failed:', {
      error: error.message,
      timestamp: new Date().toISOString()
    });
    if (onModelLoadFailed) onModelLoadFailed(error);
    return { success: false, error, cleanup: () => {} };
  }
  console.log('[ModelLoader] State Sync - Library Loaded Successfully');

  try {
    console.log('[ModelLoader] Lifecycle - Creating PIXI Application');
    
    if (!containerRef.current) {
      const error = new Error('Container reference is not available');
      console.error('[ModelLoader] Lifecycle - Container Error:', {
        error: error.message,
        timestamp: new Date().toISOString()
      });
      throw error;
    }
    
    app = new PIXI.Application({
      width: width || 800,
      height: height || 600,
      backgroundAlpha: 0,
      antialias: true,
      autoStart: true,
      clearBeforeRender: true,
    });
    
    console.log('[ModelLoader] Lifecycle - PIXI Application Created:', {
      width: app.renderer.width,
      height: app.renderer.height,
      requestedWidth: width,
      requestedHeight: height,
      rendererType: app.renderer.type,
      timestamp: new Date().toISOString()
    });
    
    // Check WebGL context health (with proper typing)
    const webglContext1 = (app.renderer as unknown as { context: WebGLRenderingContext }).context;
    if (webglContext1) {
      console.log('[ModelLoader] DEBUG: WebGL Context Details:', {
        contextType: webglContext1.constructor.name,
        isContextLost: webglContext1.isContextLost ? webglContext1.isContextLost() : 'unknown',
        contextAttributes: webglContext1.getContextAttributes ? webglContext1.getContextAttributes() : 'unknown',
        maxTextureSize: webglContext1.getParameter ? webglContext1.getParameter(webglContext1.MAX_TEXTURE_SIZE) : 'unknown',
        maxRenderbufferSize: webglContext1.getParameter ? webglContext1.getParameter(webglContext1.MAX_RENDERBUFFER_SIZE) : 'unknown'
      });
    } else {
      console.error('[ModelLoader] ERROR: No WebGL context available!');
    }
    
    // Add the PIXI view to the container
    console.log('[ModelLoader] Lifecycle - Adding PIXI View to Container:', {
      containerExists: !!containerRef.current,
      containerTagName: containerRef.current?.tagName,
      containerId: containerRef.current?.id,
      containerClassName: containerRef.current?.className,
      hasAppView: !!app.view
    });
    containerRef.current.appendChild(app.view as unknown as HTMLElement);
    
    try {
      console.log('[ModelLoader] State Sync - Loading Model from Primary Path:', {
        modelPath,
        timestamp: new Date().toISOString()
      });
      
      console.log('[ModelLoader] DEBUG: About to call Live2DModelInstance.from with:', {
        modelPath,
        hasLive2DModelInstance: !!Live2DModelInstance,
        instanceType: Live2DModelInstance?.constructor?.name
      });
      
      model = await Live2DModelInstance.from(modelPath);
      console.log('[ModelLoader] State Sync - Model Loaded Successfully:', {
        modelType: model?.constructor?.name,
        hasModel: !!model,
        modelWidth: model?.width,
        modelHeight: model?.height,
        modelScale: model?.scale,
        modelPosition: model?.position,
        hasInternalModel: !!model?.internalModel,
        internalModelType: model?.internalModel?.constructor?.name,
        hasCoreModel: !!(model?.internalModel as unknown as { coreModel: unknown })?.coreModel,
        coreModelType: (model?.internalModel as unknown as { coreModel: unknown })?.coreModel?.constructor?.name
      });
      
      // Check model's WebGL context requirements
      const internalModel = model?.internalModel as unknown as { coreModel: unknown };
      if (internalModel?.coreModel) {
        console.log('[ModelLoader] DEBUG: Model Core Model Details:', {
          hasCoreModel: !!internalModel.coreModel,
          coreModelType: internalModel.coreModel.constructor.name,
          hasModelMatrix: !!(internalModel.coreModel as unknown as { _modelMatrix: unknown })._modelMatrix,
          hasCanvasInfo: !!(internalModel.coreModel as unknown as { _canvasInfo: unknown })._canvasInfo,
          canvasInfo: (internalModel.coreModel as unknown as { _canvasInfo: unknown })._canvasInfo
        });
      }
      
      loaded = true;
    } catch (err) {
      console.error('[ModelLoader] State Sync - Primary Path Load Failed:', {
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
        modelPath,
        timestamp: new Date().toISOString(),
        hasLive2DModelInstance: !!Live2DModelInstance
      });
      errorObj = err instanceof Error ? err : new Error(String(err));
      
      // Try fallback paths
      console.log('[ModelLoader] DEBUG: Attempting fallback paths:', fallbackPaths);
      for (const basePath of fallbackPaths) {
        try {
          const fallbackPath = `${basePath}${modelPath.split('/').pop()}`;
          console.log('[ModelLoader] State Sync - Trying Fallback Path:', {
            fallbackPath,
            basePath,
            originalModelPath: modelPath,
            timestamp: new Date().toISOString()
          });
          
          model = await Live2DModelInstance.from(fallbackPath);
          console.log('[ModelLoader] State Sync - Fallback Path Load Successful:', {
            fallbackPath,
            modelType: model?.constructor?.name,
            hasModel: !!model
          });
          loaded = true;
          break;
        } catch (fallbackErr) {
          console.error('[ModelLoader] State Sync - Fallback Path Load Failed:', {
            error: fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr),
            stack: fallbackErr instanceof Error ? fallbackErr.stack : undefined,
            fallbackPath: `${basePath}${modelPath.split('/').pop()}`,
            timestamp: new Date().toISOString()
          });
        }
      }
      
      // If all attempts failed, try the default model
      if (!loaded) {
        try {
          const defaultModelPath = '/model/shizuku/shizuku.model.json';
          console.log('[ModelLoader] State Sync - Trying Default Model:', {
            defaultModelPath,
            timestamp: new Date().toISOString()
          });
          model = await Live2DModelInstance.from(defaultModelPath);
          console.log('[ModelLoader] State Sync - Default Model Load Successful');
          loaded = true;
        } catch (defaultErr) {
          console.error('[ModelLoader] State Sync - Default Model Load Failed:', {
            error: defaultErr instanceof Error ? defaultErr.message : String(defaultErr),
            timestamp: new Date().toISOString()
          });
          errorObj = defaultErr instanceof Error ? defaultErr : new Error(String(defaultErr));
          if (onModelLoadFailed) {
            onModelLoadFailed(errorObj);
          }
          return { success: false, error: errorObj, cleanup: () => {} };
        }
      }
    }
    
    if (!model) {
      const error = new Error('Model failed to load but no error was thrown');
      console.error('[ModelLoader] State Sync - Model Load Error:', {
        error: error.message,
        timestamp: new Date().toISOString()
      });
      throw error;
    }
    
    console.log('[ModelLoader] Lifecycle - Adding Model to Stage');
    
    // Check WebGL context before adding model to stage
    const webglContext2 = (app.renderer as unknown as { context: WebGLRenderingContext }).context;
    if (webglContext2 && webglContext2.isContextLost && webglContext2.isContextLost()) {
      console.error('[ModelLoader] ERROR: WebGL context is lost before adding model to stage!');
      throw new Error('WebGL context is lost - cannot render model');
    }
    
    (app.stage as PIXI.Container).addChild(model as unknown as PIXI.DisplayObject);
    
    // Add WebGL context loss listener
    if (webglContext2 && webglContext2.canvas) {
      webglContext2.canvas.addEventListener('webglcontextlost', (event: Event) => {
        console.error('[ModelLoader] ERROR: WebGL context lost during rendering!', event);
        event.preventDefault();
      });
      
      webglContext2.canvas.addEventListener('webglcontextrestored', (event: Event) => {
        console.log('[ModelLoader] INFO: WebGL context restored', event);
      });
    }
    
    const safePosition = position || { x: 0.5, y: 0.5 };
    console.log('[ModelLoader] State Sync - Setting Model Position:', {
      position: safePosition,
      modelWidth: model.width,
      modelHeight: model.height,
      modelAnchorX: model.anchor?.x,
      modelAnchorY: model.anchor?.y,
      rendererWidth: app.renderer.width,
      rendererHeight: app.renderer.height,
      timestamp: new Date().toISOString()
    });
    
    centerModelOnStage(model, app, safePosition);
    
    const scaleFactor = Math.min(
      app.renderer.width / model.width,
      app.renderer.height / model.height
    ) * scale;
    
    console.log('[ModelLoader] State Sync - Applying Scale:', {
      scaleFactor,
      requestedScale: scale,
      modelWidth: model.width,
      modelHeight: model.height,
      rendererWidth: app.renderer.width,
      rendererHeight: app.renderer.height,
      widthRatio: app.renderer.width / model.width,
      heightRatio: app.renderer.height / model.height,
      finalScaleX: model.scale.x,
      finalScaleY: model.scale.y,
      timestamp: new Date().toISOString()
    });
    
    model.scale.set(scaleFactor);

    if (onModelLoaded && model) {
      console.log('[ModelLoader] Lifecycle - Calling onModelLoaded Callback');
      onModelLoaded(model, app);
    }
    
    // Test model rendering to catch WebGL context issues early
    try {
      console.log('[ModelLoader] DEBUG: Testing model rendering...');
      app.render();
      console.log('[ModelLoader] DEBUG: Model rendering test successful');
    } catch (renderError) {
      const webglContext = (app.renderer as unknown as { context: WebGLRenderingContext }).context;
      console.error('[ModelLoader] ERROR: Model rendering test failed:', {
        error: renderError instanceof Error ? renderError.message : String(renderError),
        stack: renderError instanceof Error ? renderError.stack : undefined,
        webGLContextLost: webglContext?.isContextLost ? webglContext.isContextLost() : 'unknown'
      });
      
      // If it's a WebGL context issue, provide specific guidance
      if (renderError instanceof Error && renderError.message.includes('_currentFrameNo')) {
        console.error('[ModelLoader] ERROR: WebGL Context Issue Detected!', {
          possibleCauses: [
            'WebGL context was lost or not properly initialized',
            'Model requires WebGL 2.0 but only WebGL 1.0 is available',
            'Browser does not support required WebGL extensions',
            'Model texture size exceeds WebGL limits',
            'Multiple WebGL contexts conflict with each other'
          ],
          webGLVersion: webglContext?.VERSION,
          maxTextureSize: webglContext?.getParameter ? webglContext.getParameter(webglContext.MAX_TEXTURE_SIZE) : 'unknown',
          modelTextureSize: model.width + 'x' + model.height
        });
      }
      
      // Don't throw here - let the model load complete but log the issue
    }
    
    loaded = true;
    console.log('[ModelLoader] Lifecycle - Model Load Complete');
  } catch (err) {
    console.error('[ModelLoader] Lifecycle - Model Load Failed:', {
      error: err instanceof Error ? err.message : String(err),
      timestamp: new Date().toISOString()
    });
    errorObj = err instanceof Error ? err : new Error(String(err));
    if (onModelLoadFailed) {
      onModelLoadFailed(errorObj);
    }
  }

  return { 
    success: loaded, 
    model: model || undefined, 
    pixiApp: app || undefined, 
    error: errorObj || undefined,
    cleanup: () => {
      console.log('[ModelLoader] Lifecycle - Running Cleanup');
      if (model || app) {
        destroyLive2DModel(model, app);
      }
    }
  };
};

// Update window interface declaration
declare global {
  interface Window {
    Live2DCubismCore: typeof import('pixi-live2d-display-lipsyncpatch/cubism4');
    PIXI: typeof import('pixi.js');
    appConfig?: {
      characters?: Array<{ id: string; name: string }>;
      models?: Array<{ id: string; path: string }>;
      backgrounds?: string[];
    };
    ConfigManager?: {
      loadBaseConfig: () => void;
      getCharacters: () => Array<{ id: string; name: string }>;
      getBackgrounds: () => string[];
      findModel: (modelName: string) => { id: string; path: string } | null;
      onConfigEvent: (eventName: string, callback: (data: unknown) => void) => void;
    };
  }
}

// Remove the duplicate type exports at the end
// export type { Live2DDisplayObject, Live2DModelStatic }; 