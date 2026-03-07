export default function LiveVideoPanel({ caller }) {
  return (
    <div className="live-video-block">
      <div className="live-video-glow"></div>

      <div className="live-video-split">
        <div className="video-feed with-divider">
          <div className="twin-avatar-large">KO</div>
          <div className="mini-wave">
            <span className="wave-stick delay-1"></span>
            <span className="wave-stick delay-2"></span>
            <span className="wave-stick delay-3"></span>
            <span className="wave-stick delay-4"></span>
            <span className="wave-stick delay-5"></span>
            <span className="wave-stick delay-6"></span>
          </div>
          <div className="video-corner-label gold">TWIN ✦</div>
        </div>

        <div className="video-feed">
          <div className={`call-avatar large ${caller.avatarClass}`}>{caller.initials}</div>
          <div className="video-corner-label">{caller.liveCallerLabel || caller.name.toUpperCase()}</div>
        </div>
      </div>

      <div className="video-bottom-bar">
        <div className="video-live">
          <span className="live-dot"></span>
          <span>LIVE · 32:14</span>
        </div>
        <div className="video-actions">
          <button className="btn btn-video" type="button">
            👁 Monitor
          </button>
          <button className="btn btn-video-danger" type="button">
            ✋ Take Over
          </button>
        </div>
      </div>
    </div>
  );
}
