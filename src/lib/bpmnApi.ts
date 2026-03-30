import { supabase } from "@/integrations/supabase/client";
import type { BpmnGraph, GraphNode, GraphFlow, AiFlowRow, BpmnType, TeamRole, Phase } from "@/types/bpmn";
import { PHASE_ORDER } from "@/types/bpmn";

// ── Fetch ──────────────────────────────────────────────────────────────────

export async function fetchBpmnData(): Promise<{
  automations: any[];
  aiFlows: AiFlowRow[];
}> {
  const [{ data: automations, error: e1 }, { data: aiFlows, error: e2 }] =
    await Promise.all([
      supabase
        .from("automatiseringen")
        .select("id, naam, bpmn_type, bpmn_cluster, team_role, phase")
        .eq("source", "hubspot"),
      supabase.from("automatisering_ai_flows").select("*"),
    ]);
  if (e1) throw e1;
  if (e2) throw e2;
  return { automations: automations ?? [], aiFlows: aiFlows ?? [] };
}

// ── Save / Review ──────────────────────────────────────────────────────────

export async function reviewAiFlow(
  id: string,
  action: "confirm" | "reject"
): Promise<void> {
  const { error } = await supabase
    .from("automatisering_ai_flows")
    .update({ confirmed: action === "confirm", rejected: action === "reject" })
    .eq("id", id);
  if (error) throw error;
}

// ── Graph builder ──────────────────────────────────────────────────────────

export function buildBpmnGraph(
  automations: any[],
  aiFlows: AiFlowRow[]
): BpmnGraph {
  // Map DB rows to GraphNodes
  const nodeMap = new Map<string, GraphNode>();
  for (const a of automations) {
    const role = (a.team_role as TeamRole) ?? inferTeamRole(a.naam ?? "");
    const cluster = a.bpmn_cluster ?? "Overig";
    nodeMap.set(`node-${a.id}`, {
      id: `node-${a.id}`,
      original_automation_id: a.id,
      label: a.naam ?? a.id,
      team_role: role,
      bpmn_type: "task" as BpmnType,
      lane: role,
      cluster,
      reasoning_role: "",
      phase: (a.phase as Phase) ?? inferPhase(a.naam ?? "", cluster),
    });
  }

  // Build flows (skip rejected; enforce forward-only phase direction)
  const flows: GraphFlow[] = aiFlows
    .filter((f) => !f.rejected)
    .map((f) => ({
      id: `flow-${f.id}`,
      from: `node-${f.from_id}`,
      to: `node-${f.to_id}`,
      type: "sequenceFlow" as const,
      confidence: f.confidence,
      reasoning_flow: f.reasoning ?? "",
      confirmed: f.confirmed,
      rejected: f.rejected,
      db_id: f.id,
    }))
    .filter((f) => {
      const fromNode = nodeMap.get(f.from);
      const toNode = nodeMap.get(f.to);
      if (!fromNode || !toNode) return false;
      // Only allow same or later phase (no backward arrows)
      return PHASE_ORDER.indexOf(fromNode.phase) <= PHASE_ORDER.indexOf(toNode.phase);
    });

  return { nodes: Array.from(nodeMap.values()), flows };
}

function inferPhase(naam: string, cluster: string): Phase {
  const c = cluster.toLowerCase();
  const n = naam.toLowerCase();
  if (c.includes("ib aangifte") || c.includes("ib ")) return "Boekhouding – IB";
  if (c.includes("jaarrekening")) return "Boekhouding – Jaarrekening";
  if (c.includes("onboarding") || c.includes("klantportaal")) return "Onboarding";
  if (c.includes("marketing") || /nieuwsbrief/.test(n)) return "Marketing/Relatie";
  if (c.includes("lead capture") || c.includes("intake formulieren")) return "Lead/Intake";
  if (c.includes("contact deal") || c.includes("dataverrijking")) return "Sales";
  if (c.includes("crm") || c.includes("databeheer")) return "Data hygiene / CRM";
  // keyword fallback on naam
  if (/offerte|follow.?up|deal|intake|typeform/.test(n)) return "Sales";
  if (/onboarding|portaal/.test(n)) return "Onboarding";
  if (/jaarrekening|jaarklant|machtiging|bank/.test(n)) return "Boekhouding – Jaarrekening";
  if (/ib |inkomsten|btw/.test(n)) return "Boekhouding – IB";
  if (/nieuwsbrief|marketing/.test(n)) return "Marketing/Relatie";
  if (/lead|nieuw contact/.test(n)) return "Lead/Intake";
  return "Data hygiene / CRM";
}

function inferTeamRole(naam: string): TeamRole {
  const t = naam.toLowerCase();
  if (/jaarrekening|jaarklant|jren|ib |inkomsten|btw|machtiging|bank/.test(t))
    return "Boekhouding";
  if (/nieuwsbrief|marketing/.test(t)) return "Marketing";
  if (/onboarding|portaal|typeform/.test(t)) return "Onboarding";
  if (/intake|offerte|sales|follow|lead|deal/.test(t)) return "Sales";
  return "Management";
}
