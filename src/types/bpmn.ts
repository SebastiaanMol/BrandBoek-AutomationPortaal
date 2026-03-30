export type BpmnType = "startEvent" | "endEvent" | "task" | "exclusiveGateway";
export type TeamRole = "Marketing" | "Sales" | "Onboarding" | "Boekhouding" | "Management";
export type Phase =
  | "Lead/Intake"
  | "Sales"
  | "Onboarding"
  | "Boekhouding – Jaarrekening"
  | "Boekhouding – IB"
  | "Marketing/Relatie"
  | "Data hygiene / CRM";

export const PHASE_ORDER: Phase[] = [
  "Lead/Intake",
  "Sales",
  "Onboarding",
  "Boekhouding – Jaarrekening",
  "Boekhouding – IB",
  "Marketing/Relatie",
  "Data hygiene / CRM",
];

export interface GraphNode {
  id: string;
  original_automation_id: string | null;
  label: string;
  team_role: TeamRole;
  bpmn_type: BpmnType;
  lane: TeamRole;
  cluster: string;
  reasoning_role: string;
  phase: Phase;
}

export interface GraphFlow {
  id: string;
  from: string;
  to: string;
  type: "sequenceFlow";
  confidence: number;
  reasoning_flow: string;
  confirmed: boolean;
  rejected: boolean;
  db_id?: string;
}

export interface BpmnGraph {
  nodes: GraphNode[];
  flows: GraphFlow[];
}

export interface AiFlowRow {
  id: string;
  from_id: string;
  to_id: string;
  confidence: number;
  reasoning: string | null;
  cluster: string | null;
  confirmed: boolean;
  rejected: boolean;
  created_at: string;
}
