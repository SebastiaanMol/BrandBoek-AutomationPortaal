import { Link } from "react-router-dom";
import type { Automatisering, Flow } from "@/lib/types";
import { getSystemMeta } from "@/lib/systemMeta";
import { ExternalLink, Repeat2, X } from "lucide-react";

interface AutomationDetailProps {
  automationId: string | null;
  currentFlowId: string;
  autoMap: Map<string, Automatisering>;
  allFlows: Flow[];
  onClose: () => void;
}

export const AutomationDetail = ({
  automationId,
  currentFlowId,
  autoMap,
  allFlows,
  onClose,
}: AutomationDetailProps) => {
  if (!automationId) return null;
  const auto = autoMap.get(automationId);
  if (!auto) return null;

  const primarySysteem = auto.systemen[0] ?? "Anders";
  const sys = getSystemMeta(primarySysteem);
  const reusedIn = allFlows.filter(
    (f) => f.id !== currentFlowId && f.automationIds.includes(automationId),
  );

  const description =
    auto.aiDescription ||
    auto.beschrijvingInSimpeleTaal?.[0] ||
    auto.doel;

  return (
    <div className="card-elevated p-5 animate-fade-in">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <span
            className="inline-flex items-center justify-center w-10 h-10 rounded-lg flex-shrink-0"
            style={{
              background: `color-mix(in oklab, hsl(var(${sys.hue})) 14%, transparent)`,
              color: `hsl(var(${sys.hue}))`,
            }}
          >
            <span className="text-xs font-bold">{sys.label.slice(0, 2).toUpperCase()}</span>
          </span>
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">
              Automation · {sys.label}
            </p>
            <h3 className="text-base font-semibold text-foreground leading-tight truncate">
              {auto.naam}
            </h3>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1.5 rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors focus-ring flex-shrink-0"
          aria-label="Sluiten"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <p className="text-sm text-foreground leading-relaxed">{description}</p>

      {reusedIn.length > 0 && (
        <div className="mt-4 p-3 rounded-lg bg-primary-soft border border-primary/20">
          <div className="flex items-center gap-1.5 text-primary mb-2">
            <Repeat2 className="w-3.5 h-3.5" />
            <span className="text-[11px] uppercase tracking-wider font-semibold">
              Ook gebruikt in
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {reusedIn.map((f) => (
              <Link
                key={f.id}
                to={`/flows/${f.id}`}
                className="inline-flex items-center px-2 py-0.5 rounded-md bg-card border border-primary/20 text-xs font-medium text-foreground hover:border-primary hover:text-primary transition-colors"
              >
                {f.naam}
              </Link>
            ))}
          </div>
        </div>
      )}

      {auto.stappen.length > 0 && (
        <div className="mt-4">
          <p className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-2">
            Interne stappen ({auto.stappen.length})
          </p>
          <ol className="relative space-y-0.5">
            <span
              className="absolute left-[15px] top-3 bottom-3 w-px bg-border"
              aria-hidden
            />
            {auto.stappen.map((stap, idx) => (
              <li key={idx} className="relative pl-10 py-1.5">
                <span
                  className="absolute left-1 top-2 inline-flex items-center justify-center w-7 h-7 rounded-full bg-card border border-border text-[10px] font-mono font-bold"
                  style={{ color: `hsl(var(${sys.hue}))` }}
                >
                  {String(idx + 1).padStart(2, "0")}
                </span>
                <p className="text-xs text-foreground leading-relaxed">{stap}</p>
              </li>
            ))}
          </ol>
        </div>
      )}

      <div className="mt-4 pt-4 border-t border-border">
        <Link
          to={`/alle?open=${auto.id}`}
          className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
        >
          Open in portaal
          <ExternalLink className="w-3 h-3" />
        </Link>
      </div>
    </div>
  );
};
