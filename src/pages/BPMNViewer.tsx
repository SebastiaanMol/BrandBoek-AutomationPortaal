import { useState, useMemo, useCallback } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useAutomatiseringen } from "@/lib/hooks";
import { StatusBadge, SystemBadge } from "@/components/Badges";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, LayoutGrid, FileText, X } from "lucide-react";
import { Automatisering } from "@/lib/types";
import { MermaidDiagram } from "@/components/MermaidDiagram";
import { ActivityNode, EventNode, GatewayNode, LaneHeaderNode } from "@/components/bpmn/BPMNNodes";
import { buildBPMNGraph, LaneGrouping } from "@/components/bpmn/buildBPMNGraph";

const nodeTypes = {
  activity: ActivityNode,
  event: EventNode,
  gateway: GatewayNode,
  laneHeader: LaneHeaderNode,
};

type ViewMode = "overzicht" | "individueel";

function BPMNOverview({ data, laneType }: { data: Automatisering[]; laneType: LaneGrouping }) {
  const { nodes: initialNodes, edges: initialEdges, width, height } = useMemo(
    () => buildBPMNGraph(data, laneType),
    [data, laneType]
  );

  const [nodes, , onNodesChange] = useNodesState(initialNodes);
  const [edges, , onEdgesChange] = useEdgesState(initialEdges);
  const [selected, setSelected] = useState<Automatisering | null>(null);

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      if (node.type !== "activity") return;
      const auto = data.find((a) => a.id === node.id);
      if (auto) setSelected(auto);
    },
    [data]
  );

  if (initialNodes.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        {laneType === "fase"
          ? "Geen automatiseringen met klantfasen gevonden."
          : "Geen automatiseringen beschikbaar."}
      </p>
    );
  }

  return (
    <div className="relative">
      <div
        className="bg-card border border-border rounded-[var(--radius-outer)] shadow-sm overflow-hidden"
        style={{ height: "calc(100vh - 200px)", minHeight: 500 }}
      >
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={onNodeClick}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.15 }}
          minZoom={0.2}
          maxZoom={2}
          proOptions={{ hideAttribution: true }}
        >
          <Background color="hsl(var(--border))" gap={20} size={1} />
          <Controls
            showInteractive={false}
            style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
          />
          <MiniMap
            nodeColor={(n) => {
              if (n.type === "activity") return "#fef9c3";
              if (n.type === "laneHeader") return "#e2e8f0";
              return "#f1f5f9";
            }}
            style={{ border: "1px solid hsl(var(--border))", borderRadius: 8 }}
          />
        </ReactFlow>
      </div>

      {/* Detail panel */}
      {selected && (
        <div className="absolute top-4 right-4 w-80 bg-card border border-border rounded-lg shadow-lg p-4 space-y-3 z-50">
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs text-muted-foreground">{selected.id}</span>
            <button onClick={() => setSelected(null)} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
          <h3 className="font-semibold text-sm">{selected.naam}</h3>
          <StatusBadge status={selected.status} />
          <div className="grid gap-2 text-xs">
            <div>
              <span className="text-muted-foreground">Trigger:</span>{" "}
              <span>{selected.trigger}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Owner:</span>{" "}
              <span>{selected.owner}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Systemen:</span>
              <div className="flex gap-1 flex-wrap mt-1">
                {selected.systemen.map((s) => (
                  <SystemBadge key={s} systeem={s} />
                ))}
              </div>
            </div>
            {selected.koppelingen.length > 0 && (
              <div>
                <span className="text-muted-foreground">Koppelingen:</span>
                <ul className="mt-1 space-y-0.5">
                  {selected.koppelingen.map((k) => (
                    <li key={k.doelId} className="text-muted-foreground">
                      → {k.doelId} {k.label && `(${k.label})`}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="mt-4 border-t border-border pt-4">
        <p className="label-uppercase mb-2">Legenda</p>
        <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span style={{ width: 16, height: 12, borderRadius: 3, background: "#fffde7", border: "2px solid #64748b", display: "inline-block" }} />
            Automatisering
          </span>
          <span className="flex items-center gap-1.5">→ Pijlen = directe koppelingen</span>
          <span>Lanes = {laneType === "categorie" ? "categorieën" : "klantfasen"}</span>
          <span>Klik op een node voor details</span>
        </div>
      </div>
    </div>
  );
}

export default function BPMNViewer() {
  const { data: allData, isLoading } = useAutomatiseringen();
  const [viewMode, setViewMode] = useState<ViewMode>("overzicht");
  const [selectedId, setSelectedId] = useState<string>("alle");
  const [laneType, setLaneType] = useState<LaneGrouping>("categorie");

  const data = allData || [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const individualItems =
    selectedId === "alle"
      ? data.filter((a) => a.mermaidDiagram)
      : data.filter((a) => a.id === selectedId && a.mermaidDiagram);

  return (
    <div className="space-y-6">
      {/* View mode tabs */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex gap-1 bg-secondary p-1 rounded-lg">
          <button
            onClick={() => setViewMode("overzicht")}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              viewMode === "overzicht"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <LayoutGrid className="h-4 w-4" />
            BPMN Overzicht
          </button>
          <button
            onClick={() => setViewMode("individueel")}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              viewMode === "individueel"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <FileText className="h-4 w-4" />
            Per automatisering
          </button>
        </div>

        {viewMode === "overzicht" && (
          <Select value={laneType} onValueChange={(v) => setLaneType(v as LaneGrouping)}>
            <SelectTrigger className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="categorie">Groeperen op categorie</SelectItem>
              <SelectItem value="fase">Groeperen op klantfase</SelectItem>
            </SelectContent>
          </Select>
        )}

        {viewMode === "individueel" && (
          <Select value={selectedId} onValueChange={setSelectedId}>
            <SelectTrigger className="w-80">
              <SelectValue placeholder="Selecteer automatisering" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="alle">Alle diagrammen</SelectItem>
              {data
                .filter((a) => a.mermaidDiagram)
                .map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.id} — {a.naam}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Overview mode — React Flow BPMN */}
      {viewMode === "overzicht" && <BPMNOverview data={data} laneType={laneType} />}

      {/* Individual mode — Mermaid diagrams */}
      {viewMode === "individueel" && (
        <>
          {individualItems.length === 0 && (
            <p className="text-muted-foreground text-sm">Geen diagrammen beschikbaar.</p>
          )}
          {individualItems.map((a) => (
            <div
              key={a.id}
              className="bg-card border border-border rounded-[var(--radius-outer)] shadow-sm p-6 space-y-4"
            >
              <div className="flex items-center gap-3 flex-wrap">
                <span className="font-mono text-xs text-muted-foreground">{a.id}</span>
                <h3 className="font-semibold text-foreground">{a.naam}</h3>
                <StatusBadge status={a.status} />
              </div>
              <div className="overflow-x-auto">
                <MermaidDiagram chart={a.mermaidDiagram} />
              </div>
              <div className="grid md:grid-cols-3 gap-4 pt-2 border-t border-border">
                <div>
                  <p className="label-uppercase mb-0.5">Trigger</p>
                  <p className="text-sm">{a.trigger}</p>
                </div>
                <div>
                  <p className="label-uppercase mb-0.5">Owner</p>
                  <p className="text-sm">{a.owner}</p>
                </div>
                <div>
                  <p className="label-uppercase mb-0.5">Systemen</p>
                  <div className="flex gap-1.5 flex-wrap">
                    {a.systemen.map((s) => (
                      <SystemBadge key={s} systeem={s} />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
