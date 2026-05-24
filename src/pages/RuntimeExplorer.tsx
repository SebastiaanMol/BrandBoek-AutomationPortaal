import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  ReactFlow,
  type Edge,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  AlertTriangle,
  Activity,
  Clock3,
  GitBranch,
  Network,
  Play,
  RadioTower,
  Search,
  ServerCog,
  Workflow,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  fetchRuntimeGraphSnapshot,
  fetchRuntimeEvents,
  fetchRuntimeStateTransitions,
  fetchRuntimeWorkflowGraphs,
} from "@/lib/storage/runtimeObservability";
import {
  getObservedPropagationChains,
  getRecentRuntimeTraces,
  getTraceTimeline,
  getWorkerExecutionHistory,
  RuntimeTraceTimeline,
} from "@/lib/storage/runtimeTelemetry";
import {
  getDownstreamPaths,
  getSignalBlastRadius,
  getSignalConsumers,
  getSignalProducers,
  getUpstreamPaths,
  RuntimeGraphSnapshot,
  RuntimePropagationPath,
  RuntimeSignalImpact,
} from "@/lib/runtimeGraphTraversal";
import {
  RuntimeEdge,
  RuntimeEvent,
  RuntimeRelationshipType,
  RuntimeRiskLevel,
  RuntimeSignal,
  RuntimeStateTransition,
  RuntimeTrace,
  RuntimeWorker,
  RuntimeWorkflowGraph,
} from "@/lib/runtimeObservability";

type SelectedNode =
  | { type: "worker"; id: string }
  | { type: "signal"; id: string }
  | null;

type EvidenceFilter = "all" | "inferred" | "observed";
type RiskFilter = "all" | RuntimeRiskLevel;

const RELATIONSHIP_TYPES: RuntimeRelationshipType[] = [
  "direct",
  "derived",
  "cross-workflow",
  "temporal",
  "inferred",
  "observed",
];

const WORKFLOW_COLORS = [
  { bg: "#eff6ff", border: "#2563eb", text: "#1e3a8a" },
  { bg: "#fff7ed", border: "#ea580c", text: "#7c2d12" },
  { bg: "#f0fdf4", border: "#16a34a", text: "#14532d" },
  { bg: "#fdf2f8", border: "#db2777", text: "#831843" },
  { bg: "#f5f3ff", border: "#7c3aed", text: "#4c1d95" },
  { bg: "#ecfeff", border: "#0891b2", text: "#164e63" },
  { bg: "#fefce8", border: "#ca8a04", text: "#713f12" },
  { bg: "#f1f5f9", border: "#475569", text: "#0f172a" },
];

export default function RuntimeExplorer() {
  const [selectedNode, setSelectedNode] = useState<SelectedNode>(null);
  const [workflowGraphId, setWorkflowGraphId] = useState("all");
  const [riskFilter, setRiskFilter] = useState<RiskFilter>("all");
  const [relationshipType, setRelationshipType] = useState<"all" | RuntimeRelationshipType>("all");
  const [evidenceFilter, setEvidenceFilter] = useState<EvidenceFilter>("all");
  const [search, setSearch] = useState("");
  const [highlightIds, setHighlightIds] = useState<Set<string>>(new Set());
  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(null);
  const [replayStep, setReplayStep] = useState(0);

  const graphQuery = useQuery({
    queryKey: ["runtime-graph-snapshot"],
    queryFn: () => fetchRuntimeGraphSnapshot({ includeInactiveWorkers: true }),
  });

  const workflowGraphsQuery = useQuery({
    queryKey: ["runtime-workflow-graphs"],
    queryFn: fetchRuntimeWorkflowGraphs,
  });

  const recentTracesQuery = useQuery({
    queryKey: ["runtime-recent-traces"],
    queryFn: () => getRecentRuntimeTraces(20),
  });

  const traceTimelineQuery = useQuery({
    queryKey: ["runtime-trace-timeline", selectedTraceId],
    queryFn: () => (selectedTraceId ? getTraceTimeline(selectedTraceId) : null),
    enabled: Boolean(selectedTraceId),
  });

  const graph = graphQuery.data;
  const workflowGraphs = workflowGraphsQuery.data ?? [];
  const recentTraces = recentTracesQuery.data ?? [];
  const selectedTraceTimeline = traceTimelineQuery.data ?? null;

  const graphIndex = useMemo(() => {
    if (!graph) return null;
    return indexGraph(graph, workflowGraphs);
  }, [graph, workflowGraphs]);

  const filteredGraph = useMemo(() => {
    if (!graph) return null;
    return filterGraph(graph, {
      workflowGraphId,
      riskFilter,
      relationshipType,
      evidenceFilter,
      search,
    });
  }, [graph, workflowGraphId, riskFilter, relationshipType, evidenceFilter, search]);

  const flowModel = useMemo(() => {
    if (!filteredGraph || !graphIndex) return { nodes: [] as Node[], edges: [] as Edge[] };
    return buildFlowModel(filteredGraph, graphIndex, highlightIds, selectedNode);
  }, [filteredGraph, graphIndex, highlightIds, selectedNode]);

  const selectedWorker =
    selectedNode?.type === "worker" ? graph?.workers.find((worker) => worker.id === selectedNode.id) : undefined;
  const selectedSignal =
    selectedNode?.type === "signal" ? graph?.signals.find((signal) => signal.id === selectedNode.id) : undefined;

  const selectedSignalImpact = useMemo(() => {
    if (!graph || !selectedSignal) return null;
    return getSignalBlastRadius(graph, selectedSignal.id, { maxDepth: 3 });
  }, [graph, selectedSignal]);

  function highlightWorkerPaths(workerId: string, direction: "upstream" | "downstream") {
    if (!graph) return;
    const paths =
      direction === "downstream"
        ? getDownstreamPaths(graph, workerId, { maxDepth: 4 })
        : getUpstreamPaths(graph, workerId, { maxDepth: 4 });
    setHighlightIds(idsFromPaths(paths));
  }

  function highlightSignalImpact(signalId: string) {
    if (!graph) return;
    const impact = getSignalBlastRadius(graph, signalId, { maxDepth: 4 });
    if (!impact) return;
    setHighlightIds(idsFromSignalImpact(impact));
  }

  function selectTrace(traceId: string) {
    setSelectedTraceId(traceId);
    setReplayStep(0);
  }

  function highlightTraceStep(timeline: RuntimeTraceTimeline, step: number) {
    if (!graph) return;
    const visibleEvents = timeline.events.slice(0, step + 1);
    setHighlightIds(idsFromTraceEvents(visibleEvents, graph));
  }

  if (graphQuery.isLoading || workflowGraphsQuery.isLoading) {
    return <RuntimeLoading />;
  }

  if (graphQuery.error) {
    return (
      <div className="p-6">
        <RuntimeHeader />
        <div className="mt-4 rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
          Proceskaart kon niet geladen worden. Controleer of de analyse-data beschikbaar is.
        </div>
      </div>
    );
  }

  const totalWorkers = graph?.workers.length ?? 0;
  const totalSignals = graph?.signals.length ?? 0;
  const totalEdges = graph?.edges.length ?? 0;
  const filteredWorkers = filteredGraph?.workers.length ?? 0;
  const filteredEdges = filteredGraph?.edges.length ?? 0;

  return (
    <div className="flex h-[calc(100vh-3rem)] min-h-[720px] flex-col bg-background">
      <div className="border-b bg-card px-5 py-4">
        <RuntimeHeader />
        <div className="mt-4 grid gap-3 lg:grid-cols-[1.2fr_repeat(4,minmax(120px,160px))]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Zoek automation, signaal of HubSpot-property"
              className="pl-9"
            />
          </div>
          <FilterSelect value={workflowGraphId} onChange={setWorkflowGraphId}>
            <option value="all">Alle workflows</option>
            {workflowGraphs.map((workflow) => (
              <option key={workflow.id} value={workflow.id}>
                {workflow.name}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect value={riskFilter} onChange={(value) => setRiskFilter(value as RiskFilter)}>
            <option value="all">Alle risico's</option>
            <option value="critical">Kritiek</option>
            <option value="high">Hoog</option>
            <option value="medium">Middel</option>
            <option value="low">Laag</option>
          </FilterSelect>
          <FilterSelect value={relationshipType} onChange={(value) => setRelationshipType(value as "all" | RuntimeRelationshipType)}>
            <option value="all">Alle relaties</option>
            {RELATIONSHIP_TYPES.map((type) => (
              <option key={type} value={type}>
                {formatRelationshipType(type)}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect value={evidenceFilter} onChange={(value) => setEvidenceFilter(value as EvidenceFilter)}>
            <option value="all">Verwacht + waargenomen</option>
            <option value="inferred">Alleen verwacht</option>
            <option value="observed">Alleen waargenomen</option>
          </FilterSelect>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <StatPill label="Automations" value={`${filteredWorkers}/${totalWorkers}`} />
          <StatPill label="Signalen" value={totalSignals} />
          <StatPill label="Overgangen" value={`${filteredEdges}/${totalEdges}`} />
          <StatPill label="Waargenomen" value={graph?.edges.filter(isObservedEdge).length ?? 0} />
          <StatPill label="Procesruns" value={recentTraces.length} />
          <StatPill label="Hubs" value={graph?.hubs.length ?? 0} />
          <StatPill label="Lussen" value={graph?.loops.length ?? 0} />
          {highlightIds.size > 0 && (
            <Button size="sm" variant="ghost" onClick={() => setHighlightIds(new Set())}>
              Highlight wissen
            </Button>
          )}
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-h-0 border-r">
          <ReactFlow
            nodes={flowModel.nodes}
            edges={flowModel.edges}
            fitView
            minZoom={0.2}
            maxZoom={1.5}
            onNodeClick={(_, node) => {
              const nodeType = node.data?.nodeType;
              if (nodeType === "worker" || nodeType === "signal") {
                setSelectedNode({ type: nodeType, id: String(node.data.refId) });
              }
            }}
          >
            <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="#cbd5e1" />
            <Controls position="bottom-left" />
          </ReactFlow>
        </div>

        <RuntimeChainPanel
          graph={graph}
          graphIndex={graphIndex}
          selectedWorker={selectedWorker}
          selectedSignal={selectedSignal}
          traces={recentTraces}
          selectedTrace={selectedTraceTimeline}
          replayStep={replayStep}
          onSelectNode={setSelectedNode}
          onSelectTrace={selectTrace}
          onReplayStep={(step) => {
            setReplayStep(step);
            if (selectedTraceTimeline) highlightTraceStep(selectedTraceTimeline, step);
          }}
          onHighlight={(ids) => setHighlightIds(ids)}
        />
      </div>

      <Sheet open={Boolean(selectedNode)} onOpenChange={(open) => !open && setSelectedNode(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          {selectedWorker && graph && graphIndex && (
            <WorkerDetail
              worker={selectedWorker}
              graph={graph}
              graphIndex={graphIndex}
              onUpstream={() => highlightWorkerPaths(selectedWorker.id, "upstream")}
              onDownstream={() => highlightWorkerPaths(selectedWorker.id, "downstream")}
              onSelectSignal={(id) => setSelectedNode({ type: "signal", id })}
            />
          )}
          {selectedSignal && graph && graphIndex && (
            <SignalDetail
              signal={selectedSignal}
              impact={selectedSignalImpact}
              graph={graph}
              graphIndex={graphIndex}
              onBlastRadius={() => highlightSignalImpact(selectedSignal.id)}
              onSelectWorker={(id) => setSelectedNode({ type: "worker", id })}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function RuntimeHeader() {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div className="flex items-center gap-2">
          <Network className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-semibold text-foreground">Procesketen verkenner</h1>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Laat zien welke HubSpot workflows, signalen en backend workers elkaar in het proces opvolgen.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <LegendBadge className="border-primary/30 bg-primary/10 text-primary">Automation</LegendBadge>
        <LegendBadge className="border-amber-300 bg-amber-50 text-amber-800">Signaal</LegendBadge>
        <LegendBadge className="border-red-300 bg-red-50 text-red-700">Risico</LegendBadge>
      </div>
    </div>
  );
}

function RuntimeLoading() {
  return (
    <div className="flex h-[calc(100vh-3rem)] items-center justify-center bg-background">
      <div className="rounded-lg border bg-card p-5 text-sm text-muted-foreground">Procesketen laden...</div>
    </div>
  );
}

function FilterSelect({
  value,
  onChange,
  children,
}: {
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
    >
      {children}
    </select>
  );
}

function RuntimeChainPanel({
  graph,
  graphIndex,
  selectedWorker,
  selectedSignal,
  traces,
  selectedTrace,
  replayStep,
  onSelectNode,
  onSelectTrace,
  onReplayStep,
  onHighlight,
}: {
  graph?: RuntimeGraphSnapshot;
  graphIndex: GraphIndex | null;
  selectedWorker?: RuntimeWorker;
  selectedSignal?: RuntimeSignal;
  traces: RuntimeTrace[];
  selectedTrace: RuntimeTraceTimeline | null;
  replayStep: number;
  onSelectNode: (node: SelectedNode) => void;
  onSelectTrace: (traceId: string) => void;
  onReplayStep: (step: number) => void;
  onHighlight: (ids: Set<string>) => void;
}) {
  if (!graph || !graphIndex) {
    return <aside className="hidden xl:block" />;
  }

  const paths = selectedWorker
    ? getDownstreamPaths(graph, selectedWorker.id, { maxDepth: 4 }).slice(0, 6)
    : selectedSignal
      ? getSignalBlastRadius(graph, selectedSignal.id, { maxDepth: 4 })?.downstreamPaths.slice(0, 6) ?? []
      : graph.edges
          .filter((edge) => edge.relationshipType === "cross-workflow" || edge.fanOutRisk === "critical" || edge.fanOutRisk === "high")
          .slice(0, 8)
          .map((edge) => pathFromEdge(edge, graphIndex));

  return (
    <aside className="hidden min-h-0 overflow-y-auto bg-card p-4 xl:block">
      <TracePanel
        graph={graph}
        graphIndex={graphIndex}
        traces={traces}
        selectedTrace={selectedTrace}
        replayStep={replayStep}
        onSelectTrace={onSelectTrace}
        onReplayStep={onReplayStep}
        onSelectNode={onSelectNode}
      />

      <div className="mb-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Procesketens</p>
        <h2 className="mt-1 text-base font-semibold">
          {selectedWorker ? selectedWorker.name : selectedSignal ? selectedSignal.name : "Hoog risico vervolg"}
        </h2>
      </div>
      <div className="space-y-3">
        {paths.length === 0 && (
          <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            Selecteer een automation of signaal om te zien wat daarna kan gebeuren.
          </div>
        )}
        {paths.map((path, index) => (
          <button
            key={`${path.edges.map((edge) => edge.id).join("-")}-${index}`}
            className="w-full rounded-lg border bg-background p-3 text-left transition hover:border-primary/40 hover:bg-primary/5"
            onClick={() => onHighlight(idsFromPaths([path]))}
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <Badge variant={path.riskScore >= 75 ? "destructive" : "secondary"}>
                risico {Math.round(path.riskScore)}
              </Badge>
              <span className="text-xs text-muted-foreground">
                zekerheid {Math.round(path.confidenceScore * 100)}%
              </span>
            </div>
            <div className="space-y-1">
              {path.workers.map((worker, wi) => (
                <div key={`${worker.id}-${wi}`} className="flex items-center gap-2 text-sm">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-bold">
                    {wi + 1}
                  </span>
                  <span
                    className="truncate font-medium"
                    onClick={(event) => {
                      event.stopPropagation();
                      onSelectNode({ type: "worker", id: worker.id });
                    }}
                  >
                    {worker.name}
                  </span>
                </div>
              ))}
            </div>
          </button>
        ))}
      </div>
    </aside>
  );
}

function TracePanel({
  graph,
  graphIndex,
  traces,
  selectedTrace,
  replayStep,
  onSelectTrace,
  onReplayStep,
  onSelectNode,
}: {
  graph: RuntimeGraphSnapshot;
  graphIndex: GraphIndex;
  traces: RuntimeTrace[];
  selectedTrace: RuntimeTraceTimeline | null;
  replayStep: number;
  onSelectTrace: (traceId: string) => void;
  onReplayStep: (step: number) => void;
  onSelectNode: (node: SelectedNode) => void;
}) {
  const replayEvents = selectedTrace?.events ?? [];
  const currentReplayEvent = replayEvents[replayStep];

  return (
    <section className="mb-5 rounded-lg border bg-background p-3">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Waargenomen procesruns</p>
          <h2 className="text-sm font-semibold">Wat gebeurde echt?</h2>
        </div>
        <Badge variant="secondary">{traces.length}</Badge>
      </div>

      {traces.length === 0 ? (
        <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
          Nog geen waargenomen procesruns. De verwachte procesketen blijft zichtbaar tot er meetdata binnenkomt.
        </div>
      ) : (
        <div className="max-h-44 space-y-2 overflow-y-auto pr-1">
          {traces.map((trace) => (
            <button
              key={trace.id}
              onClick={() => onSelectTrace(trace.id)}
              className={`w-full rounded-md border px-3 py-2 text-left text-xs transition hover:border-primary/40 hover:bg-primary/5 ${
                selectedTrace?.trace.id === trace.id ? "border-primary bg-primary/5" : "bg-card"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-semibold">{trace.summary || trace.id}</span>
                <TraceStatusBadge status={trace.status} />
              </div>
              <div className="mt-1 flex items-center gap-2 text-muted-foreground">
                <Clock3 className="h-3 w-3" />
                <span>{formatDateTime(trace.lastEventAt ?? trace.startedAt)}</span>
                <span>{trace.eventCount ?? 0} gebeurtenissen</span>
              </div>
            </button>
          ))}
        </div>
      )}

      {selectedTrace && (
        <div className="mt-4 border-t pt-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Procesrun stap voor stap</p>
            <span className="text-xs text-muted-foreground">
              {Math.min(replayStep + 1, replayEvents.length)}/{replayEvents.length}
            </span>
          </div>
          <div className="mb-2 flex gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-8 flex-1"
              onClick={() => onReplayStep(Math.max(0, replayStep - 1))}
              disabled={replayStep <= 0}
            >
              Vorige
            </Button>
            <Button
              size="sm"
              className="h-8 flex-1"
              onClick={() => onReplayStep(Math.min(replayEvents.length - 1, replayStep + 1))}
              disabled={replayStep >= replayEvents.length - 1}
            >
              <Play className="h-3.5 w-3.5" />
              Volgende
            </Button>
          </div>
          {currentReplayEvent && (
            <TraceEventCard
              event={currentReplayEvent}
              graphIndex={graphIndex}
              transitions={selectedTrace.transitions.filter((transition) => transition.eventId === currentReplayEvent.id)}
              onSelectNode={onSelectNode}
            />
          )}
          <div className="mt-3 space-y-2">
            {selectedTrace.events.slice(0, 8).map((event, index) => (
              <button
                key={event.id}
                onClick={() => onReplayStep(index)}
                className={`flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left text-xs ${
                  index === replayStep ? "border-primary bg-primary/5" : "bg-card"
                }`}
              >
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-bold">
                  {index + 1}
                </span>
                <span className="min-w-0 flex-1 truncate">{eventLabel(event, graphIndex)}</span>
                <EventTypeBadge eventType={event.eventType} />
              </button>
            ))}
          </div>
          {selectedTrace.observedEdges.length > 0 && (
            <div className="mt-3 rounded-md border bg-emerald-50 p-2 text-xs text-emerald-900">
              {selectedTrace.observedEdges.length} waargenomen vervolgstap(pen) in deze procesrun.
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function TraceEventCard({
  event,
  transitions,
  graphIndex,
  onSelectNode,
}: {
  event: RuntimeEvent;
  transitions: RuntimeStateTransition[];
  graphIndex: GraphIndex;
  onSelectNode: (node: SelectedNode) => void;
}) {
  const worker = event.workerId ? graphIndex.workerById.get(event.workerId) : null;
  const signal = event.signalId ? graphIndex.signalById.get(event.signalId) : null;

  return (
    <div className="rounded-md border bg-card p-3 text-xs">
      <div className="mb-2 flex items-center justify-between gap-2">
        <EventTypeBadge eventType={event.eventType} />
        <span className="text-muted-foreground">{formatDateTime(event.occurredAt)}</span>
      </div>
      <p className="font-semibold">{eventLabel(event, graphIndex)}</p>
      <div className="mt-2 space-y-1 text-muted-foreground">
        {worker && (
          <button
            className="block truncate text-left text-primary hover:underline"
            onClick={() => onSelectNode({ type: "worker", id: worker.id })}
          >
            Automation: {worker.name}
          </button>
        )}
        {signal && (
          <button
            className="block truncate text-left text-primary hover:underline"
            onClick={() => onSelectNode({ type: "signal", id: signal.id })}
          >
            Signaal: {signal.name}
          </button>
        )}
        {event.hubspotObjectId && (
          <p>
            HubSpot: {event.hubspotObjectType ?? "object"}:{event.hubspotObjectId}
          </p>
        )}
        {event.correlationStrategy && <p>Gekoppeld via: {event.correlationStrategy}</p>}
      </div>
      {transitions.length > 0 && (
        <div className="mt-3 rounded-md bg-muted/40 p-2">
          <p className="mb-1 font-semibold text-foreground">HubSpot state wijziging</p>
          {transitions.map((transition) => (
            <p key={transition.id} className="text-muted-foreground">
              {transition.propertyName ?? transition.transitionType}: {transition.oldValue ?? transition.dealstageOld ?? "-"} {"->"}{" "}
              {transition.newValue ?? transition.dealstageNew ?? "-"}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

function WorkerDetail({
  worker,
  graph,
  graphIndex,
  onUpstream,
  onDownstream,
  onSelectSignal,
}: {
  worker: RuntimeWorker;
  graph: RuntimeGraphSnapshot;
  graphIndex: GraphIndex;
  onUpstream: () => void;
  onDownstream: () => void;
  onSelectSignal: (id: string) => void;
}) {
  const incoming = graph.edges.filter((edge) => edge.targetWorkerId === worker.id);
  const outgoing = graph.edges.filter((edge) => edge.sourceWorkerId === worker.id);
  const readSignals = signalListFromMetadata(worker.metadata.reads_properties, graphIndex);
  const triggerSignals = signalListFromMetadata(worker.metadata.trigger_signals, graphIndex);
  const writeSignals = signalListFromMetadata(worker.metadata.writes_properties, graphIndex);
  const emittedSignals = signalListFromMetadata(worker.metadata.emits_signals, graphIndex);
  const upstream = getUpstreamPaths(graph, worker.id, { maxDepth: 3 }).slice(0, 4);
  const downstream = getDownstreamPaths(graph, worker.id, { maxDepth: 3 }).slice(0, 4);
  const workflow = graphIndex.workflowById.get(worker.workflowGraphId ?? "");
  const executionQuery = useQuery({
    queryKey: ["runtime-worker-execution-history", worker.id],
    queryFn: () => getWorkerExecutionHistory(worker.id, 20),
  });
  const observedEdgesQuery = useQuery({
    queryKey: ["runtime-worker-observed-edges", worker.id],
    queryFn: () => getObservedPropagationChains({ workerId: worker.id, limit: 20 }),
  });
  const executions = executionQuery.data ?? [];
  const observedEdges = observedEdgesQuery.data ?? [];
  const failureCount = executions.filter((event) => event.eventType === "error").length;

  return (
    <>
      <SheetHeader>
        <SheetTitle>{worker.name}</SheetTitle>
        <SheetDescription>
          Runtime transition binnen {workflow?.name ?? "onbekende workflow"}.
        </SheetDescription>
      </SheetHeader>

      <div className="mt-5 space-y-5">
        <div className="flex flex-wrap gap-2">
          <Badge>{worker.actorRole}</Badge>
          <RiskBadge score={worker.riskScore} />
          <Badge variant="outline">zekerheid {Math.round(worker.confidenceScore * 100)}%</Badge>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={onUpstream}>
            <GitBranch className="h-4 w-4" />
            Waarom draait dit?
          </Button>
          <Button variant="outline" onClick={onDownstream}>
            <Zap className="h-4 w-4" />
            Wat gebeurt hierna?
          </Button>
        </div>

        <InfoBlock title="Runtime transition narrative">
          <p>{worker.businessSemantics || "Geen business semantics vastgelegd."}</p>
        </InfoBlock>

        <SignalChips title="Runtime trigger en gelezen state" signals={[...triggerSignals, ...readSignals]} onSelect={onSelectSignal} />
        <SignalChips title="Runtime writes en nieuwe signalen" signals={[...writeSignals, ...emittedSignals]} onSelect={onSelectSignal} />

        <InfoGrid
          items={[
            ["Upstream triggers", incoming.length],
            ["Downstream effects", outgoing.length],
            ["Waargenomen runs", executions.length],
            ["Waargenomen vervolg", observedEdges.filter((edge) => edge.sourceWorkerId === worker.id).length],
            ["Failures", failureCount],
            ["Blast radius", worker.fanOutRisk || "onbekend"],
            ["Runtime risk", worker.orchestrationRisk || "onbekend"],
          ]}
        />

        <RuntimeHistoryList
          title="Laatste runtime gebeurtenissen"
          events={executions}
          graphIndex={graphIndex}
          emptyText="Nog geen waargenomen runs voor deze automation."
        />

        <ObservedEdgeList
          title="Waargenomen vervolg-effecten"
          edges={observedEdges.filter((edge) => edge.sourceWorkerId === worker.id)}
          graphIndex={graphIndex}
        />

        <PathList title="Waarom draait dit?" paths={upstream} />
        <PathList title="Wat kan hierna reageren?" paths={downstream} />
      </div>
    </>
  );
}

function SignalDetail({
  signal,
  impact,
  graph,
  graphIndex,
  onBlastRadius,
  onSelectWorker,
}: {
  signal: RuntimeSignal;
  impact: RuntimeSignalImpact | null;
  graph: RuntimeGraphSnapshot;
  graphIndex: GraphIndex;
  onBlastRadius: () => void;
  onSelectWorker: (id: string) => void;
}) {
  const producers = getSignalProducers(graph, signal.id);
  const consumers = getSignalConsumers(graph, signal.id);
  const workflowNames = [
    ...new Set(
      (impact?.downstreamPaths ?? [])
        .flatMap((path) => path.workflowGraphIds)
        .map((id) => graphIndex.workflowById.get(id)?.name)
        .filter(Boolean),
    ),
  ];
  const eventQuery = useQuery({
    queryKey: ["runtime-signal-events", signal.id],
    queryFn: () => fetchRuntimeEvents({ signalId: signal.id, limit: 20 }),
  });
  const transitionQuery = useQuery({
    queryKey: ["runtime-signal-transitions", signal.id],
    queryFn: () => fetchRuntimeStateTransitions({ signalId: signal.id, limit: 20 }),
  });
  const observedEdgesQuery = useQuery({
    queryKey: ["runtime-signal-observed-edges", signal.id],
    queryFn: () => getObservedPropagationChains({ signalId: signal.id, limit: 20 }),
  });
  const recentEvents = eventQuery.data ?? [];
  const recentTransitions = transitionQuery.data ?? [];
  const observedEdges = observedEdgesQuery.data ?? [];

  return (
    <>
      <SheetHeader>
        <SheetTitle>{signal.name}</SheetTitle>
        <SheetDescription>
          {signal.signalType} signaal {signal.isOrchestrationHub ? "met hub-status" : "in de procesketen"}.
        </SheetDescription>
      </SheetHeader>

      <div className="mt-5 space-y-5">
        <div className="flex flex-wrap gap-2">
          <Badge>{signal.signalType}</Badge>
          {signal.isOrchestrationHub && <Badge variant="destructive">hub</Badge>}
          {signal.semanticGroup && <Badge variant="secondary">{signal.semanticGroup}</Badge>}
          <RiskBadge score={impact?.blastRadiusScore ?? signal.hubScore} />
        </div>

        <Button variant="outline" onClick={onBlastRadius} className="w-full">
          <RadioTower className="h-4 w-4" />
          Toon bereik
        </Button>

        <InfoGrid
          items={[
            ["Wordt gezet door", producers.length],
            ["Wordt gebruikt door", consumers.length],
            ["Recente writes", recentTransitions.length],
            ["Waargenomen gebruikers", new Set(observedEdges.map((edge) => edge.targetWorkerId)).size],
            ["Bereik", impact ? Math.round(impact.blastRadiusScore) : 0],
            ["Geraakte workflows", workflowNames.length],
          ]}
        />

        <RuntimeTransitionList transitions={recentTransitions} emptyText="Nog geen waargenomen writes voor dit signaal." />
        <RuntimeHistoryList
          title="Signaalgeschiedenis"
          events={recentEvents}
          graphIndex={graphIndex}
          emptyText="Nog geen gebeurtenissen voor dit signaal."
        />
        <ObservedEdgeList title="Waargenomen vervolgketens" edges={observedEdges} graphIndex={graphIndex} />

        <WorkerChips title="Zet dit signaal" workers={producers} onSelect={onSelectWorker} />
        <WorkerChips title="Gebruikt dit signaal" workers={consumers} onSelect={onSelectWorker} />

        <InfoBlock title="Geraakte workflowgroepen">
          {workflowNames.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {workflowNames.map((name) => (
                <Badge key={name} variant="outline">
                  {name}
                </Badge>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground">Geen downstream workflow gevonden.</p>
          )}
        </InfoBlock>
      </div>
    </>
  );
}

function PathList({ title, paths }: { title: string; paths: RuntimePropagationPath[] }) {
  return (
    <InfoBlock title={title}>
      {paths.length === 0 ? (
        <p className="text-muted-foreground">Geen chain gevonden.</p>
      ) : (
        <div className="space-y-2">
          {paths.map((path, index) => (
            <div key={index} className="rounded-md border bg-muted/30 p-2">
              <div className="mb-1 flex justify-between text-[11px] text-muted-foreground">
                <span>{path.depth} stap(pen)</span>
                <span>{Math.round(path.confidenceScore * 100)}% zekerheid</span>
              </div>
              <p className="text-xs font-medium">
                {path.workers.map((worker) => worker.name).join(" -> ")}
              </p>
            </div>
          ))}
        </div>
      )}
    </InfoBlock>
  );
}

function InfoBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">{title}</h3>
      <div className="rounded-lg border bg-card p-3 text-sm">{children}</div>
    </section>
  );
}

function InfoGrid({ items }: { items: Array<[string, string | number]> }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {items.map(([label, value]) => (
        <div key={label} className="rounded-lg border bg-muted/20 p-3">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="mt-1 text-sm font-semibold">{value}</p>
        </div>
      ))}
    </div>
  );
}

function SignalChips({
  title,
  signals,
  onSelect,
}: {
  title: string;
  signals: RuntimeSignal[];
  onSelect: (id: string) => void;
}) {
  return (
    <InfoBlock title={title}>
      {signals.length === 0 ? (
        <p className="text-muted-foreground">Geen runtime signalen gevonden.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {signals.slice(0, 30).map((signal) => (
            <button
              key={signal.id}
              onClick={() => onSelect(signal.id)}
              className="rounded-full border bg-background px-2.5 py-1 text-xs font-medium hover:border-primary/40 hover:bg-primary/5"
            >
              {signal.name}
            </button>
          ))}
        </div>
      )}
    </InfoBlock>
  );
}

function WorkerChips({
  title,
  workers,
  onSelect,
}: {
  title: string;
  workers: RuntimeWorker[];
  onSelect: (id: string) => void;
}) {
  return (
    <InfoBlock title={title}>
      {workers.length === 0 ? (
        <p className="text-muted-foreground">Geen automations gevonden.</p>
      ) : (
        <div className="space-y-2">
          {workers.map((worker) => (
            <button
              key={worker.id}
              onClick={() => onSelect(worker.id)}
              className="flex w-full items-center justify-between gap-2 rounded-md border bg-background px-3 py-2 text-left text-sm hover:border-primary/40 hover:bg-primary/5"
            >
              <span className="truncate font-medium">{worker.name}</span>
              <Badge variant="secondary">{worker.actorRole}</Badge>
            </button>
          ))}
        </div>
      )}
    </InfoBlock>
  );
}

function RuntimeHistoryList({
  title,
  events,
  graphIndex,
  emptyText,
}: {
  title: string;
  events: RuntimeEvent[];
  graphIndex: GraphIndex;
  emptyText: string;
}) {
  return (
    <InfoBlock title={title}>
      {events.length === 0 ? (
        <p className="text-muted-foreground">{emptyText}</p>
      ) : (
        <div className="space-y-2">
          {events.slice(0, 8).map((event) => (
            <div key={event.id} className="rounded-md border bg-background px-3 py-2">
              <div className="mb-1 flex items-center justify-between gap-2">
                <EventTypeBadge eventType={event.eventType} />
                <span className="text-[11px] text-muted-foreground">{formatDateTime(event.occurredAt)}</span>
              </div>
              <p className="truncate text-xs font-medium">{eventLabel(event, graphIndex)}</p>
              <p className="mt-1 truncate text-[11px] text-muted-foreground">
                {event.correlationStrategy ? `via ${event.correlationStrategy}` : event.correlationId ?? event.id}
              </p>
            </div>
          ))}
        </div>
      )}
    </InfoBlock>
  );
}

function RuntimeTransitionList({
  transitions,
  emptyText,
}: {
  transitions: RuntimeStateTransition[];
  emptyText: string;
}) {
  return (
    <InfoBlock title="Recente HubSpot state-wijzigingen">
      {transitions.length === 0 ? (
        <p className="text-muted-foreground">{emptyText}</p>
      ) : (
        <div className="space-y-2">
          {transitions.slice(0, 8).map((transition) => (
            <div key={transition.id} className="rounded-md border bg-background px-3 py-2 text-xs">
              <div className="mb-1 flex items-center justify-between gap-2">
                <Badge variant="secondary">{formatTransitionType(transition.transitionType)}</Badge>
                <span className="text-[11px] text-muted-foreground">{formatDateTime(transition.occurredAt)}</span>
              </div>
              <p className="font-medium">{transition.propertyName ?? transition.transitionType}</p>
              <p className="mt-1 text-muted-foreground">
                {transition.oldValue ?? transition.dealstageOld ?? "-"} -&gt; {transition.newValue ?? transition.dealstageNew ?? "-"}
              </p>
            </div>
          ))}
        </div>
      )}
    </InfoBlock>
  );
}

function ObservedEdgeList({
  title,
  edges,
  graphIndex,
}: {
  title: string;
  edges: RuntimeEdge[];
  graphIndex: GraphIndex;
}) {
  return (
    <InfoBlock title={title}>
      {edges.length === 0 ? (
        <p className="text-muted-foreground">Nog geen waargenomen downstream effect.</p>
      ) : (
        <div className="space-y-2">
          {edges.slice(0, 8).map((edge) => {
            const source = graphIndex.workerById.get(edge.sourceWorkerId);
            const target = graphIndex.workerById.get(edge.targetWorkerId);
            const signal = edge.emittedSignalId ? graphIndex.signalById.get(edge.emittedSignalId) : null;
            return (
              <div key={edge.id} className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-950">
                <div className="flex items-center justify-between gap-2">
                  <Badge className="bg-emerald-600 text-white">waargenomen</Badge>
                  <span>{edge.observedCount}x</span>
                </div>
                <p className="mt-1 font-medium">
                  {source?.name ?? edge.sourceWorkerId} -&gt; {target?.name ?? edge.targetWorkerId}
                </p>
                <p className="mt-1 truncate text-emerald-800">{signal?.name ?? "onbekend signaal"}</p>
                {edge.lastObservedAt && <p className="mt-1 text-emerald-700">laatst {formatDateTime(edge.lastObservedAt)}</p>}
              </div>
            );
          })}
        </div>
      )}
    </InfoBlock>
  );
}

function StatPill({ label, value }: { label: string; value: string | number }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border bg-background px-2.5 py-1">
      <span>{label}</span>
      <span className="font-semibold text-foreground">{value}</span>
    </span>
  );
}

function LegendBadge({ className, children }: { className: string; children: ReactNode }) {
  return <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${className}`}>{children}</span>;
}

function RiskBadge({ score }: { score: number }) {
  const level = riskLevel(score);
  const cls =
    level === "critical"
      ? "bg-red-100 text-red-800 border-red-200"
      : level === "high"
        ? "bg-orange-100 text-orange-800 border-orange-200"
        : level === "medium"
          ? "bg-amber-100 text-amber-800 border-amber-200"
          : "bg-emerald-100 text-emerald-800 border-emerald-200";
  return <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${cls}`}>{level} {Math.round(score)}</span>;
}

interface GraphIndex {
  workerById: Map<string, RuntimeWorker>;
  signalById: Map<string, RuntimeSignal>;
  workflowById: Map<string, RuntimeWorkflowGraph>;
  workflowColorById: Map<string, (typeof WORKFLOW_COLORS)[number]>;
}

function indexGraph(graph: RuntimeGraphSnapshot, workflows: RuntimeWorkflowGraph[]): GraphIndex {
  const workflowById = new Map(workflows.map((workflow) => [workflow.id, workflow]));
  const workflowIds = [...new Set(graph.workers.map((worker) => worker.workflowGraphId).filter(Boolean))] as string[];
  const workflowColorById = new Map<string, (typeof WORKFLOW_COLORS)[number]>();
  workflowIds.forEach((id, index) => workflowColorById.set(id, WORKFLOW_COLORS[index % WORKFLOW_COLORS.length]));
  return {
    workerById: new Map(graph.workers.map((worker) => [worker.id, worker])),
    signalById: new Map(graph.signals.map((signal) => [signal.id, signal])),
    workflowById,
    workflowColorById,
  };
}

function filterGraph(
  graph: RuntimeGraphSnapshot,
  filters: {
    workflowGraphId: string;
    riskFilter: RiskFilter;
    relationshipType: "all" | RuntimeRelationshipType;
    evidenceFilter: EvidenceFilter;
    search: string;
  },
): RuntimeGraphSnapshot {
  let edges = graph.edges;
  const query = filters.search.trim().toLowerCase();

  if (filters.workflowGraphId !== "all") {
    edges = edges.filter((edge) => edge.workflowGraphId === filters.workflowGraphId);
  }
  if (filters.relationshipType !== "all") {
    edges = edges.filter((edge) => edge.relationshipType === filters.relationshipType);
  }
  if (filters.evidenceFilter !== "all") {
    edges = edges.filter((edge) => {
      const observed =
        edge.relationshipType === "observed" ||
        edge.relationshipOrigin === "observed_runtime_trace" ||
        edge.evidenceType === "observed_trace";
      return filters.evidenceFilter === "observed" ? observed : !observed;
    });
  }
  if (filters.riskFilter !== "all") {
    edges = edges.filter((edge) => riskLevel(edge.riskScore) === filters.riskFilter || edge.fanOutRisk === filters.riskFilter);
  }

  let workerIds = new Set(edges.flatMap((edge) => [edge.sourceWorkerId, edge.targetWorkerId]));
  let signalIds = new Set(edges.map((edge) => edge.emittedSignalId).filter(Boolean) as string[]);

  if (query) {
    const matchingWorkers = new Set(
      graph.workers
        .filter((worker) => `${worker.name} ${worker.actorRole} ${worker.businessSemantics ?? ""}`.toLowerCase().includes(query))
        .map((worker) => worker.id),
    );
    const matchingSignals = new Set(
      graph.signals
        .filter((signal) => `${signal.name} ${signal.semanticGroup ?? ""} ${signal.propertyName ?? ""}`.toLowerCase().includes(query))
        .map((signal) => signal.id),
    );
    edges = edges.filter(
      (edge) =>
        matchingWorkers.has(edge.sourceWorkerId) ||
        matchingWorkers.has(edge.targetWorkerId) ||
        (edge.emittedSignalId && matchingSignals.has(edge.emittedSignalId)),
    );
    workerIds = new Set(edges.flatMap((edge) => [edge.sourceWorkerId, edge.targetWorkerId]));
    signalIds = new Set(edges.map((edge) => edge.emittedSignalId).filter(Boolean) as string[]);
  }

  return {
    ...graph,
    workers: graph.workers.filter((worker) => workerIds.has(worker.id)),
    signals: graph.signals.filter((signal) => signalIds.has(signal.id)),
    edges,
  };
}

function buildFlowModel(
  graph: RuntimeGraphSnapshot,
  graphIndex: GraphIndex,
  highlightIds: Set<string>,
  selectedNode: SelectedNode,
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const workerPositions = layoutWorkers(graph.workers);
  const signalPositions = layoutSignals(graph.edges, workerPositions);

  for (const worker of graph.workers) {
    const workflowColor = graphIndex.workflowColorById.get(worker.workflowGraphId ?? "") ?? WORKFLOW_COLORS[0];
    const highlighted = highlightIds.size === 0 || highlightIds.has(worker.id);
    const selected = selectedNode?.type === "worker" && selectedNode.id === worker.id;
    nodes.push({
      id: worker.id,
      type: "default",
      position: workerPositions.get(worker.id) ?? { x: 0, y: 0 },
      data: {
        nodeType: "worker",
        refId: worker.id,
        label: (
          <RuntimeNodeLabel
            title={worker.name}
            subtitle={worker.actorRole}
            icon={<Workflow className="h-3.5 w-3.5" />}
            riskScore={worker.riskScore}
          />
        ),
      },
      style: {
        width: 230,
        borderRadius: 8,
        border: `2px solid ${selected ? "#111827" : workflowColor.border}`,
        background: workflowColor.bg,
        color: workflowColor.text,
        opacity: highlighted ? 1 : 0.25,
        boxShadow: worker.riskScore >= 75 ? "0 0 0 3px rgba(239, 68, 68, 0.16)" : undefined,
      },
    });
  }

  for (const signal of graph.signals) {
    const highlighted = highlightIds.size === 0 || highlightIds.has(signal.id);
    const selected = selectedNode?.type === "signal" && selectedNode.id === signal.id;
    nodes.push({
      id: signal.id,
      type: "default",
      position: signalPositions.get(signal.id) ?? { x: 0, y: 0 },
      data: {
        nodeType: "signal",
        refId: signal.id,
        label: (
          <RuntimeNodeLabel
            title={signal.name}
            subtitle={signal.signalType}
            icon={<RadioTower className="h-3.5 w-3.5" />}
            riskScore={signal.hubScore}
          />
        ),
      },
      style: {
        width: 190,
        borderRadius: 999,
        border: `2px solid ${selected ? "#111827" : signal.isOrchestrationHub ? "#dc2626" : "#f59e0b"}`,
        background: signal.isOrchestrationHub ? "#fef2f2" : "#fffbeb",
        color: signal.isOrchestrationHub ? "#991b1b" : "#78350f",
        opacity: highlighted ? 1 : 0.25,
        boxShadow: signal.isOrchestrationHub ? "0 0 0 3px rgba(220, 38, 38, 0.14)" : undefined,
      },
    });
  }

  for (const edge of graph.edges) {
    if (!edge.emittedSignalId) continue;
    const highlighted =
      highlightIds.size === 0 ||
      highlightIds.has(edge.id) ||
      highlightIds.has(edge.sourceWorkerId) ||
      highlightIds.has(edge.targetWorkerId) ||
      highlightIds.has(edge.emittedSignalId);
    const style = edgeStyle(edge, highlighted);
    edges.push({
      id: `${edge.id}-emit`,
      source: edge.sourceWorkerId,
      target: edge.emittedSignalId,
      label: isObservedEdge(edge) ? `waargenomen ${edge.observedCount || 1}x` : "verwacht",
      animated: edge.relationshipType === "observed",
      style,
      markerEnd: { type: MarkerType.ArrowClosed, color: String(style.stroke) },
    });
    edges.push({
      id: `${edge.id}-trigger`,
      source: edge.emittedSignalId,
      target: edge.targetWorkerId,
      label: `${formatRelationshipType(edge.relationshipType)} ${Math.round(edge.confidenceScore * 100)}%`,
      animated: edge.relationshipType === "observed",
      style,
      markerEnd: { type: MarkerType.ArrowClosed, color: String(style.stroke) },
    });
  }

  return { nodes, edges };
}

function RuntimeNodeLabel({
  title,
  subtitle,
  icon,
  riskScore,
}: {
  title: string;
  subtitle: string;
  icon: ReactNode;
  riskScore: number;
}) {
  return (
    <div className="min-w-0 px-1 py-0.5 text-left">
      <div className="flex items-center gap-1.5">
        {icon}
        <span className="truncate text-xs font-semibold">{title}</span>
      </div>
      <div className="mt-1 flex items-center justify-between gap-2 text-[10px] opacity-80">
        <span className="truncate">{subtitle}</span>
        {riskScore >= 70 && <AlertTriangle className="h-3 w-3 text-red-600" />}
      </div>
    </div>
  );
}

function TraceStatusBadge({ status }: { status: RuntimeTrace["status"] }) {
  const className =
    status === "failed"
      ? "border-red-200 bg-red-50 text-red-700"
      : status === "completed"
        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
        : status === "partial"
          ? "border-amber-200 bg-amber-50 text-amber-700"
          : "border-blue-200 bg-blue-50 text-blue-700";
  const label =
    status === "failed" ? "mislukt" :
    status === "completed" ? "klaar" :
    status === "partial" ? "gedeeltelijk" :
    "actief";
  return <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${className}`}>{label}</span>;
}

function EventTypeBadge({ eventType }: { eventType: RuntimeEvent["eventType"] }) {
  const className =
    eventType === "error"
      ? "border-red-200 bg-red-50 text-red-700"
      : eventType.includes("worker")
        ? "border-blue-200 bg-blue-50 text-blue-700"
        : eventType.includes("hubspot")
          ? "border-orange-200 bg-orange-50 text-orange-700"
          : eventType === "api_write"
            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
            : "border-slate-200 bg-slate-50 text-slate-700";
  return <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${className}`}>{formatEventType(eventType)}</span>;
}

function formatEventType(eventType: RuntimeEvent["eventType"]): string {
  if (eventType === "error") return "fout";
  if (eventType.includes("worker_started")) return "automation gestart";
  if (eventType.includes("worker_finished")) return "automation klaar";
  if (eventType.includes("worker")) return "automation";
  if (eventType.includes("hubspot")) return "HubSpot wijziging";
  if (eventType === "api_write") return "state write";
  return eventType.replace(/_/g, " ");
}

function formatTransitionType(transitionType: RuntimeStateTransition["transitionType"]): string {
  if (transitionType === "property_change") return "property wijziging";
  if (transitionType === "dealstage_change") return "fase wijziging";
  return transitionType.replace(/_/g, " ");
}

function formatRelationshipType(type: RuntimeRelationshipType): string {
  if (type === "direct") return "direct";
  if (type === "derived") return "afgeleid";
  if (type === "cross-workflow") return "workflow-overstap";
  if (type === "temporal") return "tijdgestuurd";
  if (type === "observed") return "waargenomen";
  return type;
}

function eventLabel(event: RuntimeEvent, graphIndex: GraphIndex): string {
  const worker = event.workerId ? graphIndex.workerById.get(event.workerId) : null;
  const signal = event.signalId ? graphIndex.signalById.get(event.signalId) : null;
  if (worker) return worker.name;
  if (signal) return signal.name;
  if (event.propertyName) return `${event.propertyName}: ${event.oldValue ?? "-"} -> ${event.newValue ?? "-"}`;
  if (event.dealstageNew) return `Dealstage -> ${event.dealstageNew}`;
  if (event.hubspotObjectId) return `${event.hubspotObjectType ?? "HubSpot"} ${event.hubspotObjectId}`;
  return event.eventType;
}

function formatDateTime(value?: string | null): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("nl-NL", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function layoutWorkers(workers: RuntimeWorker[]): Map<string, { x: number; y: number }> {
  const byWorkflow = new Map<string, RuntimeWorker[]>();
  for (const worker of workers) {
    const key = worker.workflowGraphId ?? "unknown";
    byWorkflow.set(key, [...(byWorkflow.get(key) ?? []), worker]);
  }

  const positions = new Map<string, { x: number; y: number }>();
  [...byWorkflow.entries()].forEach(([, group], groupIndex) => {
    group.forEach((worker, index) => {
      positions.set(worker.id, {
        x: groupIndex * 380,
        y: index * 130,
      });
    });
  });
  return positions;
}

function layoutSignals(
  edges: RuntimeEdge[],
  workerPositions: Map<string, { x: number; y: number }>,
): Map<string, { x: number; y: number }> {
  const signalSources = new Map<string, Array<{ x: number; y: number }>>();
  for (const edge of edges) {
    if (!edge.emittedSignalId) continue;
    const source = workerPositions.get(edge.sourceWorkerId);
    const target = workerPositions.get(edge.targetWorkerId);
    if (!source || !target) continue;
    const list = signalSources.get(edge.emittedSignalId) ?? [];
    list.push({
      x: (source.x + target.x) / 2 + 110,
      y: (source.y + target.y) / 2 + 20,
    });
    signalSources.set(edge.emittedSignalId, list);
  }

  const positions = new Map<string, { x: number; y: number }>();
  for (const [signalId, coords] of signalSources.entries()) {
    positions.set(signalId, {
      x: coords.reduce((sum, item) => sum + item.x, 0) / coords.length,
      y: coords.reduce((sum, item) => sum + item.y, 0) / coords.length,
    });
  }
  return positions;
}

function edgeStyle(edge: RuntimeEdge, highlighted: boolean): CSSProperties {
  const observed = isObservedEdge(edge);
  const stroke =
    observed
      ? "#059669"
      : edge.relationshipType === "cross-workflow"
      ? "#7c3aed"
      : edge.relationshipType === "temporal"
        ? "#0891b2"
        : edge.relationshipType === "derived"
          ? "#64748b"
          : edge.riskScore >= 75
            ? "#dc2626"
            : "#2563eb";
  return {
    stroke,
    strokeWidth: observed ? Math.min(5, 2.2 + edge.observedCount * 0.35) : edge.relationshipType === "cross-workflow" ? 2.5 : 1.6,
    strokeDasharray:
      observed
        ? undefined
        : edge.relationshipType === "temporal"
        ? "8 6"
        : edge.relationshipType === "derived"
          ? "3 5"
          : "4 6",
    opacity: highlighted ? (observed ? 1 : 0.62) : 0.16,
  };
}

function isObservedEdge(edge: RuntimeEdge): boolean {
  return (
    edge.relationshipType === "observed" ||
    edge.relationshipOrigin === "observed_runtime_trace" ||
    edge.evidenceType === "observed_trace" ||
    edge.observedCount > 0
  );
}

function signalListFromMetadata(value: unknown, graphIndex: GraphIndex): RuntimeSignal[] {
  const values = Array.isArray(value) ? value.map(String) : [];
  const byName = new Map([...graphIndex.signalById.values()].map((signal) => [signal.name, signal]));
  return values
    .map((name) => byName.get(name))
    .filter((signal): signal is RuntimeSignal => Boolean(signal));
}

function pathFromEdge(edge: RuntimeEdge, graphIndex: GraphIndex): RuntimePropagationPath {
  const workers = [edge.sourceWorkerId, edge.targetWorkerId]
    .map((id) => graphIndex.workerById.get(id))
    .filter((worker): worker is RuntimeWorker => Boolean(worker));
  const signals = edge.emittedSignalId
    ? [graphIndex.signalById.get(edge.emittedSignalId)].filter((signal): signal is RuntimeSignal => Boolean(signal))
    : [];
  return {
    workers,
    edges: [edge],
    signals,
    depth: 1,
    confidenceScore: edge.confidenceScore,
    riskScore: edge.riskScore,
    fanOutScore: edge.fanOutScore,
    relationshipTypes: [edge.relationshipType],
    workflowGraphIds: edge.workflowGraphId ? [edge.workflowGraphId] : [],
  };
}

function idsFromPaths(paths: RuntimePropagationPath[]): Set<string> {
  return new Set(
    paths.flatMap((path) => [
      ...path.workers.map((worker) => worker.id),
      ...path.signals.map((signal) => signal.id),
      ...path.edges.map((edge) => edge.id),
    ]),
  );
}

function idsFromSignalImpact(impact: RuntimeSignalImpact): Set<string> {
  return new Set([
    impact.signal.id,
    ...impact.producers.map((worker) => worker.id),
    ...impact.consumers.map((worker) => worker.id),
    ...impact.directEdges.map((edge) => edge.id),
    ...impact.downstreamPaths.flatMap((path) => [
      ...path.workers.map((worker) => worker.id),
      ...path.signals.map((signal) => signal.id),
      ...path.edges.map((edge) => edge.id),
    ]),
  ]);
}

function idsFromTraceEvents(events: RuntimeEvent[], graph: RuntimeGraphSnapshot): Set<string> {
  const ids = new Set<string>();
  for (const event of events) {
    if (event.workerId) ids.add(event.workerId);
    if (event.signalId) ids.add(event.signalId);
  }
  const workerIds = new Set(events.map((event) => event.workerId).filter(Boolean));
  const signalIds = new Set(events.map((event) => event.signalId).filter(Boolean));
  for (const edge of graph.edges) {
    if (
      workerIds.has(edge.sourceWorkerId) ||
      workerIds.has(edge.targetWorkerId) ||
      (edge.emittedSignalId && signalIds.has(edge.emittedSignalId))
    ) {
      ids.add(edge.id);
    }
  }
  return ids;
}

function riskLevel(score: number): RuntimeRiskLevel {
  if (score >= 75) return "critical";
  if (score >= 50) return "high";
  if (score >= 25) return "medium";
  return "low";
}
