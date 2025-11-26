"""
Base interface for chat platform integrations.
"""

import asyncio
from abc import ABC, abstractmethod
from typing import Optional, Callable, Dict, Any
from dataclasses import dataclass
from datetime import datetime
from enum import Enum


class PlatformType(Enum):
    """Supported platform types"""
    TWITCH = "twitch"
    TIKTOK_LIVE = "tiktok_live"
    PUMP_FUN = "pump_fun"
    YOUTUBE_LIVE = "youtube_live"
    CUSTOM = "custom"


@dataclass
class ChatMessage:
    """Represents a chat message from any platform"""
    username: str
    message: str
    timestamp: datetime
    platform: PlatformType
    channel: str
    user_id: Optional[str] = None
    badges: Optional[Dict[str, Any]] = None
    metadata: Optional[Dict[str, Any]] = None


@dataclass
class PlatformConfig:
    """Configuration for a chat platform connection"""
    platform_type: PlatformType
    channel: str
    token: Optional[str] = None
    api_key: Optional[str] = None
    secret: Optional[str] = None
    custom_endpoint: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None


class ChatPlatform(ABC):
    """
    Base interface for chat platform clients.
    All platform implementations should inherit from this.
    """
    
    def __init__(
        self,
        config: PlatformConfig,
        message_callback: Optional[Callable[[ChatMessage], None]] = None
    ):
        """
        Initialize the chat platform client.
        
        Args:
            config: Platform configuration
            message_callback: Callback function for received messages
        """
        self.config = config
        self.message_callback = message_callback
        self.is_connected = False
        self.channel = config.channel
    
    @abstractmethod
    async def connect(self) -> bool:
        """
        Connect to the chat platform.
        
        Returns:
            bool: True if connection successful, False otherwise
        """
        pass
    
    @abstractmethod
    async def disconnect(self) -> None:
        """Disconnect from the chat platform."""
        pass
    
    @abstractmethod
    async def send_message(self, message: str) -> bool:
        """
        Send a message to the chat.
        
        Args:
            message: Message text to send
            
        Returns:
            bool: True if message sent successfully
        """
        pass
    
    @abstractmethod
    def get_status(self) -> Dict[str, Any]:
        """
        Get current connection status.
        
        Returns:
            dict: Status information including connected, channel, etc.
        """
        pass
    
    def _handle_message(self, raw_message: Dict[str, Any]) -> None:
        """
        Process a raw message and call the callback.
        
        Args:
            raw_message: Raw message data from platform
        """
        if self.message_callback:
            chat_message = self._parse_message(raw_message)
            if chat_message:
                # Handle both sync and async callbacks
                try:
                    if asyncio.iscoroutinefunction(self.message_callback):
                        # Schedule async callback
                        try:
                            loop = asyncio.get_running_loop()
                            loop.create_task(self.message_callback(chat_message))
                        except RuntimeError:
                            # No running loop, create new one
                            asyncio.run(self.message_callback(chat_message))
                    else:
                        # Call sync callback
                        self.message_callback(chat_message)
                except Exception as e:
                    # Log error but don't crash
                    import logging
                    logging.error(f"Error in message callback: {e}")
    
    @abstractmethod
    def _parse_message(self, raw_message: Dict[str, Any]) -> Optional[ChatMessage]:
        """
        Parse a raw platform message into a ChatMessage.
        
        Args:
            raw_message: Raw message data from platform
            
        Returns:
            ChatMessage or None if message should be ignored
        """
        pass

