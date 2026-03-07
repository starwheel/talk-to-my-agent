const sourceOptions = [
  {
    key: "linkedin",
    logoClass: "linkedin",
    logo: "in",
    title: "LinkedIn Profile",
    subtitle: "Posts, experience, connections & activity",
    trailing: <div className="connected-label">Connected ✓</div>,
  },
  {
    key: "crunchbase",
    logoClass: "crunchbase",
    logo: "CB",
    title: "Crunchbase",
    subtitle: "Investment history, portfolio, funding rounds",
    trailing: <div className="connected-label">Connected ✓</div>,
  },
  {
    key: "x",
    logoClass: "x",
    logo: "𝕏",
    title: "X / Twitter",
    subtitle: "Opinions, hot takes, public voice",
    trailing: (
      <button className="btn btn-ghost compact" type="button">
        Connect
      </button>
    ),
  },
  {
    key: "podcast",
    logoClass: "podcast",
    logo: "🎙",
    title: "Podcast / Interviews",
    subtitle: "Upload audio or paste YouTube/Spotify URL",
    trailing: (
      <button className="btn btn-ghost compact" type="button">
        Upload
      </button>
    ),
  },
  {
    key: "docs",
    logoClass: "docs",
    logo: "📄",
    title: "Upload Documents",
    subtitle: "PDFs, pitch decks, memos, deal notes",
    trailing: (
      <button className="btn btn-ghost compact" type="button">
        Browse
      </button>
    ),
  },
];

export default function SourceModal({ onClose }) {
  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="modal-card"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Add knowledge source"
      >
        <div className="modal-header">
          <div>
            <div className="modal-title">ADD KNOWLEDGE SOURCE</div>
            <div className="modal-subtitle">Connect a source to train your digital twin</div>
          </div>
          <button className="close-x" onClick={onClose} type="button">
            ✕
          </button>
        </div>

        <div className="modal-body">
          {sourceOptions.map((option) => (
            <div className="source-option" key={option.key}>
              <div className={`source-logo ${option.logoClass}`}>{option.logo}</div>
              <div className="source-option-copy">
                <div className="source-option-title">{option.title}</div>
                <div className="source-option-subtitle">{option.subtitle}</div>
              </div>
              {option.trailing}
            </div>
          ))}

          <div className="url-scrape">
            <div className="mini-label">Paste any URL to scrape</div>
            <div className="url-row">
              <input
                type="text"
                placeholder="e.g. kevino.com/about, Forbes profile, blog..."
              />
              <button className="btn btn-gold" type="button">
                Scrape
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
