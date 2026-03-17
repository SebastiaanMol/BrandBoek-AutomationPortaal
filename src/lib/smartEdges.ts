import { Automatisering, Systeem } from "./types";

export type EdgeType = "explicit" | "shared_system" | "trigger_match" | "shared_owner";

export interface SmartEdge {
  sourceId: string;
  targetId: string;
  type: EdgeType;
  label: string;
}

// Common keywords to match between trigger/stappen
const KEYWORDS = [
  "deal", "lead", "contact", "stage", "pipeline", "e-mail", "email", "mail",
  "webhook", "api", "formulier", "form", "klant", "customer", "rapport",
  "report", "notificatie", "notification", "betaling", "payment", "factuur",
  "invoice", "ticket", "taak", "task", "meeting", "sync", "import", "export",
  "workflow", "script", "cron", "onboarding", "welkom", "offerte", "quote",
  "slack", "sharepoint", "csv", "data", "campaign", "campagne",
];

function extractKeywords(text: string): Set<string> {
  const lower = text.toLowerCase();
  const found = new Set<string>();
  for (const kw of KEYWORDS) {
    if (lower.includes(kw)) found.add(kw);
  }
  return found;
}

function getAutoText(a: Automatisering): string {
  return [a.trigger, a.doel, ...(a.stappen || [])].join(" ");
}

export function computeSmartEdges(automatiseringen: Automatisering[]): SmartEdge[] {
  const edges: SmartEdge[] = [];
  const seen = new Set<string>();

  const addEdge = (e: SmartEdge) => {
    const key = `${e.sourceId}-${e.targetId}-${e.type}`;
    const reverseKey = `${e.targetId}-${e.sourceId}-${e.type}`;
    if (!seen.has(key) && !seen.has(reverseKey)) {
      seen.add(key);
      edges.push(e);
    }
  };

  for (let i = 0; i < automatiseringen.length; i++) {
    const a = automatiseringen[i];

    // 1. Explicit koppelingen
    for (const k of a.koppelingen || []) {
      addEdge({
        sourceId: a.id,
        targetId: k.doelId,
        type: "explicit",
        label: k.label || "Expliciete koppeling",
      });
    }

    for (let j = i + 1; j < automatiseringen.length; j++) {
      const b = automatiseringen[j];

      // 2. Shared systems
      const sharedSystems = a.systemen.filter((s) => b.systemen.includes(s));
      if (sharedSystems.length > 0) {
        addEdge({
          sourceId: a.id,
          targetId: b.id,
          type: "shared_system",
          label: `Gedeeld: ${sharedSystems.join(", ")}`,
        });
      }

      // 3. Trigger keyword match
      const kwA = extractKeywords(getAutoText(a));
      const kwB = extractKeywords(getAutoText(b));
      const shared = [...kwA].filter((k) => kwB.has(k));
      if (shared.length >= 2) {
        addEdge({
          sourceId: a.id,
          targetId: b.id,
          type: "trigger_match",
          label: `Match: ${shared.slice(0, 3).join(", ")}`,
        });
      }

      // 4. Shared owner
      if (a.owner && b.owner && a.owner.toLowerCase() === b.owner.toLowerCase()) {
        addEdge({
          sourceId: a.id,
          targetId: b.id,
          type: "shared_owner",
          label: `Owner: ${a.owner}`,
        });
      }
    }
  }

  return edges;
}

export function countConnections(autoId: string, edges: SmartEdge[]): number {
  return edges.filter((e) => e.sourceId === autoId || e.targetId === autoId).length;
}
