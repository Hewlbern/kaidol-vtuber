"""
Autonomous Message Generator

This module provides functionality to generate and send random chat messages
to connected WebSocket clients in autonomous mode. It periodically generates
messages using the agent engine and sends them via WebSocket.
"""

import asyncio
import json
import random
from typing import Dict, Optional, List
from fastapi import WebSocket
from loguru import logger
from .service_context import ServiceContext
from .websocket_handler import WebSocketHandler
from .conversations.conversation_utils import create_batch_input


class AutonomousMessageGenerator:
    """Generates and sends random autonomous messages to connected clients"""
    
    def __init__(
        self,
        default_context: ServiceContext,
        ws_handler: WebSocketHandler,
        interval_seconds: float = 120.0,
        min_interval_seconds: float = 120.0,
        max_interval_seconds: float = 240.0,
        enabled: bool = False
    ):
        """
        Initialize the autonomous message generator.
        
        Args:
            default_context: Default service context for generating messages
            ws_handler: WebSocket handler for sending messages
            interval_seconds: Base interval between message generations (default: 120 seconds / 2 minutes)
            min_interval_seconds: Minimum interval between messages (default: 120 seconds / 2 minutes)
            max_interval_seconds: Maximum interval between messages (default: 240 seconds / 4 minutes)
            enabled: Whether the generator is enabled (default: False - must be activated)
        """
        self.default_context = default_context
        self.ws_handler = ws_handler
        self.interval_seconds = interval_seconds
        self.min_interval_seconds = min_interval_seconds
        self.max_interval_seconds = max_interval_seconds
        self.enabled = enabled
        self._task: Optional[asyncio.Task] = None
        self._running = False
        
        # Random prompts for generating autonomous messages
        self.prompts = [
            "Say something interesting about yourself",
            "Share a random thought",
            "What's on your mind?",
            "Tell me something fun",
            "What would you like to talk about?",
            "Share a random observation",
            "What's happening?",
            "Say something spontaneous",
            "What are you thinking about?",
            "Share something random",
        ]
    
    async def start(self):
        """Start the autonomous message generator"""
        if self._running:
            logger.warning("Autonomous message generator is already running")
            return
        
        self._running = True
        self._task = asyncio.create_task(self._generation_loop())
        logger.info(f"Autonomous message generator started (interval: {self.interval_seconds}s)")
    
    async def stop(self):
        """Stop the autonomous message generator"""
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        logger.info("Autonomous message generator stopped")
    
    def set_enabled(self, enabled: bool):
        """Enable or disable the generator"""
        self.enabled = enabled
        logger.info(f"Autonomous message generator {'enabled' if enabled else 'disabled'}")
    
    def set_interval(self, interval_seconds: float, min_interval: Optional[float] = None, max_interval: Optional[float] = None):
        """Set the interval between message generations"""
        self.interval_seconds = interval_seconds
        if min_interval is not None:
            self.min_interval_seconds = min_interval
        if max_interval is not None:
            self.max_interval_seconds = max_interval
        logger.info(f"Autonomous message generator interval set to {interval_seconds}s (range: {self.min_interval_seconds}s - {self.max_interval_seconds}s)")
    
    def _get_random_interval(self) -> float:
        """Get a random interval between min and max"""
        return random.uniform(self.min_interval_seconds, self.max_interval_seconds)
    
    async def _generation_loop(self):
        """Main loop for generating and sending messages"""
        while self._running:
            try:
                if self.enabled:
                    await self._generate_and_send_message()
                
                # Wait for a random interval between min and max
                wait_time = self._get_random_interval()
                logger.debug(f"Waiting {wait_time:.1f}s before next autonomous message")
                await asyncio.sleep(wait_time)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error in autonomous message generation loop: {e}", exc_info=True)
                # Wait a bit before retrying
                await asyncio.sleep(5)
    
    async def _generate_and_send_message(self):
        """Generate a random message and send it to all connected clients in chunks"""
        try:
            # Check if there are any connected clients
            if not self.ws_handler.client_connections:
                logger.debug("No connected clients, skipping message generation")
                return
            
            # Select a random prompt
            prompt = random.choice(self.prompts)
            logger.info(f"Generating autonomous message with prompt: {prompt}")
            
            # Generate message using the agent engine
            batch_input = create_batch_input(
                input_text=prompt,
                images=None,
                from_name=self.default_context.character_config.human_name,
            )
            
            # Process agent output in chunks and send to all connected clients
            await self._process_and_send_agent_output(batch_input)
            
        except Exception as e:
            logger.error(f"Error generating autonomous message: {e}", exc_info=True)
    
    async def _process_and_send_agent_output(self, batch_input):
        """Process agent output streamingly and send chunks to all connected clients"""
        from .conversations.conversation_utils import process_agent_output
        
        # Use default context for generating the response
        context = self.default_context
        
        # Prepare all client connections and contexts
        client_setups = {}
        disconnected_clients = []
        
        for client_uid, websocket in self.ws_handler.client_connections.items():
            try:
                # Get or create context for this client
                if client_uid not in self.ws_handler.client_contexts:
                    client_context = self.default_context
                else:
                    client_context = self.ws_handler.client_contexts[client_uid]
                
                # Create WebSocket send function for this client
                def create_websocket_send(uid: str, ws: WebSocket):
                    async def websocket_send(msg: str):
                        try:
                            await ws.send_text(msg)
                        except Exception as e:
                            logger.warning(f"Error sending to client {uid}: {e}")
                            raise
                    return websocket_send
                
                websocket_send = create_websocket_send(client_uid, websocket)
                
                # Create TTS manager for this client
                from .conversations.tts_manager import TTSTaskManager
                tts_manager = TTSTaskManager()
                
                client_setups[client_uid] = {
                    'context': client_context,
                    'websocket_send': websocket_send,
                    'tts_manager': tts_manager,
                    'websocket': websocket
                }
                
                # Send conversation start signals
                await websocket_send(json.dumps({
                    "type": "control",
                    "text": "conversation-chain-start",
                }))
                await websocket_send(json.dumps({"type": "full-text", "text": "Thinking..."}))
                
            except Exception as e:
                logger.warning(f"Failed to setup client {client_uid}: {e}")
                disconnected_clients.append(client_uid)
        
        if not client_setups:
            logger.warning("No clients available for autonomous message")
            return
        
        # Generate agent output and process streamingly
        agent_output = context.agent_engine.chat(batch_input)
        full_response = ""
        
        try:
            async for output in agent_output:
                # Process output for each client simultaneously
                tasks = []
                for client_uid, setup in client_setups.items():
                    try:
                        task = process_agent_output(
                            output=output,
                            character_config=setup['context'].character_config,
                            live2d_model=setup['context'].live2d_model,
                            tts_engine=setup['context'].tts_engine,
                            websocket_send=setup['websocket_send'],
                            tts_manager=setup['tts_manager'],
                            translate_engine=setup['context'].translate_engine,
                        )
                        tasks.append((client_uid, task))
                    except Exception as e:
                        logger.warning(f"Error processing output for client {client_uid}: {e}")
                        disconnected_clients.append(client_uid)
                
                # Wait for all clients to process this chunk
                for client_uid, task in tasks:
                    try:
                        response_part = await task
                        if client_uid == list(client_setups.keys())[0]:  # Track response from first client
                            full_response += response_part
                    except Exception as e:
                        logger.warning(f"Error waiting for client {client_uid} processing: {e}")
                        disconnected_clients.append(client_uid)
            
            # Wait for all TTS tasks to complete for each client
            for client_uid, setup in client_setups.items():
                try:
                    if setup['tts_manager'].task_list:
                        await asyncio.gather(*setup['tts_manager'].task_list)
                        await setup['websocket_send'](json.dumps({"type": "backend-synth-complete"}))
                    
                    # Send conversation end signal
                    await setup['websocket_send'](json.dumps({
                        "type": "control",
                        "text": "conversation-chain-end",
                    }))
                    
                    logger.info(f"Sent autonomous message with TTS to client {client_uid}: {full_response[:100]}...")
                except Exception as e:
                    logger.warning(f"Error finalizing message for client {client_uid}: {e}")
                    disconnected_clients.append(client_uid)
        
        except Exception as e:
            logger.error(f"Error processing agent output: {e}", exc_info=True)
        
        # Clean up disconnected clients
        for client_uid in disconnected_clients:
            if client_uid in self.ws_handler.client_connections:
                await self.ws_handler.handle_disconnect(client_uid)
    
    
    async def generate_and_send_now(self) -> Optional[str]:
        """Generate and send a message immediately, bypassing the interval"""
        if not self.enabled:
            logger.warning("Autonomous message generator is disabled")
            return None
        
        try:
            await self._generate_and_send_message()
            return "Message generated and sent"
        except Exception as e:
            logger.error(f"Error generating message now: {e}", exc_info=True)
            return None

