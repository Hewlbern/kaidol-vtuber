"""
Python ML Service for Vaidol
Provides HTTP API for TTS, RVC, ASR, Agent, and VAD services
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import os
import sys

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend', 'src'))

app = FastAPI(title="Vaidol Python ML Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Import service modules
try:
    from open_llm_vtuber.service_context import ServiceContext
    from open_llm_vtuber.config_manager.utils import Config, read_yaml
    from open_llm_vtuber.tts.tts_factory import TTSFactory
    from open_llm_vtuber.asr.asr_factory import ASRFactory
    from open_llm_vtuber.agent.agent_factory import AgentFactory
    from open_llm_vtuber.vad.vad_factory import VADFactory
    from open_llm_vtuber.rvc.rvc_factory import RVCFactory
except ImportError as e:
    print(f"Warning: Could not import service modules: {e}")
    print("Some features may not be available")


# Global service context (lazy loaded)
_service_context: Optional[ServiceContext] = None


def get_service_context() -> ServiceContext:
    """Get or create service context"""
    global _service_context
    if _service_context is None:
        # Load config
        config_path = os.getenv("CONFIG_PATH", "../backend/conf.yaml")
        config_data = read_yaml(config_path)
        from open_llm_vtuber.config_manager.utils import validate_config
        config = validate_config(config_data)
        
        # Create service context
        _service_context = ServiceContext()
        _service_context.load_from_config(config)
    
    return _service_context


# Request/Response models
class TTSRequest(BaseModel):
    text: str
    voice: Optional[str] = None
    language: Optional[str] = None
    config: Optional[Dict[str, Any]] = None  # Full TTS config for engine initialization


class TTSResponse(BaseModel):
    audio_path: str
    success: bool
    error: Optional[str] = None


class RVCRequest(BaseModel):
    audio_path: str
    model: str


class RVCResponse(BaseModel):
    audio_path: str
    success: bool


class ASRRequest(BaseModel):
    audio_data: List[float]


class ASRResponse(BaseModel):
    text: str
    success: bool


class Message(BaseModel):
    role: str
    content: str


class AgentRequest(BaseModel):
    messages: List[Message]
    context: Optional[Dict[str, Any]] = None


class AgentResponse(BaseModel):
    text: str
    success: bool


# Health check
@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "ok"}


# TTS endpoints
@app.post("/tts/synthesize", response_model=TTSResponse)
async def synthesize_tts(request: TTSRequest):
    """Synthesize text to speech"""
    try:
        from .tts_service import get_tts_service
        
        tts_service = get_tts_service()
        
        # Initialize engine if config provided and different from current
        if request.config:
            # Check if we need to reinitialize
            if (tts_service.current_config != request.config or 
                tts_service.tts_engine is None):
                if not tts_service.initialize_engine(request.config):
                    return TTSResponse(
                        audio_path="",
                        success=False,
                        error="Failed to initialize TTS engine"
                    )
        elif tts_service.tts_engine is None:
            # Try to get from service context as fallback
            try:
                context = get_service_context()
                if context.tts_engine:
                    tts_service.tts_engine = context.tts_engine
                else:
                    return TTSResponse(
                        audio_path="",
                        success=False,
                        error="TTS engine not initialized and no config provided"
                    )
            except Exception:
                return TTSResponse(
                    audio_path="",
                    success=False,
                    error="TTS engine not initialized and no config provided"
                )
        
        # Generate audio
        audio_path = tts_service.synthesize(request.text)
        
        if audio_path:
            return TTSResponse(audio_path=audio_path, success=True)
        else:
            return TTSResponse(
                audio_path="",
                success=False,
                error="Failed to generate audio"
            )
    except Exception as e:
        import traceback
        error_msg = f"{str(e)}\n{traceback.format_exc()}"
        return TTSResponse(
            audio_path="",
            success=False,
            error=error_msg
        )


# RVC endpoints
@app.post("/rvc/convert", response_model=RVCResponse)
async def convert_voice(request: RVCRequest):
    """Convert voice using RVC"""
    try:
        context = get_service_context()
        # RVC conversion logic here
        # For now, return the same path
        return RVCResponse(audio_path=request.audio_path, success=True)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ASR endpoints
@app.post("/asr/transcribe", response_model=ASRResponse)
async def transcribe_audio(request: ASRRequest):
    """Transcribe audio to text"""
    try:
        context = get_service_context()
        if not context.asr_engine:
            raise HTTPException(status_code=500, detail="ASR engine not initialized")
        
        # Convert float array to numpy array
        import numpy as np
        audio_array = np.array(request.audio_data, dtype=np.float32)
        
        # Transcribe
        text = context.asr_engine.transcribe(audio_array)
        
        return ASRResponse(text=text, success=True)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# Agent endpoints
@app.post("/agent/chat", response_model=AgentResponse)
async def chat(request: AgentRequest):
    """Chat with agent/LLM"""
    try:
        context = get_service_context()
        if not context.agent_engine:
            raise HTTPException(status_code=500, detail="Agent engine not initialized")
        
        # Convert messages to format expected by agent
        from open_llm_vtuber.conversations.conversation_utils import create_batch_input
        
        # Get last user message
        user_messages = [msg for msg in request.messages if msg.role == "user"]
        if not user_messages:
            raise HTTPException(status_code=400, detail="No user messages found")
        
        last_message = user_messages[-1]
        batch_input = create_batch_input(
            input_text=last_message.content,
            images=None,
            from_name=context.character_config.human_name,
        )
        
        # Generate response
        response_text = ""
        async for chunk in context.agent_engine.chat(batch_input):
            response_text += chunk
        
        return AgentResponse(text=response_text, success=True)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run(app, host="0.0.0.0", port=port)

