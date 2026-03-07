const personaItems = [
  { icon: "🪞", label: "Twin Persona" },
  { icon: "🔊", label: "Voice Clone" },
  { icon: "🎬", label: "Video Model" },
  { icon: "🏋️", label: "Train Twin" },
];

export default function Sidebar({ personaMenuOpen, onTogglePersonaMenu }) {
  return (
    <aside className="sidebar">
      <div className="logo-area">
        <div className="logo-mark">
          VENTURE
          <br />
          COPILOT
        </div>
        <div className="logo-sub">Digital Twin Platform</div>
      </div>

      <div className="twin-card">
        <div className="twin-avatar">
          KO
          <div className="twin-status-dot"></div>
        </div>
        <div className="twin-name">Kevin O&apos;Leary</div>
        <div className="twin-role">Your Digital Twin</div>
        <div className="twin-mode">
          <div className="dot"></div>
          Twin is taking calls
        </div>
      </div>

      <nav>
        <div className="nav-section">
          <div className="nav-label">Overview</div>
          <div className="nav-item active">
            <span className="nav-icon">⬡</span> Dashboard
          </div>
        </div>

        <div className="nav-section">
          <div className="nav-label">Twin Settings</div>
          <div className="nav-item">
            <span className="nav-icon">🧠</span> Knowledge Base
          </div>

          <button className="nav-toggle" type="button" onClick={onTogglePersonaMenu}>
            <span>
              <span className="nav-icon">🎭</span> Persona Editor
            </span>
            <span className="persona-toggle-icon">{personaMenuOpen ? "−" : "+"}</span>
          </button>

          <div className={`persona-submenu ${personaMenuOpen ? "open" : ""}`}>
            {personaItems.map((item) => (
              <div className="nav-item nav-subitem" key={item.label}>
                <span className="nav-icon">{item.icon}</span> {item.label}
              </div>
            ))}
          </div>
        </div>

        <div className="nav-section">
          <div className="nav-label">Deals</div>
          <div className="nav-item">
            <span className="nav-icon">💼</span> Pipeline
          </div>
          <div className="nav-item">
            <span className="nav-icon">📊</span> Analytics
          </div>
          <div className="nav-item">
            <span className="nav-icon">⚙️</span> Settings
          </div>
        </div>
      </nav>
    </aside>
  );
}
