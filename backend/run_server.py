import os
import sys
import atexit
import argparse
from pathlib import Path
import tomli
import uvicorn
from loguru import logger
from upgrade import sync_user_config
from src.open_llm_vtuber.server import WebSocketServer
from src.open_llm_vtuber.config_manager import Config, read_yaml, validate_config
from dotenv import load_dotenv

# Load environment variables before any other initialization
load_dotenv()

# Update the model paths at the top
BASE_DIR = Path(__file__).parent
os.environ["HF_HOME"] = str(BASE_DIR / "models")
os.environ["MODELSCOPE_CACHE"] = str(BASE_DIR / "models")


def get_version() -> str:
    with open("pyproject.toml", "rb") as f:
        pyproject = tomli.load(f)
    return pyproject["project"]["version"]


def init_logger(console_log_level: str = "INFO") -> None:
    logger.remove()
    # Console output
    logger.add(
        sys.stderr,
        level=console_log_level,
        format="<green>{time:YYYY-MM-DD HH:mm:ss}</green> | <level>{level: <8}</level> | <cyan>{name}</cyan>:<cyan>{function}</cyan>:<cyan>{line}</cyan> | {message}",
        colorize=True,
    )

    # File output
    logger.add(
        "logs/debug_{time:YYYY-MM-DD}.log",
        rotation="10 MB",
        retention="30 days",
        level="DEBUG",
        format="{time:YYYY-MM-DD HH:mm:ss.SSS} | {level: <8} | {name}:{function}:{line} | {message} | {extra}",
        backtrace=True,
        diagnose=True,
    )


def parse_args():
    parser = argparse.ArgumentParser(description="Open-LLM-VTuber Server")
    parser.add_argument("--verbose", action="store_true", help="Enable verbose logging")
    parser.add_argument(
        "--hf_mirror", action="store_true", help="Use Hugging Face mirror"
    )
    return parser.parse_args()


def load_config() -> Config:
    """Load and validate configuration"""
    return validate_config(read_yaml("conf.yaml"))


@logger.catch
def run(console_log_level: str = "INFO") -> None:
    """
    Run the server with the specified configuration.
    """
    init_logger(console_log_level)
    logger.info(f"Open-LLM-VTuber, version {get_version()}")

    try:
        sync_user_config(config_dir="config")
    except Exception as e:
        logger.error(f"Error syncing user config: {e}")

    atexit.register(WebSocketServer.clean_cache)

    # Load the configuration
    config = load_config()
    server_config = config.system_config

    # Convert paths to absolute paths relative to BASE_DIR
    server_config.live2d_models_dir = str(BASE_DIR / server_config.live2d_models_dir)
    server_config.shared_assets_dir = str(BASE_DIR / server_config.shared_assets_dir)
    server_config.cache_dir = str(BASE_DIR / server_config.cache_dir)

    # Ensure directories exist
    Path(server_config.live2d_models_dir).mkdir(parents=True, exist_ok=True)
    Path(server_config.shared_assets_dir).mkdir(parents=True, exist_ok=True)
    Path(server_config.cache_dir).mkdir(parents=True, exist_ok=True)
    Path(server_config.backgrounds_dir).mkdir(parents=True, exist_ok=True)
    Path(server_config.avatars_dir).mkdir(parents=True, exist_ok=True)
    Path(server_config.assets_dir).mkdir(parents=True, exist_ok=True)

    # Log directory paths for debugging
    logger.debug(f"Live2D models directory: {server_config.live2d_models_dir}")
    logger.debug(f"Looking for model_dict.json in parent directory")
    model_dict_path = Path("model_dict.json")
    if model_dict_path.exists():
        logger.debug(f"Found model_dict.json at {model_dict_path.absolute()}")
        # Copy model_dict.json to live2d models directory
        target_path = Path(server_config.live2d_models_dir) / "model_dict.json"
        target_path.write_text(model_dict_path.read_text())
        logger.debug(f"Copied model_dict.json to {target_path}")
    else:
        logger.error(f"model_dict.json not found in {model_dict_path.absolute()}")

    # After converting paths
    logger.debug(f"Live2D models directory structure:")
    live2d_dir = Path(server_config.live2d_models_dir)
    logger.debug(f"Base dir: {live2d_dir}")
    for model_dir in live2d_dir.iterdir():
        if model_dir.is_dir():
            logger.debug(f"  Model dir: {model_dir}")
            for file in model_dir.iterdir():
                logger.debug(f"    {file}")

    # After creating other directories
    Path("src/ui/frontend").mkdir(parents=True, exist_ok=True)
    Path("src/ui/web_tool").mkdir(parents=True, exist_ok=True)
    Path("src/ui/simple-live2d").mkdir(parents=True, exist_ok=True)

    # Create the server with the config
    server = WebSocketServer(
        config=config,
    )

    uvicorn.run(
        app=server.app,
        host=server_config.host,
        port=server_config.port,
        log_level=console_log_level.lower(),
        proxy_headers=True,
        forwarded_allow_ips="127.0.0.1,::1",
    )


if __name__ == "__main__":
    args = parse_args()
    console_log_level = "DEBUG" if args.verbose else "INFO"
    if args.verbose:
        logger.info("Running in verbose mode")
    else:
        logger.info(
            "Running in standard mode. For detailed debug logs, use: uv run run_server.py --verbose"
        )
    if args.hf_mirror:
        os.environ["HF_ENDPOINT"] = "https://hf-mirror.com"
    run(console_log_level=console_log_level)
