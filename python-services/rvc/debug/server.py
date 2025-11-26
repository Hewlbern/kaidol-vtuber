import os
# Set OpenMP environment variable before any imports
os.environ["KMP_DUPLICATE_LIB_OK"] = "TRUE"

from fastapi import FastAPI, UploadFile, HTTPException, Request, status
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import tempfile
import soundfile as sf
from ..inferrvc.interface import VC
import logging
import logging.handlers
from pathlib import Path

import sys
from datetime import datetime

# Create logs directory if it doesn't exist
LOGS_DIR = Path(__file__).parent / "logs"
LOGS_DIR.mkdir(exist_ok=True)

# Set environment variables for RVC
os.environ["index_root"] = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__))))), 
                                      "models", "rvc")

# Configure logging
def setup_logging():
    """Configure logging to both file and console with different formats"""
    # Create formatters
    file_formatter = logging.Formatter(
        '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )
    console_formatter = logging.Formatter(
        '%(levelname)s: %(message)s'
    )

    # Create logs directory if it doesn't exist
    LOGS_DIR.mkdir(exist_ok=True)

    # Create file handlers
    debug_file = LOGS_DIR / f"debug_{datetime.now().strftime('%Y%m%d')}.log"
    error_file = LOGS_DIR / f"error_{datetime.now().strftime('%Y%m%d')}.log"
    
    # Debug file handler - includes all logs
    debug_handler = logging.handlers.RotatingFileHandler(
        debug_file,
        maxBytes=10*1024*1024,  # 10MB
        backupCount=5,
        encoding='utf-8'
    )
    debug_handler.setLevel(logging.DEBUG)
    debug_handler.setFormatter(file_formatter)

    # Error file handler - includes only ERROR and above
    error_handler = logging.handlers.RotatingFileHandler(
        error_file,
        maxBytes=10*1024*1024,  # 10MB
        backupCount=5,
        encoding='utf-8'
    )
    error_handler.setLevel(logging.ERROR)
    error_handler.setFormatter(file_formatter)

    # Console handler
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(logging.INFO)
    console_handler.setFormatter(console_formatter)

    # Get the root logger
    root_logger = logging.getLogger()
    root_logger.setLevel(logging.DEBUG)

    # Remove any existing handlers
    for handler in root_logger.handlers[:]:
        root_logger.removeHandler(handler)

    # Add the handlers
    root_logger.addHandler(debug_handler)
    root_logger.addHandler(error_handler)
    root_logger.addHandler(console_handler)

    return root_logger

# Initialize logging
logger = setup_logging()
logger.info(f"Logs will be stored in: {LOGS_DIR}")
logger.info("Debug logs: debug_YYYYMMDD.log")
logger.info("Error logs: error_YYYYMMDD.log")

app = FastAPI(title="RVC Voice Conversion API")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global VC instance
vc_instance = None

# Default model paths
DEFAULT_MODEL_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__))))), 
                                 "models", "rvc", "bao", "Bao1_e280_s2800.pth")
DEFAULT_INDEX_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__))))), 
                                 "models", "rvc", "bao", "added_IVF783_Flat_nprobe_1_Bao1_v2.index")

@app.middleware("http")
async def log_requests(request: Request, call_next):
    """Log all requests and responses"""
    logger.debug(f"Request: {request.method} {request.url}")
    logger.debug(f"Headers: {dict(request.headers)}")
    try:
        response = await call_next(request)
        logger.debug(f"Response status: {response.status_code}")
        return response
    except Exception as e:
        logger.error(f"Request failed: {str(e)}", exc_info=True)
        raise

def validate_wav_file(file_path: str) -> tuple[bool, str]:
    """Validate WAV file."""
    try:
        logger.debug(f"Validating WAV file: {file_path}")
        if not os.path.exists(file_path):
            logger.error(f"File not found: {file_path}")
            return False, f"File not found: {file_path}"
        if not file_path.lower().endswith('.wav'):
            logger.error(f"Invalid file extension: {file_path}")
            return False, "File must be a WAV file"
            
        logger.debug("Reading audio file for validation")
        audio_data, sample_rate = sf.read(file_path)
        logger.debug(f"Audio file stats: shape={audio_data.shape}, sample_rate={sample_rate}Hz")
        
        if len(audio_data) == 0:
            logger.error("WAV file is empty")
            return False, "WAV file is empty"
            
        logger.debug("WAV file validation successful")
        return True, "Valid WAV file"
    except Exception as e:
        logger.error(f"WAV file validation failed: {str(e)}", exc_info=True)
        return False, f"Invalid WAV file: {str(e)}"

def init_vc(model_path: str = DEFAULT_MODEL_PATH, index_path: str = DEFAULT_INDEX_PATH):
    """Initialize the VC model."""
    global vc_instance
    try:
        # Validate model paths
        logger.debug(f"Checking model path: {model_path}")
        if not os.path.exists(model_path):
            logger.error(f"Model file not found: {model_path}")
            raise FileNotFoundError(f"Model file not found: {model_path}")
            
        logger.debug(f"Checking index path: {index_path}")
        if not os.path.exists(index_path):
            logger.error(f"Index file not found: {index_path}")
            raise FileNotFoundError(f"Index file not found: {index_path}")
            
        logger.info(f"Initializing VC with model: {model_path}")
        logger.info(f"Using index: {index_path}")
        
        vc_instance = VC()
        vc_instance.get_vc(model_path)
        logger.info("VC model initialized successfully")
    except Exception as e:
        logger.error(f"Failed to initialize VC model: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to initialize VC model: {str(e)}")

@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    """Handle HTTP exceptions with detailed logging"""
    logger.error(f"HTTP {exc.status_code} error: {exc.detail}")
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail, "path": str(request.url)}
    )

@app.post("/init")
async def initialize_model(model_path: str = DEFAULT_MODEL_PATH, index_path: str = DEFAULT_INDEX_PATH):
    """Initialize the VC model with specified paths."""
    try:
        init_vc(model_path, index_path)
        return {
            "status": "success", 
            "message": "VC model initialized successfully",
            "model_path": model_path,
            "index_path": index_path
        }
    except Exception as e:
        logger.error(f"Model initialization failed: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/convert")
async def convert_voice(
    request: Request,
    audio_file: UploadFile,
    pitch_shift: float = 0.0,
    method: str = "rmvpe",
    index_rate: float = 0.7,
    protect: float = 0.5,
    output_volume: float = 1.0
):
    """Convert voice using the VC model."""
    try:
        # Log request details
        logger.info(f"Received conversion request from {request.client.host}")
        
        # Log form data
        form_data = await request.form()
        logger.debug("Form data received:")
        for key, value in form_data.items():
            if key == "audio_file":
                logger.debug(f"- {key}: {value.filename} ({value.content_type})")
            else:
                logger.debug(f"- {key}: {value}")

        # Validate audio file
        if not audio_file:
            logger.error("No audio file provided in request")
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="No audio file provided"
            )
            
        logger.debug(f"Audio file details:")
        logger.debug(f"- Filename: {audio_file.filename}")
        logger.debug(f"- Content-Type: {audio_file.content_type}")
        
        try:
            size = len(await audio_file.read())
            await audio_file.seek(0)  # Reset file pointer
            logger.debug(f"- Size: {size} bytes")
            if size == 0:
                logger.error("Uploaded file is empty")
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="Uploaded file is empty"
                )
        except Exception as e:
            logger.error(f"Error reading file: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Error reading uploaded file: {str(e)}"
            )

        logger.info(f"Parameters: pitch_shift={pitch_shift}, method={method}, "
                   f"index_rate={index_rate}, protect={protect}, output_volume={output_volume}")

        if vc_instance is None:
            logger.info("VC model not initialized, initializing with default model...")
            init_vc()
        
        # Validate file extension
        if not audio_file.filename:
            logger.error("No filename provided in request")
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="No filename provided"
            )
        if not audio_file.filename.lower().endswith('.wav'):
            logger.error(f"Invalid file extension: {audio_file.filename}")
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"File must be a WAV file, got: {audio_file.filename}"
            )
        
        try:
            # Create temporary files for input and output
            with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as temp_input:
                logger.info(f"Creating temporary input file: {temp_input.name}")
                
                # Read and validate input file
                logger.debug("Reading uploaded file content")
                content = await audio_file.read()
                logger.debug(f"Read {len(content)} bytes from uploaded file")
                
                temp_input.write(content)
                temp_input.flush()
                
                # Validate WAV file
                logger.debug("Validating WAV file")
                is_valid, validation_msg = validate_wav_file(temp_input.name)
                if not is_valid:
                    logger.error(f"WAV file validation failed: {validation_msg}")
                    raise HTTPException(
                        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                        detail=validation_msg
                    )
                
                # Convert the voice using VC instance
                try:
                    logger.info("Processing audio through VC model...")
                    tgt_sr, audio_opt, times, info = vc_instance.vc_inference(
                        sid=0,  # Using first speaker
                        input_audio_path=Path(temp_input.name),
                        f0_up_key=int(pitch_shift),
                        f0_method=method,
                        index_file=Path(DEFAULT_INDEX_PATH),
                        index_rate=index_rate,
                        protect=protect
                    )
                    
                    if info:
                        logger.error(f"Error in voice conversion: {info}")
                        raise HTTPException(
                            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                            detail=f"Error in voice conversion: {info}"
                        )
                        
                    logger.debug(f"Converted audio shape: {audio_opt.shape if audio_opt is not None else None}")
                    
                    # Apply output volume
                    if audio_opt is not None and output_volume != 1.0:
                        audio_opt *= output_volume
                    
                except Exception as e:
                    logger.error(f"Error in voice conversion: {str(e)}", exc_info=True)
                    raise HTTPException(
                        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                        detail=f"Error in voice conversion: {str(e)}"
                    )
                
                # Save the converted audio
                try:
                    output_path = temp_input.name.replace('.wav', '_converted.wav')
                    logger.info(f"Saving converted audio to: {output_path}")
                    sf.write(output_path, audio_opt, tgt_sr)
                    logger.debug(f"Saved converted audio file: {os.path.getsize(output_path)} bytes")
                except Exception as e:
                    logger.error(f"Error saving converted audio: {str(e)}", exc_info=True)
                    raise HTTPException(
                        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                        detail=f"Error saving converted audio: {str(e)}"
                    )
                
                # Clean up input file
                try:
                    os.unlink(temp_input.name)
                    logger.info("Temporary input file cleaned up")
                except Exception as e:
                    logger.warning(f"Error cleaning up temporary file: {str(e)}")
                
                # Return the converted file
                logger.info("Sending converted audio file...")
                return FileResponse(
                    output_path,
                    media_type="audio/wav",
                    filename=f"converted_{audio_file.filename}",
                    background=None  # This ensures the file is deleted after sending
                )
                
        except Exception as e:
            logger.error(f"Error processing audio: {str(e)}", exc_info=True)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Error processing audio: {str(e)}"
            )
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Unexpected error: {str(e)}"
        )

@app.get("/health")
async def health_check():
    """Health check endpoint."""
    try:
        model_status = "initialized" if vc_instance is not None else "not initialized"
        model_info = {
            "model_path": DEFAULT_MODEL_PATH,
            "index_path": DEFAULT_INDEX_PATH,
            "model_exists": os.path.exists(DEFAULT_MODEL_PATH),
            "index_exists": os.path.exists(DEFAULT_INDEX_PATH)
        }
        logger.debug(f"Health check - Model status: {model_status}")
        logger.debug(f"Health check - Model info: {model_info}")
        return {
            "status": "healthy",
            "vc_status": model_status,
            "model_info": model_info
        }
    except Exception as e:
        logger.error(f"Health check failed: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Health check failed: {str(e)}"
        ) 