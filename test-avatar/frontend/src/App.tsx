import { useEffect, useMemo, useRef, useState } from 'react';
import AgoraRTC, {
  type IAgoraRTCClient,
  type IAgoraRTCRemoteUser,
  type IMicrophoneAudioTrack,
} from 'agora-rtc-sdk-ng';
import { Paperclip } from 'lucide-react';

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
  attachmentName?: string;
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

function chunkTextByBytes(text: string, maxBytes: number): string[] {
  const encoder = new TextEncoder();
  const chunks: string[] = [];
  let current = '';

  for (const char of text) {
    const next = current + char;
    if (encoder.encode(next).length > maxBytes) {
      if (current) chunks.push(current);
      current = char;
    } else {
      current = next;
    }
  }

  if (current) chunks.push(current);
  return chunks.length > 0 ? chunks : [''];
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
  const [isUploading, setIsUploading] = useState(false);
  const [summaryData, setSummaryData] = useState<SummaryData | null>(null);
  const [showSummary, setShowSummary] = useState(false);

  const clientRef = useRef<IAgoraRTCClient | null>(null);
  const micTrackRef = useRef<IMicrophoneAudioTrack | null>(null);
  const remoteUserRef = useRef<IAgoraRTCRemoteUser | null>(null);
  const videoContainerRef = useRef<HTMLDivElement | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const sessionStartRef = useRef<number>(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const canSend = useMemo(
    () => isConnected && text.trim().length > 0 && !isSending && !isUploading,
    [isConnected, text, isSending, isUploading],
  );

  const addMessage = (role: 'user' | 'ai', msg: string, attachmentName?: string) => {
    setMessages((prev) => [...prev, { id: Date.now() + Math.random(), role, text: msg, attachmentName }]);
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

  const sendChatMessage = async (text: string) => {
    const messageId = `msg-${Date.now()}`;
    const chunks = chunkTextByBytes(text, 800);

    for (let i = 0; i < chunks.length; i += 1) {
      await sendData(buildChatPayload(messageId, chunks[i], i, i === chunks.length - 1));
    }
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
        const errorDetail = 'detail' in session ? session.detail : undefined;
        throw new Error(
          typeof errorDetail === 'string' ? errorDetail : JSON.stringify(errorDetail ?? 'Failed to create session'),
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

        try {
          const msg = JSON.parse(decoded);
          if (msg.type === 'chat' && msg.pld?.text) {
            const from = msg.pld.from;
            if (from === 'user') {
              addMessage('user', msg.pld.text);
            } else if (from === 'bot' && msg.pld.text.trim()) {
              addMessage('ai', msg.pld.text);
            }
          }
        } catch {
          // not JSON or unexpected format — ignore
        }
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

      await sendChatMessage(response_text);
    } catch (sendError) {
      const message = sendError instanceof Error ? sendError.message : 'Unknown send error';
      setError(message);
    } finally {
      setIsSending(false);
    }
  };

  const uploadDeck = async (file: File) => {
    if (!isConnected) {
      setError('Start a call before uploading a deck.');
      return;
    }

    setError(null);
    setIsUploading(true);
    addMessage('user', `Uploaded a pitch deck: ${file.name}`, file.name);

    try {
      const formData = new FormData();
      formData.append('user_id', 'default');
      formData.append('file', file);

      const resp = await fetch(`${API_BASE}/api/conversation/deck`, {
        method: 'POST',
        body: formData,
      });

      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({ detail: 'Backend error' }));
        throw new Error(typeof errData.detail === 'string' ? errData.detail : JSON.stringify(errData.detail));
      }

      const { response_text } = (await resp.json()) as { response_text: string; turn_id: string };
      addMessage('ai', response_text);
      await sendChatMessage(response_text);
    } catch (uploadError) {
      const message = uploadError instanceof Error ? uploadError.message : 'Unknown upload error';
      setError(message);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
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
              {isConnected ? 'Upload a deck or ask a question to start the conversation...' : 'Start a call to begin chatting'}
            </div>
          )}
          {messages.map((msg) => (
            <div key={msg.id} className={`chat-bubble ${msg.role}`}>
              <span className="chat-role">{msg.role === 'user' ? 'You' : 'AI'}</span>
              {msg.attachmentName && <div className="chat-attachment">{msg.attachmentName}</div>}
              <p>{msg.text}</p>
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>

        <div className="chat-input-row">
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,application/pdf"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void uploadDeck(file);
            }}
          />
          <button
            className="attach-button"
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={!isConnected || isUploading || isSending}
            aria-label={isUploading ? 'Uploading deck' : 'Attach deck'}
            title={isUploading ? 'Uploading deck' : 'Attach deck'}
          >
            <Paperclip size={18} strokeWidth={1.9} aria-hidden="true" />
            <span className="sr-only">{isUploading ? 'Uploading deck' : 'Attach deck'}</span>
          </button>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={isConnected ? 'Type a message...' : 'Start a call first'}
            disabled={!isConnected || isUploading}
            onKeyDown={(e) => { if (e.key === 'Enter') void sendText(); }}
          />
          <button onClick={() => void sendText()} disabled={!canSend}>
            {isSending ? '...' : 'Send'}
          </button>
        </div>
      </div>

      {/* Loading overlay while generating summary */}
      {isEnding && (
        <div className="summary-overlay">
          <div className="loading-popup">
            <div className="loading-spinner" />
            <h2>Generating Summary</h2>
            <p className="loading-hint">Analyzing your conversation...</p>
          </div>
        </div>
      )}

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
