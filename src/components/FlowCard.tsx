import { Link } from "react-router-dom";
import type { Automatisering, Flow } from "@/lib/types";
import { getSystemMeta } from "@/lib/systemMeta";
import { MiniFlowPreview } from "@/components/portal/MiniFlowPreview";
import { ArrowUpRight } from "lucide-react";

interface FlowCardProps {
  flow: Flow;
  autoMap: Map<string, Automatisering>;
  hasUpdate?: boolean;
}

export function FlowCard({ flow, autoMap, hasUpdate }: FlowCardProps) {
  const uniqueSystems = [...new Set(flow.systemen)];

  return (
    <Link
      to={`/flows/${flow.id}`}
      className="group block rounded-xl bg-card border border-border shadow-sm hover:shadow-lg hover:-translate-y-0.5 hover:border-primary/30 transition-all duration-200 focus-ring"
    >
      <div className="p-5">
        <div className="flex items-center justify-between mb-3">
          <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-secondary text-[11px] font-semibold text-secondary-foreground tracking-wide">
            {uniqueSystems[0] ?? "Flow"}
          </span>
          {hasUpdate ? (
            <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-warning">
              <span className="w-1.5 h-1.5 rounded-full bg-warning" />
              Update beschikbaar
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-success">
              <span className="w-1.5 h-1.5 rounded-full bg-success" />
              Actief
            </span>
          )}
        </div>

        <div className="flex items-start justify-between gap-2">
          <h3 className="text-base font-semibold text-foreground leading-snug group-hover:text-primary transition-colors">
            {flow.naam}
          </h3>
          <ArrowUpRight className="w-4 h-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all flex-shrink-0 mt-0.5" />
        </div>
        {flow.beschrijving && (
          <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed line-clamp-2">
            {flow.beschrijving}
          </p>
        )}

        <div className="mt-4">
          <MiniFlowPreview automationIds={flow.automationIds} autoMap={autoMap} />
        </div>

        <div className="mt-4 pt-3 border-t border-border flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div>
              <p className="text-sm font-semibold text-foreground tabular-nums">
                {flow.automationIds.length}
              </p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                automations
              </p>
            </div>
            <div className="h-7 w-px bg-border" />
            <div className="flex items-center">
              {uniqueSystems.slice(0, 5).map((s) => {
                const meta = getSystemMeta(s);
                return (
                  <span
                    key={s}
                    title={meta.label}
                    className="w-5 h-5 rounded-full border-2 border-card -ml-1 first:ml-0"
                    style={{ background: `hsl(var(${meta.hue}))` }}
                  />
                );
              })}
              {uniqueSystems.length > 5 && (
                <span className="text-[10px] font-mono text-muted-foreground ml-1">
                  +{uniqueSystems.length - 5}
                </span>
              )}
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground">
            {new Date(flow.createdAt).toLocaleDateString("nl-NL")}
          </p>
        </div>
      </div>
    </Link>
  );
}
