export default function CallQueue({ items }) {
  return (
    <>
      <div className="callqueue-head">
        <div></div>
        <div>CONTACT / PURPOSE</div>
        <div>TIME</div>
        <div className="right">ACTION</div>
      </div>

      {items.map((item) => (
        <div className="callqueue-row" key={`${item.name}-${item.time}`}>
          <div className={`call-avatar small ${item.avatarClass}`}>{item.initials}</div>
          <div className="call-info">
            <div className="call-name">{item.name}</div>
            <div className="call-detail">{item.detail}</div>
          </div>
          <div className={`queue-time ${item.timeClass || ""}`}>{item.time}</div>
          <div className="right">
            <button className="btn btn-ghost compact" type="button">
              {item.action}
            </button>
          </div>
        </div>
      ))}
    </>
  );
}
