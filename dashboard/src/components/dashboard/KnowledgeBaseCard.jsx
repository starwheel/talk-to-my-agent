export default function KnowledgeBaseCard({ sources, stats, onOpenSourceModal }) {
  return (
    <section className="kb-card">
      <div className="kb-header">
        <div>
          <div className="section-title">KNOWLEDGE BASE</div>
          <div className="section-subtitle">What your twin knows</div>
        </div>
        <button className="btn btn-gold compact" onClick={onOpenSourceModal} type="button">
          + Add Source
        </button>
      </div>

      <div className="source-chip-wrap">
        {sources.map((source) => (
          <button
            className={`source-chip ${source.connected ? "connected" : ""}`}
            key={source.label}
            onClick={source.connected ? undefined : onOpenSourceModal}
            type="button"
          >
            <span className="source-chip-icon">{source.icon}</span>
            <span>{source.label}</span>
            <span className={`chip-status ${source.connected ? "" : "add"}`}>
              {source.connected ? "✓" : "+"}
            </span>
          </button>
        ))}
      </div>

      <div className="kb-body">
        {stats.map((stat) => (
          <div className="kb-block" key={stat.label}>
            <div className="kb-stat">
              <div className="kb-stat-label">{stat.label}</div>
              <div className="kb-stat-value">{stat.value}</div>
            </div>
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${stat.progress}%` }}></div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
