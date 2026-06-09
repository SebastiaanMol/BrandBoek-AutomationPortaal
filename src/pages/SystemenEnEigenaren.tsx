import { useState, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useAutomatiseringen } from "@/lib/hooks";
import { StatusBadge, CategorieBadge, SystemBadge } from "@/components/Badges";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, ChevronRight, Loader2, Search, Server, Users, Zap } from "lucide-react";
import type { Systeem } from "@/lib/types";

// ── Types ─────────────────────────────────────────────────────────────────────

type Automation = NonNullable<ReturnType<typeof useAutomatiseringen>["data"]>[number];

// ── Helpers ───────────────────────────────────────────────────────────────────

function OwnerAvatar({ name, size = "md" }: { name: string; size?: "sm" | "md" | "lg" }) {
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const cls =
    size === "lg"
      ? "w-12 h-12 text-sm"
      : size === "sm"
      ? "w-6 h-6 text-[10px]"
      : "w-9 h-9 text-xs";
  return (
    <span className={`${cls} rounded-full bg-primary/10 text-primary font-semibold flex items-center justify-center shrink-0`}>
      {initials}
    </span>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-card border border-border rounded-lg px-4 py-3 flex flex-col gap-0.5">
      <span className="text-2xl font-semibold tabular-nums">{value}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="label-uppercase mb-0.5">{label}</p>
      <p className="text-sm text-foreground">{value || "—"}</p>
    </div>
  );
}

// ── Automation accordion ──────────────────────────────────────────────────────

function AutomationAccordion({ automations }: { automations: Automation[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    if (!query.trim()) return automations;
    const q = query.toLowerCase();
    return automations.filter(
      (a) => a.naam.toLowerCase().includes(q) || a.doel?.toLowerCase().includes(q),
    );
  }, [automations, query]);

  return (
    <div className="space-y-3">
      {automations.length > 5 && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Zoek automation..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-8 h-8 text-sm"
          />
        </div>
      )}

      {filtered.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-6">Geen resultaten voor "{query}"</p>
      )}

      <div className="space-y-2">
        {filtered.map((a) => {
          const isOpen = openId === a.id;
          return (
            <div
              key={a.id}
              className="bg-card border border-border rounded-[var(--radius-outer)] shadow-sm overflow-hidden"
            >
              <button
                onClick={() => setOpenId(isOpen ? null : a.id)}
                className="w-full px-4 py-3 flex items-center gap-3 justify-between text-left hover:bg-secondary/50 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <span className="font-normal text-sm truncate" title={a.naam}>{a.naam}</span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <CategorieBadge categorie={a.categorie} />
                    <StatusBadge status={a.status} />
                  </div>
                </div>
                <ChevronDown
                  className={`h-4 w-4 text-muted-foreground transition-transform shrink-0 ${isOpen ? "rotate-180" : ""}`}
                />
              </button>

              <AnimatePresence>
                {isOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                    className="overflow-hidden"
                  >
                    <div className="px-4 pb-4 pt-3 border-t border-border space-y-4">
                      {a.beschrijvingInSimpeleTaal && a.beschrijvingInSimpeleTaal.length > 0 ? (
                        <div className="bg-secondary/40 rounded-md px-4 py-3 space-y-1.5">
                          <p className="label-uppercase mb-2">Wat doet deze automatisering?</p>
                          {a.beschrijvingInSimpeleTaal.map((line, i) => (
                            <p key={i} className="text-sm text-foreground leading-relaxed">{line}</p>
                          ))}
                        </div>
                      ) : a.doel ? (
                        <div className="bg-secondary/40 rounded-md px-4 py-3">
                          <p className="label-uppercase mb-1">Wat doet deze automatisering?</p>
                          <p className="text-sm text-foreground leading-relaxed">{a.doel}</p>
                        </div>
                      ) : null}

                      {a.trigger && (
                        <div className="flex items-start gap-2">
                          <Zap className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                          <div>
                            <p className="label-uppercase mb-0.5">Wordt gestart door</p>
                            <p className="text-sm text-foreground">{a.trigger}</p>
                          </div>
                        </div>
                      )}

                      {a.stappen.length > 0 && (
                        <div>
                          <p className="label-uppercase mb-2">Hoe werkt het?</p>
                          <div className="flex flex-col gap-1.5">
                            {a.stappen.map((s, i) => (
                              <div key={i} className="flex items-start gap-2.5">
                                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/10 text-primary text-[10px] font-semibold flex items-center justify-center mt-0.5">
                                  {i + 1}
                                </span>
                                <p className="text-sm text-foreground leading-snug pt-0.5">{s}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="grid md:grid-cols-2 gap-4 pt-1 border-t border-border">
                        {a.fasen && a.fasen.length > 0 && (
                          <div>
                            <p className="label-uppercase mb-1.5">Bedrijfsfasen</p>
                            <div className="flex gap-1.5 flex-wrap">
                              {a.fasen.map((f) => (
                                <span key={f} className="px-2 py-0.5 rounded-full text-[11px] bg-secondary text-foreground border border-border">{f}</span>
                              ))}
                            </div>
                          </div>
                        )}
                        {a.owner && <Detail label="Eigenaar" value={a.owner} />}
                        {a.afhankelijkheden && <Detail label="Afhankelijkheden" value={a.afhankelijkheden} />}
                      </div>

                      <div>
                        <p className="label-uppercase mb-1">Systemen</p>
                        <div className="flex gap-1.5 flex-wrap">
                          {a.systemen.map((s) => <SystemBadge key={s} systeem={s} />)}
                        </div>
                      </div>

                      {a.verbeterideeën && <Detail label="Verbeterideeën" value={a.verbeterideeën} />}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Systemen tab ──────────────────────────────────────────────────────────────

function SystemenTab({
  all, selected, onSelect, onBack,
}: {
  all: Automation[]; selected: string | null;
  onSelect: (name: string) => void; onBack: () => void;
}) {
  const systemCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const a of all) {
      for (const s of a.systemen) map.set(s, (map.get(s) ?? 0) + 1);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }));
  }, [all]);

  const maxCount = systemCounts[0]?.count ?? 1;

  if (!selected) {
    return systemCounts.length === 0 ? (
      <div className="text-center py-16">
        <Server className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
        <p className="font-medium text-foreground">Geen systemen gevonden</p>
        <p className="text-sm text-muted-foreground mt-1">Er zijn nog geen automations gekoppeld aan een systeem.</p>
      </div>
    ) : (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {systemCounts.map(({ name, count }) => (
          <button
            key={name}
            onClick={() => onSelect(name)}
            className="group flex items-center justify-between p-4 bg-card border border-border rounded-[var(--radius-outer)] shadow-sm hover:border-primary/40 hover:shadow-md transition-all text-left"
          >
            <div className="flex items-center gap-3 min-w-0">
              <SystemBadge systeem={name as Systeem} />
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{name}</p>
                <div className="mt-1.5 h-1 w-24 bg-secondary rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary/40 rounded-full"
                    style={{ width: `${Math.round((count / maxCount) * 100)}%` }}
                  />
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0 ml-3">
              <span className="text-sm font-semibold tabular-nums text-foreground">{count}</span>
              <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
            </div>
          </button>
        ))}
      </div>
    );
  }

  const filtered = all.filter((a) => a.systemen.includes(selected as Systeem));

  return (
    <div className="space-y-5">
      <button onClick={onBack} className="text-sm text-primary hover:underline flex items-center gap-1">
        ← Terug naar systemen
      </button>
      <div className="flex items-center gap-4 p-4 bg-card border border-border rounded-[var(--radius-outer)]">
        <SystemBadge systeem={selected as Systeem} />
        <div className="flex-1 min-w-0">
          <p className="text-lg font-semibold">{selected}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {filtered.length} {filtered.length === 1 ? "automation" : "automations"}
          </p>
        </div>
      </div>
      {filtered.length === 0 ? (
        <div className="text-center py-12">
          <p className="font-medium text-foreground">Geen automations</p>
          <p className="text-sm text-muted-foreground mt-1">Geen automations gekoppeld aan {selected}.</p>
        </div>
      ) : (
        <AutomationAccordion automations={filtered} />
      )}
    </div>
  );
}

// ── Eigenaren tab ─────────────────────────────────────────────────────────────

function EigenarenTab({
  all, selected, onSelect, onBack,
}: {
  all: Automation[]; selected: string | null;
  onSelect: (name: string) => void; onBack: () => void;
}) {
  const ownerCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const a of all) {
      if (a.owner?.trim()) map.set(a.owner, (map.get(a.owner) ?? 0) + 1);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }));
  }, [all]);

  const maxCount = ownerCounts[0]?.count ?? 1;

  if (!selected) {
    return ownerCounts.length === 0 ? (
      <div className="text-center py-16">
        <Users className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
        <p className="font-medium text-foreground">Geen eigenaren gevonden</p>
        <p className="text-sm text-muted-foreground mt-1">Er zijn nog geen automations toegewezen aan een eigenaar.</p>
      </div>
    ) : (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {ownerCounts.map(({ name, count }) => (
          <button
            key={name}
            onClick={() => onSelect(name)}
            className="group flex items-center justify-between p-4 bg-card border border-border rounded-[var(--radius-outer)] shadow-sm hover:border-primary/40 hover:shadow-md transition-all text-left"
          >
            <div className="flex items-center gap-3 min-w-0">
              <OwnerAvatar name={name} />
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{name}</p>
                <div className="mt-1.5 h-1 w-24 bg-secondary rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary/40 rounded-full"
                    style={{ width: `${Math.round((count / maxCount) * 100)}%` }}
                  />
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0 ml-3">
              <span className="text-sm font-semibold tabular-nums text-foreground">{count}</span>
              <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
            </div>
          </button>
        ))}
      </div>
    );
  }

  const filtered = all.filter((a) => a.owner === selected);

  return (
    <div className="space-y-5">
      <button onClick={onBack} className="text-sm text-primary hover:underline">
        ← Terug naar eigenaren
      </button>
      <div className="flex items-center gap-4 p-4 bg-card border border-border rounded-[var(--radius-outer)]">
        <OwnerAvatar name={selected} size="lg" />
        <div className="flex-1 min-w-0">
          <p className="text-lg font-semibold">{selected}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {filtered.length} {filtered.length === 1 ? "automation" : "automations"}
          </p>
        </div>
      </div>
      {filtered.length === 0 ? (
        <div className="text-center py-12">
          <p className="font-medium text-foreground">Geen automations</p>
          <p className="text-sm text-muted-foreground mt-1">{selected} heeft nog geen automations toegewezen.</p>
        </div>
      ) : (
        <AutomationAccordion automations={filtered} />
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SystemenEnEigenaren() {
  const { data, isLoading } = useAutomatiseringen();
  const [searchParams, setSearchParams] = useSearchParams();

  const tab    = searchParams.get("tab") ?? "systemen";
  const system = searchParams.get("system");
  const owner  = searchParams.get("owner");

  const all = data ?? [];

  const stats = useMemo(() => {
    const systems = new Set<string>();
    const owners  = new Set<string>();
    for (const a of all) {
      a.systemen.forEach((s) => systems.add(s));
      if (a.owner?.trim()) owners.add(a.owner);
    }
    return { automations: all.length, systems: systems.size, owners: owners.size };
  }, [all]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <h1 className="text-xl font-semibold">Systemen & Eigenaren</h1>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Automations" value={stats.automations} />
        <StatCard label="Systemen" value={stats.systems} />
        <StatCard label="Eigenaren" value={stats.owners} />
      </div>

      <Tabs value={tab} onValueChange={(v) => setSearchParams({ tab: v })}>
        <TabsList>
          <TabsTrigger value="systemen" className="gap-1.5">
            <Server className="h-3.5 w-3.5" />
            Systemen
          </TabsTrigger>
          <TabsTrigger value="eigenaren" className="gap-1.5">
            <Users className="h-3.5 w-3.5" />
            Eigenaren
          </TabsTrigger>
        </TabsList>

        <TabsContent value="systemen" className="mt-4">
          <SystemenTab
            all={all}
            selected={system}
            onSelect={(name) => setSearchParams({ tab: "systemen", system: name })}
            onBack={() => setSearchParams({ tab: "systemen" })}
          />
        </TabsContent>

        <TabsContent value="eigenaren" className="mt-4">
          <EigenarenTab
            all={all}
            selected={owner}
            onSelect={(name) => setSearchParams({ tab: "eigenaren", owner: name })}
            onBack={() => setSearchParams({ tab: "eigenaren" })}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
