function StatCard({ stat }) {
  return (
    <div className="stat-card">
      <div className="stat-icon">{stat.icon}</div>
      <div className="stat-label">{stat.label}</div>
      <div className={`stat-value ${stat.valueClass || ""}`}>{stat.value}</div>
      <div className={`stat-delta ${stat.deltaClass || ""}`}>{stat.delta}</div>
    </div>
  );
}

export default function StatGrid({ statCards }) {
  return (
    <div className="grid-4">
      {statCards.map((stat) => (
        <StatCard key={stat.label} stat={stat} />
      ))}
    </div>
  );
}
