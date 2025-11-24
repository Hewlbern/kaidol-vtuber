'use client';

import { useState, useEffect, useCallback } from 'react';
import { useModel } from '../../contexts/ModelContext';
import { useWebSocket } from '../../contexts/WebSocketContext';

interface Character {
  id: string;
  name: string;
  modelName: string;
  modelPath?: string;
}

interface GeneralTabProps {
  onBackgroundChange: (backgroundUrl: string) => void;
  onSubtitleToggle?: (showSubtitles: boolean) => void;
  isConnected: boolean;
  backgroundError: string | null;
  connectionError: string;
  clientId: string;
}

export default function GeneralTab({
  onBackgroundChange,
  onSubtitleToggle,
  isConnected,
  backgroundError,
  connectionError,
  clientId
}: GeneralTabProps) {
  const { handleCharacterChange } = useModel();
  const { isAutoReconnecting, setAutoReconnect } = useWebSocket();
  // State for characters, backgrounds, and selected values
  const [characters, setCharacters] = useState<Character[]>([]);
  const [backgrounds, setBackgrounds] = useState<string[]>([]);
  const [selectedCharacter, setSelectedCharacter] = useState<string>('');
  const [selectedBackground, setSelectedBackground] = useState<string>('');
  const [showSubtitles, setShowSubtitles] = useState<boolean>(true);
  const [customBackgroundUrl, setCustomBackgroundUrl] = useState<string>('');
  const [isPreviewingBackground, setIsPreviewingBackground] = useState<string | null>(null);
  const [initialLoadComplete, setInitialLoadComplete] = useState<boolean>(false);
  
  // Add connection-related state
  const [backendUrl, setBackendUrl] = useState('ws://localhost:12393/client-ws');
  
  // Load characters from API or window.appConfig without triggering a change
  const loadCharactersWithoutChange = useCallback(async () => {
    try {
      let characterList: Character[] = [];
      
      // Try to get characters from window.ConfigManager first
      if (typeof window !== 'undefined' && window.ConfigManager) {
        const chars = window.ConfigManager.getCharacters();
        if (chars && chars.length > 0) {
          characterList = chars.map(char => ({ ...char, modelName: char.id }));
        }
      }
      
      // Try to get from window.appConfig if ConfigManager didn't work
      else if (typeof window !== 'undefined' && window.appConfig?.characters) {
        characterList = window.appConfig.characters.map(char => ({ ...char, modelName: char.id }));
      }
      
      // If still empty, use default characters
      if (characterList.length === 0) {
        console.warn('No character configuration found. Using default characters.');
        characterList = [
          { id: 'shizuku', name: 'Shizuku', modelName: 'shizuku', modelPath: '/model/shizuku/shizuku.model.json' },
          { id: 'vanilla', name: 'Vanilla', modelName: 'vanilla', modelPath: '/model/vanilla/vanilla.model3.json' }
        ];
      }
      
      setCharacters(characterList);
    } catch (error) {
      console.error('Error loading characters:', error);
    }
  }, []);
  
  // Load backgrounds without triggering a change
  const loadBackgroundsWithoutChange = useCallback(async () => {
    try {
      let backgroundList: string[] = [];
      
      // First try to get from the ConfigManager
      if (typeof window !== 'undefined' && window.ConfigManager && typeof window.ConfigManager.getBackgrounds === 'function') {
        backgroundList = window.ConfigManager.getBackgrounds();
      } 
      // Then fall back to the window.appConfig if available
      else if (typeof window !== 'undefined' && window.appConfig && window.appConfig.backgrounds) {
        backgroundList = window.appConfig.backgrounds;
      } 
      // If neither is available, use the static backgrounds in the public directory
      else {
        console.warn('No background configuration found. Using static backgrounds.');
        
        // Use static list of backgrounds we know exist in the public directory
        backgroundList = [
          '/backgrounds/ceiling-window-room-night.jpeg',
          '/backgrounds/classroom-center.jpeg',
          '/backgrounds/computer-room-illustration.jpeg',
          '/backgrounds/cityscape.jpeg',
          '/backgrounds/night-scene-cartoon-moon.jpeg',
          '/backgrounds/mountain-range-illustration.jpeg',
          '/backgrounds/fluorescent_green.webp',
          '/backgrounds/base-2-image.png',
          '/backgrounds/base-image.png',

        ];
      }
      
      setBackgrounds(backgroundList);
    } catch (error) {
      console.error('Error loading backgrounds:', error);
    }
  }, []);
  
  // Load both characters and backgrounds without triggering changes
  const loadCharactersAndBackgrounds = useCallback(async () => {
    await Promise.all([
      loadCharactersWithoutChange(),
      loadBackgroundsWithoutChange()
    ]);
  }, [loadCharactersWithoutChange, loadBackgroundsWithoutChange]);
  
  // Load characters and backgrounds on component mount, but don't trigger changes
  useEffect(() => {
    // Only perform the initial load once
    if (!initialLoadComplete) {
      loadCharactersAndBackgrounds();
      setInitialLoadComplete(true);
    }
  }, [initialLoadComplete, loadCharactersAndBackgrounds]);
  
  // Load saved settings from localStorage on mount
  useEffect(() => {
    const savedUrl = localStorage.getItem('backendUrl');
    const savedAutoReconnect = localStorage.getItem('autoReconnect');
    if (savedUrl) {
      setBackendUrl(savedUrl);
    }
    if (savedAutoReconnect !== null) {
      setAutoReconnect(savedAutoReconnect === 'true');
    }
  }, [setAutoReconnect]);
  
  // Load backgrounds and potentially trigger a change event (used by refresh button)
  const loadBackgrounds = async () => {
    await loadBackgroundsWithoutChange();
  };
  
  // Format background name for display
  const formatBackgroundName = (path: string): string => {
    if (!path) return 'None';
    
    // Extract the filename from the path
    const filename = path.split('/').pop() || path;
    
    // Remove file extension and convert hyphens to spaces
    const nameWithoutExtension = filename.replace(/\.(jpeg|jpg|png)$/, '');
    
    // Convert hyphens to spaces and capitalize words
    return nameWithoutExtension
      .replace(/-/g, ' ')
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };
  
  // Handle character selection - only triggered by explicit user selection
  const handleCharacterSelect = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const characterId = event.target.value;
    setSelectedCharacter(characterId);
    
    const character = characters.find(char => char.id === characterId);
    if (character) {
      let modelPath = character.modelPath;
      
      if (!modelPath) {
        if (character.modelName.includes('.model')) {
          modelPath = `/model/${character.id}/${character.modelName}`;
        } else {
          modelPath = `/model/${character.id}/${character.modelName}.model.json`;
        }
      }
      
      handleCharacterChange(characterId, modelPath);
    }
  };
  
  // Handle background selection
  const handleBackgroundChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const backgroundUrl = event.target.value;
    setSelectedBackground(backgroundUrl);
    onBackgroundChange(backgroundUrl);
  };
  
  // Handle custom background URL
  const handleCustomBackgroundSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (customBackgroundUrl.trim()) {
      onBackgroundChange(customBackgroundUrl);
      setSelectedBackground('custom');
    }
  };
  
  // Handle subtitle toggle
  const handleSubtitleToggle = (event: React.ChangeEvent<HTMLInputElement>) => {
    const checked = event.target.checked;
    setShowSubtitles(checked);
    if (onSubtitleToggle) {
      onSubtitleToggle(checked);
    }
  };
  
  // Show background preview
  const handleShowPreview = (backgroundUrl: string) => {
    setIsPreviewingBackground(backgroundUrl);
  };
  
  // Hide background preview
  const handleHidePreview = () => {
    setIsPreviewingBackground(null);
  };

  // Add this function back
  const loadCharacters = async () => {
    try {
      await loadCharactersWithoutChange();
      
      // If we have a selected character, reapply it
      if (selectedCharacter) {
        const character = characters.find(char => char.id === selectedCharacter);
        if (character) {
          const modelPath = character.modelPath || `/model/${character.id}/${character.modelName}.model.json`;
          handleCharacterChange(selectedCharacter, modelPath);
        }
      }
    } catch (error) {
      console.error('Error refreshing characters:', error);
    }
  };
  
  const handleReconnect = () => {
    // Save settings to localStorage
    localStorage.setItem('backendUrl', backendUrl);
    localStorage.setItem('autoReconnect', isAutoReconnecting.toString());
    
    // Dispatch a custom event to trigger reconnection with the new URL
    window.dispatchEvent(new CustomEvent('reconnect-websocket', {
      detail: { 
        url: backendUrl
      }
    }));
  };

  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setBackendUrl(e.target.value);
  };

  const handleAutoReconnectToggle = (e: React.ChangeEvent<HTMLInputElement>) => {
    setAutoReconnect(e.target.checked);
  };

  return (
    <div className="space-y-6">
      <div className="p-6 bg-[#2d2e47]/80 rounded-lg border border-[#6366f1]/20 shadow-[0_0_20px_rgba(99,102,241,0.1)]">
        <h3 className="text-lg font-bold text-white mb-4">Character & Background</h3>

        {/* Character Selection */}
        <div className="space-y-3">
          <label htmlFor="character-select" className="block text-sm font-medium text-[#8b5cf6]">
            Character
          </label>
          <div className="flex items-center gap-2">
            <select
              id="character-select"
              className="block w-full p-3 bg-[#1a1b2e]/80 text-white rounded-lg border-2 border-[#6366f1]/40 focus:border-[#8b5cf6] focus:ring-2 focus:ring-[#8b5cf6] shadow-[0_0_15px_rgba(99,102,241,0.2)]"
              value={selectedCharacter}
              onChange={handleCharacterSelect}
              disabled={!isConnected}
            >
              {characters.length === 0 && (
                <option value="">No characters available</option>
              )}
              {characters.map((character) => (
                <option key={character.id} value={character.id}>
                  {character.name}
                </option>
              ))}
            </select>
            <button
              className="p-3 bg-[#1a1b2e] text-[#8b5cf6] rounded-lg transition-all duration-200 border border-[#6366f1]/20 hover:bg-[#2d2e47] hover:text-[#ec4899] shadow-[0_0_15px_rgba(99,102,241,0.1)]"
              onClick={loadCharacters}
              title="Refresh character list"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
          {!isConnected && (
            <p className="text-xs text-[#f87171] flex items-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 inline mr-1" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              Connect to the server to select a character
            </p>
          )}
        </div>
      </div>

      {/* Background Selection */}
      <div className="p-6 bg-[#2d2e47]/80 rounded-lg border border-[#6366f1]/20 shadow-[0_0_20px_rgba(99,102,241,0.1)]">
        <h3 className="text-lg font-bold text-white mb-4">Background</h3>
        <div className="space-y-3">
          <label htmlFor="background-select" className="block text-sm font-medium text-[#8b5cf6]">
            Select Background
          </label>
          <div className="flex items-center gap-2">
            <select
              id="background-select"
              className="block w-full p-3 bg-[#1a1b2e]/80 text-white rounded-lg border-2 border-[#6366f1]/40 focus:border-[#8b5cf6] focus:ring-2 focus:ring-[#8b5cf6] shadow-[0_0_15px_rgba(99,102,241,0.2)]"
              value={selectedBackground}
              onChange={handleBackgroundChange}
            >
              <option value="">No background</option>
              {backgrounds.map((background) => (
                <option key={background} value={background}>
                  {formatBackgroundName(background)}
                </option>
              ))}
              {customBackgroundUrl && (
                <option value="custom">Custom URL</option>
              )}
            </select>
            <button
              className="p-3 bg-[#1a1b2e] text-[#8b5cf6] rounded-lg transition-all duration-200 border border-[#6366f1]/20 hover:bg-[#2d2e47] hover:text-[#ec4899] shadow-[0_0_15px_rgba(99,102,241,0.1)]"
              onClick={loadBackgrounds}
              title="Refresh background list"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
        </div>

        {/* Preview buttons for backgrounds */}
        {backgrounds.length > 0 && (
          <div className="grid grid-cols-3 gap-2 mt-4">
            {backgrounds.slice(0, 6).map((background) => (
              <button
                key={background}
                className="relative h-12 w-full overflow-hidden rounded-lg border border-[#6366f1]/20 hover:border-[#8b5cf6] transition-all duration-200 shadow-[0_0_10px_rgba(99,102,241,0.1)] hover:shadow-[0_0_15px_rgba(139,92,246,0.2)]"
                onClick={() => handleBackgroundChange({ target: { value: background } } as React.ChangeEvent<HTMLSelectElement>)}
                onMouseEnter={() => handleShowPreview(background)}
                onMouseLeave={handleHidePreview}
              >
                <img
                  src={background}
                  alt={formatBackgroundName(background)}
                  className="w-full h-full object-cover"
                />
              </button>
            ))}
          </div>
        )}

        {/* Background preview modal */}
        {isPreviewingBackground && (
          <div className="absolute z-50 left-1/2 -translate-x-1/2 mt-2">
            <div className="bg-[#1a1b2e]/95 border border-[#6366f1]/20 rounded-lg shadow-[0_0_30px_rgba(99,102,241,0.2)] p-3">
              <img
                src={isPreviewingBackground}
                alt="Background preview"
                className="h-32 w-auto object-cover rounded-lg"
              />
              <p className="text-xs text-center mt-2 text-[#a5b4fc]">
                {formatBackgroundName(isPreviewingBackground)}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Custom Background URL input */}
      <div className="p-6 bg-[#2d2e47]/80 rounded-lg border border-[#6366f1]/20 shadow-[0_0_20px_rgba(99,102,241,0.1)]">
        <h3 className="text-lg font-bold text-white mb-4">Custom Background</h3>
        <div className="space-y-3">
          <label htmlFor="custom-background" className="block text-sm font-medium text-[#8b5cf6]">
            Custom Background URL
          </label>
          <form onSubmit={handleCustomBackgroundSubmit} className="flex items-center gap-2">
            <input
              type="text"
              id="custom-background"
              value={customBackgroundUrl}
              onChange={(e) => setCustomBackgroundUrl(e.target.value)}
              placeholder="https://example.com/image.jpg"
              className="w-full p-3 bg-[#1a1b2e]/80 text-white rounded-lg border-2 border-[#6366f1]/40 focus:border-[#8b5cf6] focus:ring-2 focus:ring-[#8b5cf6] shadow-[0_0_15px_rgba(99,102,241,0.2)] placeholder-[#6366f1]/40"
            />
            <button
              type="submit"
              className="p-3 bg-gradient-to-r from-[#8b5cf6] to-[#6366f1] text-white rounded-lg font-medium hover:from-[#ec4899] hover:to-[#8b5cf6] transition-all duration-200 shadow-[0_0_15px_rgba(139,92,246,0.3)] transform hover:-translate-y-1"
              title="Apply custom background"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
            </button>
          </form>
        </div>
      </div>

      {/* Show Subtitle Toggle */}
      <div className="p-6 bg-[#2d2e47]/80 rounded-lg border border-[#6366f1]/20 shadow-[0_0_20px_rgba(99,102,241,0.1)]">
        <div className="flex items-center justify-between">
          <label htmlFor="show-subtitles" className="flex-1 cursor-pointer">
            <span className="block text-sm font-medium text-[#8b5cf6]">
              Show Subtitles
            </span>
            <span className="text-xs text-[#a5b4fc] mt-1 block">
              Display AI responses as subtitles
            </span>
          </label>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              id="show-subtitles"
              checked={showSubtitles}
              onChange={handleSubtitleToggle}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-[#1a1b2e] rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-gradient-to-r peer-checked:from-[#8b5cf6] peer-checked:to-[#6366f1] shadow-[0_0_10px_rgba(99,102,241,0.2)]"></div>
          </label>
        </div>
      </div>

      
      {backgroundError && (
        <div className="p-4 bg-[#f87171]/10 border border-[#f87171]/20 rounded-lg shadow-[0_0_20px_rgba(248,113,113,0.1)]">
          <div className="flex items-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-[#f87171] mr-2" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            <p className="text-sm font-medium text-[#f87171]">{backgroundError}</p>
          </div>
        </div>
      )}

      {/* Connection Settings */}
      <div className="p-6 bg-[#2d2e47]/80 rounded-lg border border-[#6366f1]/20 shadow-[0_0_20px_rgba(99,102,241,0.1)]">
        <h3 className="text-lg font-bold text-white mb-4">Connection Status</h3>

        <div className="mb-4">
          <label className="block text-sm font-bold text-[#8b5cf6] uppercase mb-2">Backend URL</label>
          <div className="flex">
            <input
              type="text"
              value={backendUrl}
              onChange={handleUrlChange}
              placeholder="ws://localhost:12393/client-ws"
              className="w-full p-3 bg-[#1a1b2e]/80 text-white rounded-lg border-2 border-[#6366f1]/40 focus:border-[#8b5cf6] focus:ring-2 focus:ring-[#8b5cf6] shadow-[0_0_15px_rgba(99,102,241,0.2)]"
            />
          </div>
          <p className="mt-2 text-sm text-[#a5b4fc]">
            Enter the WebSocket URL of your backend server
          </p>
        </div>

        <div className="mb-4">
          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={isAutoReconnecting}
              onChange={handleAutoReconnectToggle}
              className="form-checkbox h-5 w-5 text-[#8b5cf6] rounded border-[#6366f1]/40 focus:ring-[#8b5cf6]"
            />
            <span className="text-sm font-medium text-[#8b5cf6]">Enable Auto-Reconnect</span>
          </label>
          <p className="mt-1 text-sm text-[#a5b4fc]">
            Automatically attempt to reconnect when connection is lost
          </p>
        </div>

        <div className="mb-4">
          <label className="block text-sm font-bold text-[#8b5cf6] uppercase mb-2">Client ID</label>
          <div className="flex">
            <input
              type="text"
              readOnly
              value={clientId}
              className="w-full p-3 bg-[#1a1b2e]/80 text-white rounded-lg border-2 border-[#6366f1]/40 focus:border-[#8b5cf6] focus:ring-2 focus:ring-[#8b5cf6] shadow-[0_0_15px_rgba(99,102,241,0.2)]"
            />
            <button 
              onClick={() => navigator.clipboard.writeText(clientId)}
              className="ml-2 px-4 py-2 bg-gradient-to-r from-[#8b5cf6] to-[#6366f1] text-white rounded-lg font-medium hover:from-[#ec4899] hover:to-[#8b5cf6] transition-all duration-200 shadow-[0_0_15px_rgba(139,92,246,0.3)] transform hover:-translate-y-1"
            >
              Copy
            </button>
          </div>
        </div>

        <div className="mt-6">
          <button 
            onClick={handleReconnect}
            className="w-full px-4 py-3 bg-gradient-to-r from-[#8b5cf6] to-[#6366f1] text-white rounded-lg font-medium hover:from-[#ec4899] hover:to-[#8b5cf6] transition-all duration-200 shadow-[0_0_15px_rgba(139,92,246,0.3)] transform hover:-translate-y-1 uppercase"
          >
            Reconnect
          </button>
        </div>
      </div>

      <div className="p-6 bg-[#2d2e47]/80 rounded-lg border border-[#6366f1]/20 shadow-[0_0_20px_rgba(99,102,241,0.1)]">
        <h3 className="text-lg font-bold text-white mb-4">Connection Details</h3>
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium text-[#8b5cf6]">Status:</span>
            <span className={`text-sm font-medium ${isConnected ? 'text-[#4ade80]' : 'text-[#f87171]'}`}>
              {isConnected ? 'Connected' : 'Disconnected'}
            </span>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-sm font-medium text-[#8b5cf6]">Client ID:</span>
            <span className="text-sm font-mono text-white">{clientId || 'Not assigned'}</span>
          </div>

          {connectionError && (
            <div className="mt-4 p-3 bg-[#f87171]/10 border border-[#f87171]/20 rounded-lg">
              <div className="flex items-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-[#f87171] mr-2" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                <span className="text-sm font-medium text-[#f87171]">Error: {connectionError}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="p-6 bg-[#2d2e47]/80 rounded-lg border border-[#6366f1]/20 shadow-[0_0_20px_rgba(99,102,241,0.1)]">
        <h3 className="text-lg font-bold text-white mb-4">Server Information</h3>
        <p className="text-sm text-[#a5b4fc]">
          Connected to Open LLM VTuber server. This server handles character configuration, 
          text-to-speech processing, and AI responses.
        </p>
      </div>
    </div>
  );
} 