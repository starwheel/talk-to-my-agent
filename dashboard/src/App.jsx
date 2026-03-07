import { useMemo, useState } from "react";
import DetailPanel from "./components/dashboard/DetailPanel";
import InterventionBanner from "./components/dashboard/InterventionBanner";
import KnowledgeBaseCard from "./components/dashboard/KnowledgeBaseCard";
import PersonaCard from "./components/dashboard/PersonaCard";
import PipelineCard from "./components/dashboard/PipelineCard";
import QueueSection from "./components/dashboard/QueueSection";
import StatGrid from "./components/dashboard/StatGrid";
import Sidebar from "./components/layout/Sidebar";
import Topbar from "./components/layout/Topbar";
import SourceModal from "./components/modals/SourceModal";
import { dashboardData } from "./data/dashboardData";

export default function App() {
  const {
    currentDate,
    callers,
    interventions,
    statCards,
    callQueue,
    knowledgeSources,
    knowledgeStats,
    personaGroups,
    pipelineDeals,
  } = dashboardData;

  const [selectedCallerId, setSelectedCallerId] = useState("rt");
  const [queueTab, setQueueTab] = useState("priority");
  const [personaMenuOpen, setPersonaMenuOpen] = useState(false);
  const [sourceModalOpen, setSourceModalOpen] = useState(false);
  const [interventionVisible, setInterventionVisible] = useState(true);

  const selectedCaller = useMemo(
    () => callers.find((caller) => caller.id === selectedCallerId) ?? callers[0],
    [callers, selectedCallerId],
  );

  return (
    <div className="app-shell">
      <Sidebar
        personaMenuOpen={personaMenuOpen}
        onTogglePersonaMenu={() => setPersonaMenuOpen((open) => !open)}
      />

      <main className="main">
        <Topbar currentDate={currentDate} />

        <div className="content">
          {interventionVisible ? (
            <InterventionBanner
              interventions={interventions}
              onDismiss={() => setInterventionVisible(false)}
              onOpenCaller={setSelectedCallerId}
            />
          ) : null}

          <StatGrid statCards={statCards} />

          <div className="queue-layout">
            <QueueSection
              callers={callers}
              selectedCallerId={selectedCallerId}
              queueTab={queueTab}
              callQueue={callQueue}
              onChangeTab={setQueueTab}
              onSelectCaller={setSelectedCallerId}
            />

            <DetailPanel caller={selectedCaller} />
          </div>

          <div className="grid-bottom">
            <KnowledgeBaseCard
              sources={knowledgeSources}
              stats={knowledgeStats}
              onOpenSourceModal={() => setSourceModalOpen(true)}
            />
            <PersonaCard groups={personaGroups} />
            <PipelineCard deals={pipelineDeals} />
          </div>
        </div>
      </main>

      {sourceModalOpen ? <SourceModal onClose={() => setSourceModalOpen(false)} /> : null}
    </div>
  );
}
