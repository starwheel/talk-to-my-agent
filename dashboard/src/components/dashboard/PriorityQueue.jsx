export default function PriorityQueue({ callers, selectedCallerId, onSelectCaller }) {
  return (
    <>
      <div className="queue-table-head">
        <div>#</div>
        <div></div>
        <div>CONTACT / DEAL</div>
        <div className="center">CALLS</div>
        <div className="center">SCORE</div>
        <div className="right">STATUS</div>
      </div>

      {callers.map((caller) => (
        <button
          className={`call-item ${caller.activeCall ? "active-call" : ""} ${
            selectedCallerId === caller.id ? "selected-row" : ""
          }`}
          key={caller.id}
          onClick={() => onSelectCaller(caller.id)}
          type="button"
        >
          <div className={`rank-badge ${caller.rankClass}`}>{caller.rank}</div>
          <div className={`call-avatar small ${caller.avatarClass}`}>{caller.initials}</div>
          <div className="call-info">
            <div className="call-topline">
              <div className="call-name">{caller.name}</div>
              <div className="deal-tag">{caller.chip}</div>
            </div>
            <div className="call-detail">
              {caller.ask} · {caller.stage} ·{" "}
              {caller.detailTrend.replace("↑ ", "").replace("→ ", "").replace("↓ ", "")}
            </div>
          </div>
          <div className="mono center">{caller.calls}</div>
          <div className={`priority-score ${caller.priorityClass}`}>{caller.priorityScore}</div>
          <div className="call-meta right">
            <div className="call-time">{caller.timeLabel}</div>
            <div className={`call-status ${caller.statusClass}`}>{caller.statusLabel}</div>
          </div>
        </button>
      ))}
    </>
  );
}
