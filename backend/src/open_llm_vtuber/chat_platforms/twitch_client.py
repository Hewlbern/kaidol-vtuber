"""
Twitch IRC chat client implementation.
"""

import asyncio
import re
from typing import Optional, Callable, Dict, Any
from datetime import datetime
import socket
from loguru import logger

from .base_platform import ChatPlatform, ChatMessage, PlatformConfig, PlatformType


class TwitchChatClient(ChatPlatform):
    """
    Twitch IRC chat client.
    Connects to Twitch IRC and listens for chat messages.
    """
    
    IRC_SERVER = "irc.chat.twitch.tv"
    IRC_PORT = 6667
    
    def __init__(
        self,
        config: PlatformConfig,
        message_callback: Optional[Callable[[ChatMessage], None]] = None
    ):
        super().__init__(config, message_callback)
        self.token = config.token
        self.nickname = None  # Will be extracted from token or config
        self.reader: Optional[asyncio.StreamReader] = None
        self.writer: Optional[asyncio.StreamWriter] = None
        self.receive_task: Optional[asyncio.Task] = None
        
        # Validate token format (oauth:xxxxx or just xxxxx)
        if self.token:
            if self.token.startswith("oauth:"):
                self.token = self.token[6:]
            # Extract username from token if possible (for now, use channel as fallback)
            self.nickname = config.metadata.get("username") if config.metadata else None
            if not self.nickname:
                # Try to extract from token or use a default
                # For anonymous connections, Twitch allows "justinfan" + random number
                import random
                self.nickname = f"justinfan{random.randint(10000, 99999)}"  # Anonymous Twitch user
    
    async def connect(self) -> bool:
        """
        Connect to Twitch IRC.
        
        Returns:
            bool: True if connection successful
        """
        try:
            logger.info(f"Connecting to Twitch IRC for channel: {self.channel}")
            
            # Create connection
            self.reader, self.writer = await asyncio.open_connection(
                self.IRC_SERVER,
                self.IRC_PORT
            )
            
            # Authenticate
            if self.token:
                self.writer.write(f"PASS oauth:{self.token}\n".encode())
            else:
                # Anonymous connection (limited functionality)
                logger.warning("No token provided, using anonymous connection")
            
            self.writer.write(f"NICK {self.nickname}\n".encode())
            
            # Request tags capability for enhanced message metadata
            self.writer.write("CAP REQ :twitch.tv/tags\n".encode())
            self.writer.write("CAP REQ :twitch.tv/commands\n".encode())
            self.writer.write("CAP REQ :twitch.tv/membership\n".encode())
            
            self.writer.write(f"JOIN #{self.channel}\n".encode())
            await self.writer.drain()
            
            # Start receiving messages
            self.receive_task = asyncio.create_task(self._receive_messages())
            
            # Wait a bit to confirm connection
            await asyncio.sleep(1)
            
            self.is_connected = True
            logger.info(f"Successfully connected to Twitch channel: {self.channel}")
            return True
            
        except Exception as e:
            logger.error(f"Error connecting to Twitch IRC: {e}")
            self.is_connected = False
            return False
    
    async def disconnect(self) -> None:
        """Disconnect from Twitch IRC."""
        try:
            if self.receive_task:
                self.receive_task.cancel()
                try:
                    await self.receive_task
                except asyncio.CancelledError:
                    pass
            
            if self.writer:
                self.writer.write("PART\n".encode())
                self.writer.close()
                await self.writer.wait_closed()
            
            self.is_connected = False
            logger.info(f"Disconnected from Twitch channel: {self.channel}")
            
        except Exception as e:
            logger.error(f"Error disconnecting from Twitch: {e}")
    
    async def send_message(self, message: str) -> bool:
        """
        Send a message to the Twitch chat.
        
        Args:
            message: Message text to send
            
        Returns:
            bool: True if message sent successfully
        """
        if not self.is_connected or not self.writer:
            logger.warning("Cannot send message: not connected")
            return False
        
        try:
            # Twitch IRC format: PRIVMSG #channel :message
            irc_message = f"PRIVMSG #{self.channel} :{message}\n"
            self.writer.write(irc_message.encode())
            await self.writer.drain()
            logger.debug(f"Sent message to Twitch: {message[:50]}...")
            return True
        except Exception as e:
            logger.error(f"Error sending message to Twitch: {e}")
            return False
    
    def get_status(self) -> Dict[str, Any]:
        """Get current connection status."""
        return {
            "connected": self.is_connected,
            "platform": PlatformType.TWITCH.value,
            "channel": self.channel,
            "has_token": self.token is not None,
        }
    
    async def _receive_messages(self) -> None:
        """Continuously receive and process IRC messages."""
        try:
            while self.is_connected:
                if not self.reader:
                    break
                
                try:
                    line = await asyncio.wait_for(
                        self.reader.readline(),
                        timeout=30.0
                    )
                    
                    if not line:
                        break
                    
                    message = line.decode('utf-8', errors='ignore').strip()
                    
                    # Handle PING (keep-alive)
                    if message.startswith("PING"):
                        if self.writer:
                            self.writer.write("PONG :tmi.twitch.tv\n".encode())
                            await self.writer.drain()
                        continue
                    
                    # Parse PRIVMSG (chat messages)
                    if "PRIVMSG" in message:
                        parsed = self._parse_irc_message(message)
                        if parsed:
                            self._handle_message(parsed)
                    
                    # Log connection status messages
                    if "376" in message or "366" in message:  # End of MOTD, End of NAMES
                        logger.info(f"Twitch IRC connection established for {self.channel}")
                    
                except asyncio.TimeoutError:
                    # Send keep-alive
                    if self.writer:
                        self.writer.write("PING :tmi.twitch.tv\n".encode())
                        await self.writer.drain()
                    continue
                except Exception as e:
                    logger.error(f"Error receiving Twitch message: {e}")
                    break
                    
        except asyncio.CancelledError:
            logger.info("Twitch message receiver cancelled")
        except Exception as e:
            logger.error(f"Error in Twitch message receiver: {e}")
            self.is_connected = False
    
    def _parse_irc_message(self, irc_line: str) -> Optional[Dict[str, Any]]:
        """
        Parse Twitch IRC message format.
        
        Format: :username!username@username.tmi.twitch.tv PRIVMSG #channel :message
        Also handles tags: @badges=...;color=...;display-name=...;emotes=...;id=...;mod=...;room-id=...;subscriber=...;tmi-sent-ts=...;turbo=...;user-id=...;user-type=... :username!username@username.tmi.twitch.tv PRIVMSG #channel :message
        """
        try:
            # Handle messages with tags (more detailed format)
            # Format: @tags :username!username@username.tmi.twitch.tv PRIVMSG #channel :message
            tags_pattern = r"@([^ ]+) :(\w+)!\w+@\w+\.tmi\.twitch\.tv PRIVMSG #(\w+) :(.+)"
            tags_match = re.match(tags_pattern, irc_line)
            
            if tags_match:
                tags_str = tags_match.group(1)
                username = tags_match.group(2)
                channel = tags_match.group(3)
                message = tags_match.group(4)
                
                # Parse tags
                tags = {}
                for tag in tags_str.split(';'):
                    if '=' in tag:
                        key, value = tag.split('=', 1)
                        tags[key] = value
                
                return {
                    "username": tags.get("display-name", username),
                    "message": message,
                    "channel": channel,
                    "timestamp": datetime.now(),
                    "raw": irc_line,
                    "tags": tags,
                    "user_id": tags.get("user-id"),
                    "badges": tags.get("badges", "").split(",") if tags.get("badges") else [],
                    "is_mod": tags.get("mod") == "1",
                    "is_subscriber": tags.get("subscriber") == "1",
                }
            
            # Fallback to simple format (no tags)
            pattern = r":(\w+)!\w+@\w+\.tmi\.twitch\.tv PRIVMSG #(\w+) :(.+)"
            match = re.match(pattern, irc_line)
            
            if match:
                username = match.group(1)
                channel = match.group(2)
                message = match.group(3)
                
                return {
                    "username": username,
                    "message": message,
                    "channel": channel,
                    "timestamp": datetime.now(),
                    "raw": irc_line,
                    "tags": {},
                }
            
            return None
            
        except Exception as e:
            logger.error(f"Error parsing IRC message: {e}")
            return None
    
    def _parse_message(self, raw_message: Dict[str, Any]) -> Optional[ChatMessage]:
        """
        Parse raw Twitch message into ChatMessage.
        
        Args:
            raw_message: Raw message data from IRC
            
        Returns:
            ChatMessage or None if message should be ignored
        """
        try:
            # Filter out empty messages
            message_text = raw_message.get("message", "").strip()
            if not message_text:
                return None
            
            # Build metadata with all available information
            metadata = {
                "raw_irc": raw_message.get("raw"),
                "tags": raw_message.get("tags", {}),
                "user_id": raw_message.get("user_id"),
                "is_mod": raw_message.get("is_mod", False),
                "is_subscriber": raw_message.get("is_subscriber", False),
                "badges": raw_message.get("badges", []),
            }
            
            # Build badges dict if available
            badges = {}
            if raw_message.get("badges"):
                for badge in raw_message.get("badges", []):
                    if badge:
                        parts = badge.split("/")
                        if len(parts) >= 1:
                            badges[parts[0]] = parts[1] if len(parts) > 1 else "1"
            metadata["badges_dict"] = badges
            
            return ChatMessage(
                username=raw_message.get("username", "unknown"),
                message=message_text,
                timestamp=raw_message.get("timestamp", datetime.now()),
                platform=PlatformType.TWITCH,
                channel=raw_message.get("channel", self.channel),
                user_id=raw_message.get("user_id"),
                badges=badges if badges else None,
                metadata=metadata,
            )
        except Exception as e:
            logger.error(f"Error creating ChatMessage from Twitch: {e}")
            return None

