import type { Pipeline } from "@/lib/types";

export type TeamKey = "marketing" | "sales" | "onboarding" | "boekhouding" | "management";

export interface ProcessStep {
  id: string;
  label: string;
  team: TeamKey;
  column: number;
  row?: number;          // vertical row within lane (0 = top, 1 = second, …)
  description?: string;
  type?: "task" | "start" | "end" | "decision";
}

export interface Automation {
  id: string;
  name: string;
  team: TeamKey;
  tool: string;
  goal: string;
  link?: string;
  fromStepId?: string;  // step this automation sits ON (for dot position)
  toStepId?: string;    // step this automation sits ON (for dot position)
}

export interface Connection {
  id: string;
  fromStepId?: string;        // step-to-step edge
  fromAutomationId?: string;  // branch edge (automation → step)
  toStepId: string;
  label?: string;             // text label on the edge
}

export interface ProcessState {
  steps: ProcessStep[];
  connections: Connection[];
  automations: Automation[];
}

export const TEAM_CONFIG: Record<TeamKey, {
  label: string;
  bg: string;
  stroke: string;
  text: string;
  dot: string;
}> = {
  marketing:   { label: "Marketing",   bg: "hsl(280 60% 97%)", stroke: "hsl(280 60% 52%)", text: "hsl(280 50% 32%)", dot: "hsl(280 55% 58%)" },
  sales:       { label: "Sales",       bg: "hsl(215 80% 97%)", stroke: "hsl(215 80% 50%)", text: "hsl(215 70% 32%)", dot: "hsl(215 75% 55%)" },
  onboarding:  { label: "Onboarding",  bg: "hsl(165 60% 97%)", stroke: "hsl(165 55% 40%)", text: "hsl(165 55% 24%)", dot: "hsl(165 50% 44%)" },
  boekhouding: { label: "Boekhouding", bg: "hsl(35  85% 97%)", stroke: "hsl(35  85% 50%)", text: "hsl(35  75% 28%)", dot: "hsl(35  80% 55%)" },
  management:  { label: "Management",  bg: "hsl(350 65% 97%)", stroke: "hsl(350 65% 52%)", text: "hsl(350 55% 32%)", dot: "hsl(350 60% 56%)" },
};

export const TEAM_ORDER: TeamKey[] = [
  "marketing", "sales", "onboarding", "boekhouding", "management",
];

export const initialState: ProcessState = {
  steps: [
    // Event markers
    { id: "ev-start", type: "start", label: "Start", team: "marketing",  column: 0 },
    { id: "ev-end",   type: "end",   label: "Einde", team: "management", column: 8 },
    // Marketing (columns shifted +1 to make room for start event)
    { id: "s1",  label: "Lead generatie",    team: "marketing",   column: 1 },
    { id: "s2",  label: "Lead nurturing",    team: "marketing",   column: 2 },
    { id: "s3",  label: "MQL handoff",       team: "marketing",   column: 3 },
    // Sales
    { id: "s4",  label: "Intake gesprek",    team: "sales",       column: 3 },
    { id: "s5",  label: "Offerte",           team: "sales",       column: 4 },
    { id: "s6",  label: "Deal sluiten",      team: "sales",       column: 5 },
    // Onboarding
    { id: "s7",  label: "Welkom e-mail",     team: "onboarding",  column: 5 },
    { id: "s8",  label: "Onboarding call",   team: "onboarding",  column: 6 },
    // Boekhouding
    { id: "s9",  label: "Factuur aanmaken",  team: "boekhouding", column: 6 },
    { id: "s10", label: "Betaling verwerken",team: "boekhouding", column: 7 },
    // Management
    { id: "s11", label: "Strategie plan",    team: "management",  column: 1 },
    { id: "s12", label: "Pipeline review",   team: "management",  column: 4 },
    { id: "s13", label: "Rapportage",        team: "management",  column: 7 },
  ],
  connections: [
    // Marketing flow
    { id: "c1",  fromStepId: "s1",  toStepId: "s2"  },
    { id: "c2",  fromStepId: "s2",  toStepId: "s3"  },
    // Marketing → Sales handoff (same column, vertical)
    { id: "c3",  fromStepId: "s3",  toStepId: "s4"  },
    // Sales flow
    { id: "c4",  fromStepId: "s4",  toStepId: "s5"  },
    { id: "c5",  fromStepId: "s5",  toStepId: "s6"  },
    // Sales → Onboarding (same column, vertical)
    { id: "c6",  fromStepId: "s6",  toStepId: "s7"  },
    // Onboarding flow
    { id: "c7",  fromStepId: "s7",  toStepId: "s8"  },
    // Onboarding → Boekhouding (same column, vertical)
    { id: "c8",  fromStepId: "s8",  toStepId: "s9"  },
    // Boekhouding flow
    { id: "c9",  fromStepId: "s9",  toStepId: "s10" },
    // Management flow
    { id: "c10", fromStepId: "s11", toStepId: "s12" },
    { id: "c11", fromStepId: "s12", toStepId: "s13" },
    // Cross-lane diagonals
    { id: "c12", fromStepId: "s1",  toStepId: "s11" },
    { id: "c13", fromStepId: "s5",  toStepId: "s12" },
    { id: "c14", fromStepId: "s10", toStepId: "s13" },
  ],
  automations: [],
};

/** Convert a pipeline's HubSpot stages into a ProcessState with sequential steps in the sales lane. */
export function stagesToProcessState(pipeline: Pipeline): ProcessState {
  const sorted = [...pipeline.stages].sort((a, b) => a.display_order - b.display_order);
  const steps: ProcessStep[] = sorted.map((stage, i) => ({
    id:     `stage-${stage.stage_id}`,
    label:  stage.label,
    team:   "sales",
    column: i + 1,
    row:    0,
    type:   "task",
  }));
  const connections: Connection[] = steps.slice(0, -1).map((step, i) => ({
    id:         `stage-conn-${i}`,
    fromStepId: step.id,
    toStepId:   steps[i + 1].id,
  }));
  return { steps, connections, automations: [] };
}
