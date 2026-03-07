import LiveVideoPanel from "./LiveVideoPanel";

function HistoryItem({ item }) {
  return (
    <div className="history-call-row">
      <div className="history-num">{item.num}</div>
      <div className="history-content">
        <div className="history-date">{item.date}</div>
        <div className="history-summary">{item.summary}</div>
        <div className="history-actions">
          <span className={`history-outcome ${item.outcomeStyle}`}>{item.outcome}</span>
          <button className="transcript-btn" type="button">
            📄 Transcript
          </button>
        </div>
      </div>
    </div>
  );
}

export default function DetailPanel({ caller }) {
  return (
    <aside className="detail-panel">
      <div className={`detail-header ${caller.activeCall ? "live" : ""}`}>
        <div className="detail-headline">
          <div className={`call-avatar ${caller.avatarClass}`}>{caller.initials}</div>
          <div>
            <div className="detail-title-row">
              <div className="detail-name">{caller.name.toUpperCase()}</div>
              {caller.activeCall ? (
                <span className="live-pill">
                  <span className="live-pill-dot"></span>LIVE
                </span>
              ) : null}
            </div>
            <div className="detail-subline">
              {caller.company} · {caller.sector} · {caller.calls} calls ·{" "}
              <span style={{ color: caller.detailTrendColor }}>{caller.detailTrend}</span>
            </div>
          </div>
        </div>

        <div className={`priority-score ${caller.priorityClass}`}>{caller.priorityScore}</div>
      </div>

      {caller.activeCall ? <LiveVideoPanel caller={caller} /> : null}

      <div className="detail-block">
        <div className="mini-label">AI Deal Summary</div>
        <div className="detail-copy">{caller.summary}</div>
      </div>

      <div className="detail-block">
        <div className="mini-label">Deal Stats</div>
        <div className="detail-stats-grid">
          {caller.stats.map((stat) => (
            <div className="drawer-stat-row" key={stat.label}>
              <div className="drawer-stat-label">{stat.label}</div>
              <div className="drawer-stat-val">{stat.value}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="detail-history">
        <div className="mini-label">Call History · {caller.calls} Calls</div>
        {caller.history.map((item) => (
          <HistoryItem item={item} key={`${caller.id}-${item.num}`} />
        ))}
      </div>
    </aside>
  );
}
