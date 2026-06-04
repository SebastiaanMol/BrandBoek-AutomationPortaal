import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, RefreshCw } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { SyncReviewChangeItem } from "@/lib/storage/edgeFunctions";

type SyncReviewDialogProps = {
  open: boolean;
  source: "hubspot" | "zapier" | "typeform" | "gitlab" | string;
  syncRunId?: string;
  items: SyncReviewChangeItem[];
  isApplying: boolean;
  onOpenChange: (open: boolean) => void;
  onApply: (selectedIds: string[]) => void;
};

const CHANGE_LABELS: Record<string, string> = {
  new_automation: "Nieuw",
  metadata_changed: "Gewijzigd",
  route_changed: "Webhook gewijzigd",
  source_data_incomplete: "Brondata incompleet",
  source_missing: "Niet meer gevonden",
  legacy_gitlab_record: "Legacy GitLab",
};

const CHANGE_CLASSES: Record<string, string> = {
  new_automation: "border-emerald-200 bg-emerald-50 text-emerald-700",
  metadata_changed: "border-orange-200 bg-orange-50 text-orange-700",
  route_changed: "border-orange-200 bg-orange-50 text-orange-700",
  source_data_incomplete: "border-amber-200 bg-amber-50 text-amber-700",
  source_missing: "border-red-200 bg-red-50 text-red-700",
  legacy_gitlab_record: "border-violet-200 bg-violet-50 text-violet-700",
};

const SOURCE_LABELS: Record<string, string> = {
  hubspot: "HubSpot",
  zapier: "Zapier",
  typeform: "Typeform",
  gitlab: "GitLab",
};

const FIELD_LABELS: Record<string, string> = {
  naam: "Naam",
  doel: "Beschrijving",
  trigger_beschrijving: "Trigger",
  categorie: "Categorie",
  status: "Status",
  systemen: "Systemen",
  stappen: "Stappen",
  webhook_paths: "Webhookpaden",
  endpoints: "Endpoints",
};

type DiffRow = {
  label: string;
  before: string;
  after: string;
};

export function SyncReviewDialog({
  open,
  source,
  items,
  isApplying,
  onOpenChange,
  onApply,
}: SyncReviewDialogProps): React.ReactNode {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [activeFilter, setActiveFilter] = useState<"all" | "new" | "changed" | "warnings">("all");

  useEffect(() => {
    if (!open) return;
    setSelectedIds(new Set(items.filter((item) => item.selectedByDefault !== false).map((item) => item.id)));
    setActiveFilter("all");
  }, [items, open]);

  const counts = useMemo(() => ({
    selected: selectedIds.size,
    newItems: items.filter((item) => item.changeType === "new_automation").length,
    changed: items.filter((item) => item.changeType === "metadata_changed" || item.changeType === "route_changed").length,
    warnings: items.filter((item) => item.changeType === "source_data_incomplete" || item.changeType === "source_missing" || item.changeType === "legacy_gitlab_record").length,
  }), [items, selectedIds.size]);

  const filteredItems = useMemo(() => {
    if (activeFilter === "new") return items.filter((item) => item.changeType === "new_automation");
    if (activeFilter === "changed") return items.filter((item) => item.changeType === "metadata_changed" || item.changeType === "route_changed");
    if (activeFilter === "warnings") return items.filter((item) =>
      item.changeType === "source_data_incomplete" ||
      item.changeType === "source_missing" ||
      item.changeType === "legacy_gitlab_record",
    );
    return items;
  }, [activeFilter, items]);

  function toggleItem(id: string): void {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll(): void {
    if (selectedIds.size === items.length) {
      setSelectedIds(new Set());
      return;
    }
    setSelectedIds(new Set(items.map((item) => item.id)));
  }

  const sourceLabel = SOURCE_LABELS[source] ?? source;
  const applyCountLabel = `${selectedIds.size} ${selectedIds.size === 1 ? "wijziging" : "wijzigingen"} toepassen`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] w-[calc(100vw-32px)] max-w-6xl gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-border px-6 py-5">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-orange-200 bg-orange-50 px-2.5 py-1 text-[11px] font-bold uppercase text-orange-700">
              {sourceLabel}
            </span>
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-bold uppercase text-emerald-700">
              Sync preview
            </span>
          </div>
          <DialogTitle className="text-2xl">Bronwijzigingen controleren</DialogTitle>
          <DialogDescription className="max-w-3xl text-sm leading-6">
            Deze sync heeft {items.length} wijziging{items.length === 1 ? "" : "en"} gevonden. Alles staat standaard aangevinkt; zet regels uit die je nu niet wilt toepassen.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 border-b border-border bg-muted/25 px-6 py-4 md:grid-cols-4">
          <MetricCard label="Aangevinkt" value={counts.selected} className="bg-card" />
          <MetricCard label="Nieuw" value={counts.newItems} className="border-emerald-200 bg-emerald-50 text-emerald-800" />
          <MetricCard label="Gewijzigd" value={counts.changed} className="border-orange-200 bg-orange-50 text-orange-800" />
          <MetricCard label="Waarschuwingen" value={counts.warnings} className="border-amber-200 bg-amber-50 text-amber-800" />
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b border-border px-6 py-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold">
            <input
              type="checkbox"
              checked={items.length > 0 && selectedIds.size === items.length}
              onChange={toggleAll}
              className="h-4 w-4 rounded border-border"
            />
            Alles selecteren
          </label>
          <span className="mx-1 h-5 w-px bg-border" />
          <FilterButton active={activeFilter === "all"} onClick={() => setActiveFilter("all")}>Alles</FilterButton>
          <FilterButton active={activeFilter === "new"} onClick={() => setActiveFilter("new")}>Nieuw</FilterButton>
          <FilterButton active={activeFilter === "changed"} onClick={() => setActiveFilter("changed")}>Gewijzigd</FilterButton>
          <FilterButton active={activeFilter === "warnings"} onClick={() => setActiveFilter("warnings")}>Bronwaarschuwing</FilterButton>
        </div>

        <ScrollArea className="max-h-[46vh]">
          <div className="min-w-[760px]">
            <div className="grid grid-cols-[44px_1.15fr_.72fr_1.5fr_.9fr] gap-4 border-b border-border bg-muted/40 px-6 py-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
              <span />
              <span>Automation</span>
              <span>Type</span>
              <span>Wat verandert er?</span>
              <span>Impact</span>
            </div>

            {filteredItems.length === 0 ? (
              <div className="px-6 py-10 text-center text-sm text-muted-foreground">
                Geen wijzigingen binnen dit filter.
              </div>
            ) : filteredItems.map((item) => {
              const diffRows = buildDiffRows(item);
              return (
                <div
                  key={item.id}
                  data-sync-review-row
                  className={cn(
                    "grid grid-cols-[44px_1.15fr_.72fr_1.5fr_.9fr] gap-4 border-b border-border/70 px-6 py-4 text-sm",
                    !selectedIds.has(item.id) && "bg-muted/20 opacity-70",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={selectedIds.has(item.id)}
                    onChange={() => toggleItem(item.id)}
                    className="mt-1 h-4 w-4 rounded border-border"
                  />
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-foreground">{item.title}</p>
                    <p className="mt-1 truncate text-xs text-muted-foreground">{item.externalId ?? item.automationId ?? sourceLabel}</p>
                  </div>
                  <div>
                    <span className={cn(
                      "inline-flex rounded-full border px-2 py-1 text-[11px] font-bold",
                      CHANGE_CLASSES[item.changeType] ?? "border-border bg-muted text-muted-foreground",
                    )}>
                      {CHANGE_LABELS[item.changeType] ?? item.changeType}
                    </span>
                  </div>
                  <div className="min-w-0 space-y-2">
                    <p className="text-sm leading-5 text-foreground">{item.summary}</p>
                    {diffRows.length > 0 && <DiffTable rows={diffRows} />}
                    {item.changeType === "source_missing" || item.changeType === "source_data_incomplete" || item.changeType === "legacy_gitlab_record" ? (
                      <p className="inline-flex items-center gap-1 text-xs font-medium text-amber-700">
                        <AlertTriangle className="h-3 w-3" />
                        Bronwaarschuwing
                      </p>
                    ) : (
                      <p className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
                        <CheckCircle2 className="h-3 w-3" />
                        Kan toegepast worden
                      </p>
                    )}
                  </div>
                  <p className="text-xs leading-5 text-muted-foreground">{item.impact}</p>
                </div>
              );
            })}
          </div>
        </ScrollArea>

        <DialogFooter className="border-t border-border bg-card px-6 py-4 sm:items-center sm:justify-between sm:space-x-0">
          <p className="text-xs text-muted-foreground">
            Alleen aangevinkte regels worden toegepast. Uitgevinkte regels blijven gekoppeld aan deze sync-run.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="rounded-lg border border-border bg-card px-4 py-2 text-sm font-semibold hover:bg-muted"
              disabled={isApplying}
            >
              Annuleren
            </button>
            <button
              type="button"
              aria-label={`${selectedIds.size} wijzigingen toepassen`}
              onClick={() => onApply([...selectedIds])}
              disabled={isApplying || selectedIds.size === 0}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {isApplying && <RefreshCw className="h-4 w-4 animate-spin" />}
              {applyCountLabel}
            </button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DiffTable({ rows }: { rows: DiffRow[] }): React.ReactNode {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card text-xs">
      <div className="grid grid-cols-[.72fr_1fr_1fr] border-b border-border bg-muted/45 px-2 py-1.5 font-bold uppercase tracking-wide text-muted-foreground">
        <span>Veld</span>
        <span>Was</span>
        <span>Wordt</span>
      </div>
      {rows.map((row) => (
        <div key={`${row.label}:${row.before}:${row.after}`} className="grid grid-cols-[.72fr_1fr_1fr] border-b border-border/60 px-2 py-1.5 last:border-b-0">
          <span className="pr-2 font-semibold text-foreground">{row.label}</span>
          <span className="min-w-0 break-words pr-2 text-muted-foreground">{row.before}</span>
          <span className="min-w-0 break-words font-medium text-foreground">{row.after}</span>
        </div>
      ))}
    </div>
  );
}

function MetricCard({ label, value, className }: { label: string; value: number; className?: string }): React.ReactNode {
  return (
    <div className={cn("rounded-xl border border-border px-3 py-2", className)}>
      <p className="text-xl font-bold leading-none">{value}</p>
      <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide opacity-75">{label}</p>
    </div>
  );
}

function FilterButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}): React.ReactNode {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
        active ? "border-slate-900 bg-slate-900 text-white" : "border-border bg-card text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function buildDiffRows(item: SyncReviewChangeItem): DiffRow[] {
  const oldValue = asRecord(item.oldValue);
  const newValue = asRecord(item.newValue);
  const rows: DiffRow[] = [];

  for (const field of ["webhook_paths", "endpoints"]) {
    addDiffRow(rows, fieldLabel(field), oldValue?.[field], newValue?.[field]);
  }

  for (const row of buildMetadataDiffRows(oldValue, newValue)) {
    rows.push(row);
  }

  if (rows.length === 0) {
    for (const field of ["naam", "status", "categorie", "trigger_beschrijving", "doel", "systemen", "stappen"]) {
      addDiffRow(rows, fieldLabel(field), oldValue?.[field], newValue?.[field]);
      if (rows.length >= 4) break;
    }
  }

  return rows.slice(0, 6);
}

function buildMetadataDiffRows(
  oldValue: Record<string, unknown> | null,
  newValue: Record<string, unknown> | null,
): DiffRow[] {
  const oldMetadata = metadataMap(oldValue?.metadata);
  const newMetadata = metadataMap(newValue?.metadata);
  const fields = new Set([...oldMetadata.keys(), ...newMetadata.keys()]);

  return [...fields].flatMap((field) => {
    const before = oldMetadata.get(field);
    const after = newMetadata.get(field);
    if (formatDiffValue(before) === formatDiffValue(after)) return [];
    return [{
      label: fieldLabel(field),
      before: formatDiffValue(before),
      after: formatDiffValue(after),
    }];
  });
}

function metadataMap(value: unknown): Map<string, unknown> {
  const result = new Map<string, unknown>();
  if (!Array.isArray(value)) return result;

  for (const item of value) {
    const record = asRecord(item);
    const field = typeof record?.field === "string" ? record.field : "";
    if (!field) continue;
    result.set(field, record?.value);
  }

  return result;
}

function addDiffRow(rows: DiffRow[], label: string, beforeValue: unknown, afterValue: unknown): void {
  const before = formatDiffValue(beforeValue);
  const after = formatDiffValue(afterValue);
  if (before === after) return;
  rows.push({ label, before, after });
}

function formatDiffValue(value: unknown): string {
  if (value == null) return "Niet aanwezig";
  if (Array.isArray(value)) {
    const values = value.map((item) => formatDiffValue(item)).filter((item) => item !== "Niet aanwezig");
    return values.length > 0 ? values.join(", ") : "Niet aanwezig";
  }
  if (typeof value === "object") return JSON.stringify(value);
  const text = String(value).trim();
  return text || "Niet aanwezig";
}

function fieldLabel(field: string): string {
  return FIELD_LABELS[field] ?? field.replaceAll("_", " ");
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}
