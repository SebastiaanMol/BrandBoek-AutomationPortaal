import type { Automatisering } from "@/lib/types";

export function displayAutomationName(automation: Automatisering): string {
  const baseName = automation.naam.replace(/\s+\((GET|POST|PUT|PATCH|DELETE)\s+\/[^)]*\)$/i, "");
  const text = `${baseName} ${automation.gitlabEndpoint?.handler ?? ""}`.toLowerCase();

  if (text.includes("next quarter") && text.includes("prev2m")) {
    return "Volgend BTW-kwartaal bijwerken";
  }

  if (text.includes("wefact") || text.includes("debtor") || text.includes("debiteur")) {
    return "WeFact debiteur bijwerken";
  }
  if (text.includes("lead")) return "Lead verwerken";
  if (text.includes("contact")) return "Contactgegevens bijwerken";
  if (text.includes("dossier")) return "Dossier bijwerken";
  if (text.includes("stage") || text.includes("fase")) return "Procesfase bepalen";

  return baseName;
}
