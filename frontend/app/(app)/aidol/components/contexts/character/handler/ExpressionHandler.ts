import type { Live2DModel } from 'pixi-live2d-display-lipsyncpatch';

/**
 * Interface for expression parameter
 */
interface ExpressionParameter {
  Id: string;
  Value: number;
  Blend: 'Add' | 'Multiply';
}

/**
 * Interface for expression file
 */
interface ExpressionFile {
  Type: string;
  Parameters: ExpressionParameter[];
}

/**
 * Interface for model configuration
 * Defines parameters and expressions for the Live2D model
 */
interface ModelConfig {
  expressions?: Array<{
    parameters: Array<{
      id: string;
      value: number;
    }>;
  }>;
  version?: 'v2' | 'v3';
  parameters?: {
    mouthOpen?: string;
    mouthForm?: string;
    eyeLOpen?: string;
    eyeROpen?: string;
    angleX?: string;
    angleY?: string;
    angleZ?: string;
    browLForm?: string;
    browRForm?: string;
    cheek?: string;
    eyeBallX?: string;
    eyeBallY?: string;
    bodyAngleX?: string;
    bodyAngleY?: string;
    bodyAngleZ?: string;
  };
}

/**
 * Interface for Live2D internal model core
 * Provides access to model parameters and values
 */
interface Live2DCoreModel {
  getParameterIndex?: (id: string) => number;
  getParameterValueById?: (id: string) => number;
  getParameterValueByIndex?: (index: number) => number;
  setParameterValueById?: (id: string, value: number) => void;
  setParameterValueByIndex?: (index: number, value: number) => void;
}

/**
 * Interface for Live2D internal model
 * Contains the core components of a Live2D model
 */
interface Live2DInternalModel {
  coreModel?: Live2DCoreModel;
}

/**
 * ExpressionHandler class responsible for managing Live2D model expressions
 * Implements the Single Responsibility Principle by handling only expression-related functionality
 */
export class ExpressionHandler {
  private model: Live2DModel | null = null;
  private modelConfig: ModelConfig | null = null;
  private currentExpression: number | null = null;
  private expressionFiles: { [key: string]: ExpressionFile } = {};
  private resetTimeout: NodeJS.Timeout | null = null;

  /**
   * Sets the Live2D model for expression handling
   * @param model - The Live2D model to control
   */
  setModel(model: Live2DModel | null): void {
    this.model = model;
    console.log('[ExpressionHandler] Model set:', model ? 'available' : 'null');
  }

  /**
   * Sets the model configuration
   * @param config - The model configuration to use
   */
  setModelConfig(config: ModelConfig | null): void {
    this.modelConfig = config;
    console.log('[ExpressionHandler] Model config updated:', config ? 'available' : 'null');
  }

  /**
   * Loads an expression file
   * @param filePath - Path to the expression file
   * @returns Promise that resolves when the expression is loaded
   */
  private async loadExpressionFile(filePath: string): Promise<ExpressionFile | null> {
    if (this.expressionFiles[filePath]) {
      return this.expressionFiles[filePath];
    }

    try {
      const response = await fetch(filePath);
      const expression = await response.json() as ExpressionFile;
      this.expressionFiles[filePath] = expression;
      return expression;
    } catch (error) {
      console.error('[ExpressionHandler] Error loading expression file:', error);
      return null;
    }
  }

  /**
   * Sets the model's expression with smooth interpolation
   * @param expressionId - The ID of the expression to set
   * @param duration - Duration of the expression transition in milliseconds
   */
  async setExpression(expressionId: number, duration: number = 3000): Promise<void> {
    if (!this.model || !this.modelConfig) {
      return;
    }

    try {
      console.log('[ExpressionHandler] Setting expression:', {
        expressionId,
        duration,
        timestamp: new Date().toISOString()
      });

      // Get the expression file path based on ID
      const expressionFile = this.getExpressionFilePath(expressionId);
      if (!expressionFile) {
        console.warn('[ExpressionHandler] No expression file found for ID:', expressionId);
        return;
      }

      // Load the expression file
      const expression = await this.loadExpressionFile(expressionFile);
      if (!expression) {
        console.warn('[ExpressionHandler] Failed to load expression file:', expressionFile);
        return;
      }

      // Apply the expression parameters
      const internalModel = this.model.internalModel as Live2DInternalModel;
      const coreModel = internalModel.coreModel;
      if (!coreModel) {
        console.warn('[ExpressionHandler] Core model not available');
        return;
      }

      // Apply each parameter from the expression
      for (const param of expression.Parameters) {
        const paramIndex = coreModel.getParameterIndex?.(param.Id);
        if (paramIndex !== undefined && paramIndex !== -1) {
          coreModel.setParameterValueByIndex?.(paramIndex, param.Value);
        }
      }

      this.currentExpression = expressionId;

      // Clear any existing reset timeout
      if (this.resetTimeout) {
        clearTimeout(this.resetTimeout);
        this.resetTimeout = null;
      }

      // Reset expression after duration if specified
      if (duration > 0) {
        console.log('[ExpressionHandler] Setting expression timeout:', {
          expressionId,
          duration,
          timestamp: new Date().toISOString()
        });
        
        this.resetTimeout = setTimeout(() => {
          console.log('[ExpressionHandler] Expression timeout reached, resetting:', {
            expressionId,
            timestamp: new Date().toISOString()
          });
          this.resetExpression();
        }, duration);
      }
    } catch (error) {
      console.error('[ExpressionHandler] Error setting expression:', error);
    }
  }

  /**
   * Gets the expression file path for a given expression ID
   * @param expressionId - The ID of the expression
   * @returns The path to the expression file
   */
  private getExpressionFilePath(expressionId: number): string | null {
    if (!this.modelConfig) {
      console.warn('[ExpressionHandler] No model config available for expression path');
      return null;
    }

    // Get the model path from the model config or current model
    const modelPath = this.getModelPath();
    if (!modelPath) {
      console.warn('[ExpressionHandler] No model path available for expression');
      return null;
    }

    // Extract model directory from path
    const modelDir = modelPath.substring(0, modelPath.lastIndexOf('/'));
    
    // Define expression mappings based on model type
    let expressionMap: { [key: number]: string } = {};
    
    if (modelPath.includes('woodDog')) {
      expressionMap = {
        1: `${modelDir}/Sad.exp3.json`,
        2: `${modelDir}/Angy.exp3.json`,
        3: `${modelDir}/Blush.exp3.json`
      };
    } else if (modelPath.includes('Wintherscris')) {
      expressionMap = {
        1: `${modelDir}/wink.exp3.json`,
        2: `${modelDir}/cute frown.exp3.json`,
        3: `${modelDir}/laught smile.exp3.json`
      };
    } else if (modelPath.includes('mao_pro')) {
      expressionMap = {
        1: `${modelDir}/expressions/exp_01.exp3.json`,
        2: `${modelDir}/expressions/exp_02.exp3.json`,
        3: `${modelDir}/expressions/exp_03.exp3.json`,
        4: `${modelDir}/expressions/exp_04.exp3.json`,
        5: `${modelDir}/expressions/exp_05.exp3.json`,
        6: `${modelDir}/expressions/exp_06.exp3.json`,
        7: `${modelDir}/expressions/exp_07.exp3.json`,
        8: `${modelDir}/expressions/exp_08.exp3.json`
      };
    } else if (modelPath.includes('vanilla')) {
      // Vanilla model might not have expression files
      expressionMap = {};
    }

    console.log('[ExpressionHandler] Expression file path lookup:', {
      expressionId,
      modelPath,
      modelDir,
      expressionMap,
      foundPath: expressionMap[expressionId] || null
    });

    return expressionMap[expressionId] || null;
  }

  /**
   * Gets the current model path
   * @returns The model path or null if not available
   */
  private getModelPath(): string | null {
    // Try to get model path from various sources
    if (this.model && (this.model as unknown as { modelPath: string }).modelPath) {
      return (this.model as unknown as { modelPath: string }).modelPath;
    }
    
    // Fallback to checking the model's internal structure
    if (this.model && (this.model as unknown as { internalModel: { modelPath: string } }).internalModel) {
      const internalModel = (this.model as unknown as { internalModel: { modelPath: string } }).internalModel;
      if (internalModel.modelPath) {
        return internalModel.modelPath;
      }
    }
    
    console.warn('[ExpressionHandler] Could not determine model path');
    return null;
  }

  /**
   * Gets the current expression ID
   * @returns The current expression ID or null if no expression is set
   */
  getCurrentExpression(): number | null {
    return this.currentExpression;
  }

  /**
   * Resets the current expression by setting all parameters to their default values
   */
  async resetExpression(): Promise<void> {
    if (!this.model) {
      console.warn('[ExpressionHandler] Cannot reset expression: model not available');
      return;
    }

    try {
      console.log('[ExpressionHandler] Resetting expression');
      
      const internalModel = this.model.internalModel as Live2DInternalModel;
      const coreModel = internalModel.coreModel;
      if (!coreModel) {
        console.warn('[ExpressionHandler] Core model not available for reset');
        return;
      }

      // Reset all expression-related parameters to their default values
      const defaultParameters = {
        'ParamEyeLOpen': 1.0,
        'ParamEyeROpen': 1.0,
        'ParamEyeLSmile': 0.0,
        'ParamEyeRSmile': 0.0,
        'ParamEyeLForm': 0.0,
        'ParamEyeRForm': 0.0,
        'ParamBrowLForm': 0.0,
        'ParamBrowRForm': 0.0,
        'ParamBrowLY': 0.0,
        'ParamBrowRY': 0.0,
        'ParamMouthForm': 0.0,
        'ParamMouthOpenY': 0.0,
        'ParamCheek': 0.0,
        'ParamEyeBallX': 0.0,
        'ParamEyeBallY': 0.0,
        'ParamBodyAngleX': 0.0,
        'ParamBodyAngleY': 0.0,
        'ParamBodyAngleZ': 0.0,
        // Tear and water parameters (from Sad.exp3.json)
        'ParamEyeWaterOn': 0.0,
        'ParamTearOn': 0.0,
        // Blush parameters (from Angy.exp3.json and Blush.exp3.json)
        'ParamBlushOn': 0.0,
        'ParamAngyBlushOn': 0.0,
        'Param18': 0.0,  // From cute frown.exp3.json
        'Param19': 0.0,  // From wink.exp3.json
        'Param20': 0.0   // From laught smile.exp3.json (stars effect)
      };

      // Apply default values to each parameter
      for (const [paramId, defaultValue] of Object.entries(defaultParameters)) {
        const paramIndex = coreModel.getParameterIndex?.(paramId);
        if (paramIndex !== undefined && paramIndex !== -1) {
          coreModel.setParameterValueByIndex?.(paramIndex, defaultValue);
          console.log(`[ExpressionHandler] Reset parameter ${paramId} to ${defaultValue}`);
        } else {
          console.warn(`[ExpressionHandler] Parameter ${paramId} not found in model`);
        }
      }

      this.currentExpression = null;
      
      // Clear the reset timeout
      if (this.resetTimeout) {
        clearTimeout(this.resetTimeout);
        this.resetTimeout = null;
      }
      
      console.log('[ExpressionHandler] Expression reset complete');
    } catch (error) {
      console.error('[ExpressionHandler] Error resetting expression:', error);
    }
  }

  /**
   * Cleans up resources and clears any pending timeouts
   */
  cleanup(): void {
    console.log('[ExpressionHandler] Cleaning up expression handler');
    
    if (this.resetTimeout) {
      clearTimeout(this.resetTimeout);
      this.resetTimeout = null;
    }
    
    this.currentExpression = null;
    this.expressionFiles = {};
  }

  /**
   * Updates the model's mouth based on audio volume
   * @param volume - The volume level for lip sync
   * @param expression - Optional expression to apply during lip sync
   */
  updateMouth(volume: number, expression?: number | string): void {
    if (!this.model || !this.modelConfig) {
      console.warn('[ExpressionHandler] Cannot update mouth: model or config not available');
      return;
    }

    try {
      const internalModel = this.model.internalModel as Live2DInternalModel;
      const coreModel = internalModel.coreModel;
      if (!coreModel) {
        console.warn('[ExpressionHandler] Core model not available');
        return;
      }

      // Get mouth parameters from config
      const { mouthOpen, mouthForm } = this.modelConfig.parameters || {};
      if (!mouthOpen && !mouthForm) {
        console.warn('[ExpressionHandler] No mouth parameters found in config');
        return;
      }

      // Calculate mouth value based on volume (0-1 range)
      const mouthValue = Math.min(Math.max(volume, 0), 1);

      // Update mouth parameters if they exist
      if (mouthOpen) {
        const paramIndex = coreModel.getParameterIndex?.(mouthOpen);
        if (paramIndex !== undefined && paramIndex !== -1) {
          coreModel.setParameterValueByIndex?.(paramIndex, mouthValue);
        }
      }

      if (mouthForm) {
        const paramIndex = coreModel.getParameterIndex?.(mouthForm);
        if (paramIndex !== undefined && paramIndex !== -1) {
          coreModel.setParameterValueByIndex?.(paramIndex, mouthValue);
        }
      }

      // Apply expression if provided
      if (expression !== undefined) {
        this.setExpression(typeof expression === 'number' ? expression : 0);
      }
    } catch (error) {
      console.error('[ExpressionHandler] Error updating mouth:', error);
    }
  }
} 