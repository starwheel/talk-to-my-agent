function InterventionItem({ intervention, onOpenCaller }) {
  const buttonClass =
    intervention.buttonStyle === "gold"
      ? "btn btn-gold compact"
      : intervention.buttonStyle === "blue"
        ? "btn btn-blue compact"
        : "btn btn-ghost compact";

  return (
    <div className="intervention-item">
      <div className={`urgency-bar ${intervention.urgency}`}></div>
      <div className="intervention-icon">{intervention.icon}</div>
      <div className="intervention-content">
        <div className="intervention-label">
          <span className={`urgency-tag ${intervention.urgency}`}>{intervention.urgencyLabel}</span>
          {intervention.title}
        </div>
        <div className="intervention-desc">{intervention.description}</div>
        <div className="intervention-meta">
          <span>{intervention.metaLeft}</span>
          <span>{intervention.metaRight}</span>
        </div>
      </div>
      <div className="intervention-actions">
        <button
          className={buttonClass}
          type="button"
          onClick={() => onOpenCaller(intervention.callerId)}
        >
          {intervention.buttonLabel}
        </button>
      </div>
    </div>
  );
}

export default function InterventionBanner({ interventions, onDismiss, onOpenCaller }) {
  return (
    <section className="intervention-banner">
      <div className="intervention-header">
        <div className="intervention-headline">
          <div className="intervention-pulse">
            <div className="intervention-ring"></div>
            <div className="intervention-dot"></div>
          </div>
          <div>
            <div className="intervention-title">KEVIN — YOUR ATTENTION IS NEEDED</div>
            <div className="intervention-subtitle">
              3 decisions your twin cannot make without you
            </div>
          </div>
        </div>
        <div className="intervention-top-actions">
          <div className="intervention-updated">LAST UPDATED 2 MIN AGO</div>
          <button className="close-x" type="button" onClick={onDismiss}>
            ✕
          </button>
        </div>
      </div>

      <div className="intervention-items">
        {interventions.map((intervention) => (
          <InterventionItem
            intervention={intervention}
            key={intervention.title}
            onOpenCaller={onOpenCaller}
          />
        ))}
      </div>
    </section>
  );
}
