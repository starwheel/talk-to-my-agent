import { useEffect, useMemo, useRef, useState } from 'react';
import AgoraRTC, {
  type IAgoraRTCClient,
  type IAgoraRTCRemoteUser,
  type IMicrophoneAudioTrack,
} from 'agora-rtc-sdk-ng';

type SessionResponse = {
  session_id: string;
  agora: {
    appId: string;
    channel: string;
    token: string;
    uid: number;
  };
};

type LogEntry = {
  id: number;
  message: string;
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

export default function App() {
  const [apiBase, setApiBase] = useState('http://localhost:8000');
  const [avatarId, setAvatarId] = useState('');
  const [voiceId, setVoiceId] = useState('');
  const [text, setText] = useState('');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);

  const clientRef = useRef<IAgoraRTCClient | null>(null);
  const micTrackRef = useRef<IMicrophoneAudioTrack | null>(null);
  const remoteUserRef = useRef<IAgoraRTCRemoteUser | null>(null);
  const videoContainerRef = useRef<HTMLDivElement | null>(null);

  const canSend = useMemo(() => isConnected && text.trim().length > 0, [isConnected, text]);
  const canStart = useMemo(() => !isStarting && !isConnected, [isConnected, isStarting]);

  const appendLog = (message: string) => {
    setLogs((current) => [{ id: Date.now() + Math.random(), message }, ...current].slice(0, 20));
  };

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
    } catch (cleanupError) {
      console.error(cleanupError);
    }
  };

  useEffect(() => {
    return () => {
      void cleanupAgora();
    };
  }, []);

  const sendData = async (payload: object) => {
    const client = clientRef.current as IAgoraRTCClient & {
      sendStreamMessage?: (data: string, reliable: boolean) => Promise<void>;
    };

    if (!client?.sendStreamMessage) {
      throw new Error('Agora stream messaging is not available on this client');
    }

    const textPayload = JSON.stringify(payload);
    await client.sendStreamMessage(textPayload, false);
    appendLog(`sent: ${textPayload}`);
  };

  const attachRemoteVideo = (user: IAgoraRTCRemoteUser) => {
    if (!videoContainerRef.current || !user.videoTrack) {
      return;
    }

    videoContainerRef.current.innerHTML = '';
    user.videoTrack.play(videoContainerRef.current);
  };

  const startSession = async () => {
    setError(null);
    setIsStarting(true);

    try {
      const response = await fetch(`${apiBase}/api/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          avatar_id: avatarId || undefined,
          voice_id: voiceId || undefined,
        }),
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
        appendLog(`remote published ${mediaType}`);

        if (mediaType === 'video') {
          attachRemoteVideo(user);
        }

        if (mediaType === 'audio' && user.audioTrack) {
          user.audioTrack.play();
        }
      });

      client.on('user-unpublished', (_user, mediaType) => {
        appendLog(`remote unpublished ${mediaType}`);
      });

      client.on('stream-message', (_uid: number, payload: Uint8Array) => {
        const decoded = new TextDecoder().decode(payload);
        appendLog(`recv: ${decoded}`);
      });

      await client.join(session.agora.appId, session.agora.channel, session.agora.token, session.agora.uid);
      const micTrack = await AgoraRTC.createMicrophoneAudioTrack();
      micTrackRef.current = micTrack;
      await client.publish([micTrack]);

      setSessionId(session.session_id);
      setIsConnected(true);
      appendLog('joined Agora and published microphone');

      await sendData(
        buildCommandPayload('set-params', {
          ...(voiceId ? { vid: voiceId } : {}),
        }),
      );
    } catch (startError) {
      const message = startError instanceof Error ? startError.message : 'Unknown startup error';
      setError(message);
      appendLog(`error: ${message}`);
      await cleanupAgora();
    } finally {
      setIsStarting(false);
    }
  };

  const stopSession = async () => {
    const currentSessionId = sessionId;
    await cleanupAgora();

    if (currentSessionId) {
      try {
        await fetch(`${apiBase}/api/session/close`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_id: currentSessionId }),
        });
      } catch (closeError) {
        console.error(closeError);
      }
    }

    setSessionId(null);
    appendLog('session stopped');
  };

  const sendText = async () => {
    if (!canSend) {
      return;
    }

    const content = text.trim();
    setText('');

    try {
      await sendData(buildChatPayload(`msg-${Date.now()}`, content));
    } catch (sendError) {
      const message = sendError instanceof Error ? sendError.message : 'Unknown send error';
      setError(message);
      appendLog(`error: ${message}`);
    }
  };

  const interrupt = async () => {
    try {
      await sendData(buildCommandPayload('interrupt'));
    } catch (interruptError) {
      const message = interruptError instanceof Error ? interruptError.message : 'Unknown interrupt error';
      setError(message);
      appendLog(`error: ${message}`);
    }
  };

  return (
    <div className="app-shell">
      <div className="panel">
        <h1>Test Avatar</h1>
        <p className="subtitle">FastAPI creates the AKOOL session. The browser joins Agora and streams mic audio directly.</p>

        <label>
          Backend URL
          <input value={apiBase} onChange={(event) => setApiBase(event.target.value)} />
        </label>

        <label>
          Avatar ID
          <input value={avatarId} onChange={(event) => setAvatarId(event.target.value)} placeholder="akool avatar id" />
        </label>

        <label>
          Voice ID
          <input value={voiceId} onChange={(event) => setVoiceId(event.target.value)} placeholder="optional voice id" />
        </label>

        <div className="actions">
          <button onClick={startSession} disabled={!canStart}>
            {isStarting ? 'Starting...' : 'Start Session'}
          </button>
          <button onClick={() => void stopSession()} disabled={!sessionId}>
            Stop
          </button>
        </div>

        <div className="status-row">
          <span className={isConnected ? 'status ok' : 'status'}>{isConnected ? 'Connected' : 'Disconnected'}</span>
          {sessionId ? <code>{sessionId}</code> : null}
        </div>

        <div className="chat-row">
          <input
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Type text for the avatar"
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                void sendText();
              }
            }}
          />
          <button onClick={() => void sendText()} disabled={!canSend}>
            Send
          </button>
          <button onClick={() => void interrupt()} disabled={!isConnected}>
            Interrupt
          </button>
        </div>

        {error ? <div className="error-box">{error}</div> : null}

        <div className="log-panel">
          <h2>Events</h2>
          <ul>
            {logs.map((entry) => (
              <li key={entry.id}>{entry.message}</li>
            ))}
          </ul>
        </div>
      </div>

      <div className="stage">
        <div ref={videoContainerRef} className="video-frame" />
      </div>
    </div>
  );
}
