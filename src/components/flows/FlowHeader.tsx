import { Link } from "react-router-dom";
import type { Flow } from "@/lib/types";
import { getSystemMeta } from "@/lib/systemMeta";
import { Activity, Calendar, ChevronRight, Layers, Server } from "lucide-react";

interface FlowHeaderProps {
  flow: Flow;
  automationCount: number;
  naam: string;
  beschrijving: string;
  setNaam: (v: string) => void;
  setBeschrijving: (v: string) => void;
  isDirty: boolean;
  onSave: () => void;
  isSaving: boolean;
}

export const FlowHeader = ({
  flow,
  automationCount,
  naam,
  beschrijving,
  setNaam,
  setBeschrijving,
  isDirty,
  onSave,
  isSaving,
}: FlowHeaderProps) => {
  const uniqueSystems = [...new Set(flow.systemen)];
  const primarySystem = uniqueSystems[0];
  const primaryMeta = primarySystem ? getSystemMeta(primarySystem) : null;

  return (
    <header className="relative overflow-hidden rounded-2xl border border-border bg-gradient-hero">
      <div className="relative px-8 py-7">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-1 text-xs text-muted-foreground mb-4">
          <Link to="/flows" className="hover:text-foreground transition-colors">
            Flows
          </Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-foreground font-medium">{flow.naam}</span>
        </nav>

        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div className="min-w-0 flex-1">
            {/* Category-style badge row */}
            <div className="flex items-center gap-2 mb-2">
              {primaryMeta && (
                <span
                  className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] uppercase tracking-[0.14em] font-semibold"
                  style={{
                    background: `color-mix(in oklab, hsl(var(${primaryMeta.hue})) 14%, transparent)`,
                    color: `hsl(var(${primaryMeta.hue}))`,
                  }}
                >
                  {primaryMeta.label}
                </span>
              )}
              <span className="text-muted-foreground">·</span>
              <span className="text-[11px] font-mono text-muted-foreground">
                {new Date(flow.createdAt).toLocaleDateString("nl-NL")}
              </span>
            </div>

            <input
              className="text-3xl font-semibold tracking-tight text-foreground bg-transparent border-b border-transparent hover:border-border focus:border-border focus:outline-none w-full pb-0.5"
              value={naam}
              onChange={(e) => setNaam(e.target.value)}
            />
            <textarea
              className="mt-3 w-full max-w-2xl text-[15px] leading-relaxed text-muted-foreground bg-transparent border-b border-transparent hover:border-border focus:border-border focus:outline-none resize-none"
              rows={2}
              value={beschrijving}
              onChange={(e) => setBeschrijving(e.target.value)}
              placeholder="Beschrijving..."
            />

            <div className="mt-5 flex flex-wrap items-center gap-2">
              {uniqueSystems.map((s) => {
                const meta = getSystemMeta(s);
                return (
                  <span
                    key={s}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-card border border-border text-xs font-medium text-foreground/80"
                  >
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: `hsl(var(${meta.hue}))` }} />
                    {meta.label}
                  </span>
                );
              })}
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-card border border-border text-xs font-medium text-foreground/80">
                <Layers className="w-3 h-3" />
                {automationCount} automations
              </span>
            </div>
          </div>

          {/* Status + save action */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-card border border-border text-xs font-medium text-success">
              <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse-soft" />
              Actief
            </span>
            {isDirty && (
              <button
                type="button"
                onClick={onSave}
                disabled={isSaving}
                className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold shadow-sm hover:shadow-glow transition-shadow focus-ring disabled:opacity-50"
              >
                {isSaving ? "Opslaan..." : "Opslaan"}
              </button>
            )}
          </div>
        </div>

        {/* 4-column stat grid */}
        <div className="mt-7 grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard icon={Calendar} label="Aangemaakt" value={new Date(flow.createdAt).toLocaleDateString("nl-NL")} />
          <StatCard icon={Layers} label="Automations" value={String(automationCount)} />
          <StatCard icon={Server} label="Systemen" value={String(uniqueSystems.length)} />
          <StatCard icon={Activity} label="Status" value="Actief" accent="Geen openstaande updates" />
        </div>
      </div>
    </header>
  );
};

const StatCard = ({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: typeof Activity;
  label: string;
  value: string;
  accent?: string;
}) => (
  <div className="rounded-xl bg-card/80 backdrop-blur-sm border border-border px-4 py-3">
    <div className="flex items-center gap-1.5 text-muted-foreground">
      <Icon className="w-3.5 h-3.5" />
      <span className="text-[11px] uppercase tracking-wider font-semibold">{label}</span>
    </div>
    <p className="mt-1 text-sm font-semibold text-foreground truncate">{value}</p>
    {accent && <p className="text-[11px] text-success font-medium mt-0.5">{accent}</p>}
  </div>
);
