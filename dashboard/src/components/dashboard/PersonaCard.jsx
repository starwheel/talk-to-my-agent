export default function PersonaCard({ groups }) {
  return (
    <section className="kb-card">
      <div className="kb-header">
        <div>
          <div className="section-title">TWIN PERSONA</div>
          <div className="section-subtitle">Active behavioral traits</div>
        </div>
      </div>

      <div className="kb-body">
        {groups.map((group) => (
          <div className="persona-group" key={group.title}>
            <div className="mini-label">{group.title}</div>
            <div className="tag-wrap">
              {group.tags.map((tag) => (
                <span className={`persona-tag ${tag.active ? "active" : ""}`} key={tag.label}>
                  {tag.label}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
