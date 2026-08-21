import { describe, expect, it } from "vitest";

import { formatSyncApplyToast, formatSyncPreviewImportedToast } from "@/lib/syncReviewToast";

describe("formatSyncApplyToast", () => {
  it("mentions newly created automations separately from updated changes and skipped items", () => {
    expect(formatSyncApplyToast({
      inserted: 2,
      updated: 1,
      skipped: 1,
      applied: 3,
      failed: 0,
    })).toBe("Sync toegepast - 2 nieuwe automations aangemaakt, 1 wijziging bijgewerkt, 1 overgeslagen");
  });

  it("falls back to selected count when the apply result has no detailed counters", () => {
    expect(formatSyncApplyToast({}, 2)).toBe("Sync toegepast - 2 wijzigingen toegepast");
  });

  it("mentions deactivated and failed items explicitly", () => {
    expect(formatSyncApplyToast({
      inserted: 1,
      deactivated: 2,
      failed: 1,
      applied: 3,
      failedItems: [{
        id: "change-1",
        title: "Deal aanmaken",
        externalId: "app/API/deals.py::POST /deals/create",
        changeType: "new_automation",
        errorMessage: "duplicate key",
      }],
    })).toBe("Sync toegepast - 1 nieuwe automation aangemaakt, 2 uit actieve weergave gehaald, 1 mislukt: Deal aanmaken");
  });
});

describe("formatSyncPreviewImportedToast", () => {
  it("summarizes preview changes as added to Imports", () => {
    expect(formatSyncPreviewImportedToast("HubSpot", [
      { id: "1", source: "hubspot", changeType: "new_automation", title: "A", summary: "", impact: "", selectedByDefault: true },
      { id: "2", source: "hubspot", changeType: "metadata_changed", title: "B", summary: "", impact: "", selectedByDefault: true },
      { id: "3", source: "hubspot", changeType: "source_data_incomplete", title: "C", summary: "", impact: "", selectedByDefault: true },
    ])).toBe("HubSpot sync-preview klaar - 3 wijzigingen toegevoegd aan Imports (1 nieuw, 1 gewijzigd, 1 waarschuwing)");
  });
});
