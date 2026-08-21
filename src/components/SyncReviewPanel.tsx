import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, RefreshCw } from "lucide-react";
import { Pagination, PaginationContent, PaginationItem } from "@/components/ui/pagination";
import { cn } from "@/lib/utils";
import type { SyncReviewChangeItem, SyncReviewFilters } from "@/lib/storage/edgeFunctions";

type SyncReviewPanelProps = {
  items: SyncReviewChangeItem[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  from: number;
  to: number;
  filters: SyncReviewFilters;
  isLoading: boolean;
  isApplying: boolean;
  onFiltersChange: (filters: SyncReviewFilters) => void;
  onPageChange: (page: number) => void;
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

const SOURCE_LABELS: Record<string, string> = {
  hubspot: "HubSpot",
  zapier: "Zapier",
  typeform: "Typeform",
  gitlab: "GitLab",
};

type DiffRow = {
  label: string;
  before: string;
  after: string;
};

type SyncReviewGroup = {
  key: string;
  title: string;
  sourceLabel: string;
  externalId: string | null;
  items: SyncReviewChangeItem[];
  warnings: SyncReviewChangeItem[];
  actionable: SyncReviewChangeItem[];
};

export function SyncReviewPanel({
  items,
  total,
  page,
  pageSize,
  pageCount,
  from,
  to,
  filters,
  isLoading,
  isApplying,
  onFiltersChange,
  onPageChange,
  onApply,
}: SyncReviewPanelProps): React.ReactNode {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  useEffect(() => {
    setSelectedIds(new Set(items.filter((item) => item.selectedByDefault !== false).map((item) => item.id)));
  }, [items]);

  useEffect(() => {
    setCollapsedGroups(new Set());
  }, [items]);

  const groups = useMemo(() => groupSyncReviewItems(items), [items]);

  const counts = useMemo(() => ({
    selected: selectedIds.size,
    newItems: items.filter((item) => item.changeType === "new_automation").length,
    changed: items.filter((item) => item.changeType === "metadata_changed" || item.changeType === "route_changed").length,
    warnings: items.filter((item) => isWarningChange(item.changeType)).length,
    failed: items.filter((item) => item.status === "failed").length,
  }), [items, selectedIds.size]);

  function toggleItem(id: string): void {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleGroup(group: SyncReviewGroup): void {
    const groupIds = group.items.map((item) => item.id);
    const allSelected = groupIds.every((id) => selectedIds.has(id));
    setSelectedIds((current) => {
      const next = new Set(current);
      for (const id of groupIds) {
        if (allSelected) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  }

  function toggleGroupCollapsed(groupKey: string): void {
    setCollapsedGroups((current) => {
      const next = new Set(current);
      if (next.has(groupKey)) next.delete(groupKey);
      else next.add(groupKey);
      return next;
    });
  }

  function toggleAll(): void {
    if (items.length > 0 && selectedIds.size === items.length) {
      setSelectedIds(new Set());
      return;
    }
    setSelectedIds(new Set(items.map((item) => item.id)));
  }

  function updateFilters(patch: Partial<SyncReviewFilters>): void {
    onFiltersChange({ ...filters, ...patch });
  }

  const applyCountLabel = `${selectedIds.size} geselecteerde ${selectedIds.size === 1 ? "regel" : "regels"} toepassen`;
  const hasPreviousPage = page > 1;
  const hasNextPage = page < pageCount;

  return (
    <section className="mb-8 overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <header className="border-b border-border px-6 py-5">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-bold uppercase text-emerald-700">
            Sync preview
          </span>
        </div>
        <h2 className="text-2xl font-semibold tracking-tight">Bronwijzigingen uit synchronisaties</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
          Nieuwe sync-resultaten staan hier klaar. Bulkselectie geldt alleen voor de huidige pagina.
        </p>
      </header>

      <div className="grid grid-cols-2 gap-3 border-b border-border bg-muted/25 px-6 py-4 md:grid-cols-4">
        <MetricCard label="Totaal open" value={total} className="bg-card" />
        <MetricCard label="Aangevinkt pagina" value={counts.selected} className="bg-card" />
        <MetricCard label="Nieuw pagina" value={counts.newItems} className="border-emerald-200 bg-emerald-50 text-emerald-800" />
        <MetricCard
          label={counts.failed > 0 ? "Mislukt pagina" : "Waarschuwingen pagina"}
          value={counts.failed > 0 ? counts.failed : counts.warnings}
          className={counts.failed > 0 ? "border-red-200 bg-red-50 text-red-800" : "border-amber-200 bg-amber-50 text-amber-800"}
        />
      </div>

      <div className="grid gap-3 border-b border-border px-6 py-3 lg:grid-cols-[minmax(220px,1fr)_160px_160px_180px_auto]">
        <label className="min-w-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Zoeken in bronwijzigingen
          <input
            aria-label="Zoeken in bronwijzigingen"
            type="search"
            value={filters.search}
            onChange={(event) => updateFilters({ search: event.target.value })}
            placeholder="Titel of external ID"
            className="mt-1 h-9 w-full rounded-lg border border-border bg-card px-3 text-sm font-normal normal-case tracking-normal text-foreground outline-none focus:ring-2 focus:ring-ring"
          />
        </label>
        <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Bron filter
          <select
            aria-label="Bron filter"
            value={filters.source}
            onChange={(event) => updateFilters({ source: event.target.value as SyncReviewFilters["source"] })}
            className="mt-1 h-9 w-full rounded-lg border border-border bg-card px-3 text-sm font-normal normal-case tracking-normal text-foreground outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="all">Alle bronnen</option>
            <option value="hubspot">HubSpot</option>
            <option value="gitlab">GitLab</option>
            <option value="zapier">Zapier</option>
            <option value="typeform">Typeform</option>
          </select>
        </label>
        <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Type filter
          <select
            aria-label="Type filter"
            value={filters.type}
            onChange={(event) => updateFilters({ type: event.target.value as SyncReviewFilters["type"] })}
            className="mt-1 h-9 w-full rounded-lg border border-border bg-card px-3 text-sm font-normal normal-case tracking-normal text-foreground outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="all">Alle types</option>
            <option value="new">Nieuw</option>
            <option value="changed">Gewijzigd</option>
            <option value="warnings">Bronwaarschuwing</option>
          </select>
        </label>
        <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Selectie filter
          <select
            aria-label="Selectie filter"
            value={filters.selected}
            onChange={(event) => updateFilters({ selected: event.target.value as SyncReviewFilters["selected"] })}
            className="mt-1 h-9 w-full rounded-lg border border-border bg-card px-3 text-sm font-normal normal-case tracking-normal text-foreground outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="all">Alles</option>
            <option value="selected">Standaard geselecteerd</option>
            <option value="unselected">Niet geselecteerd</option>
          </select>
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold">
          <input
            type="checkbox"
            checked={items.length > 0 && selectedIds.size === items.length}
            onChange={toggleAll}
            className="h-4 w-4 rounded border-border"
          />
          Alles selecteren
        </label>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[760px]">
          <div className="grid grid-cols-[44px_1.15fr_.72fr_1.5fr_.9fr] gap-4 border-b border-border bg-muted/40 px-6 py-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
            <span />
            <span>Automation</span>
            <span>Type</span>
            <span>Wat verandert er?</span>
            <span>Impact</span>
          </div>

          {isLoading ? (
            <div className="px-6 py-10 text-center text-sm text-muted-foreground">Bronwijzigingen laden...</div>
          ) : items.length === 0 ? (
            <div className="px-6 py-10 text-center text-sm text-muted-foreground">
              Geen bronwijzigingen om te controleren.
            </div>
          ) : groups.map((group) => {
            const selectedInGroup = group.items.filter((item) => selectedIds.has(item.id)).length;
            const allGroupSelected = selectedInGroup === group.items.length;
            const groupCollapsed = collapsedGroups.has(group.key);
            const primaryType = group.actionable[0]?.changeType ?? group.warnings[0]?.changeType ?? group.items[0]?.changeType;
            return (
              <div
                key={group.key}
                data-sync-review-group
                className={cn(
                  "border-b border-border/70 bg-card text-sm",
                  selectedInGroup === 0 && "bg-muted/20 opacity-70",
                )}
              >
                <div
                  data-sync-review-row
                  className="grid grid-cols-[44px_1.15fr_.72fr_1.5fr_.9fr] gap-4 px-6 py-4"
                >
                  <input
                    type="checkbox"
                    checked={allGroupSelected}
                    aria-label={`${group.title} selecteren`}
                    onChange={() => toggleGroup(group)}
                    className="mt-1 h-4 w-4 rounded border-border"
                  />
                  <div className="min-w-0">
                    <button
                      type="button"
                      onClick={() => toggleGroupCollapsed(group.key)}
                      className="flex max-w-full items-center gap-2 text-left"
                    >
                      <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", groupCollapsed && "-rotate-90")} />
                      <span className="truncate font-semibold text-foreground">{group.title}</span>
                    </button>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span>{group.externalId ?? group.sourceLabel}</span>
                      <span className="rounded-full bg-muted px-2 py-0.5 font-semibold text-foreground">
                        {group.items.length} open {group.items.length === 1 ? "punt" : "punten"}
                      </span>
                      <span>{selectedInGroup}/{group.items.length} geselecteerd</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {summarizeGroupTypes(group).map((summary) => (
                      <span
                        key={summary.changeType}
                        className={cn(
                          "inline-flex rounded-full border px-2 py-1 text-[11px] font-bold",
                          CHANGE_CLASSES[summary.changeType] ?? "border-border bg-muted text-muted-foreground",
                        )}
                      >
                        {summary.count > 1 ? `${summary.count}x ` : ""}
                        {CHANGE_LABELS[summary.changeType] ?? summary.changeType}
                      </span>
                    ))}
                    {group.items.some((item) => item.status === "failed") && (
                      <span className="inline-flex rounded-full border border-red-200 bg-red-50 px-2 py-1 text-[11px] font-bold text-red-700">
                        Mislukt
                      </span>
                    )}
                  </div>
                  <div className="min-w-0 space-y-2">
                    <p className="text-sm leading-5 text-foreground">{groupSummary(group)}</p>
                    {group.items.length > 1 && (
                      <p className="text-xs text-muted-foreground">
                        Gegroepeerd per automation; open de details om elk signaal apart te beoordelen.
                      </p>
                    )}
                  </div>
                  <p className="text-xs leading-5 text-muted-foreground">
                    {primaryType ? displayImpact(group.items.find((item) => item.changeType === primaryType) ?? group.items[0]) : ""}
                  </p>
                </div>

                {!groupCollapsed && (
                  <div className="border-t border-border/60 bg-muted/15 px-6 pb-5 pt-4">
                    {group.actionable.length > 0 && (
                      <ReviewItemSection
                        title="Toe te passen wijzigingen"
                        items={group.actionable}
                        selectedIds={selectedIds}
                        onToggleItem={toggleItem}
                      />
                    )}
                    {group.warnings.length > 0 && (
                      <ReviewItemSection
                        title="Bronkwaliteit"
                        items={group.warnings}
                        selectedIds={selectedIds}
                        onToggleItem={toggleItem}
                      />
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <footer className="flex flex-col gap-3 border-t border-border bg-card px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Alleen geselecteerde regels op deze pagina worden toegepast. Uitgevinkte regels blijven openstaan.
          </p>
          <Pagination className="justify-start">
            <PaginationContent>
              <PaginationItem>
                <button
                  type="button"
                  onClick={() => onPageChange(page - 1)}
                  disabled={!hasPreviousPage || isLoading}
                  className="h-9 rounded-md border border-border px-3 text-sm font-medium disabled:opacity-50"
                >
                  Vorige
                </button>
              </PaginationItem>
              <PaginationItem>
                <span className="px-3 text-sm text-muted-foreground">
                  {from}-{to} van {total}
                </span>
              </PaginationItem>
              <PaginationItem>
                <button
                  type="button"
                  onClick={() => onPageChange(page + 1)}
                  disabled={!hasNextPage || isLoading}
                  className="h-9 rounded-md border border-border px-3 text-sm font-medium disabled:opacity-50"
                >
                  Volgende
                </button>
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
        <div className="flex flex-col items-stretch gap-2 sm:items-end">
          <span className="text-xs text-muted-foreground">
            Pagina {page} van {pageCount} - {items.length} zichtbaar, grootte {pageSize}
          </span>
          <button
            type="button"
            aria-label={applyCountLabel}
            onClick={() => onApply([...selectedIds])}
            disabled={isApplying || selectedIds.size === 0}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {isApplying && <RefreshCw className="h-4 w-4 animate-spin" />}
            {applyCountLabel}
          </button>
        </div>
      </footer>
    </section>
  );
}

function isWarningChange(changeType: string): boolean {
  return changeType === "source_data_incomplete" || changeType === "source_missing" || changeType === "legacy_gitlab_record";
}

function groupSyncReviewItems(items: SyncReviewChangeItem[]): SyncReviewGroup[] {
  const groups = new Map<string, SyncReviewGroup>();

  for (const item of items) {
    const sourceLabel = SOURCE_LABELS[item.source] ?? item.source;
    const externalId = item.externalId ?? item.automationId ?? null;
    const key = `${item.source}:${externalId ?? item.title}`;
    const group = groups.get(key) ?? {
      key,
      title: item.title,
      sourceLabel,
      externalId,
      items: [],
      warnings: [],
      actionable: [],
    };

    group.items.push(item);
    if (isWarningChange(item.changeType)) group.warnings.push(item);
    else group.actionable.push(item);
    groups.set(key, group);
  }

  return [...groups.values()];
}

function summarizeGroupTypes(group: SyncReviewGroup): Array<{ changeType: string; count: number }> {
  const counts = new Map<string, number>();
  for (const item of group.items) {
    counts.set(item.changeType, (counts.get(item.changeType) ?? 0) + 1);
  }

  return [...counts.entries()].map(([changeType, count]) => ({ changeType, count }));
}

function groupSummary(group: SyncReviewGroup): string {
  if (group.items.length === 1) return group.items[0]?.summary ?? "";

  const parts: string[] = [];
  if (group.actionable.length > 0) {
    parts.push(`${group.actionable.length} toe te passen ${group.actionable.length === 1 ? "wijziging" : "wijzigingen"}`);
  }
  if (group.warnings.length > 0) {
    parts.push(`${group.warnings.length} bron${group.warnings.length === 1 ? "waarschuwing" : "waarschuwingen"}`);
  }
  return parts.length > 0 ? parts.join(" en ") : `${group.items.length} open punten`;
}

function ReviewItemSection({
  title,
  items,
  selectedIds,
  onToggleItem,
}: {
  title: string;
  items: SyncReviewChangeItem[];
  selectedIds: Set<string>;
  onToggleItem: (id: string) => void;
}): React.ReactNode {
  return (
    <div className="mb-4 last:mb-0">
      <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{title}</h3>
      <div className="space-y-2">
        {items.map((item) => {
          const diffRows = buildDiffRows(item);
          return (
            <div
              key={item.id}
              className={cn(
                "grid grid-cols-[28px_.7fr_1.6fr_.9fr] gap-3 rounded-xl border border-border bg-card px-3 py-3",
                !selectedIds.has(item.id) && "bg-muted/30 opacity-70",
              )}
            >
              <input
                type="checkbox"
                checked={selectedIds.has(item.id)}
                aria-label={`${item.summary} selecteren`}
                onChange={() => onToggleItem(item.id)}
                className="mt-1 h-4 w-4 rounded border-border"
              />
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
                {item.status === "failed" && (
                  <p className="inline-flex items-start gap-1 rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-xs font-medium text-red-700">
                    <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                    <span>Niet opgeslagen: {item.errorMessage ?? "onbekende fout"}</span>
                  </p>
                )}
                {isWarningChange(item.changeType) ? (
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
              <p className="text-xs leading-5 text-muted-foreground">{displayImpact(item)}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function displayImpact(item: SyncReviewChangeItem): string {
  if (isWarningChange(item.changeType)) {
    return "Registreert een bronwaarschuwing; er wordt geen automation aangemaakt.";
  }
  if (item.changeType === "new_automation") {
    return "Wordt direct toegevoegd aan Automations.";
  }
  if (item.changeType === "metadata_changed" || item.changeType === "route_changed") {
    return "Werkt bestaande automation bij.";
  }
  return item.impact;
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
