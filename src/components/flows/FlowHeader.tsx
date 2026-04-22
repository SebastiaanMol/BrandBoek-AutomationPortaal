import { Link } from "react-router-dom";
import type { Flow } from "@/lib/types";
import { getSystemMeta } from "@/lib/systemMeta";
import { ChevronRight, Layers } from "lucide-react";

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

            <div className="mt-4 flex flex-wrap items-center gap-2">
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

          {isDirty && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onSave}
                disabled={isSaving}
                className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold shadow-sm hover:shadow-glow transition-shadow focus-ring disabled:opacity-50"
              >
                {isSaving ? "Opslaan..." : "Opslaan"}
              </button>
            </div>
          )}
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3 max-w-xs">
          <div className="rounded-xl bg-card/80 backdrop-blur-sm border border-border px-4 py-3">
            <p className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">
              Aangemaakt
            </p>
            <p className="mt-1 text-sm font-semibold text-foreground">
              {new Date(flow.createdAt).toLocaleDateString("nl-NL")}
            </p>
          </div>
          <div className="rounded-xl bg-card/80 backdrop-blur-sm border border-border px-4 py-3">
            <p className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">
              Automations
            </p>
            <p className="mt-1 text-sm font-semibold text-foreground">{automationCount}</p>
          </div>
        </div>
      </div>
    </header>
  );
};
