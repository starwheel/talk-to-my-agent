export default function PipelineCard({ deals }) {
  return (
    <section className="kb-card">
      <div className="kb-header">
        <div>
          <div className="section-title">PIPELINE</div>
          <div className="section-subtitle">Deals twin is managing</div>
        </div>
        <button className="btn btn-ghost compact" type="button">
          View All
        </button>
      </div>

      <div className="kb-body">
        {deals.map((deal) => (
          <div className="deal-row" key={deal.name}>
            <div className={`deal-logo ${deal.avatarClass}`}>{deal.logo}</div>
            <div className="deal-info">
              <div className="deal-name">{deal.name}</div>
              <div className="deal-sector">{deal.sector}</div>
            </div>
            <div>
              <div className="deal-amount">{deal.amount}</div>
              <div className="deal-stage">{deal.stage}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
