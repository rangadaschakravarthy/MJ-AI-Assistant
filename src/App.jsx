import React, { useState, useEffect, useRef } from 'react';
import Navigation from './components/Navigation';
import MjOrb from './components/MjOrb';
import VoiceVisualizer from './components/VoiceVisualizer';
import ChatStream from './components/ChatStream';
import ConfirmationModal from './components/ConfirmationModal';
import ScreenShareModal from './components/ScreenShareModal';
import CodingWorkspace from './components/CodingWorkspace';
import DsaCoachView from './components/DsaCoachView';
import MemoryInspector from './components/MemoryInspector';
import PermissionManager from './components/PermissionManager';
import AuditLogView from './components/AuditLogView';
import { AudioService } from './services/audioService';

const WAKE_WORDS = ['hi mj', 'hello mj', 'hey mj', 'okay mj', 'ok mj', 'mj'];
const SLEEP_WORDS = ['thanks mj', 'thank you mj', 'bye mj', 'goodbye mj', 'sleep mj', 'activate sleep mode', 'go to sleep', 'sleep mode', 'deactivate mj'];

export default function App() {
  const [activeTab, setActiveTab] = useState('assistant');
  const [privacyMode, setPrivacyMode] = useState(false);
  const [micEnabled, setMicEnabled] = useState(false);
  const [isSleepMode, setIsSleepMode] = useState(false);
  const [assistantState, setAssistantState] = useState('IDLE');
  const [audioLevel, setAudioLevel] = useState(0);
  const [micError, setMicError] = useState('');
  const [isScreenShareOpen, setIsScreenShareOpen] = useState(false);

  const [messages, setMessages] = useState([
    {
      sender: 'mj',
      text: "Hey! I'm MJ. Click the mic button once to activate 24/7 hands-free listening! Say 'Hey MJ' to wake me up or 'Thanks MJ' to activate sleep mode.",
      timestamp: new Date().toLocaleTimeString(),
      toolExecutions: []
    }
  ]);

  const [confirmationRequest, setConfirmationRequest] = useState(null);
  const [memories, setMemories] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);

  const wsRef = useRef(null);
  const audioServiceRef = useRef(null);
  const synthRef = useRef(window.speechSynthesis);
  const lastMjResponseRef = useRef(''); // Cache last MJ spoken response to prevent self-hearing echo

  // Initialize WebSockets connection to Express Backend
  useEffect(() => {
    const wsUrl = `ws://${window.location.hostname}:3001`;
    console.log('[MJ] Connecting to WebSocket backend:', wsUrl);
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('[MJ] Connected to MJ Backend Service');
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        handleServerMessage(data);
      } catch (err) {
        console.error('[MJ] Error parsing WS message:', err);
      }
    };

    ws.onclose = () => {
      console.log('[MJ] WebSocket connection closed.');
    };

    return () => {
      ws.close();
    };
  }, []);

  // Initialize AudioService
  useEffect(() => {
    audioServiceRef.current = new AudioService(
      (speechText) => {
        handleSpeechInput(speechText);
      },
      (level) => {
        setAudioLevel(level);
      },
      (errMessage) => {
        setMicError(errMessage);
        // DO NOT set micEnabled(false) on transient errors! Keep mic active!
      },
      (state) => {
        setAssistantState(state);
      }
    );

    return () => {
      if (audioServiceRef.current) {
        audioServiceRef.current.stopMicrophone();
      }
    };
  }, []);

  // Speech input processor with Self-Hearing Filter, Wake-Word, and Sleep-Word support
  const handleSpeechInput = (speechText) => {
    if (synthRef.current && synthRef.current.speaking) {
      console.log('[MJ Speech Engine] Suppressed speech input while TTS speaking');
      return;
    }

    const cleanLower = (speechText || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
    const lastMjLower = (lastMjResponseRef.current || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();

    // SELF-HEARING ECHO FILTER: Discard input if speech matches MJ's own recent response output!
    if (lastMjLower && (cleanLower.includes(lastMjLower) || lastMjLower.includes(cleanLower))) {
      console.log('[MJ Speech Engine] Filtered out self-hearing echo match:', cleanLower);
      return;
    }

    console.log(`[MJ Speech Engine] Input: "${speechText}" -> Clean: "${cleanLower}" (SleepMode: ${isSleepMode})`);

    // Check Interrupt Keywords
    if (cleanLower === 'wait' || cleanLower === 'stop') {
      stopSpeaking();
      return;
    }

    // Check Sleep-Word Activation ("Thanks MJ", "Thank you MJ", "Bye MJ", "Go to sleep")
    const isSleepWordSpoken = SLEEP_WORDS.some(sw => cleanLower.includes(sw));
    if (isSleepWordSpoken) {
      setIsSleepMode(true);
      setAssistantState('IDLE');
      const sleepResponse = "You're welcome! Going to sleep mode. Say 'Hey MJ' whenever you need me!";
      speak(sleepResponse);
      return;
    }

    // Check Wake-Word Activation ("Hey MJ", "Hi MJ", "Hello MJ", "MJ")
    const isWakeWordSpoken = WAKE_WORDS.some(ww => cleanLower.includes(ww));
    if (isWakeWordSpoken || isSleepMode) {
      if (isWakeWordSpoken) {
        setIsSleepMode(false);
        let cleanCommand = cleanLower;
        WAKE_WORDS.forEach(ww => {
          cleanCommand = cleanCommand.replace(new RegExp(`^${ww}\\s*`, 'i'), '').trim();
        });

        if (cleanCommand.length > 2) {
          handleSendMessage(cleanCommand);
        } else {
          speak("I'm awake and listening! How can I help?");
        }
        return;
      } else if (isSleepMode) {
        console.log('[MJ Sleep Mode] Ignoring speech input until wake-word is spoken.');
        return;
      }
    }

    // Active Mode: Process Command Directly!
    setIsSleepMode(false);
    handleSendMessage(speechText);
  };

  // Toggle Microphone State with explicit User Gesture
  const handleToggleMic = async () => {
    if (privacyMode) return;

    if (micEnabled) {
      setMicEnabled(false);
      if (audioServiceRef.current) {
        audioServiceRef.current.stopMicrophone();
      }
    } else {
      setMicError('');
      if (audioServiceRef.current) {
        const success = await audioServiceRef.current.startMicrophone();
        if (success) {
          setMicEnabled(true);
          setIsSleepMode(false);
        }
      }
    }
  };

  // Handle incoming backend WS messages
  const handleServerMessage = (data) => {
    switch (data.type) {
      case 'RESPONSE':
        setAssistantState('SPEAKING');
        const newMessage = {
          sender: 'mj',
          text: data.text,
          timestamp: new Date().toLocaleTimeString(),
          toolExecutions: data.toolExecutions || []
        };
        setMessages(prev => [...prev, newMessage]);

        // Cache response text to filter out self-hearing echo
        lastMjResponseRef.current = data.text;

        // Trigger TTS voice output
        speak(data.text);
        break;

      case 'CONFIRMATION_REQUIRED':
        setAssistantState('WAITING_FOR_CONFIRMATION');
        setConfirmationRequest(data.request);
        break;

      case 'STATE_CHANGE':
        setAssistantState(data.state);
        break;

      case 'AUDIT_LOG':
        setAuditLogs(prev => [data.log, ...prev]);
        break;

      case 'MEMORY_UPDATE':
        setMemories(data.memories);
        break;

      case 'PERMISSIONS_UPDATE':
        setPermissions(data.permissions);
        break;

      default:
        break;
    }
  };

  // Speak text using Web Speech Synthesis with EMOJI STRIPPING & 3.0s COOLDOWN
  const speak = (text) => {
    if (!synthRef.current || privacyMode) return;
    synthRef.current.cancel();

    if (audioServiceRef.current) {
      audioServiceRef.current.pauseListening();
    }

    const cleanSpeechText = (text || '')
      .replace(/([\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF])/g, '') // Emojis
      .replace(/[\*\_\#\~\`\`\`\>\-\+\=]+/g, '') // Markdown symbols
      .replace(/\s+/g, ' ')
      .trim();

    if (!cleanSpeechText) return;

    const utterance = new SpeechSynthesisUtterance(cleanSpeechText);
    utterance.rate = 1.0;
    utterance.pitch = 1.25;

    const voices = synthRef.current.getVoices();

    const femaleVoices = voices.filter(v => {
      const name = v.name.toLowerCase();
      const isMale = name.includes('male') || name.includes('david') || name.includes('ravi') || name.includes('mark') || name.includes('george') || name.includes('sean') || name.includes('richard') || name.includes('stefan');
      return !isMale;
    });

    let selectedVoice = femaleVoices.find(v => 
      v.name.toLowerCase().includes('zira') || 
      v.name.toLowerCase().includes('samantha') || 
      v.name.toLowerCase().includes('google us english') || 
      v.name.toLowerCase().includes('victoria') || 
      v.name.toLowerCase().includes('karen') || 
      v.name.toLowerCase().includes('female') ||
      v.lang.includes('en-US') ||
      v.lang.includes('en-GB')
    ) || femaleVoices[0];

    if (selectedVoice) {
      utterance.voice = selectedVoice;
    }

    utterance.onstart = () => {
      if (audioServiceRef.current) {
        audioServiceRef.current.pauseListening();
      }
    };

    utterance.onend = () => {
      setAssistantState('IDLE');
      if (audioServiceRef.current) {
        audioServiceRef.current.resumeListening(3000); // 3.0s post-speech buffer
      }
    };

    utterance.onerror = () => {
      setAssistantState('IDLE');
      if (audioServiceRef.current) {
        audioServiceRef.current.resumeListening(3000);
      }
    };

    synthRef.current.speak(utterance);
  };

  const stopSpeaking = () => {
    if (synthRef.current) {
      synthRef.current.cancel();
      setAssistantState('IDLE');
      if (audioServiceRef.current) {
        audioServiceRef.current.resumeListening(500);
      }
    }
  };

  // Send message to server
  const handleSendMessage = (text, imagePayload = null) => {
    const cleanLower = (text || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
    const isSleepWordSpoken = SLEEP_WORDS.some(sw => cleanLower.includes(sw));
    const isWakeWordSpoken = WAKE_WORDS.some(ww => cleanLower.includes(ww));
    
    // If user says "Thanks, MJ." -> enter sleep mode
    if (isSleepWordSpoken) {
      stopSpeaking();
      const userMsg = {
        sender: 'user',
        text: text,
        timestamp: new Date().toLocaleTimeString()
      };
      setMessages(prev => [...prev, userMsg]);
      setIsSleepMode(true);
      setAssistantState('IDLE');
      speak("You're welcome! Going to sleep mode. Say 'Hey MJ' whenever you need me!");
      return;
    }

    // Reset sleep mode on any wake word or active command
    if (isWakeWordSpoken || isSleepMode) {
      setIsSleepMode(false);
    }

    stopSpeaking();

    const userMsg = {
      sender: 'user',
      text: text,
      timestamp: new Date().toLocaleTimeString()
    };
    setMessages(prev => [...prev, userMsg]);
    setAssistantState('THINKING');

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'USER_INPUT',
        text: text,
        image: imagePayload
      }));
    } else {
      setTimeout(() => {
        handleServerMessage({
          type: 'RESPONSE',
          text: "Yep, I'm on it.",
          toolExecutions: []
        });
      }, 800);
    }
  };

  const handleAnalyzeScreen = ({ image, prompt }) => {
    setActiveTab('assistant');
    handleSendMessage(prompt, image);
  };

  const handleConfirmAction = () => {
    if (confirmationRequest && wsRef.current) {
      wsRef.current.send(JSON.stringify({
        type: 'CONFIRM_AUTHORIZATION',
        requestId: confirmationRequest.id,
        approved: true
      }));
    }
    setConfirmationRequest(null);
    setAssistantState('WORKING');
  };

  const handleCancelAction = () => {
    if (confirmationRequest && wsRef.current) {
      wsRef.current.send(JSON.stringify({
        type: 'CONFIRM_AUTHORIZATION',
        requestId: confirmationRequest.id,
        approved: false
      }));
    }
    setConfirmationRequest(null);
    setAssistantState('IDLE');
  };

  return (
    <div className="min-h-screen p-4 sm:p-6 max-w-[1600px] mx-auto flex flex-col font-sans">
      {/* Top Header Navigation */}
      <Navigation
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        privacyMode={privacyMode}
        setPrivacyMode={setPrivacyMode}
        micEnabled={micEnabled}
        setMicEnabled={handleToggleMic}
        assistantState={isSleepMode ? 'SLEEP MODE' : micEnabled ? 'ACTIVE & LISTENING' : assistantState}
        onOpenScreenShare={() => setIsScreenShareOpen(true)}
      />

      {/* Confirmation Modal overlay for sensitive operations */}
      <ConfirmationModal
        confirmationRequest={confirmationRequest}
        onConfirm={handleConfirmAction}
        onCancel={handleCancelAction}
      />

      {/* Screen Share Vision Modal */}
      <ScreenShareModal
        isOpen={isScreenShareOpen}
        onClose={() => setIsScreenShareOpen(false)}
        onAnalyzeScreen={handleAnalyzeScreen}
      />

      {/* Main Content Area */}
      <main className="flex-1">
        {activeTab === 'assistant' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Orb & Visualizer Column */}
            <div className="lg:col-span-5 glass-panel p-6 rounded-2xl flex flex-col items-center justify-between border-t-2 border-t-cyan-400 min-h-[520px] shadow-2xl">
              <div className="text-center w-full">
                <span className={`px-3 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase font-mono mb-2 inline-block ${
                  !micEnabled
                    ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                    : isSleepMode 
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' 
                    : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 animate-pulse'
                }`}>
                  {!micEnabled 
                    ? 'CLICK MIC BUTTON TO START' 
                    : isSleepMode 
                    ? 'SLEEP MODE (Say "Hey MJ" to wake)' 
                    : 'ACTIVE & LISTENING'}
                </span>
                <h2 className="text-2xl font-extrabold text-white tracking-wide">MJ COMPANION</h2>
                <p className="text-xs text-slate-400 mt-1">Autonomous Hands-Free Desktop AI Agent</p>
              </div>

              {/* Dynamic Animated Canvas Orb */}
              <div className="my-4">
                <MjOrb state={isSleepMode ? 'IDLE' : assistantState} audioLevel={audioLevel} isMuted={privacyMode || !micEnabled || isSleepMode} />
              </div>

              {/* Voice Soundwave & Mic Controller */}
              <div className="w-full">
                <VoiceVisualizer
                  isListening={micEnabled && !isSleepMode}
                  audioLevel={audioLevel}
                  isMuted={privacyMode || isSleepMode}
                  onToggleListen={handleToggleMic}
                  micError={micError}
                />
              </div>
            </div>

            {/* Right Chat Stream Column */}
            <div className="lg:col-span-7 glass-panel p-6 rounded-2xl border-t-2 border-t-purple-500 shadow-2xl">
              <ChatStream
                messages={messages}
                onSendMessage={handleSendMessage}
                isListening={micEnabled && !isSleepMode}
                onToggleListen={handleToggleMic}
                isSpeaking={assistantState === 'SPEAKING'}
                onStopSpeaking={stopSpeaking}
                micError={micError}
              />
            </div>
          </div>
        )}

        {activeTab === 'coding' && (
          <CodingWorkspace
            onRunDiagnostics={() => handleSendMessage("Scan workspace diagnostics")}
            onRunTests={() => handleSendMessage("Run tests in terminal")}
          />
        )}

        {activeTab === 'dsa' && (
          <DsaCoachView
            onAskTopic={(topic) => {
              setActiveTab('assistant');
              handleSendMessage(topic);
            }}
          />
        )}

        {activeTab === 'memory' && (
          <MemoryInspector
            memories={memories}
            onDeleteMemory={(id) => setMemories(prev => prev.filter(m => m.id !== id))}
            onClearAll={() => setMemories([])}
          />
        )}

        {activeTab === 'permissions' && (
          <PermissionManager
            permissions={permissions}
            onTogglePermission={(id) => {
              setPermissions(prev => prev.map(p => p.id === id ? { ...p, granted: !p.granted } : p));
            }}
          />
        )}

        {activeTab === 'logs' && (
          <AuditLogView
            auditLogs={auditLogs}
            onClearLogs={() => setAuditLogs([])}
          />
        )}
      </main>
    </div>
  );
}
