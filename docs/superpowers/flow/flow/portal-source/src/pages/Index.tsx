import { useMemo, useState } from "react";
import {
  ATOMIC_AUTOMATIONS,
  PROCESSES,
  SYSTEMS,
  systemsForProcess,
  totalSystemsAcrossPortal,
  type Category,
  type Status,
  type SystemKey,
} from "@/data/portal";
import { ProcessCard } from "@/components/portal/ProcessCard";
import { Search, SlidersHorizontal, Workflow } from "lucide-react";

type SortKey = "recent" | "name" | "size";

const CATEGORIES: Category[] = ["Sales", "HR", "Finance", "Operations", "Marketing"];
const STATUSES: Status[] = ["active", "paused", "error"];

const Index = () => {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<Category | "all">("all");
  const [system, setSystem] = useState<SystemKey | "all">("all");
  const [status, setStatus] = useState<Status | "all">("all");
  const [sort, setSort] = useState<SortKey>("recent");

  const totalAutomations = Object.keys(ATOMIC_AUTOMATIONS).length;
  const totalSystems = totalSystemsAcrossPortal();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = PROCESSES.filter((p) => {
      if (category !== "all" && p.category !== category) return false;
      if (status !== "all" && p.status !== status) return false;
      if (system !== "all" && !systemsForProcess(p).includes(system)) return false;
      if (!q) return true;
      if (p.name.toLowerCase().includes(q)) return true;
      if (p.description.toLowerCase().includes(q)) return true;
      // also search atomic automation names
      return p.automationIds.some((id) =>
        ATOMIC_AUTOMATIONS[id]?.name.toLowerCase().includes(q)
      );
    });
    list = [...list].sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "size") return b.automationIds.length - a.automationIds.length;
      return 0; // recent = original order (already most-recent first in mock)
    });
    return list;
  }, [query, category, system, status, sort]);

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-[1400px] px-6 py-8 lg:px-10 lg:py-10 animate-fade-in">
        {/* Hero / header */}
        <header className="relative overflow-hidden rounded-2xl border border-border bg-gradient-hero mb-8">
          <div className="px-8 py-8">
            <div className="flex items-center gap-2 mb-3">
              <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10 text-primary">
                <Workflow className="w-4 h-4" />
              </span>
              <span className="text-[11px] uppercase tracking-[0.14em] font-semibold text-primary">
                Automatiseringsportaal
              </span>
            </div>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">
              Bedrijfsprocessen
            </h1>
            <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
              Overzicht van alle grote automatiseringen. Elk proces is opgebouwd uit
              meerdere losse automations die samenwerken over verschillende systemen.
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              <Stat label="Processen" value={PROCESSES.length} />
              <Stat label="Automations" value={totalAutomations} />
              <Stat label="Systemen" value={totalSystems} />
            </div>
          </div>
        </header>

        {/* Filters */}
        <div className="card-elevated p-4 mb-6">
          <div className="flex flex-col lg:flex-row gap-3 lg:items-center">
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Zoek op proces of automation…"
                className="w-full pl-9 pr-3 py-2 rounded-lg border border-border bg-background text-sm placeholder:text-muted-foreground focus-ring"
              />
            </div>

            <div className="flex flex-wrap gap-2 items-center">
              <Select
                value={category}
                onChange={(v) => setCategory(v as Category | "all")}
                options={[
                  { value: "all", label: "Alle categorieën" },
                  ...CATEGORIES.map((c) => ({ value: c, label: c })),
                ]}
              />
              <Select
                value={system}
                onChange={(v) => setSystem(v as SystemKey | "all")}
                options={[
                  { value: "all", label: "Alle systemen" },
                  ...Object.values(SYSTEMS).map((s) => ({ value: s.key, label: s.label })),
                ]}
              />
              <Select
                value={status}
                onChange={(v) => setStatus(v as Status | "all")}
                options={[
                  { value: "all", label: "Alle statussen" },
                  ...STATUSES.map((s) => ({
                    value: s,
                    label: s === "active" ? "Actief" : s === "paused" ? "Gepauzeerd" : "Fout",
                  })),
                ]}
              />
              <div className="h-6 w-px bg-border mx-1" />
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <Select
                  value={sort}
                  onChange={(v) => setSort(v as SortKey)}
                  options={[
                    { value: "recent", label: "Recent" },
                    { value: "name", label: "Naam" },
                    { value: "size", label: "Grootte" },
                  ]}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Result count */}
        <p className="text-sm text-muted-foreground mb-4">
          {filtered.length} proces{filtered.length === 1 ? "" : "sen"} gevonden
        </p>

        {/* Grid */}
        {filtered.length === 0 ? (
          <div className="card-elevated p-12 text-center">
            <p className="text-sm text-muted-foreground">
              Geen processen gevonden met deze filters.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {filtered.map((p) => (
              <ProcessCard key={p.id} process={p} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const Stat = ({ label, value }: { label: string; value: number }) => (
  <div className="rounded-xl bg-card/80 backdrop-blur-sm border border-border px-4 py-2.5">
    <p className="text-xl font-semibold text-foreground tabular-nums leading-tight">
      {value}
    </p>
    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
      {label}
    </p>
  </div>
);

const Select = ({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) => (
  <select
    value={value}
    onChange={(e) => onChange(e.target.value)}
    className="px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground focus-ring cursor-pointer hover:border-primary/40 transition-colors"
  >
    {options.map((o) => (
      <option key={o.value} value={o.value}>
        {o.label}
      </option>
    ))}
  </select>
);

export default Index;
