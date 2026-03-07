import CallQueue from "./CallQueue";
import PriorityQueue from "./PriorityQueue";

export default function QueueSection({
  callers,
  selectedCallerId,
  queueTab,
  callQueue,
  onChangeTab,
  onSelectCaller,
}) {
  return (
    <section className="call-feed">
      <div className="feed-header">
        <div className="feed-header-top">
          <div>
            <div className="section-title">DEAL PRIORITY QUEUE</div>
            <div className="section-subtitle">
              AI-ranked by deal potential · click any row for history
            </div>
          </div>

          <select className="feed-select" defaultValue="priority">
            <option value="priority">↕ Priority Score</option>
            <option value="deal-size">↕ Deal Size</option>
            <option value="recent-activity">↕ Recent Activity</option>
            <option value="stage">↕ Stage</option>
          </select>
        </div>

        <div className="tab-strip">
          <button
            className={`queue-tab ${queueTab === "priority" ? "active-tab" : ""}`}
            onClick={() => onChangeTab("priority")}
            type="button"
          >
            Priority Queue
          </button>
          <button
            className={`queue-tab ${queueTab === "callqueue" ? "active-tab" : ""}`}
            onClick={() => onChangeTab("callqueue")}
            type="button"
          >
            Call Queue
            <span className="tab-count">3</span>
          </button>
        </div>
      </div>

      {queueTab === "priority" ? (
        <PriorityQueue
          callers={callers}
          selectedCallerId={selectedCallerId}
          onSelectCaller={onSelectCaller}
        />
      ) : (
        <CallQueue items={callQueue} />
      )}
    </section>
  );
}
