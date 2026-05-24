import { useMemo, useState } from "react";
import { Check, XCircle } from "lucide-react";
import { ReactFlow, Background, BackgroundVariant, Controls, MarkerType } from "@xyflow/react";
import type { Edge, Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { FlowSuggestie } from "@/lib/storage/automationLinks";
import type { FlowSuggestionGroup } from "@/lib/flowSuggestionGroups";
import { sourceRuntimeRoleLabel } from "@/lib/automationRoles";
import { evidenceFromSuggestion, type FlowEvidence } from "@/lib/flowEvidence";
import {
  useBevestigFlowSuggestie,
  useOngedaanBevestigFlowSuggestie,
  useOngedaanVerwerpFlowSuggestie,
  useVerwerpFlowSuggestie,
} from "@/lib/queryHooks/automationLinks";

const SOURCE_LABELS: Record<string, string> = {
  hubspot: "HubSpot",
  gitlab: "GitLab",
  custom: "Custom",
  manual: "Handmatig",
  import: "Import",
};

const SOURCE_STYLES: Record<string, string> = {
  hubspot: "bg-orange-50 text-orange-700",
  gitlab: "bg-purple-50 text-purple-700",
  custom: "bg-blue-50 text-blue-700",
  manual: "bg-slate-100 text-slate-700",
  import: "bg-slate-100 text-slate-700",
};

function formatSource(source?: string | null): string {
  if (!source) return "Onbekende bron";
  const normalized = source.toLowerCase();
  return SOURCE_LABELS[normalized] ?? source;
}

function SourceBadge({ source }: { source?: string | null }) {
  const normalized = source?.toLowerCase() ?? "";
  const cls = SOURCE_STYLES[normalized] ?? "bg-muted text-muted-foreground";
  return (
    <span className={`${cls} inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-semibold`}>
      {formatSource(source)}
    </span>
  );
}

function StepBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 px-1.5 text-[10px] font-bold text-primary">
      {children}
    </span>
  );
}

function RoleBadge({ source, categorie }: { source?: string | null; categorie?: string | null }) {
  return (
    <span className="inline-flex shrink-0 items-center rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
      {sourceRuntimeRoleLabel(source, categorie)}
    </span>
  );
}

function getStepLabels(group: FlowSuggestionGroup): Map<string, string> {
  return new Map(group.nodes.map((node, index) => [node.id, String(index + 1)]));
}

function edgeId(suggestion: FlowSuggestie): string {
  return `${suggestion.fromId}__${suggestion.toId}`;
}

function evidenceColor(level: FlowEvidence["level"]): string {
  if (level === "confirmed") return "rgb(22 163 74)";
  if (level === "hard") return "rgb(37 99 235)";
  if (level === "strong") return "rgb(79 70 229)";
  if (level === "weak") return "rgb(234 179 8)";
  return "rgb(148 163 184)";
}

function layoutSuggestionNodes(group: FlowSuggestionGroup): Record<string, { x: number; y: number }> {
  const nodeIds = group.nodes.map((node) => node.id);
  const incoming = new Map(nodeIds.map((id) => [id, [] as string[]]));

  for (const suggestion of group.suggestions) {
    incoming.get(suggestion.toId)?.push(suggestion.fromId);
  }

  const level = new Map<string, number>();
  const visiting = new Set<string>();
  const visit = (id: string): number => {
    const cached = level.get(id);
    if (cached !== undefined) return cached;
    if (visiting.has(id)) {
      level.set(id, 0);
      return 0;
    }
    visiting.add(id);
    const sources = incoming.get(id) ?? [];
    const nextLevel = sources.length === 0 ? 0 : Math.max(...sources.map(visit)) + 1;
    visiting.delete(id);
    level.set(id, nextLevel);
    return nextLevel;
  };

  nodeIds.forEach(visit);

  const byLevel = new Map<number, string[]>();
  for (const node of group.nodes) {
    const nodeLevel = level.get(node.id) ?? 0;
    const ids = byLevel.get(nodeLevel) ?? [];
    ids.push(node.id);
    byLevel.set(nodeLevel, ids);
  }

  const colWidth = 340;
  const rowHeight = 130;
  const positions: Record<string, { x: number; y: number }> = {};
  for (const [nodeLevel, ids] of byLevel.entries()) {
    const colX = nodeLevel * colWidth;
    const totalHeight = (ids.length - 1) * rowHeight;
    ids.forEach((id, index) => {
      positions[id] = { x: colX, y: index * rowHeight - totalHeight / 2 };
    });
  }

  return positions;
}

function buildSuggestionGraph(
  group: FlowSuggestionGroup,
  selectedEdgeId: string,
): { nodes: Node[]; edges: Edge[] } {
  const positions = layoutSuggestionNodes(group);
  const stepLabels = getStepLabels(group);
  const selectedSuggestion = group.suggestions.find((suggestion) => edgeId(suggestion) === selectedEdgeId);
  const selectedNodeIds = new Set(
    selectedSuggestion ? [selectedSuggestion.fromId, selectedSuggestion.toId] : [],
  );

  const nodes: Node[] = group.nodes.map((node) => {
    const isSelected = selectedNodeIds.has(node.id);
    return {
      id: node.id,
      position: positions[node.id] ?? { x: 0, y: 0 },
      data: {
        label: (
          <div className="w-[220px] text-left">
            <div className="mb-2 flex items-center gap-1.5">
              <StepBadge>{stepLabels.get(node.id) ?? "?"}</StepBadge>
              <SourceBadge source={node.source} />
              <RoleBadge source={node.source} categorie={node.categorie} />
            </div>
            <p className="line-clamp-2 text-xs font-semibold leading-snug text-foreground">{node.naam}</p>
          </div>
        ),
      },
      style: {
        width: 244,
        borderRadius: 12,
        border: isSelected ? "2px solid rgb(79 70 229)" : "1px solid hsl(var(--border))",
        background: "hsl(var(--background))",
        boxShadow: isSelected ? "0 10px 24px rgb(79 70 229 / 0.16)" : "0 1px 2px rgb(15 23 42 / 0.05)",
        padding: 10,
      },
    };
  });

  const edges: Edge[] = group.suggestions.map((suggestion) => {
    const id = edgeId(suggestion);
    const selected = id === selectedEdgeId;
    const evidence = evidenceFromSuggestion(suggestion);
    const color = suggestion.rejected ? "rgb(148 163 184)" : evidenceColor(evidence.level);

    return {
      id,
      source: suggestion.fromId,
      target: suggestion.toId,
      type: "smoothstep",
      animated: selected && !suggestion.rejected,
      label: suggestion.rejected ? "Verworpen" : evidence.label,
      markerEnd: { type: MarkerType.ArrowClosed, color },
      style: {
        stroke: color,
        strokeWidth: selected ? 3 : 2,
        opacity: suggestion.rejected ? 0.45 : 1,
      },
      labelStyle: { fontSize: 11, fill: color, fontWeight: 700 },
      labelBgStyle: { fill: "hsl(var(--background))" },
      labelBgPadding: [6, 3] as [number, number],
      labelBgBorderRadius: 6,
    };
  });

  return { nodes, edges };
}

function FlowEndpoint({ label, name, source }: { label: string; name: string; source: string | null }) {
  return (
    <div className="rounded-lg bg-background p-2">
      <div className="mb-1 flex items-center gap-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
        <SourceBadge source={source} />
      </div>
      <p className="text-sm font-semibold leading-snug text-foreground">{name}</p>
    </div>
  );
}

function SuggestionPanel({
  suggestie: s,
  fromStep,
  toStep,
  anyPending,
  onBevestig,
  onVerwerp,
  onOngedaanBevestig,
  onOngedaanVerwerp,
}: {
  suggestie: FlowSuggestie;
  fromStep: string;
  toStep: string;
  anyPending: boolean;
  onBevestig: ReturnType<typeof useBevestigFlowSuggestie>;
  onVerwerp: ReturnType<typeof useVerwerpFlowSuggestie>;
  onOngedaanBevestig: ReturnType<typeof useOngedaanBevestigFlowSuggestie>;
  onOngedaanVerwerp: ReturnType<typeof useOngedaanVerwerpFlowSuggestie>;
}) {
  const evidence = evidenceFromSuggestion(s);

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Geselecteerde automation-overgang</p>
        <div className="rounded-xl border border-border bg-muted/20 p-3">
          <div className="mb-3 inline-flex h-7 items-center rounded-full bg-primary/10 px-2.5 text-xs font-bold text-primary">
            {fromStep} → {toStep}
          </div>
          <div className="space-y-3">
            <FlowEndpoint label="Van" name={s.fromNaam} source={s.fromSource} />
            <div className="flex justify-center text-muted-foreground">↓</div>
            <FlowEndpoint label="Naar" name={s.toNaam} source={s.toSource} />
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border p-3">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Bewijs voor deze overgang
          </p>
          <EvidenceBadge evidence={evidence} />
          <span className="text-[10px] font-semibold text-muted-foreground">
            {evidence.score}% zekerheid
          </span>
        </div>
        <p className="text-sm leading-relaxed text-foreground">
          {evidence.reason}
        </p>
      </div>

      {s.confirmed ? (
        <div className="space-y-2">
          <div className="inline-flex h-9 items-center gap-2 rounded-full bg-green-100 px-3 text-sm font-semibold text-green-700">
            <span className="inline-flex size-5 items-center justify-center rounded-full bg-green-600 text-white ring-2 ring-white">
              <Check className="h-3.5 w-3.5 stroke-[3]" />
            </span>
            Geselecteerd
          </div>
          <Button
            variant="outline"
            className="w-full border-green-200 text-green-700 hover:bg-green-50"
            disabled={anyPending}
            onClick={() =>
              onOngedaanBevestig.mutate(
                { fromId: s.fromId, toId: s.toId },
                { onError: (e) => toast.error(e instanceof Error ? e.message : "Ongedaan maken mislukt") },
              )
            }
          >
            Ongedaan maken
          </Button>
        </div>
      ) : s.rejected ? (
        <div className="space-y-2">
          <div className="inline-flex h-9 items-center gap-2 rounded-full bg-red-100 px-3 text-sm font-semibold text-red-700">
            <XCircle className="h-4 w-4" />
            Verworpen
          </div>
          <Button
            variant="outline"
            className="w-full"
            disabled={anyPending}
            onClick={() =>
              onOngedaanVerwerp.mutate(
                { fromId: s.fromId, toId: s.toId },
                { onError: (e) => toast.error(e instanceof Error ? e.message : "Ongedaan maken mislukt") },
              )
            }
          >
            Terugzetten
          </Button>
        </div>
      ) : (
        <div className="grid gap-2">
          <Button
            className="bg-green-600 text-white hover:bg-green-700"
            disabled={anyPending}
            onClick={() =>
              onBevestig.mutate(
                { fromId: s.fromId, toId: s.toId },
                {
                  onSuccess: () => toast.success("Koppeling geselecteerd"),
                  onError: (e) => toast.error(e instanceof Error ? e.message : "Selecteren mislukt"),
                },
              )
            }
          >
            Selecteer overgang
          </Button>
          <Button
            variant="outline"
            disabled={anyPending}
            onClick={() =>
              onVerwerp.mutate(
                { fromId: s.fromId, toId: s.toId },
                { onError: (e) => toast.error(e instanceof Error ? e.message : "Verwerpen mislukt") },
              )
            }
          >
            Verwerp
          </Button>
        </div>
      )}
    </div>
  );
}

function EvidenceBadge({ evidence }: { evidence: FlowEvidence }) {
  const className =
    evidence.level === "confirmed"
      ? "bg-green-100 text-green-700"
      : evidence.level === "hard"
        ? "bg-blue-100 text-blue-700"
        : evidence.level === "strong"
          ? "bg-indigo-100 text-indigo-700"
          : evidence.level === "weak"
            ? "bg-yellow-100 text-yellow-800"
            : "bg-slate-100 text-slate-700";

  return (
    <span className={`${className} inline-flex shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold`}>
      {evidence.label}
    </span>
  );
}

export function FlowSuggestionVisualReview({
  group,
  footer,
}: {
  group: FlowSuggestionGroup;
  footer?: React.ReactNode;
}) {
  const bevestig = useBevestigFlowSuggestie();
  const verwerp = useVerwerpFlowSuggestie();
  const ongedaanBevestig = useOngedaanBevestigFlowSuggestie();
  const ongedaanVerwerp = useOngedaanVerwerpFlowSuggestie();
  const [selectedEdgeId, setSelectedEdgeId] = useState(() => {
    const firstActionable = group.suggestions.find((s) => !s.rejected) ?? group.suggestions[0];
    return firstActionable ? edgeId(firstActionable) : "";
  });
  const selectedSuggestion =
    group.suggestions.find((suggestion) => edgeId(suggestion) === selectedEdgeId) ?? group.suggestions[0];
  const anyPending =
    bevestig.isPending ||
    verwerp.isPending ||
    ongedaanBevestig.isPending ||
    ongedaanVerwerp.isPending;
  const stepLabels = getStepLabels(group);
  const { nodes, edges } = useMemo(
    () => buildSuggestionGraph(group, selectedEdgeId),
    [group, selectedEdgeId],
  );

  return (
    <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_auto] rounded-2xl border border-border bg-card shadow-sm">
      <div className="border-b border-border bg-muted/20 px-5 py-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Flow = automation-keten
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Selecteer alleen de overgangen tussen automations. De binnenkant van een GitLab backend worker staat in de automation funnel.
        </p>
      </div>
      <div className="grid min-h-0 gap-0 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-h-[520px] border-b border-border bg-[hsl(var(--surface-sunken))] lg:border-b-0 lg:border-r">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onEdgeClick={(_, edge) => setSelectedEdgeId(edge.id)}
            fitView
            fitViewOptions={{ padding: 0.22 }}
            proOptions={{ hideAttribution: true }}
            minZoom={0.2}
            maxZoom={1.6}
          >
            <Background
              variant={BackgroundVariant.Dots}
              gap={20}
              size={1.2}
              color="hsl(var(--grid-dot))"
            />
            <Controls
              showInteractive={false}
              className="!overflow-hidden !rounded-lg !border !border-border !shadow-sm"
            />
          </ReactFlow>
        </div>

        <aside className="min-h-0 overflow-y-auto bg-background p-4">
          {selectedSuggestion ? (
            <SuggestionPanel
              suggestie={selectedSuggestion}
              fromStep={stepLabels.get(selectedSuggestion.fromId) ?? "?"}
              toStep={stepLabels.get(selectedSuggestion.toId) ?? "?"}
              anyPending={anyPending}
              onBevestig={bevestig}
              onVerwerp={verwerp}
              onOngedaanBevestig={ongedaanBevestig}
              onOngedaanVerwerp={ongedaanVerwerp}
            />
          ) : (
            <p className="text-sm text-muted-foreground">Selecteer een lijn in de flow.</p>
          )}
        </aside>
      </div>
      {footer && <div className="border-t border-border bg-muted/20 px-5 py-3">{footer}</div>}
    </div>
  );
}
