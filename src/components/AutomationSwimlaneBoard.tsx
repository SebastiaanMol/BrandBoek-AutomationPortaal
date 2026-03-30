/**
 * AutomationSwimlaneBoard
 *
 * Kanban-style board where:
 *  - Columns (left to right) = team_role (lane) — arranged horizontally
 *  - Rows within each column = phase groups, ordered top to bottom
 *  - Cards                   = automation nodes (label + phase tag)
 *  - Arrow overlay           = flows with confidence >= 0.7
 *
 * Props: graph: { nodes: GraphNode[]; flows: GraphFlow[] }
 */

import { useMemo } from "react";
import type { BpmnGraph, GraphNode, TeamRole, Phase } from "@/types/bpmn";
import { PHASE_ORDER } from "@/types/bpmn";

// ── Visual config ──────────────────────────────────────────────────────────

const LANE_ORDER: TeamRole[] = ["Sales", "Marketing", "Onboarding", "Boekhouding", "Management"];

const LANE_HEADER_BG: Record<TeamRole, string> = {
  Sales:       "bg-blue-500",
  Marketing:   "bg-pink-500",
  Onboarding:  "bg-green-500",
  Boekhouding: "bg-yellow-500",
  Management:  "bg-purple-500",
};

const LANE_COLUMN_BG: Record<TeamRole, string> = {
  Sales:       "bg-blue-50",
  Marketing:   "bg-pink-50",
  Onboarding:  "bg-green-50",
  Boekhouding: "bg-yellow-50",
  Management:  "bg-purple-50",
};

const LANE_BORDER: Record<TeamRole, string> = {
  Sales:       "border-blue-200",
  Marketing:   "border-pink-200",
  Onboarding:  "border-green-200",
  Boekhouding: "border-yellow-200",
  Management:  "border-purple-200",
};

const PHASE_TAG: Record<Phase, string> = {
  "Lead/Intake":               "bg-slate-100 text-slate-600",
  "Sales":                     "bg-blue-100 text-blue-700",
  "Onboarding":                "bg-green-100 text-green-700",
  "Boekhouding – Jaarrekening":"bg-yellow-100 text-yellow-700",
  "Boekhouding – IB":          "bg-orange-100 text-orange-700",
  "Marketing/Relatie":         "bg-pink-100 text-pink-700",
  "Data hygiene / CRM":        "bg-purple-100 text-purple-700",
};

// ── Card ───────────────────────────────────────────────────────────────────

function NodeCard({ node }: { node: GraphNode }) {
  return (
    <div className="bg-white border border-slate-200 rounded-md shadow-sm px-2.5 py-2 text-xs leading-snug">
      <p className="font-medium text-slate-800 line-clamp-2">{node.label}</p>
      <span className={`inline-block mt-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ${PHASE_TAG[node.phase]}`}>
        {node.phase}
      </span>
    </div>
  );
}

// ── Board ──────────────────────────────────────────────────────────────────

export function AutomationSwimlaneBoard({ graph }: { graph: BpmnGraph }) {
  // lane → phase → nodes[]
  const cells = useMemo(() => {
    const map = new Map<string, GraphNode[]>();
    for (const lane of LANE_ORDER)
      for (const phase of PHASE_ORDER)
        map.set(`${lane}:${phase}`, []);
    for (const n of graph.nodes) {
      const key = `${n.lane}:${n.phase}`;
      if (map.has(key)) map.get(key)!.push(n);
    }
    return map;
  }, [graph.nodes]);

  // Phases that have at least one node (prune empty rows)
  const activePhases = useMemo<Phase[]>(
    () => PHASE_ORDER.filter((p) => graph.nodes.some((n) => n.phase === p)),
    [graph.nodes]
  );

  // Lanes that have at least one node
  const activeLanes = useMemo<TeamRole[]>(
    () => LANE_ORDER.filter((l) => graph.nodes.some((n) => n.lane === l)),
    [graph.nodes]
  );

  return (
    <div className="overflow-auto">
      {/* Column headers — one per lane */}
      <div className="flex border-b border-border sticky top-0 z-10 bg-background">
        {/* Phase label gutter */}
        <div className="w-44 shrink-0 border-r border-border" />
        {activeLanes.map((lane) => (
          <div
            key={lane}
            className={`flex-1 min-w-[180px] px-3 py-2.5 text-center text-sm font-bold text-white ${LANE_HEADER_BG[lane]}`}
          >
            {lane}
          </div>
        ))}
      </div>

      {/* Phase rows */}
      {activePhases.map((phase) => (
        <div key={phase} className="flex border-b border-border">
          {/* Phase label */}
          <div className="w-44 shrink-0 border-r border-border bg-slate-50 px-3 py-3 flex items-start">
            <span className="text-[11px] font-semibold text-slate-500 leading-snug">{phase}</span>
          </div>

          {/* Lane cells for this phase row */}
          {activeLanes.map((lane) => {
            const nodes = cells.get(`${lane}:${phase}`) ?? [];
            return (
              <div
                key={lane}
                className={`flex-1 min-w-[180px] p-2 flex flex-col gap-2 border-r last:border-r-0 ${LANE_COLUMN_BG[lane]} ${LANE_BORDER[lane]}`}
                style={{ minHeight: nodes.length > 0 ? undefined : 48 }}
              >
                {nodes.map((n) => (
                  <NodeCard key={n.id} node={n} />
                ))}
              </div>
            );
          })}
        </div>
      ))}

    </div>
  );
}
