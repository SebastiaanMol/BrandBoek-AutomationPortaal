import { Link } from "react-router-dom";
import {
  SYSTEMS,
  systemsForProcess,
  type BusinessProcess,
} from "@/data/portal";
import { MiniFlowPreview } from "./MiniFlowPreview";
import { ArrowUpRight, Clock } from "lucide-react";

const statusMeta = {
  active: { label: "Actief", dot: "bg-success", text: "text-success" },
  paused: { label: "Gepauzeerd", dot: "bg-warning", text: "text-warning" },
  error: { label: "Fout", dot: "bg-destructive", text: "text-destructive" },
} as const;

export const ProcessCard = ({ process }: { process: BusinessProcess }) => {
  const s = statusMeta[process.status];
  const systems = systemsForProcess(process);

  return (
    <Link
      to={`/process/${process.id}`}
      className="group block rounded-xl bg-card border border-border shadow-sm hover:shadow-lg hover:-translate-y-0.5 hover:border-primary/30 transition-all duration-200 ease-base focus-ring"
    >
      <div className="p-5">
        <div className="flex items-center justify-between mb-3">
          <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-secondary text-[11px] font-semibold text-secondary-foreground tracking-wide">
            {process.category}
          </span>
          <span
            className={`inline-flex items-center gap-1.5 text-[11px] font-medium ${s.text}`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
            {s.label}
          </span>
        </div>

        <div className="flex items-start justify-between gap-2">
          <h3 className="text-base font-semibold text-foreground leading-snug group-hover:text-primary transition-colors">
            {process.name}
          </h3>
          <ArrowUpRight className="w-4 h-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all flex-shrink-0 mt-0.5" />
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed line-clamp-2">
          {process.description}
        </p>

        <div className="mt-4">
          <MiniFlowPreview process={process} />
        </div>

        <div className="mt-4 pt-3 border-t border-border flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div>
              <p className="text-sm font-semibold text-foreground tabular-nums">
                {process.automationIds.length}
              </p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                automations
              </p>
            </div>
            <div className="h-7 w-px bg-border" />
            <div className="flex items-center gap-1">
              {systems.map((key) => {
                const sys = SYSTEMS[key];
                return (
                  <span
                    key={key}
                    title={sys.label}
                    className="w-5 h-5 rounded-full border-2 border-card -ml-1 first:ml-0"
                    style={{ background: `hsl(var(${sys.hue}))` }}
                  />
                );
              })}
            </div>
          </div>

          <div className="text-right">
            <p className="text-xs font-semibold text-success tabular-nums">
              {process.successRate}%
            </p>
            <p className="text-[10px] text-muted-foreground flex items-center gap-1 justify-end">
              <Clock className="w-2.5 h-2.5" />
              {process.lastRun}
            </p>
          </div>
        </div>
      </div>
    </Link>
  );
};
