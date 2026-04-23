import type { Automatisering, Flow } from "@/lib/types";
import { getSystemMeta } from "@/lib/systemMeta";
import { ChevronRight } from "lucide-react";

interface AutomationListProps {
  flow: Flow;
  autoMap: Map<string, Automatisering>;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export const AutomationList = ({ flow, autoMap, selectedId, onSelect }: AutomationListProps) => {
  return (
    <ol className="relative">
      <span className="absolute left-[19px] top-2 bottom-2 w-px bg-border" aria-hidden />
      {flow.automationIds.map((id, i) => {
        const auto = autoMap.get(id);
        if (!auto) return null;
        const primarySysteem = auto.systemen[0] ?? "Anders";
        const sys = getSystemMeta(primarySysteem);
        const active = id === selectedId;
        return (
          <li key={id} className="relative pl-12 pr-2 py-1.5">
            <span
              className="absolute left-[1px] top-3 inline-flex items-center justify-center w-9 h-9 rounded-full bg-card border-2 transition-colors text-[11px] font-bold"
              style={{
                borderColor: active ? `hsl(var(${sys.hue}))` : "hsl(var(--border))",
                color: `hsl(var(${sys.hue}))`,
              }}
            >
              {String(i + 1).padStart(2, "0")}
            </span>
            <button
              type="button"
              onClick={() => onSelect(id)}
              className={`w-full text-left rounded-lg px-3 py-2 transition-all duration-200 ${
                active
                  ? "bg-primary-soft border border-primary/30"
                  : "border border-transparent hover:bg-secondary"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <h4 className="text-sm font-semibold text-foreground leading-snug">
                    {auto.naam}
                  </h4>
                  <p className="mt-1 text-xs text-muted-foreground leading-relaxed line-clamp-2">
                    {auto.doel}
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
                      {auto.stappen.length} stap{auto.stappen.length === 1 ? "" : "pen"}
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
