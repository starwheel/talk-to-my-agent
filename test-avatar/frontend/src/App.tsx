import { useEffect, useMemo, useRef, useState } from 'react';
import AgoraRTC, {
  type IAgoraRTCClient,
  type IAgoraRTCRemoteUser,
  type IMicrophoneAudioTrack,
} from 'agora-rtc-sdk-ng';

const API_BASE = 'http://localhost:8000';
const VOICE_ID = 'hae0UoGzmG25-6LDrB39Q';

type SessionResponse = {
  session_id: string;
  agora: {
    appId: string;
    channel: string;
    token: string;
    uid: number;
  };
};

type ChatMessage = {
  id: number;
  role: 'user' | 'ai';
  text: string;
};

type SummaryData = {
  summary: string;
  messageCount: number;
  duration: string;
};

function buildChatPayload(messageId: string, text: string, idx = 0, fin = true) {
  return {
    v: 2,
    type: 'chat',
    mid: messageId,
    idx,
    fin,
    pld: { text },
  };
}

function buildCommandPayload(command: string, data?: Record<string, unknown>) {
  return {
    v: 2,
    type: 'command',
    mid: `msg-${Date.now()}`,
    pld: {
      cmd: command,
      ...(data ? { data } : {}),
    },
  };
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s}s`;
  return `${m}m ${s}s`;
}

export default function App() {
  const [text, setText] = useState('');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isEnding, setIsEnding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [summaryData, setSummaryData] = useState<SummaryData | null>(null);
  const [showSummary, setShowSummary] = useState(false);

  const clientRef = useRef<IAgoraRTCClient | null>(null);
  const micTrackRef = useRef<IMicrophoneAudioTrack | null>(null);
  const remoteUserRef = useRef<IAgoraRTCRemoteUser | null>(null);
  const videoContainerRef = useRef<HTMLDivElement | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const sessionStartRef = useRef<number>(0);

  const canSend = useMemo(() => isConnected && text.trim().length > 0 && !isSending, [isConnected, text, isSending]);

  const addMessage = (role: 'user' | 'ai', msg: string) => {
    setMessages((prev) => [...prev, { id: Date.now() + Math.random(), role, text: msg }]);
  };

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const cleanupAgora = async () => {
    try {
      if (micTrackRef.current) {
        await clientRef.current?.unpublish([micTrackRef.current]);
        micTrackRef.current.stop();
        micTrackRef.current.close();
        micTrackRef.current = null;
      }
      if (clientRef.current) {
        clientRef.current.removeAllListeners();
        await clientRef.current.leave();
        clientRef.current = null;
      }
      remoteUserRef.current = null;
      setIsConnected(false);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    return () => { void cleanupAgora(); };
  }, []);

  const sendData = async (payload: object) => {
    const client = clientRef.current as IAgoraRTCClient & {
      sendStreamMessage?: (data: string, reliable: boolean) => Promise<void>;
    };
    if (!client?.sendStreamMessage) {
      throw new Error('Agora stream messaging is not available');
    }
    await client.sendStreamMessage(JSON.stringify(payload), false);
  };

  const attachRemoteVideo = (user: IAgoraRTCRemoteUser) => {
    if (!videoContainerRef.current || !user.videoTrack) return;
    videoContainerRef.current.innerHTML = '';
    user.videoTrack.play(videoContainerRef.current);
  };

  const startSession = async () => {
    setError(null);
    setIsStarting(true);
    setMessages([]);
    setSummaryData(null);
    setShowSummary(false);

    try {
      const response = await fetch(`${API_BASE}/api/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voice_id: VOICE_ID }),
      });

      const session = (await response.json()) as SessionResponse | { detail?: string };
      if (!response.ok || !('agora' in session)) {
        throw new Error(
          typeof session.detail === 'string' ? session.detail : JSON.stringify(session.detail ?? 'Failed to create session'),
        );
      }

      const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
      clientRef.current = client;

      client.on('user-published', async (user, mediaType) => {
        await client.subscribe(user, mediaType);
        remoteUserRef.current = user;
        if (mediaType === 'video') attachRemoteVideo(user);
        if (mediaType === 'audio' && user.audioTrack) user.audioTrack.play();
      });

      client.on('user-unpublished', () => {});

      client.on('stream-message', (_uid: number, payload: Uint8Array) => {
        const decoded = new TextDecoder().decode(payload);
        console.log('avatar:', decoded);
      });

      await client.join(session.agora.appId, session.agora.channel, session.agora.token, session.agora.uid);
      const micTrack = await AgoraRTC.createMicrophoneAudioTrack();
      micTrackRef.current = micTrack;
      await client.publish([micTrack]);

      setSessionId(session.session_id);
      setIsConnected(true);
      sessionStartRef.current = Date.now();

      await sendData(buildCommandPayload('set-params', { vid: VOICE_ID }));
    } catch (startError) {
      const message = startError instanceof Error ? startError.message : 'Unknown startup error';
      setError(message);
      await cleanupAgora();
    } finally {
      setIsStarting(false);
    }
  };

  const stopSession = async () => {
    if (!sessionId || isEnding) return;

    setIsEnding(true);
    const currentSessionId = sessionId;
    const currentMessages = [...messages];
    const durationSeconds = Math.round((Date.now() - sessionStartRef.current) / 1000);

    await cleanupAgora();

    const payload = {
      session_id: currentSessionId,
      messages: currentMessages.map((m) => ({ role: m.role === 'ai' ? 'assistant' : 'user', text: m.text })),
      duration_seconds: durationSeconds,
    };
    console.log('[EndCall] Sending transcript:', JSON.stringify(payload, null, 2));
    console.log(`[EndCall] Message count: ${currentMessages.length}, Duration: ${durationSeconds}s`);

    try {
      const resp = await fetch(`${API_BASE}/api/session/end`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (resp.ok) {
        const data = (await resp.json()) as { summary: string; transcript_id: number; message_count: number };
        setSummaryData({
          summary: data.summary,
          messageCount: data.message_count,
          duration: formatDuration(durationSeconds),
        });
        setShowSummary(true);
      } else {
        console.error('End session failed:', await resp.text());
      }
    } catch (e) {
      console.error('End session error:', e);
    }

    setSessionId(null);
    setIsEnding(false);
  };

  const sendText = async () => {
    if (!canSend) return;

    const content = text.trim();
    setText('');
    addMessage('user', content);
    setIsSending(true);

    try {
      const resp = await fetch(`${API_BASE}/api/conversation/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: content }),
      });

      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({ detail: 'Backend error' }));
        throw new Error(typeof errData.detail === 'string' ? errData.detail : JSON.stringify(errData.detail));
      }

      const { response_text } = (await resp.json()) as { response_text: string; turn_id: string };
      addMessage('ai', response_text);

      await sendData(buildChatPayload(`msg-${Date.now()}`, response_text));
    } catch (sendError) {
      const message = sendError instanceof Error ? sendError.message : 'Unknown send error';
      setError(message);
    } finally {
      setIsSending(false);
    }
  };

  const interrupt = async () => {
    try {
      await sendData(buildCommandPayload('interrupt'));
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="call-layout">
      {/* Video area */}
      <div className="video-area">
        <div ref={videoContainerRef} className="video-frame" />

        {/* Call controls overlay */}
        <div className="call-controls">
          {!isConnected ? (
            <button className="btn-call start" onClick={startSession} disabled={isStarting}>
              {isStarting ? 'Connecting...' : 'Start Call'}
            </button>
          ) : (
            <>
              <button className="btn-call end" onClick={() => void stopSession()} disabled={isEnding}>
                {isEnding ? 'Ending...' : 'End Call'}
              </button>
              <button className="btn-call interrupt" onClick={() => void interrupt()}>
                Interrupt
              </button>
            </>
          )}
        </div>

        {error && <div className="error-toast">{error}</div>}
      </div>

      {/* Chat panel */}
      <div className="chat-panel">
        <div className="chat-header">Chat</div>

        <div className="chat-messages">
          {messages.length === 0 && (
            <div className="chat-empty">
              {isConnected ? 'Say something to start the conversation...' : 'Start a call to begin chatting'}
            </div>
          )}
          {messages.map((msg) => (
            <div key={msg.id} className={`chat-bubble ${msg.role}`}>
              <span className="chat-role">{msg.role === 'user' ? 'You' : 'AI'}</span>
              <p>{msg.text}</p>
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>

        <div className="chat-input-row">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={isConnected ? 'Type a message...' : 'Start a call first'}
            disabled={!isConnected}
            onKeyDown={(e) => { if (e.key === 'Enter') void sendText(); }}
          />
          <button onClick={() => void sendText()} disabled={!canSend}>
            {isSending ? '...' : 'Send'}
          </button>
        </div>
      </div>

      {/* Summary Popup */}
      {showSummary && summaryData && (
        <div className="summary-overlay" onClick={() => setShowSummary(false)}>
          <div className="summary-popup" onClick={(e) => e.stopPropagation()}>
            <div className="summary-icon">✓</div>
            <h2>Call Ended</h2>
            <div className="summary-stats">
              <div className="stat">
                <span className="stat-value">{summaryData.messageCount}</span>
                <span className="stat-label">Messages</span>
              </div>
              <div className="stat">
                <span className="stat-value">{summaryData.duration}</span>
                <span className="stat-label">Duration</span>
              </div>
            </div>
            <div className="summary-section">
              <h3>Summary</h3>
              <p>{summaryData.summary}</p>
            </div>
            <button className="summary-close" onClick={() => setShowSummary(false)}>
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
