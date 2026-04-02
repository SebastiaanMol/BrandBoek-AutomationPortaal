import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAutomatiseringen } from "@/lib/hooks";
import { Systeem } from "@/lib/types";
import { SystemBadge, StatusBadge, CategorieBadge } from "@/components/Badges";
import { VerificatieBadge } from "@/components/VerificatieBadge";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Loader2, Server } from "lucide-react";

export default function Systems() {
  const { data, isLoading } = useAutomatiseringen();
  const [searchParams, setSearchParams] = useSearchParams();
  const [openId, setOpenId] = useState<string | null>(null);

  const selected = searchParams.get("system");

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const all = data || [];

  // Derive system counts from actual automation data (NOT SYSTEMEN constant)
  const systemCounts = new Map<string, number>();
  for (const a of all) {
    for (const s of a.systemen) {
      systemCounts.set(s, (systemCounts.get(s) ?? 0) + 1);
    }
  }
  const systems = [...systemCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count }));

  // LIST VIEW
  if (!selected) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold">Systems</h1>

        {systems.length === 0 ? (
          <div className="text-center py-12">
            <Server className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
            <p className="font-medium text-foreground">No systems found</p>
            <p className="text-sm text-muted-foreground mt-1">
              No automations have been linked to any system yet.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {systems.map(({ name, count }) => (
              <button
                key={name}
                onClick={() => setSearchParams({ system: name })}
                className="w-full flex items-center justify-between py-2 px-4 bg-card border border-border rounded-[var(--radius-outer)] shadow-sm hover:bg-secondary/50 transition-colors text-left"
              >
                <div className="flex items-center">
                  <SystemBadge systeem={name as Systeem} />
                  <span className="text-sm font-normal ml-2">{name}</span>
                </div>
                <span className="px-2 py-1 rounded-full text-[10px] bg-secondary text-muted-foreground">
                  {count} {count === 1 ? "automation" : "automations"}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // DETAIL VIEW
  const filtered = all.filter((a) => a.systemen.includes(selected as Systeem));

  return (
    <div className="space-y-4">
      <button
        onClick={() => setSearchParams({})}
        className="text-sm text-primary hover:underline"
      >
        ← Back to Systems
      </button>
      <h1 className="sr-only">Systems</h1>

      <div className="flex items-center">
        <SystemBadge systeem={selected as Systeem} />
        <span className="text-xl font-semibold ml-2">{selected}</span>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-12">
          <p className="font-medium text-foreground">No automations</p>
          <p className="text-sm text-muted-foreground mt-1">
            No automations are linked to {selected}.
          </p>
        </div>
      ) : (
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
                  className="w-full px-5 py-4 flex items-center gap-3 justify-between text-left hover:bg-secondary/50 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <span className="font-mono text-xs text-muted-foreground shrink-0 w-[72px]">
                      {a.id}
                    </span>
                    <span
                      className="font-normal truncate w-[280px] shrink-0"
                      title={a.naam}
                    >
                      {a.naam}
                    </span>
                    <div className="flex items-center gap-2 shrink-0">
                      <CategorieBadge categorie={a.categorie} />
                      <StatusBadge status={a.status} />
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <VerificatieBadge item={a} />
                    <ChevronDown
                      className={`h-4 w-4 text-muted-foreground transition-transform ${
                        isOpen ? "rotate-180" : ""
                      }`}
                    />
                  </div>
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
                      <div className="px-4 pb-4 pt-2 border-t border-border space-y-4">
                        <div className="grid md:grid-cols-2 gap-4">
                          <Detail label="Source System" value={a.categorie} />
                          <Detail label="Goal" value={a.doel} />
                          <Detail label="Trigger" value={a.trigger} />
                          <Detail label="Owner" value={a.owner} />
                          <Detail label="Dependencies" value={a.afhankelijkheden} />
                        </div>
                        <div>
                          <p className="label-uppercase mb-1">Systems</p>
                          <div className="flex gap-1.5 flex-wrap">
                            {a.systemen.map((s) => (
                              <SystemBadge key={s} systeem={s} />
                            ))}
                          </div>
                        </div>
                        <div>
                          <p className="label-uppercase mb-1">Flow Steps</p>
                          <ol className="list-decimal list-inside text-sm text-foreground space-y-0.5">
                            {a.stappen.map((s, i) => (
                              <li key={i}>{s}</li>
                            ))}
                          </ol>
                        </div>
                        {a.verbeterideeën && (
                          <Detail label="Improvement Ideas" value={a.verbeterideeën} />
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      )}
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
