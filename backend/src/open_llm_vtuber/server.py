import os
import shutil

from fastapi import FastAPI
from starlette.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.responses import Response

from .routes import init_client_ws_route, init_webtool_routes
from .service_context import ServiceContext
from .config_manager.utils import Config


class CustomStaticFiles(StaticFiles):
    async def get_response(self, path, scope):
        response = await super().get_response(path, scope)
        if path.endswith(".js"):
            response.headers["Content-Type"] = "application/javascript"
        return response


class AvatarStaticFiles(StaticFiles):
    async def get_response(self, path: str, scope):
        allowed_extensions = (".jpg", ".jpeg", ".png", ".gif", ".svg")
        if not any(path.lower().endswith(ext) for ext in allowed_extensions):
            return Response("Forbidden file type", status_code=403)
        return await super().get_response(path, scope)


class WebSocketServer:
    def __init__(self, config: Config):
        self.app = FastAPI()
        self.config = config
        self.autonomous_generator = None  # Will be initialized later

        # Add CORS
        self.app.add_middleware(
            CORSMiddleware,
            allow_origins=["*"],
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
        )

        # Load configurations and initialize the default context cache
        default_context_cache = ServiceContext()
        default_context_cache.load_from_config(config)

        # Create shared WebSocketHandler for both WebSocket and REST routes
        from .websocket_handler import WebSocketHandler
        ws_handler = WebSocketHandler(default_context_cache)

        # Initialize autonomous message generator (disabled by default - must be activated)
        from .autonomous_message_generator import AutonomousMessageGenerator
        self.autonomous_generator = AutonomousMessageGenerator(
            default_context=default_context_cache,
            ws_handler=ws_handler,
            interval_seconds=120.0,  # Base interval: 2 minutes
            min_interval_seconds=120.0,  # Minimum: 2 minutes
            max_interval_seconds=240.0,  # Maximum: 4 minutes
            enabled=False  # Disabled by default - must be activated via API
        )
        
        # Start the autonomous message generator on startup
        @self.app.on_event("startup")
        async def startup_event():
            await self.autonomous_generator.start()
        
        @self.app.on_event("shutdown")
        async def shutdown_event():
            await self.autonomous_generator.stop()

        # Include routes with shared WebSocketHandler
        self.app.include_router(
            init_client_ws_route(
                default_context_cache=default_context_cache,
                ws_handler=ws_handler
            ),
        )
        self.app.include_router(
            init_webtool_routes(
                default_context_cache=default_context_cache,
                ws_handler=ws_handler,
                autonomous_generator=self.autonomous_generator
            ),
        )

        # Mount cache directory first (to ensure audio file access)
        if not os.path.exists("cache"):
            os.makedirs("cache")
        self.app.mount(
            "/cache",
            StaticFiles(directory="cache"),
            name="cache",
        )

        # Mount static files and directories
        self.app.mount(
            "/live2d-models",
            StaticFiles(directory=self.config.system_config.live2d_models_dir),
            name="live2d-models",
        )

        # Mount backgrounds with correct path
        self.app.mount(
            "/bg",  # This matches the HTML URL
            StaticFiles(directory=self.config.system_config.backgrounds_dir),
            name="backgrounds",
        )

        # Mount characters with correct path
        self.app.mount(
            "/characters",
            StaticFiles(directory=self.config.system_config.characters_dir),
            name="characters", 
        )

        # Mount avatars
        self.app.mount(
            "/avatars",
            AvatarStaticFiles(directory=self.config.system_config.avatars_dir),
            name="avatars",
        )

        # Mount simple live2d viewer with its own static files
        self.app.mount(
            "/simple-live2d",
            CustomStaticFiles(directory="src/ui/simple-live2d", html=True),
            name="simple_live2d",
        )

        # Mount web tool
        self.app.mount(
            "/web-tool",
            CustomStaticFiles(directory="src/ui/web_tool", html=True),
            name="web_tool",
        )

        # Mount main frontend
        self.app.mount(
            "/frontend",
            CustomStaticFiles(directory="src/ui/frontend", html=True),
            name="frontend",
        )

        # Mount root last (landing page)
        self.app.mount(
            "/",
            CustomStaticFiles(directory="src/ui", html=True),
            name="root",
        )

    def run(self):
        pass

    @staticmethod
    def clean_cache():
        """Clean the cache directory by removing and recreating it."""
        cache_dir = "cache"
        if os.path.exists(cache_dir):
            shutil.rmtree(cache_dir)
            os.makedirs(cache_dir)