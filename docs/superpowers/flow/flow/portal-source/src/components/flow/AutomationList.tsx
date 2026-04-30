import {
  ATOMIC_AUTOMATIONS,
  SYSTEMS,
  type BusinessProcess,
} from "@/data/portal";
import { ChevronRight } from "lucide-react";

interface AutomationListProps {
  process: BusinessProcess;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export const AutomationList = ({
  process,
  selectedId,
  onSelect,
}: AutomationListProps) => {
  return (
    <ol className="relative">
      <span
        className="absolute left-[19px] top-2 bottom-2 w-px bg-border"
        aria-hidden
      />
      {process.automationIds.map((id, i) => {
        const a = ATOMIC_AUTOMATIONS[id];
        if (!a) return null;
        const sys = SYSTEMS[a.system];
        const active = id === selectedId;
        return (
          <li key={id} className="relative pl-12 pr-2 py-1.5">
            <span
              className="absolute left-2 top-3 inline-flex items-center justify-center w-9 h-9 rounded-full bg-card border-2 transition-colors text-[11px] font-bold"
              style={{
                borderColor: active ? `hsl(var(${sys.hue}))` : "hsl(var(--border))",
                color: `hsl(var(${sys.hue}))`,
              }}
            >
              {String(i + 1).padStart(2, "0")}
            </span>
            <button
              onClick={() => onSelect(id)}
              className={`w-full text-left rounded-lg px-3 py-2 transition-all duration-200 ease-base ${
                active
                  ? "bg-primary-soft border border-primary/30"
                  : "border border-transparent hover:bg-secondary"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <h4 className="text-sm font-semibold text-foreground leading-snug">
                    {a.name}
                  </h4>
                  <p className="mt-1 text-xs text-muted-foreground leading-relaxed line-clamp-2">
                    {a.description}
                  </p>
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <span
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ background: `hsl(var(${sys.hue}))` }}
                    />
                    <span className="text-[11px] font-medium text-muted-foreground">
                      {sys.label}
                    </span>
                    <span className="text-muted-foreground">·</span>
                    <span className="text-[11px] text-muted-foreground">
                      {a.steps.length} stap{a.steps.length === 1 ? "" : "pen"}
                    </span>
                  </div>
                </div>
                <ChevronRight
                  className={`w-4 h-4 text-muted-foreground transition-transform flex-shrink-0 ${
                    active ? "translate-x-0.5 text-primary" : ""
                  }`}
                />
              </div>
            </button>
          </li>
        );
      })}
    </ol>
  );
};
