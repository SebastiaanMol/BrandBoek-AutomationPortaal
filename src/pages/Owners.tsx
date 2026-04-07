import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAutomatiseringen } from "@/lib/hooks";
import { StatusBadge, CategorieBadge, SystemBadge } from "@/components/Badges";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Loader2, Users, Zap } from "lucide-react";

export default function Owners() {
  const { data, isLoading } = useAutomatiseringen();
  const [searchParams, setSearchParams] = useSearchParams();
  const [openId, setOpenId] = useState<string | null>(null);

  const selected = searchParams.get("owner");

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const all = data || [];

  const ownerCounts = new Map<string, number>();
  for (const a of all) {
    if (a.owner?.trim()) {
      ownerCounts.set(a.owner, (ownerCounts.get(a.owner) ?? 0) + 1);
    }
  }
  const owners = [...ownerCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count }));

  if (selected === null) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold">Owners</h1>
        {owners.length === 0 ? (
          <div className="text-center py-12">
            <p className="font-semibold text-foreground">No owners found</p>
            <p className="text-sm text-muted-foreground mt-1">No automations have been assigned an owner yet.</p>
          </div>
        ) : (
          owners.map(({ name, count }) => (
            <button
              key={name}
              onClick={() => setSearchParams({ owner: name })}
              className="w-full flex items-center justify-between py-2 px-4 bg-card border border-border rounded-[var(--radius-outer)] shadow-sm hover:bg-secondary/50 transition-colors text-left"
            >
              <div className="flex items-center">
                <Users className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-normal ml-2">{name}</span>
              </div>
              <span className="px-2 py-1 rounded-full text-[10px] bg-secondary text-muted-foreground">
                {count} {count === 1 ? "automation" : "automations"}
              </span>
            </button>
          ))
        )}
      </div>
    );
  }

  const filtered = all.filter(a => a.owner === selected);

  return (
    <div className="space-y-4">
      <button
        onClick={() => setSearchParams({})}
        className="text-sm text-primary hover:underline"
      >
        ← Back to Owners
      </button>
      <h1 className="sr-only">Owners</h1>
      <div className="flex items-center">
        <Users className="h-5 w-5 text-muted-foreground" />
        <span className="text-xl font-semibold ml-2">{selected}</span>
      </div>
      {filtered.length === 0 ? (
        <div className="text-center py-12">
          <p className="font-semibold text-foreground">No automations</p>
          <p className="text-sm text-muted-foreground mt-1">{selected} has no automations assigned.</p>
        </div>
      ) : (
        filtered.map((a) => {
          const isOpen = openId === a.id;
          return (
            <div key={a.id} className="bg-card border border-border rounded-[var(--radius-outer)] shadow-sm overflow-hidden">
              <button
                onClick={() => setOpenId(isOpen ? null : a.id)}
                className="w-full px-5 py-4 flex items-center gap-3 justify-between text-left hover:bg-secondary/50 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <span className="font-mono text-xs text-muted-foreground shrink-0 w-[72px]">{a.id}</span>
                  <span className="font-normal truncate w-[280px] shrink-0" title={a.naam}>{a.naam}</span>
                  <div className="flex items-center gap-2 shrink-0">
                    <CategorieBadge categorie={a.categorie} />
                    <StatusBadge status={a.status} />
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`} />
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
                    <div className="px-4 pb-4 pt-3 border-t border-border space-y-5">
                      {/* Plain-language description */}
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

                      {/* Trigger */}
                      {a.trigger && (
                        <div className="flex items-start gap-2">
                          <Zap className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                          <div>
                            <p className="label-uppercase mb-0.5">Wordt gestart door</p>
                            <p className="text-sm text-foreground">{a.trigger}</p>
                          </div>
                        </div>
                      )}

                      {/* Flow steps */}
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

                      {/* Meta */}
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
                        {a.afhankelijkheden && <Detail label="Dependencies" value={a.afhankelijkheden} />}
                      </div>

                      {/* Systems */}
                      <div>
                        <p className="label-uppercase mb-1">Systemen</p>
                        <div className="flex gap-1.5 flex-wrap">
                          {a.systemen.map((s) => <SystemBadge key={s} systeem={s} />)}
                        </div>
                      </div>

                      {a.verbeterideeën && <Detail label="Improvement Ideas" value={a.verbeterideeën} />}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })
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
