import json
import asyncio
from uuid import uuid4
import numpy as np
from datetime import datetime
from fastapi import APIRouter, WebSocket, UploadFile, File, Response, HTTPException, Request, Header
from starlette.websockets import WebSocketDisconnect
from pydantic import BaseModel
from typing import Optional, Dict, Any, Callable
from loguru import logger
from .service_context import ServiceContext
from .websocket_handler import WebSocketHandler
from .conversations.conversation_utils import create_batch_input
from .chat_platforms import (
    create_chat_client,
    PlatformConfig,
    PlatformType,
    ChatMessage,
    ChatPlatform
)
from pathlib import Path
import os
from .config_manager.utils import read_yaml

# Global connection manager for chat platforms
# In production, this should be a proper connection manager class
_active_chat_clients: Dict[str, ChatPlatform] = {}

# Make it accessible in route functions
def get_active_chat_clients():
    """Get the active chat clients dictionary"""
    return _active_chat_clients

# Global message router for chat platform messages
# Routes messages to autonomous text generation or WebSocket clients
_chat_message_router: Optional[Callable[[ChatMessage], None]] = None

# Global message filters and selectors (cached for efficiency)
_message_selector: Optional[Any] = None
_response_selector: Optional[Any] = None

def get_message_selector():
    """Get or create the global message selector."""
    global _message_selector
    if _message_selector is None:
        from .chat_platforms.message_filters import MessageSelector
        _message_selector = MessageSelector()
    return _message_selector

def get_response_selector():
    """Get or create the global response selector."""
    global _response_selector
    if _response_selector is None:
        from .chat_platforms.message_filters import ResponseSelector
        _response_selector = ResponseSelector()
    return _response_selector


async def _process_chat_message_for_autonomous(
    context_cache: ServiceContext,
    chat_message: ChatMessage,
    context: Dict[str, Any]
) -> None:
    """
    Process a chat message and generate autonomous response with spam filtering
    and response selection.
    This runs as a background task to avoid blocking the chat client.
    
    Args:
        context_cache: Service context for generating responses
        chat_message: The chat message to process
        context: Additional context information
    """
    try:
        logger.info(
            f"Processing {chat_message.platform.value} message for autonomous response: "
            f"{chat_message.message[:50]}..."
        )
        
        # Get cached filter and selector instances
        message_selector = get_message_selector()
        response_selector = get_response_selector()
        
        # Get character name for mention detection
        character_name = context_cache.character_config.character_name
        
        # Check if we should respond to this message
        should_respond, quality_score, reason = message_selector.should_respond(
            chat_message, 
            character_name
        )
        
        if not should_respond:
            logger.debug(
                f"Skipping response to {chat_message.platform.value} message from "
                f"{chat_message.username}: {reason} (quality_score: {quality_score:.2f})"
            )
            return
        
        logger.info(
            f"Selected message for response (quality_score: {quality_score:.2f}, reason: {reason})"
        )
        
        # Generate multiple response options and select the best one
        selected_response = await response_selector.select_best_response(
            context_cache,
            chat_message,
            context,
            num_options=3  # Generate 3 options, pick the best
        )
        
        if selected_response:
            logger.info(
                f"Generated autonomous response to {chat_message.platform.value} message: "
                f"{selected_response[:50]}..."
            )
            
            # TODO: Send response back to chat platform or WebSocket clients
            # This could be:
            # 1. Send back to the chat platform (e.g., reply in Twitch/pump.fun chat)
            # 2. Send to WebSocket clients for display
            # 3. Queue for TTS and character animation
            
            # For now, log the response
            logger.info(f"Response ready: {selected_response}")
            
        else:
            logger.warning(f"No response generated for message: {chat_message.message}")
            
    except Exception as e:
        logger.error(f"Error processing chat message for autonomous response: {e}", exc_info=True)


def init_client_ws_route(
    default_context_cache: ServiceContext,
    ws_handler: Optional[WebSocketHandler] = None
) -> APIRouter:
    """
    Create and return API routes for handling the `/client-ws` WebSocket connections.

    Args:
        default_context_cache: Default service context cache for new sessions.
        ws_handler: Optional WebSocketHandler instance. If None, creates a new one.

    Returns:
        APIRouter: Configured router with WebSocket endpoint.
    """

    router = APIRouter()
    if ws_handler is None:
        ws_handler = WebSocketHandler(default_context_cache)

    @router.websocket("/client-ws")
    async def websocket_endpoint(websocket: WebSocket):
        """WebSocket endpoint for client connections"""
        await websocket.accept()
        client_uid = str(uuid4())

        try:
            await ws_handler.handle_new_connection(websocket, client_uid)
            await ws_handler.handle_websocket_communication(websocket, client_uid)
        except WebSocketDisconnect:
            await ws_handler.handle_disconnect(client_uid)
        except Exception as e:
            logger.error(f"Error in WebSocket connection: {e}")
            await ws_handler.handle_disconnect(client_uid)
            raise

    return router


def init_webtool_routes(
    default_context_cache: ServiceContext,
    ws_handler: Optional[WebSocketHandler] = None,
    autonomous_generator: Optional[Any] = None
) -> APIRouter:
    """
    Create and return API routes for handling web tool interactions.

    Args:
        default_context_cache: Default service context cache for new sessions.
        ws_handler: Optional WebSocketHandler instance. If None, creates a new one.

    Returns:
        APIRouter: Configured router with WebSocket endpoint.
    """

    router = APIRouter()
    
    # Create WebSocketHandler if not provided
    if ws_handler is None:
        ws_handler = WebSocketHandler(default_context_cache)
    
    # Use global connection manager
    active_chat_clients = _active_chat_clients

    @router.get("/web-tool")
    async def web_tool_redirect():
        """Redirect /web-tool to /web_tool/index.html"""
        return Response(status_code=302, headers={"Location": "/web-tool/index.html"})

    @router.get("/web_tool")
    async def web_tool_redirect_alt():
        """Redirect /web_tool to /web_tool/index.html"""
        return Response(status_code=302, headers={"Location": "/web-tool/index.html"})

    @router.post("/asr")
    async def transcribe_audio(file: UploadFile = File(...)):
        """
        Endpoint for transcribing audio using the ASR engine
        """
        logger.info(f"Received audio file for transcription: {file.filename}")

        try:
            contents = await file.read()

            # Validate minimum file size
            if len(contents) < 44:  # Minimum WAV header size
                raise ValueError("Invalid WAV file: File too small")

            # Decode the WAV header and get actual audio data
            wav_header_size = 44  # Standard WAV header size
            audio_data = contents[wav_header_size:]

            # Validate audio data size
            if len(audio_data) % 2 != 0:
                raise ValueError("Invalid audio data: Buffer size must be even")

            # Convert to 16-bit PCM samples to float32
            try:
                audio_array = (
                    np.frombuffer(audio_data, dtype=np.int16).astype(np.float32)
                    / 32768.0
                )
            except ValueError as e:
                raise ValueError(
                    f"Audio format error: {str(e)}. Please ensure the file is 16-bit PCM WAV format."
                )

            # Validate audio data
            if len(audio_array) == 0:
                raise ValueError("Empty audio data")

            text = await default_context_cache.asr_engine.async_transcribe_np(
                audio_array
            )
            logger.info(f"Transcription result: {text}")
            return {"text": text}

        except ValueError as e:
            logger.error(f"Audio format error: {e}")
            return Response(
                content=json.dumps({"error": str(e)}),
                status_code=400,
                media_type="application/json",
            )
        except Exception as e:
            logger.error(f"Error during transcription: {e}")
            return Response(
                content=json.dumps(
                    {"error": "Internal server error during transcription"}
                ),
                status_code=500,
                media_type="application/json",
            )

    @router.websocket("/tts-ws")
    async def tts_endpoint(websocket: WebSocket):
        """WebSocket endpoint for TTS generation"""
        await websocket.accept()
        logger.info("TTS WebSocket connection established")

        try:
            while True:
                data = await websocket.receive_json()
                text = data.get("text")
                if not text:
                    continue

                logger.info(f"Received text for TTS: {text}")

                # Split text into sentences
                sentences = [s.strip() for s in text.split(".") if s.strip()]

                try:
                    # Generate and send audio for each sentence
                    for sentence in sentences:
                        sentence = sentence + "."  # Add back the period
                        file_name = f"{datetime.now().strftime('%Y%m%d_%H%M%S')}_{str(uuid4())[:8]}"
                        audio_path = (
                            await default_context_cache.tts_engine.async_generate_audio(
                                text=sentence, file_name_no_ext=file_name
                            )
                        )
                        logger.info(
                            f"Generated audio for sentence: {sentence} at: {audio_path}"
                        )

                        await websocket.send_json(
                            {
                                "status": "partial",
                                "audioPath": audio_path,
                                "text": sentence,
                            }
                        )

                    # Send completion signal
                    await websocket.send_json({"status": "complete"})

                except Exception as e:
                    logger.error(f"Error generating TTS: {e}")
                    await websocket.send_json({"status": "error", "message": str(e)})

        except WebSocketDisconnect:
            logger.info("TTS WebSocket client disconnected")
        except Exception as e:
            logger.error(f"Error in TTS WebSocket connection: {e}")
            await websocket.close()

    @router.get("/api/backgrounds")
    async def get_backgrounds():
        """Get list of available background images"""
        try:
            # Get backgrounds directory from system config
            backgrounds_dir = default_context_cache.system_config.backgrounds_dir
            
            # List all files in the backgrounds directory
            backgrounds = []
            
            # Use the existing mounted directory structure
            for filename in default_context_cache.system_config.get_backgrounds_path().glob("*"):
                # Check if file has valid image extension
                if filename.suffix.lower() in ['.jpg', '.jpeg', '.png', '.gif']:
                    backgrounds.append({
                        "name": filename.stem,
                        "path": f"/bg/{filename.name}"  # Maps to the mounted /bg route
                    })
            
            logger.info(f"Found {len(backgrounds)} background images")
            return backgrounds

        except Exception as e:
            logger.error(f"Error getting backgrounds: {e}")
            return []

    @router.get("/api/base-config")
    async def get_base_config():
        """Get base configuration for Live2D viewer"""
        try:
            # Add debug info about current directory and paths
            logger.info(f"Current working directory: {os.getcwd()}")
            characters_dir = Path("config/characters")
            logger.info(f"Characters directory exists: {characters_dir.exists()}")
            logger.info(f"Characters directory absolute path: {characters_dir.absolute()}")
            
            # Get TTS config
            tts_config = default_context_cache.character_config.tts_config
            tts_model_name = tts_config.tts_model
            tts_model_config = getattr(tts_config, tts_model_name)

            # Get current character info
            current_character = {
                "id": default_context_cache.character_config.conf_uid,
                "name": default_context_cache.character_config.conf_name,
                "modelName": default_context_cache.character_config.live2d_model_name,
                "persona": default_context_cache.character_config.persona_prompt
            }
            logger.info(f"Current character: {current_character}")
            
            # Load all available characters with enhanced logging
            characters = []
            char_files = list(characters_dir.glob("*.yaml"))
            logger.info(f"Found {len(char_files)} character files: {[f.name for f in char_files]}")
            
            for char_file in char_files:
                try:
                    logger.info(f"Loading character from: {char_file}")
                    # Check file permissions
                    logger.info(f"File {char_file} readable: {os.access(char_file, os.R_OK)}")
                    
                    # Read and log file content preview
                    with open(char_file, 'r', encoding='utf-8') as f:
                        content = f.read()
                        logger.debug(f"File content preview: {content[:100]}...")
                    
                    char_config = read_yaml(char_file)
                    
                    if "character_config" in char_config:
                        char_data = char_config["character_config"]
                        char_id = char_data.get("conf_uid", char_file.stem)
                        model_name = char_data.get("live2d_model_name", "shizuku-local")
                        
                        logger.info(f"Adding character: {char_id} ({model_name})")
                        characters.append({
                            "id": char_id,
                            "name": char_data.get("conf_name", char_file.stem),
                            "modelName": model_name,
                            "persona": char_data.get("persona_prompt", "")
                        })
                    else:
                        logger.warning(f"No character_config section in {char_file}")
                except Exception as e:
                    logger.error(f"Error loading character {char_file}: {e}", exc_info=True)
            
            logger.info(f"Loaded {len(characters)} characters")

            # Build config object
            config = {
                "tts": {
                    "model": tts_model_name,
                    "voice": getattr(tts_model_config, "voice", ""),
                    "rate": 1.0,
                    "volume": 1.0
                },
                "character": current_character,
                "characters": characters
            }

            # Load model definitions
            try:
                model_dict_path = Path("config/live2d-models/model_dict.json")
                logger.info(f"Model dict exists: {model_dict_path.exists()}")
                
                with open(model_dict_path, "r", encoding="utf-8") as f:
                    model_data = json.load(f)
                    config["models"] = [
                        {
                            "name": model["name"],
                            "description": model.get("description", ""),
                            "url": model["url"]
                        } for model in model_data
                    ]
                logger.info(f"Loaded {len(config['models'])} models")
            except Exception as e:
                logger.error(f"Error loading model_dict.json: {e}", exc_info=True)
                config["models"] = []

            logger.info(f"Returning base config with {len(characters)} characters and {len(config.get('models', []))} models")
            return config

        except Exception as e:
            logger.error(f"Error loading base config: {e}", exc_info=True)
            return Response(
                content=json.dumps({
                    "error": str(e),
                    "models": [],
                    "characters": [],
                    "tts": {"model": "edge_tts", "voice": "", "rate": 1.0, "volume": 1.0},
                    "character": {"id": "default", "name": "Default", "modelName": "shizuku-local", "persona": ""}
                }),
                status_code=200,  # Return 200 with default config instead of 500
                media_type="application/json"
            )

    @router.post("/api/switch-character/{character_id}")
    async def switch_character(character_id: str):
        """Switch to a different character"""
        try:
            logger.info(f"Switching to character: {character_id}")
            
            # Find the character config file
            characters_dir = Path("config/characters")
            character_file = None
            
            # First try exact match on conf_uid
            logger.info("Searching for character by conf_uid...")
            for char_file in characters_dir.glob("*.yaml"):
                try:
                    char_config = read_yaml(char_file)
                    if "character_config" in char_config:
                        conf_uid = char_config["character_config"].get("conf_uid")
                        logger.debug(f"File {char_file.name} has conf_uid: {conf_uid}")
                        if conf_uid == character_id:
                            character_file = char_file
                            logger.info(f"Found character by conf_uid in {char_file}")
                            break
                except Exception as e:
                    logger.error(f"Error reading character file {char_file}: {e}")
            
            # If not found, try using the filename as fallback
            if not character_file:
                logger.info("Character not found by conf_uid, trying filename...")
                for char_file in characters_dir.glob("*.yaml"):
                    if char_file.stem == character_id:
                        character_file = char_file
                        logger.info(f"Found character by filename: {char_file}")
                        break
            
            if not character_file:
                logger.warning(f"Character {character_id} not found in any files")
                return Response(
                    content=json.dumps({"error": f"Character {character_id} not found"}),
                    status_code=404,
                    media_type="application/json"
                )
            
            # Load the character config
            logger.info(f"Loading character config from {character_file}")
            
            # Validate the character file before loading
            try:
                char_config = read_yaml(character_file)
                if "character_config" not in char_config:
                    raise ValueError(f"Missing character_config section in {character_file}")
                    
                required_fields = ["conf_name", "conf_uid", "live2d_model_name"]
                missing_fields = [field for field in required_fields if field not in char_config["character_config"]]
                if missing_fields:
                    raise ValueError(f"Missing required fields in {character_file}: {missing_fields}")
                    
                logger.info(f"Character file validated successfully: {character_file}")
            except Exception as e:
                logger.error(f"Character file validation failed: {e}")
                return Response(
                    content=json.dumps({"error": f"Invalid character file: {str(e)}"}),
                    status_code=400,
                    media_type="application/json"
                )
            
            # Load the character config
            default_context_cache.load_character_config(character_file)
            
            # Get the updated character info to return
            updated_character = {
                "id": default_context_cache.character_config.conf_uid,
                "name": default_context_cache.character_config.conf_name,
                "modelName": default_context_cache.character_config.live2d_model_name,
                "persona": default_context_cache.character_config.persona_prompt
            }
            
            logger.info(f"Successfully switched to character: {updated_character['name']}")
            return {
                "success": True, 
                "message": f"Switched to character {character_id}",
                "character": updated_character
            }
        
        except Exception as e:
            logger.error(f"Error switching character: {e}", exc_info=True)
            return Response(
                content=json.dumps({"error": str(e)}),
                status_code=500,
                media_type="application/json"
            )

    # Request Models for Expression and Motion Control
    class ExpressionRequest(BaseModel):
        expressionId: int
        duration: Optional[int] = 0
        priority: Optional[int] = 0
        client_uid: Optional[str] = None

    class MotionRequest(BaseModel):
        motionGroup: str
        motionIndex: int
        loop: Optional[bool] = False
        priority: Optional[int] = 0
        client_uid: Optional[str] = None

    # Expression and Motion Control Endpoints
    @router.post("/api/expression")
    async def set_expression_endpoint(
        request: ExpressionRequest,
        x_client_uid: Optional[str] = Header(None, alias="X-Client-UID")
    ):
        """
        Set character expression via REST API.
        
        Request body:
        {
            "expressionId": int,  # Required: Expression ID (0-7 typically)
            "duration": int,     # Optional: Duration in milliseconds (0 = permanent)
            "priority": int,     # Optional: Priority level (higher = more important)
            "client_uid": str    # Optional: Client UID (can also use X-Client-UID header)
        }
        
        Returns:
        {
            "status": str,
            "expression_id": int,
            "result": dict
        }
        """
        try:
            # Determine client_uid from request body, header, or use default
            client_uid = request.client_uid or x_client_uid or "default"
            
            # Ensure client has a context (create if needed)
            if client_uid not in ws_handler.client_contexts:
                # Create a new context for this client using the same method as WebSocket connections
                context = ServiceContext()
                context.load_cache(
                    config=default_context_cache.config.model_copy(deep=True),
                    system_config=default_context_cache.system_config.model_copy(deep=True),
                    character_config=default_context_cache.character_config.model_copy(deep=True),
                    live2d_model=default_context_cache.live2d_model,
                    asr_engine=default_context_cache.asr_engine,
                    tts_engine=default_context_cache.tts_engine,
                    vad_engine=default_context_cache.vad_engine,
                    agent_engine=default_context_cache.agent_engine,
                    translate_engine=default_context_cache.translate_engine,
                )
                ws_handler.client_contexts[client_uid] = context
            
            # Get or create adapter for this client
            adapter = ws_handler._get_adapter(client_uid)
            
            # Trigger expression through adapter
            result = await adapter.trigger_expression(
                expression_id=request.expressionId,
                duration=request.duration,
                priority=request.priority
            )
            
            logger.info(
                f"Expression {request.expressionId} triggered for client {client_uid} "
                f"(duration={request.duration}, priority={request.priority})"
            )
            
            return {
                "status": "success",
                "expression_id": request.expressionId,
                "result": result
            }
            
        except ValueError as e:
            logger.error(f"Validation error setting expression: {e}")
            raise HTTPException(status_code=400, detail=str(e))
        except Exception as e:
            logger.error(f"Error setting expression: {e}", exc_info=True)
            raise HTTPException(status_code=500, detail=f"Error setting expression: {str(e)}")

    @router.post("/api/motion")
    async def trigger_motion_endpoint(
        request: MotionRequest,
        x_client_uid: Optional[str] = Header(None, alias="X-Client-UID")
    ):
        """
        Trigger character motion via REST API.
        
        Request body:
        {
            "motionGroup": str,    # Required: Motion group name (e.g., "idle")
            "motionIndex": int,    # Required: Motion index within group
            "loop": bool,          # Optional: Whether to loop the motion
            "priority": int,       # Optional: Priority level
            "client_uid": str      # Optional: Client UID (can also use X-Client-UID header)
        }
        
        Returns:
        {
            "status": str,
            "motion_group": str,
            "motion_index": int,
            "result": dict
        }
        """
        try:
            # Determine client_uid from request body, header, or use default
            client_uid = request.client_uid or x_client_uid or "default"
            
            # Ensure client has a context (create if needed)
            if client_uid not in ws_handler.client_contexts:
                # Create a new context for this client using the same method as WebSocket connections
                context = ServiceContext()
                context.load_cache(
                    config=default_context_cache.config.model_copy(deep=True),
                    system_config=default_context_cache.system_config.model_copy(deep=True),
                    character_config=default_context_cache.character_config.model_copy(deep=True),
                    live2d_model=default_context_cache.live2d_model,
                    asr_engine=default_context_cache.asr_engine,
                    tts_engine=default_context_cache.tts_engine,
                    vad_engine=default_context_cache.vad_engine,
                    agent_engine=default_context_cache.agent_engine,
                    translate_engine=default_context_cache.translate_engine,
                )
                ws_handler.client_contexts[client_uid] = context
            
            # Get or create adapter for this client
            adapter = ws_handler._get_adapter(client_uid)
            
            # Trigger motion through adapter
            result = await adapter.trigger_motion(
                motion_group=request.motionGroup,
                motion_index=request.motionIndex,
                loop=request.loop,
                priority=request.priority
            )
            
            logger.info(
                f"Motion {request.motionGroup}/{request.motionIndex} triggered for client {client_uid} "
                f"(loop={request.loop}, priority={request.priority})"
            )
            
            return {
                "status": "success",
                "motion_group": request.motionGroup,
                "motion_index": request.motionIndex,
                "result": result
            }
            
        except ValueError as e:
            logger.error(f"Validation error triggering motion: {e}")
            raise HTTPException(status_code=400, detail=str(e))
        except Exception as e:
            logger.error(f"Error triggering motion: {e}", exc_info=True)
            raise HTTPException(status_code=500, detail=f"Error triggering motion: {str(e)}")

    # Autonomous Mode Endpoints
    @router.post("/api/autonomous/generate")
    async def autonomous_generate(request: Request):
        """
        Generate text autonomously using the agent engine.
        
        Request body:
        {
            "prompt": str,  # Required: The prompt to generate text from
            "context": dict  # Optional: Additional context for generation
        }
        
        Returns:
        {
            "text": str,  # Generated text
            "metadata": {
                "character": str,  # Character name
                "model": str,  # Model used
                "tokens": int  # Optional: Token count
            }
        }
        """
        try:
            request_data = await request.json()
            prompt = request_data.get("prompt", "")
            if not prompt:
                raise HTTPException(status_code=400, detail="prompt is required")
            
            context = request_data.get("context", {})
            
            # Create batch input for the agent
            batch_input = create_batch_input(
                input_text=prompt,
                images=None,
                from_name=default_context_cache.character_config.human_name,
            )
            
            # Generate response using agent engine
            full_response = ""
            agent_output = default_context_cache.agent_engine.chat(batch_input)
            
            async for output in agent_output:
                if hasattr(output, 'display_text') and hasattr(output.display_text, 'text'):
                    full_response += output.display_text.text
                elif hasattr(output, 'transcript'):
                    full_response += output.transcript
                elif isinstance(output, str):
                    full_response += output
            
            # Build response
            response_data = {
                "text": full_response,
                "metadata": {
                    "character": default_context_cache.character_config.character_name,
                    "model": getattr(default_context_cache.character_config.agent_config, 'llm_model', 'unknown'),
                }
            }
            
            logger.info(f"Autonomous text generation completed: {len(full_response)} characters")
            return response_data
            
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error in autonomous text generation: {e}", exc_info=True)
            raise HTTPException(status_code=500, detail=f"Error generating text: {str(e)}")

    @router.get("/api/autonomous/status")
    async def autonomous_status():
        """
        Get the status of autonomous mode.
        
        Returns:
        {
            "mode": str,  # "orphiq", "external-api", or "autonomous"
            "active": bool,  # Whether autonomous mode is active
            "character": str,  # Current character name
            "autonomous_generator_enabled": bool,  # Whether random message generator is enabled
            "autonomous_generator_interval": float  # Interval in seconds between random messages
        }
        """
        try:
            # Get autonomous generator status
            autonomous_enabled = False  # Default disabled - must be activated
            autonomous_interval = 120.0  # Default 2 minutes
            min_interval = 120.0  # Default 2 minutes
            max_interval = 240.0  # Default 4 minutes
            
            if autonomous_generator:
                autonomous_enabled = autonomous_generator.enabled
                autonomous_interval = autonomous_generator.interval_seconds
                min_interval = autonomous_generator.min_interval_seconds
                max_interval = autonomous_generator.max_interval_seconds
            
            return {
                "mode": "autonomous" if autonomous_enabled else "manual",
                "active": autonomous_enabled,  # Active only if enabled
                "character": default_context_cache.character_config.character_name,
                "character_id": default_context_cache.character_config.conf_uid,
                "autonomous_generator_enabled": autonomous_enabled,
                "autonomous_generator_interval": autonomous_interval,
                "min_interval_seconds": min_interval,
                "max_interval_seconds": max_interval,
                "auto_responses_enabled": True,  # Automatic responses are always enabled
            }
        except Exception as e:
            logger.error(f"Error getting autonomous status: {e}", exc_info=True)
            raise HTTPException(status_code=500, detail=f"Error getting status: {str(e)}")
    
    @router.post("/api/autonomous/control")
    async def autonomous_control(request: Request):
        """
        Control autonomous mode settings.
        
        Request body:
        {
            "enabled": bool,  # Optional: Enable/disable random message generator
            "interval": float,  # Optional: Set base interval between random messages (seconds)
            "min_interval": float,  # Optional: Set minimum interval (seconds, default: 120)
            "max_interval": float  # Optional: Set maximum interval (seconds, default: 240)
        }
        
        Returns:
        {
            "status": "success",
            "enabled": bool,
            "interval": float,
            "min_interval": float,
            "max_interval": float
        }
        """
        try:
            request_data = await request.json()
            enabled = request_data.get("enabled")
            interval = request_data.get("interval")
            min_interval = request_data.get("min_interval")
            max_interval = request_data.get("max_interval")
            
            response_data = {
                "status": "success",
            }
            
            if enabled is not None and autonomous_generator:
                autonomous_generator.set_enabled(enabled)
                response_data["enabled"] = enabled
                logger.info(f"Autonomous generator enabled set to: {enabled}")
            
            if (interval is not None or min_interval is not None or max_interval is not None) and autonomous_generator:
                # Use current interval if not provided
                base_interval = interval if interval is not None else autonomous_generator.interval_seconds
                autonomous_generator.set_interval(base_interval, min_interval, max_interval)
                response_data["interval"] = base_interval
                response_data["min_interval"] = autonomous_generator.min_interval_seconds
                response_data["max_interval"] = autonomous_generator.max_interval_seconds
                logger.info(f"Autonomous generator interval set: base={base_interval}s, range={autonomous_generator.min_interval_seconds}s-{autonomous_generator.max_interval_seconds}s")
            
            return response_data
            
        except Exception as e:
            logger.error(f"Error controlling autonomous mode: {e}", exc_info=True)
            raise HTTPException(status_code=500, detail=f"Error controlling autonomous mode: {str(e)}")

    @router.post("/api/autonomous/speak")
    async def autonomous_speak(request: Request):
        """
        External API endpoint for autonomous mode.
        Allows external APIs to send messages that the character will speak,
        with optional expressions and motions.
        
        This endpoint is designed for external services to control the character
        in autonomous mode, allowing them to:
        - Send pre-generated or improved text messages
        - Trigger expressions and motions
        - Control character behavior programmatically
        
        Request body:
        {
            "text": str,  # Required: Text message for the character to speak
            "expressions": [int],  # Optional: List of expression IDs to apply
            "motions": [  # Optional: List of motions to trigger
                {
                    "group": str,  # Motion group name (e.g., "idle")
                    "index": int,  # Motion index within group
                    "loop": bool  # Whether to loop the motion
                }
            ],
            "client_uid": str,  # Optional: Target client UID (default: "default")
            "skip_tts": bool,  # Optional: Skip TTS and only send text/expressions (default: false)
            "metadata": dict  # Optional: Additional metadata for the message
        }
        
        Returns:
        {
            "status": str,  # "success" or "error"
            "message_id": str,  # Unique message ID
            "text": str,  # The text that was sent
            "expressions": [int],  # Expressions that were applied
            "motions": list,  # Motions that were triggered
            "tts_generated": bool  # Whether TTS was generated
        }
        """
        try:
            request_data = await request.json()
            text = request_data.get("text", "").strip()
            skip_tts = request_data.get("skip_tts", False)
            expressions = request_data.get("expressions", [])
            motions = request_data.get("motions", [])
            
            # Validate: need either text, expressions, or motions
            if not text and not expressions and not motions:
                raise HTTPException(
                    status_code=400, 
                    detail="At least one of 'text', 'expressions', or 'motions' is required"
                )
            
            # If skip_tts is false, text is required for TTS
            if not skip_tts and not text:
                raise HTTPException(
                    status_code=400,
                    detail="text is required when skip_tts is false"
                )
            
            # Extract remaining optional parameters
            client_uid = request_data.get("client_uid", "default")
            metadata = request_data.get("metadata", {})
            
            # Use empty string for text if not provided (for expression-only messages)
            if not text:
                text = ""
            
            # Generate unique message ID
            message_id = str(uuid4())
            
            # Ensure client has a context
            if client_uid not in ws_handler.client_contexts:
                context = ServiceContext()
                context.load_cache(
                    config=default_context_cache.config.model_copy(deep=True),
                    system_config=default_context_cache.system_config.model_copy(deep=True),
                    character_config=default_context_cache.character_config.model_copy(deep=True),
                    live2d_model=default_context_cache.live2d_model,
                    asr_engine=default_context_cache.asr_engine,
                    tts_engine=default_context_cache.tts_engine,
                    vad_engine=default_context_cache.vad_engine,
                    agent_engine=default_context_cache.agent_engine,
                    translate_engine=default_context_cache.translate_engine,
                )
                ws_handler.client_contexts[client_uid] = context
            
            context = ws_handler.client_contexts[client_uid]
            
            # Create Actions object from expressions and motions
            from ..agent.output_types import Actions, DisplayText
            
            # Convert motions to a format that can be included in actions
            # Note: Current Actions class doesn't support motions directly,
            # so we'll handle motions separately
            actions = Actions(expressions=expressions if expressions else None)
            
            # Create display text
            display_text = DisplayText(
                text=text,
                name=context.character_config.character_name,
                avatar=context.character_config.avatar
            )
            
            # Get WebSocket connection for this client
            websocket = ws_handler.client_connections.get(client_uid)
            
            if not websocket:
                # If no WebSocket connection, create a send function that broadcasts to all
                async def broadcast_send(message: str):
                    for uid, ws in ws_handler.client_connections.items():
                        try:
                            await ws.send_text(message)
                        except Exception as e:
                            logger.error(f"Error sending to client {uid}: {e}")
                websocket_send = broadcast_send
            else:
                async def websocket_send(message: str):
                    await websocket.send_text(message)
            
            # Process motions separately (if any)
            motion_results = []
            if motions:
                adapter = ws_handler._get_adapter(client_uid)
                for motion in motions:
                    try:
                        result = await adapter.trigger_motion(
                            motion_group=motion.get("group", "idle"),
                            motion_index=motion.get("index", 0),
                            loop=motion.get("loop", False),
                            priority=motion.get("priority", 0)
                        )
                        motion_results.append(result)
                    except Exception as e:
                        logger.error(f"Error triggering motion: {e}")
                        motion_results.append({"status": "error", "error": str(e)})
            
            # Process TTS and send message
            tts_generated = False
            if not skip_tts:
                # Create TTS manager for this message
                from ..conversations.tts_manager import TTSTaskManager
                tts_manager = TTSTaskManager()
                
                # Queue TTS task
                await tts_manager.speak(
                    tts_text=text,
                    display_text=display_text,
                    actions=actions,
                    live2d_model=context.live2d_model,
                    tts_engine=context.tts_engine,
                    websocket_send=websocket_send,
                )
                tts_generated = True
            else:
                # Send text-only message with expressions
                from ..utils.stream_audio import prepare_audio_payload
                payload = prepare_audio_payload(
                    audio_path=None,  # No audio
                    display_text=display_text,
                    actions=actions,
                    forwarded=False,
                )
                await websocket_send(json.dumps(payload))
            
            logger.info(
                f"External API autonomous message sent: {text[:50]}... "
                f"(expressions={expressions}, motions={len(motions)}, tts={not skip_tts})"
            )
            
            return {
                "status": "success",
                "message_id": message_id,
                "text": text,
                "expressions": expressions,
                "motions": [m.get("group", "") + "/" + str(m.get("index", 0)) for m in motions],
                "tts_generated": tts_generated,
                "metadata": metadata
            }
            
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error in autonomous speak endpoint: {e}", exc_info=True)
            raise HTTPException(status_code=500, detail=f"Error processing message: {str(e)}")

    # Twitch Integration Endpoints
    @router.get("/api/twitch/status")
    async def twitch_status():
        """
        Get the status of Twitch integration.
        
        Returns:
        {
            "connected": bool,  # Whether Twitch is connected
            "channel": str,  # Connected channel name (if connected)
            "enabled": bool,  # Whether Twitch integration is enabled
            "connections": list  # List of active Twitch connections
        }
        """
        try:
            # Get all active Twitch connections
            twitch_connections = []
            for conn_id, client in _active_chat_clients.items():
                if isinstance(client, ChatPlatform) and client.config.platform_type == PlatformType.TWITCH:
                    status = client.get_status()
                    twitch_connections.append({
                        "connection_id": conn_id,
                        "channel": status.get("channel"),
                        "connected": status.get("connected"),
                    })
            
            return {
                "connected": len(twitch_connections) > 0,
                "channel": twitch_connections[0]["channel"] if twitch_connections else None,
                "enabled": True,  # Twitch integration is enabled
                "connections": twitch_connections,
            }
        except Exception as e:
            logger.error(f"Error getting Twitch status: {e}", exc_info=True)
            raise HTTPException(status_code=500, detail=f"Error getting Twitch status: {str(e)}")
    
    @router.get("/api/chat-platform/status")
    async def chat_platform_status():
        """
        Get status of all active chat platform connections.
        
        Returns:
        {
            "connections": list,  # List of all active connections
            "total": int  # Total number of active connections
        }
        """
        try:
            connections = []
            for conn_id, client in _active_chat_clients.items():
                if isinstance(client, ChatPlatform):
                    status = client.get_status()
                    connections.append({
                        "connection_id": conn_id,
                        "platform": status.get("platform"),
                        "channel": status.get("channel"),
                        "connected": status.get("connected"),
                    })
            
            return {
                "connections": connections,
                "total": len(connections),
            }
        except Exception as e:
            logger.error(f"Error getting chat platform status: {e}", exc_info=True)
            raise HTTPException(
                status_code=500,
                detail=f"Error getting chat platform status: {str(e)}"
            )

    @router.post("/api/twitch/chat/connect")
    async def twitch_chat_connect(request: Request):
        """
        Connect to Twitch chat for a channel.
        
        Request body:
        {
            "channel": str,  # Required: Twitch channel name
            "token": str,  # Required: Twitch OAuth token
            "connection_id": str  # Optional: Unique connection ID for managing multiple connections
        }
        
        Returns:
        {
            "connected": bool,  # Whether connection was successful
            "channel": str,  # Connected channel name
            "platform": str,  # Platform type
            "connection_id": str,  # Connection identifier
            "message": str  # Status message
        }
        """
        try:
            request_data = await request.json()
            channel = request_data.get("channel", "")
            token = request_data.get("token", "")
            connection_id = request_data.get("connection_id", f"twitch_{channel}")
            
            if not channel:
                raise HTTPException(status_code=400, detail="channel is required")
            # Token is optional for Twitch (can use anonymous connection)
            # if not token:
            #     raise HTTPException(status_code=400, detail="token is required")
            
            # Check if already connected
            if connection_id in _active_chat_clients:
                existing_client = _active_chat_clients[connection_id]
                if existing_client.is_connected:
                    status = existing_client.get_status()
                    return {
                        "connected": True,
                        "channel": channel,
                        "platform": PlatformType.TWITCH.value,
                        "connection_id": connection_id,
                        "message": "Already connected to this channel",
                        "status": status,
                    }
                else:
                    # Clean up disconnected client
                    await existing_client.disconnect()
                    _active_chat_clients.pop(connection_id, None)
            
            # Create platform config
            platform_config = PlatformConfig(
                platform_type=PlatformType.TWITCH,
                channel=channel,
                token=token,
                metadata={
                    "username": request_data.get("username"),  # Optional
                }
            )
            
            # Create message callback that routes to autonomous text generation
            async def handle_chat_message(chat_message: ChatMessage):
                """Handle incoming chat message and route to autonomous text generation"""
                try:
                    logger.info(
                        f"Received {chat_message.platform.value} message from "
                        f"{chat_message.username} in {chat_message.channel}: {chat_message.message}"
                    )
                    
                    # Route message to autonomous text generation
                    # Create context with chat message info
                    context = {
                        "source": "chat_platform",
                        "platform": chat_message.platform.value,
                        "username": chat_message.username,
                        "channel": chat_message.channel,
                        "timestamp": chat_message.timestamp.isoformat() if chat_message.timestamp else None,
                        "metadata": chat_message.metadata or {},
                    }
                    
                    # Use the default context cache to generate a response
                    # This integrates with the autonomous text generation system
                    # Run in background task to avoid blocking
                    try:
                        # Create background task for text generation
                        asyncio.create_task(
                            _process_chat_message_for_autonomous(
                                default_context_cache,
                                chat_message,
                                context
                            )
                        )
                        
                    except Exception as e:
                        logger.error(f"Error scheduling chat message processing: {e}")
                    
                except Exception as e:
                    logger.error(f"Error handling chat message: {e}", exc_info=True)
            
            # Create and connect client
            client = create_chat_client(platform_config, handle_chat_message)
            
            if not client:
                raise HTTPException(
                    status_code=500,
                    detail="Failed to create chat client"
                )
            
            # Connect to platform
            connected = await client.connect()
            
            if connected:
                _active_chat_clients[connection_id] = client
                status = client.get_status()
                logger.info(f"Successfully connected to Twitch channel: {channel}")
                return {
                    "connected": True,
                    "channel": channel,
                    "platform": PlatformType.TWITCH.value,
                    "connection_id": connection_id,
                    "message": f"Successfully connected to Twitch channel: {channel}",
                    "status": status,
                }
            else:
                return {
                    "connected": False,
                    "channel": channel,
                    "platform": PlatformType.TWITCH.value,
                    "connection_id": connection_id,
                    "message": "Failed to connect to Twitch chat. Check token and channel name.",
                }
            
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error connecting to Twitch chat: {e}", exc_info=True)
            raise HTTPException(status_code=500, detail=f"Error connecting to Twitch: {str(e)}")
    
    @router.post("/api/chat-platform/connect")
    async def chat_platform_connect(request: Request):
        """
        Connect to any supported chat platform (Twitch, TikTok Live, pump.fun, etc.).
        
        Request body:
        {
            "platform": str,  # Required: "twitch", "tiktok_live", "pump_fun", "youtube_live"
            "channel": str,  # Required: Channel/stream identifier
            "token": str,  # Optional: OAuth token or API key
            "api_key": str,  # Optional: API key for platforms that use it
            "secret": str,  # Optional: Secret for platforms that use it
            "connection_id": str,  # Optional: Unique connection ID
            "metadata": dict  # Optional: Platform-specific metadata
        }
        
        Returns:
        {
            "connected": bool,
            "platform": str,
            "channel": str,
            "connection_id": str,
            "message": str
        }
        """
        try:
            request_data = await request.json()
            platform_str = request_data.get("platform", "").lower()
            channel = request_data.get("channel", "")
            connection_id = request_data.get("connection_id", f"{platform_str}_{channel}")
            
            if not platform_str:
                raise HTTPException(status_code=400, detail="platform is required")
            if not channel:
                raise HTTPException(status_code=400, detail="channel is required")
            
            # Map string to PlatformType
            platform_map = {
                "twitch": PlatformType.TWITCH,
                "tiktok_live": PlatformType.TIKTOK_LIVE,
                "pump_fun": PlatformType.PUMP_FUN,
                "youtube_live": PlatformType.YOUTUBE_LIVE,
            }
            
            if platform_str not in platform_map:
                raise HTTPException(
                    status_code=400,
                    detail=f"Unsupported platform: {platform_str}. Supported: {list(platform_map.keys())}"
                )
            
            platform_type = platform_map[platform_str]
            
            # Check if already connected
            if connection_id in _active_chat_clients:
                existing_client = _active_chat_clients[connection_id]
                if existing_client.is_connected:
                    status = existing_client.get_status()
                    return {
                        "connected": True,
                        "platform": platform_str,
                        "channel": channel,
                        "connection_id": connection_id,
                        "message": "Already connected to this channel",
                        "status": status,
                    }
                else:
                    await existing_client.disconnect()
                    _active_chat_clients.pop(connection_id, None)
            
            # Create platform config
            platform_config = PlatformConfig(
                platform_type=platform_type,
                channel=channel,
                token=request_data.get("token"),
                api_key=request_data.get("api_key"),
                secret=request_data.get("secret"),
                metadata=request_data.get("metadata", {}),
            )
            
            # Create message callback that routes to autonomous text generation
            async def handle_chat_message(chat_message: ChatMessage):
                """Handle incoming chat message from any platform and route to autonomous text generation"""
                try:
                    logger.info(
                        f"Received {chat_message.platform.value} message from "
                        f"{chat_message.username} in {chat_message.channel}: {chat_message.message}"
                    )
                    
                    # Route message to autonomous text generation
                    # Create context with chat message info
                    context = {
                        "source": "chat_platform",
                        "platform": chat_message.platform.value,
                        "username": chat_message.username,
                        "channel": chat_message.channel,
                        "timestamp": chat_message.timestamp.isoformat() if chat_message.timestamp else None,
                        "metadata": chat_message.metadata or {},
                    }
                    
                    # Use the default context cache to generate a response
                    # Run in background task to avoid blocking
                    try:
                        # Create background task for text generation
                        asyncio.create_task(
                            _process_chat_message_for_autonomous(
                                default_context_cache,
                                chat_message,
                                context
                            )
                        )
                        
                    except Exception as e:
                        logger.error(f"Error scheduling chat message processing: {e}")
                    
                except Exception as e:
                    logger.error(f"Error handling chat message: {e}", exc_info=True)
            
            # Create and connect client
            client = create_chat_client(platform_config, handle_chat_message)
            
            if not client:
                raise HTTPException(
                    status_code=501,
                    detail=f"Platform {platform_str} is not yet implemented"
                )
            
            connected = await client.connect()
            
            if connected:
                _active_chat_clients[connection_id] = client
                status = client.get_status()
                logger.info(f"Successfully connected to {platform_str} channel: {channel}")
                return {
                    "connected": True,
                    "platform": platform_str,
                    "channel": channel,
                    "connection_id": connection_id,
                    "message": f"Successfully connected to {platform_str} channel: {channel}",
                    "status": status,
                }
            else:
                return {
                    "connected": False,
                    "platform": platform_str,
                    "channel": channel,
                    "connection_id": connection_id,
                    "message": f"Failed to connect to {platform_str}. Check credentials and channel name.",
                }
            
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error connecting to chat platform: {e}", exc_info=True)
            raise HTTPException(
                status_code=500,
                detail=f"Error connecting to platform: {str(e)}"
            )
    
    @router.post("/api/chat-platform/disconnect")
    async def chat_platform_disconnect(request: Request):
        """
        Disconnect from a chat platform.
        
        Request body:
        {
            "connection_id": str  # Required: Connection ID to disconnect
        }
        """
        try:
            request_data = await request.json()
            connection_id = request_data.get("connection_id", "")
            
            if not connection_id:
                raise HTTPException(status_code=400, detail="connection_id is required")
            
            if connection_id in _active_chat_clients:
                client = _active_chat_clients[connection_id]
                await client.disconnect()
                _active_chat_clients.pop(connection_id, None)
                
                return {
                    "disconnected": True,
                    "connection_id": connection_id,
                    "message": "Successfully disconnected",
                }
            else:
                return {
                    "disconnected": False,
                    "connection_id": connection_id,
                    "message": "Connection not found",
                }
            
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error disconnecting from chat platform: {e}", exc_info=True)
            raise HTTPException(
                status_code=500,
                detail=f"Error disconnecting: {str(e)}"
            )

    # pump.fun specific endpoint
    @router.post("/api/pump-fun/chat/connect")
    async def pump_fun_chat_connect(request: Request):
        """
        Connect to pump.fun livestream chat.
        
        Request body:
        {
            "channel": str,  # Required: pump.fun livestream identifier
            "api_key": str,  # Optional: API key if required by pump.fun
            "connection_id": str  # Optional: Unique connection ID
        }
        
        Returns:
        {
            "connected": bool,  # Whether connection was successful
            "channel": str,  # Connected channel/stream identifier
            "platform": str,  # Platform type ("pump_fun")
            "connection_id": str,  # Connection identifier
            "message": str,  # Status message
            "status": dict  # Connection status details
        }
        """
        try:
            request_data = await request.json()
            channel = request_data.get("channel", "")
            api_key = request_data.get("api_key", "")
            connection_id = request_data.get("connection_id", f"pump_fun_{channel}")
            
            if not channel:
                raise HTTPException(status_code=400, detail="channel is required")
            
            # Use the general chat platform connect endpoint logic
            platform_str = "pump_fun"
            platform_type = PlatformType.PUMP_FUN
            
            # Check if already connected
            if connection_id in _active_chat_clients:
                existing_client = _active_chat_clients[connection_id]
                if existing_client.is_connected:
                    status = existing_client.get_status()
                    return {
                        "connected": True,
                        "channel": channel,
                        "platform": platform_str,
                        "connection_id": connection_id,
                        "message": "Already connected to this pump.fun livestream",
                        "status": status,
                    }
                else:
                    await existing_client.disconnect()
                    _active_chat_clients.pop(connection_id, None)
            
            # Create platform config
            platform_config = PlatformConfig(
                platform_type=platform_type,
                channel=channel,
                api_key=api_key,
                metadata={
                    "connection_id": connection_id,
                    "livestream_id": channel,  # pump.fun specific
                }
            )
            
            # Create message callback that routes to autonomous text generation
            async def handle_chat_message(chat_message: ChatMessage):
                """Handle incoming pump.fun chat message and route to autonomous text generation"""
                try:
                    logger.info(
                        f"Received pump.fun message from {chat_message.username} "
                        f"in {chat_message.channel}: {chat_message.message}"
                    )
                    
                    # Route message to autonomous text generation
                    context = {
                        "source": "pump_fun_chat",
                        "platform": "pump_fun",
                        "username": chat_message.username,
                        "channel": chat_message.channel,
                        "timestamp": chat_message.timestamp.isoformat() if chat_message.timestamp else None,
                        "metadata": chat_message.metadata or {},
                    }
                    
                    # Process in background
                    asyncio.create_task(
                        _process_chat_message_for_autonomous(
                            default_context_cache,
                            chat_message,
                            context
                        )
                    )
                except Exception as e:
                    logger.error(f"Error handling pump.fun chat message: {e}", exc_info=True)
            
            # Create and connect client
            client = create_chat_client(platform_config, handle_chat_message)
            
            if not client:
                raise HTTPException(
                    status_code=501,
                    detail="pump.fun client creation failed"
                )
            
            connected = await client.connect()
            
            if connected:
                _active_chat_clients[connection_id] = client
                status = client.get_status()
                logger.info(f"Successfully connected to pump.fun livestream: {channel}")
                return {
                    "connected": True,
                    "channel": channel,
                    "platform": platform_str,
                    "connection_id": connection_id,
                    "message": f"Successfully connected to pump.fun livestream: {channel} (placeholder implementation)",
                    "status": status,
                    "note": "This is a placeholder implementation. Actual pump.fun API endpoints need to be determined.",
                }
            else:
                return {
                    "connected": False,
                    "channel": channel,
                    "platform": platform_str,
                    "connection_id": connection_id,
                    "message": f"Failed to connect to pump.fun livestream: {channel}",
                }
            
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error connecting to pump.fun chat: {e}", exc_info=True)
            raise HTTPException(status_code=500, detail=f"Error connecting to pump.fun: {str(e)}")

    @router.get("/api/pump-fun/status")
    async def pump_fun_status():
        """
        Get the status of pump.fun integration.
        
        Returns:
        {
            "connected": bool,  # Whether pump.fun is connected
            "channel": str,  # Connected livestream identifier (if connected)
            "enabled": bool,  # Whether pump.fun integration is enabled
            "connections": list  # List of active pump.fun connections
        }
        """
        try:
            # Get all active pump.fun connections
            pump_fun_connections = []
            for conn_id, client in _active_chat_clients.items():
                if isinstance(client, ChatPlatform) and client.config.platform_type == PlatformType.PUMP_FUN:
                    status = client.get_status()
                    pump_fun_connections.append({
                        "connection_id": conn_id,
                        "channel": status.get("channel"),
                        "connected": status.get("connected"),
                        "status": status,
                    })
            
            return {
                "connected": len(pump_fun_connections) > 0,
                "channel": pump_fun_connections[0]["channel"] if pump_fun_connections else None,
                "enabled": True,  # pump.fun integration is enabled
                "connections": pump_fun_connections,
                "connection_count": len(pump_fun_connections),
                "implementation_status": "placeholder",  # Indicates placeholder implementation
            }
        except Exception as e:
            logger.error(f"Error getting pump.fun status: {e}", exc_info=True)
            raise HTTPException(status_code=500, detail=f"Error getting pump.fun status: {str(e)}")

    return router
