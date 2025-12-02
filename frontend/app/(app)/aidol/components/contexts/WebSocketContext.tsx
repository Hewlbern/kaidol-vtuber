'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';

// Define proper types for WebSocket messages
interface WebSocketMessage {
  type: string;
  text?: string;
  audio?: ArrayBuffer | string;
  config_id?: string;
  file?: string;
  history_uid?: string;
  invitee_uid?: string;
  target_uid?: string;
  display_text?: string | { text: string; name?: string; avatar?: string };
  volumes?: number[];
  slice_length?: number;
  actions?: Record<string, unknown>;
  forwarded?: boolean;
  [key: string]: unknown;
}

// Define a type for audio data
interface AudioData {
  data: ArrayBuffer | string;
  timestamp?: number;
  format?: string;
  duration?: number;
}

interface WebSocketContextType {
  isConnected: boolean;
  clientId: string;
  sendMessage: (message: WebSocketMessage) => void;
  audioQueue: AudioData[];
  addToAudioQueue: (audioData: AudioData) => void;
  clearAudioQueue: () => void;
  connectionError: string | null;
  isAutoReconnecting: boolean;
  setAutoReconnect: (enabled: boolean) => void;
}

const WebSocketContext = createContext<WebSocketContextType | undefined>(undefined);

interface WebSocketProviderProps {
  children: ReactNode | ((context: WebSocketContextType) => ReactNode);
}

export const WebSocketProvider = ({ children }: WebSocketProviderProps) => {
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [clientId, setClientId] = useState('');
  const [audioQueue, setAudioQueue] = useState<AudioData[]>([]);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const [maxReconnectAttempts] = useState(5);
  const [isAutoReconnecting, setIsAutoReconnecting] = useState(true);
  const [lastConnectionAttempt, setLastConnectionAttempt] = useState<Date | null>(null);
  const [messageQueue, setMessageQueue] = useState<WebSocketMessage[]>([]);
  const [customWsUrl, setCustomWsUrl] = useState<string | null>(null);
  const [reconnectTimer, setReconnectTimer] = useState<NodeJS.Timeout | null>(null);

  // Listen for custom reconnect events
  useEffect(() => {
    const handleReconnect = (event: Event) => {
      const customEvent = event as CustomEvent<{url?: string}>;
      const url = customEvent.detail?.url;
      
      if (url) {
        console.log(`Received reconnect event with URL: ${url}`);
        setCustomWsUrl(url);
        
        // Close existing connection if any
        if (socket) {
          console.log('Closing existing WebSocket connection');
          socket.close();
        }
        
        // Clear any existing reconnect timer
        if (reconnectTimer) {
          clearTimeout(reconnectTimer);
          setReconnectTimer(null);
        }
        
        // Reset reconnect attempts when manually connecting to a specific URL
        setReconnectAttempts(0);
      }
    };

    window.addEventListener('reconnect-websocket', handleReconnect);
    
    return () => {
      window.removeEventListener('reconnect-websocket', handleReconnect);
    };
  }, [socket, reconnectTimer]);

  // Function to schedule a reconnection attempt
  const scheduleReconnect = () => {
    if (!isAutoReconnecting || reconnectAttempts >= maxReconnectAttempts) {
      console.log('Auto-reconnection disabled or max attempts reached');
      return;
    }

    const baseDelay = 1000; // 1 second
    const maxDelay = 30000; // 30 seconds
    const delay = Math.min(baseDelay * Math.pow(2, reconnectAttempts), maxDelay);
    
    console.log(`Scheduling reconnect attempt ${reconnectAttempts + 1}/${maxReconnectAttempts} in ${delay}ms`);
    
    const timer = setTimeout(() => {
      setReconnectAttempts(prev => prev + 1);
    }, delay);
    
    setReconnectTimer(timer);
  };

  // Initialize WebSocket connection
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    // Clear any existing reconnect timer
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      setReconnectTimer(null);
    }

    const connectWebSocket = () => {
      try {
        // Use production URL in production, localhost in development
        const defaultWsUrl = process.env.NODE_ENV === 'production' 
          ? 'wss://securita.hiero.gl/client-ws' 
          : 'ws://localhost:12393/client-ws';
        const wsUrl = customWsUrl || defaultWsUrl;
        const now = new Date();
        
        // Log connection attempt
        console.log('WebSocket connection attempt:', {
          url: wsUrl,
          attempt: reconnectAttempts + 1,
          maxAttempts: maxReconnectAttempts,
          autoReconnect: isAutoReconnecting,
          lastAttempt: lastConnectionAttempt,
          timeSinceLastAttempt: lastConnectionAttempt ? now.getTime() - lastConnectionAttempt.getTime() : 'N/A'
        });
        
        setLastConnectionAttempt(now);
        
        // Set a timeout to detect connection failures
        const connectionTimeout = setTimeout(() => {
          console.error('WebSocket connection timeout:', {
            url: wsUrl,
            attempt: reconnectAttempts + 1,
            maxAttempts: maxReconnectAttempts,
            autoReconnect: isAutoReconnecting,
            readyState: socket?.readyState,
            timestamp: new Date().toISOString()
          });
          
          let errorMessage = `Connection to ${wsUrl} timed out. `;
          if (reconnectAttempts >= maxReconnectAttempts) {
            errorMessage += 'Max reconnection attempts reached. Please check server status and try reconnecting manually.';
          } else if (!isAutoReconnecting) {
            errorMessage += 'Auto-reconnection is disabled. Please try reconnecting manually.';
          } else {
            errorMessage += 'Attempting to reconnect automatically...';
          }
          
          setConnectionError(errorMessage);
          scheduleReconnect();
        }, 5000);
        
        const newSocket = new WebSocket(wsUrl);
        
        newSocket.onopen = () => {
          console.log('WebSocket connection established:', {
            url: wsUrl,
            attempt: reconnectAttempts + 1,
            timeToConnect: lastConnectionAttempt ? new Date().getTime() - lastConnectionAttempt.getTime() : 'N/A'
          });
          
          clearTimeout(connectionTimeout);
          setIsConnected(true);
          setConnectionError(null);
          setReconnectAttempts(0);
          
          // Process any queued messages
          if (messageQueue.length > 0) {
            console.log(`Processing ${messageQueue.length} queued messages`);
            messageQueue.forEach(message => {
              newSocket.send(JSON.stringify(message));
            });
            setMessageQueue([]);
          }
        };
        
        newSocket.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            
            // Handle client ID assignment
            if (data.client_uid) {
              setClientId(data.client_uid);
            }
            
            // Handle autonomous chat messages
            if (data.type === 'autonomous-chat') {
              const text = data.text;
              if (text) {
                console.log('[WebSocket] Received autonomous chat message:', {
                  type: data.type,
                  text: text,
                  timestamp: data.timestamp,
                  source: data.source
                });
                // Dispatch custom event for autonomous chat messages
                window.dispatchEvent(new CustomEvent('autonomous-chat', { 
                  detail: {
                    text,
                    type: data.type,
                    timestamp: data.timestamp,
                    source: data.source || 'autonomous'
                  }
                }));
                // Also dispatch as text-response for UI compatibility
                window.dispatchEvent(new CustomEvent('text-response', { 
                  detail: {
                    text,
                    type: data.type
                  }
                }));
              }
            }
            
            // Handle text messages
            if (data.type === 'full-text' || data.type === 'partial-text' || data.type === 'text' || data.type === 'user-input-transcription') {
              const text = data.text || (data.display_text && typeof data.display_text === 'object' ? data.display_text.text : data.display_text);
              if (text) {
                console.log('[WebSocket] Received text message:', {
                  type: data.type,
                  text: text
                });
                // Dispatch custom event for text responses
                window.dispatchEvent(new CustomEvent('text-response', { 
                  detail: {
                    text,
                    type: data.type
                  }
                }));
              }
            }
            
            // Handle audio data
            if (data.type === 'audio') {
              // Handle audio data if present
              if (data.audio) {
                console.log('[WebSocket] Received audio data:', {
                  data
                });

                // Ensure audio data is properly formatted
                let processedAudioData: ArrayBuffer | string;
                if (data.audio instanceof ArrayBuffer) {
                  processedAudioData = data.audio;
                } else if (typeof data.audio === 'string') {
                  processedAudioData = data.audio;
                } else {
                  console.error('[WebSocket] Invalid audio data format:', typeof data.audio);
                  return;
                }

                const audioData = {
                  data: processedAudioData,
                  format: data.format || 'mp3',
                  timestamp: data.timestamp,
                  duration: data.duration,
                  volumes: data.volumes,
                  slice_length: data.slice_length,
                  display_text: data.display_text,
                  actions: data.actions
                };
                
                // Dispatch the complete audio event with all data
                window.dispatchEvent(new CustomEvent('audio', { 
                  detail: audioData
                }));
                
                // Also add to queue for backup
                setAudioQueue(prev => [...prev, audioData]);
              }
              
              // Handle display text if present
              if (data.display_text) {
                const text = typeof data.display_text === 'object' ? data.display_text.text : data.display_text;
                if (text) {
                  console.log('[WebSocket] Audio display text:', text);
                }
              }
            }
          } catch (error) {
            console.error('Error parsing WebSocket message:', error);
          }
        };
        
        newSocket.onerror = (error) => {
          // Extract more meaningful error information
          let errorMessage = 'Connection error.';
          let errorDetails = {};
          
          if (error instanceof ErrorEvent) {
            errorMessage += ` ${error.message}`;
            errorDetails = {
              message: error.message,
              type: 'ErrorEvent',
              filename: error.filename,
              lineno: error.lineno,
              colno: error.colno
            };
          } else if (error instanceof Event) {
            errorMessage += ` Event type: ${error.type}`;
            errorDetails = {
              type: error.type,
              eventType: 'Event'
            };
          }
          
          // Check if the error is due to the server being unreachable
          if (!isConnected) {
            errorMessage = `Cannot connect to server at ${wsUrl}. Please check if the server is running and try reconnecting with a different URL if needed.`;
          }
          
          console.error('WebSocket error:', {
            message: errorMessage,
            error: errorDetails,
            url: wsUrl,
            readyState: socket?.readyState,
            timestamp: new Date().toISOString(),
            attempt: reconnectAttempts + 1,
            maxAttempts: maxReconnectAttempts,
            autoReconnect: isAutoReconnecting
          });
          
          setConnectionError(errorMessage);
          
          // Close the socket if it's in a broken state
          if (socket?.readyState === WebSocket.CONNECTING) {
            console.log('Closing socket in CONNECTING state due to error');
            socket.close();
          }
        };
        
        newSocket.onclose = (event) => {
          console.log('WebSocket connection closed', {
            code: event.code,
            reason: event.reason,
            wasClean: event.wasClean,
            url: wsUrl
          });
          
          setIsConnected(false);
          setSocket(null);
          
          let closeMessage = 'Connection closed.';
          switch (event.code) {
            case 1000:
              closeMessage = 'Normal closure, connection ended normally.';
              break;
            case 1001:
              closeMessage = 'Server is going away or page is being unloaded.';
              break;
            case 1002:
              closeMessage = 'Protocol error.';
              break;
            case 1003:
              closeMessage = 'Received data in unsupported format.';
              break;
            case 1005:
              closeMessage = 'Connection closed unexpectedly.';
              break;
            case 1006:
              closeMessage = 'Connection lost. Server might be down.';
              break;
            default:
              closeMessage = `Connection closed with code ${event.code}${event.reason ? `: ${event.reason}` : ''}`;
          }
          
          setConnectionError(closeMessage);
          
          // Only attempt to reconnect if not manually closed
          if (!event.wasClean) {
            const delay = Math.min(1000 * (1 + reconnectAttempts * 0.5), 5000);
            console.log(`Connection was not clean, attempting to reconnect in ${delay}ms...`);
            
            const timer = setTimeout(() => {
              setReconnectAttempts(prev => prev + 1);
            }, delay);
            
            setReconnectTimer(timer);
          }
        };
        
        setSocket(newSocket);
      } catch (error) {
        console.error('Error setting up WebSocket:', error);
        setConnectionError(`Failed to connect: ${error instanceof Error ? error.message : String(error)}`);
        
        // Attempt to reconnect
        const delay = Math.min(1000 * (1 + reconnectAttempts * 0.5), 5000);
        const timer = setTimeout(() => {
          setReconnectAttempts(prev => prev + 1);
        }, delay);
        
        setReconnectTimer(timer);
      }
    };
    
    connectWebSocket();
    
    // Cleanup function
    return () => {
      if (socket) {
        socket.close();
      }
      
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }
    };
  }, [customWsUrl, reconnectAttempts, isAutoReconnecting, maxReconnectAttempts]);

  // Function to send messages
  const sendMessage = useCallback((message: WebSocketMessage) => {
    if (socket && socket.readyState === WebSocket.OPEN) {
      console.log('Sending message:', message);
      socket.send(JSON.stringify(message));
    } else {
      console.log('Queueing message due to disconnected socket:', message);
      setMessageQueue(prev => [...prev, message]);
    }
  }, [socket]);

  // Function to add to audio queue
  const addToAudioQueue = useCallback((audioData: AudioData) => {
    setAudioQueue(prev => [...prev, audioData]);
  }, []);

  // Function to clear audio queue
  const clearAudioQueue = useCallback(() => {
    setAudioQueue([]);
  }, []);

  // Create context value
  const contextValue: WebSocketContextType = {
    isConnected,
    clientId,
    sendMessage,
    audioQueue,
    addToAudioQueue,
    clearAudioQueue,
    connectionError,
    isAutoReconnecting,
    setAutoReconnect: setIsAutoReconnecting
  };

  // Support both render props and regular children
  return (
    <WebSocketContext.Provider value={contextValue}>
      {typeof children === 'function' ? children(contextValue) : children}
    </WebSocketContext.Provider>
  );
};

export const useWebSocket = () => {
  const context = useContext(WebSocketContext);
  if (context === undefined) {
    throw new Error('useWebSocket must be used within a WebSocketProvider');
  }
  return context;
}; 