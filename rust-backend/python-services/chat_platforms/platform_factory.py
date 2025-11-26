"""
Factory for creating chat platform clients.
"""

from typing import Optional, Callable
from loguru import logger

from .base_platform import ChatPlatform, PlatformConfig, PlatformType
from .twitch_client import TwitchChatClient
from .pump_fun_client import PumpFunChatClient


def create_chat_client(
    config: PlatformConfig,
    message_callback: Optional[Callable] = None
) -> Optional[ChatPlatform]:
    """
    Create a chat platform client based on configuration.
    
    Args:
        config: Platform configuration
        message_callback: Callback for received messages
        
    Returns:
        ChatPlatform instance or None if platform not supported
    """
    try:
        if config.platform_type == PlatformType.TWITCH:
            return TwitchChatClient(config, message_callback)
        
        elif config.platform_type == PlatformType.TIKTOK_LIVE:
            # TODO: Implement TikTok Live client
            logger.warning("TikTok Live client not yet implemented")
            return None
        
        elif config.platform_type == PlatformType.PUMP_FUN:
            return PumpFunChatClient(config, message_callback)
        
        elif config.platform_type == PlatformType.YOUTUBE_LIVE:
            # TODO: Implement YouTube Live client
            logger.warning("YouTube Live client not yet implemented")
            return None
        
        else:
            logger.error(f"Unsupported platform type: {config.platform_type}")
            return None
            
    except Exception as e:
        logger.error(f"Error creating chat client: {e}")
        return None

