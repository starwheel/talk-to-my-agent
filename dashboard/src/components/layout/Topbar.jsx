export default function Topbar({ currentDate }) {
  return (
    <div className="topbar">
      <div className="page-title">Dashboard</div>
      <div className="topbar-date">{currentDate}</div>
      <div className="topbar-right">
        <div className="live-badge">
          <div className="live-dot"></div>
          1 CALL LIVE
        </div>
        <button className="btn btn-ghost" type="button">
          🌐 View Public Website
        </button>
      </div>
    </div>
  );
}
