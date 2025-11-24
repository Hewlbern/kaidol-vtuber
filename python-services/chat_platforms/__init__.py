"""
Chat platform integration module for various livestreaming platforms.
Supports Twitch, TikTok Live, pump.fun, and other similar platforms.
"""

from .base_platform import ChatPlatform, ChatMessage, PlatformConfig, PlatformType
from .twitch_client import TwitchChatClient
from .pump_fun_client import PumpFunChatClient
from .platform_factory import create_chat_client
from .message_filters import SpamFilter, MessageSelector, ResponseSelector

__all__ = [
    "ChatPlatform",
    "ChatMessage",
    "PlatformConfig",
    "PlatformType",
    "TwitchChatClient",
    "PumpFunChatClient",
    "create_chat_client",
    "SpamFilter",
    "MessageSelector",
    "ResponseSelector",
]

