"""
TTS Service Module for Python ML Service
Handles TTS engine initialization and synthesis
"""

import os
import sys
from typing import Optional, Dict, Any
from loguru import logger

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend', 'src'))

try:
    from open_llm_vtuber.tts.tts_factory import TTSFactory
    from open_llm_vtuber.tts.tts_interface import TTSInterface
except ImportError as e:
    logger.error(f"Failed to import TTS modules: {e}")
    TTSFactory = None
    TTSInterface = None


class TTSService:
    """TTS Service that manages TTS engine lifecycle"""
    
    def __init__(self):
        self.tts_engine: Optional[TTSInterface] = None
        self.current_config: Optional[Dict[str, Any]] = None
    
    def initialize_engine(self, tts_config: Dict[str, Any]) -> bool:
        """
        Initialize TTS engine from configuration
        
        Args:
            tts_config: TTS configuration dictionary
            
        Returns:
            True if initialization successful, False otherwise
        """
        if TTSFactory is None:
            logger.error("TTSFactory not available")
            return False
        
        try:
            tts_model = tts_config.get("tts_model")
            if not tts_model:
                logger.error("TTS model not specified in config")
                return False
            
            # Get the specific config for this TTS model
            # The config key matches the model name (e.g., "azure_tts", "edge_tts")
            model_config = tts_config.get(tts_model.lower(), {})
            
            # Convert to dict if it's already a dict-like object
            if hasattr(model_config, 'model_dump'):
                model_config = model_config.model_dump()
            elif hasattr(model_config, 'dict'):
                model_config = model_config.dict()
            
            logger.info(f"Initializing TTS engine: {tts_model} with config: {model_config}")
            
            # Initialize the TTS engine using the factory
            self.tts_engine = TTSFactory.get_tts_engine(tts_model, **model_config)
            self.current_config = tts_config
            
            logger.info(f"TTS engine initialized successfully: {tts_model}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to initialize TTS engine: {e}")
            import traceback
            logger.error(traceback.format_exc())
            return False
    
    def synthesize(self, text: str, file_name_no_ext: Optional[str] = None) -> Optional[str]:
        """
        Synthesize text to speech
        
        Args:
            text: Text to synthesize
            file_name_no_ext: Optional filename without extension
            
        Returns:
            Path to generated audio file, or None if failed
        """
        if self.tts_engine is None:
            logger.error("TTS engine not initialized")
            return None
        
        try:
            audio_path = self.tts_engine.generate_audio(text, file_name_no_ext)
            return audio_path
        except Exception as e:
            logger.error(f"TTS synthesis failed: {e}")
            import traceback
            logger.error(traceback.format_exc())
            return None
    
    def async_synthesize(self, text: str, file_name_no_ext: Optional[str] = None) -> Optional[str]:
        """
        Asynchronously synthesize text to speech
        
        Args:
            text: Text to synthesize
            file_name_no_ext: Optional filename without extension
            
        Returns:
            Path to generated audio file, or None if failed
        """
        if self.tts_engine is None:
            logger.error("TTS engine not initialized")
            return None
        
        try:
            import asyncio
            # Use async_generate_audio if available, otherwise fall back to sync
            if hasattr(self.tts_engine, 'async_generate_audio'):
                loop = asyncio.get_event_loop()
                audio_path = loop.run_until_complete(
                    self.tts_engine.async_generate_audio(text, file_name_no_ext)
                )
            else:
                audio_path = self.tts_engine.generate_audio(text, file_name_no_ext)
            return audio_path
        except Exception as e:
            logger.error(f"Async TTS synthesis failed: {e}")
            import traceback
            logger.error(traceback.format_exc())
            return None
    
    def remove_file(self, filepath: str) -> bool:
        """
        Remove an audio file
        
        Args:
            filepath: Path to file to remove
            
        Returns:
            True if successful, False otherwise
        """
        if self.tts_engine is None:
            return False
        
        try:
            self.tts_engine.remove_file(filepath, verbose=False)
            return True
        except Exception as e:
            logger.error(f"Failed to remove file {filepath}: {e}")
            return False


# Global TTS service instance
_tts_service: Optional[TTSService] = None


def get_tts_service() -> TTSService:
    """Get or create global TTS service instance"""
    global _tts_service
    if _tts_service is None:
        _tts_service = TTSService()
    return _tts_service

