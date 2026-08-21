import type { SyncPreviewResult, SyncReviewChangeItem } from "@/lib/storage/edgeFunctions";

export function formatSyncApplyToast(result: Partial<SyncPreviewResult>, fallbackApplied = 0): string {
  const parts: string[] = [];
  const inserted = result.inserted ?? 0;
  const updated = result.updated ?? 0;
  const findings = result.findings ?? 0;
  const skipped = result.skipped ?? 0;
  const failed = result.failed ?? 0;
  const applied = result.applied ?? fallbackApplied;
  const deactivated = result.deactivated ?? 0;

  if (inserted > 0) {
    parts.push(`${inserted} nieuwe automation${inserted === 1 ? "" : "s"} aangemaakt`);
  }
  if (updated > 0) {
    parts.push(`${updated} wijziging${updated === 1 ? "" : "en"} bijgewerkt`);
  }
  if (findings > 0) {
    parts.push(`${findings} bronwaarschuwing${findings === 1 ? "" : "en"} geregistreerd`);
  }
  if (deactivated > 0) {
    parts.push(`${deactivated} uit actieve weergave gehaald`);
  }
  if (failed > 0) {
    const failedNames = (result.failedItems ?? [])
      .map((item) => item.title)
      .filter(Boolean)
      .slice(0, 3);
    const failedDetail = failedNames.length > 0 ? `: ${failedNames.join(", ")}` : "";
    parts.push(`${failed} mislukt${failedDetail}`);
  }
  if (skipped > 0) {
    parts.push(`${skipped} overgeslagen`);
  }
  if (parts.length === 0) {
    parts.push(`${applied} wijziging${applied === 1 ? "" : "en"} toegepast`);
  }

  return `Sync toegepast - ${parts.join(", ")}`;
}

export function formatSyncPreviewImportedToast(sourceLabel: string, items: SyncReviewChangeItem[]): string {
  const newItems = items.filter((item) => item.changeType === "new_automation").length;
  const changed = items.filter((item) => item.changeType === "metadata_changed" || item.changeType === "route_changed").length;
  const warnings = items.filter((item) =>
    item.changeType === "source_data_incomplete" ||
    item.changeType === "source_missing" ||
    item.changeType === "legacy_gitlab_record"
  ).length;
  const parts = [
    newItems > 0 ? `${newItems} nieuw` : null,
    changed > 0 ? `${changed} gewijzigd` : null,
    warnings > 0 ? `${warnings} waarschuwing${warnings === 1 ? "" : "en"}` : null,
  ].filter(Boolean);
  const detail = parts.length > 0 ? ` (${parts.join(", ")})` : "";

  return `${sourceLabel} sync-preview klaar - ${items.length} wijziging${items.length === 1 ? "" : "en"} toegevoegd aan Imports${detail}`;
}
