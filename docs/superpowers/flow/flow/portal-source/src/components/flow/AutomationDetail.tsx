import { Link } from "react-router-dom";
import {
  ATOMIC_AUTOMATIONS,
  SYSTEMS,
  getProcessesUsingAutomation,
} from "@/data/portal";
import { stepKindMeta } from "@/lib/stepKind";
import { ExternalLink, Repeat2, X } from "lucide-react";

interface AutomationDetailProps {
  automationId: string | null;
  currentProcessId: string;
  onClose: () => void;
}

export const AutomationDetail = ({
  automationId,
  currentProcessId,
  onClose,
}: AutomationDetailProps) => {
  if (!automationId) return null;
  const a = ATOMIC_AUTOMATIONS[automationId];
  if (!a) return null;
  const sys = SYSTEMS[a.system];
  const reusedIn = getProcessesUsingAutomation(automationId).filter(
    (p) => p.id !== currentProcessId
  );

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
              {a.name}
            </h3>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors focus-ring flex-shrink-0"
          aria-label="Sluiten"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <p className="text-sm text-foreground leading-relaxed">{a.description}</p>

      {/* Reuse badges */}
      {reusedIn.length > 0 && (
        <div className="mt-4 p-3 rounded-lg bg-primary-soft border border-primary/20">
          <div className="flex items-center gap-1.5 text-primary mb-2">
            <Repeat2 className="w-3.5 h-3.5" />
            <span className="text-[11px] uppercase tracking-wider font-semibold">
              Ook gebruikt in
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {reusedIn.map((p) => (
              <Link
                key={p.id}
                to={`/process/${p.id}`}
                className="inline-flex items-center px-2 py-0.5 rounded-md bg-card border border-primary/20 text-xs font-medium text-foreground hover:border-primary hover:text-primary transition-colors"
              >
                {p.name}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Internal steps */}
      <div className="mt-4">
        <p className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-2">
          Interne stappen ({a.steps.length})
        </p>
        <ol className="relative space-y-0.5">
          <span
            className="absolute left-[15px] top-3 bottom-3 w-px bg-border"
            aria-hidden
          />
          {a.steps.map((step) => {
            const meta = stepKindMeta[step.kind];
            const Icon = meta.Icon;
            return (
              <li key={step.id} className="relative pl-10 py-1.5">
                <span
                  className="absolute left-1 top-2 inline-flex items-center justify-center w-7 h-7 rounded-full bg-card border border-border"
                  style={{ color: `hsl(var(${sys.hue}))` }}
                >
                  <Icon className="w-3.5 h-3.5" />
                </span>
                <div className="text-xs">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono text-muted-foreground">
                      {String(step.order).padStart(2, "0")}
                    </span>
                    <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                      {meta.label}
                    </span>
                  </div>
                  <p className="font-semibold text-foreground mt-0.5">{step.title}</p>
                  <p className="text-muted-foreground mt-0.5 leading-relaxed">
                    {step.summary}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      </div>

      <div className="mt-4 pt-4 border-t border-border flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          Laatste run: <span className="text-foreground font-medium">{a.lastRun}</span>
        </span>
        <button className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
          Open in {sys.label}
          <ExternalLink className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
};
