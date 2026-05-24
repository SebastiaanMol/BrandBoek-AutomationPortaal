import { describe, expect, it } from "vitest";
import { normalizeAutomationSteps } from "@/lib/automationSteps";

describe("normalizeAutomationSteps", () => {
  it("collapses repeated HubSpot branch actions into one readable step", () => {
    const result = normalizeAutomationSteps(
      [
        "Splits in 2 paden op basis van criteria",
        "Stel 'btw_2_maanden_geboekt_huidig_kwartaal' in",
        "Stel 'btw_2_maanden_geboekt_huidig_kwartaal' in",
        "Stel 'btw_2_maanden_geboekt_huidig_kwartaal' in",
        "Werk de volgende BTW-deal bij met de vorige-twee-maanden status",
        "Werk de volgende BTW-deal bij met de vorige-twee-maanden status",
        "Werk de volgende BTW-deal bij met de vorige-twee-maanden status",
      ],
      "hubspot",
    );

    expect(result).toEqual([
      "Splits in 2 paden op basis van criteria",
      "Stel 'btw_2_maanden_geboekt_huidig_kwartaal' in (3 paden)",
      "Werk de volgende BTW-deal bij met de vorige-twee-maanden status (3 paden)",
    ]);
  });

  it("keeps non-HubSpot steps untouched except for empty values", () => {
    const result = normalizeAutomationSteps(
      ["Ontvangt de request", "Ontvangt de request", "  "],
      "gitlab",
    );

    expect(result).toEqual(["Ontvangt de request", "Ontvangt de request"]);
  });
});
