import { Link } from "react-router-dom";
import {
  SYSTEMS,
  systemsForProcess,
  type BusinessProcess,
} from "@/data/portal";
import { Activity, ChevronRight, Clock, Play, Repeat, User2 } from "lucide-react";

const statusMeta = {
  active: { label: "Actief", dot: "bg-success", text: "text-success" },
  paused: { label: "Gepauzeerd", dot: "bg-warning", text: "text-warning" },
  error: { label: "Fout", dot: "bg-destructive", text: "text-destructive" },
} as const;

export const ProcessHeader = ({ process }: { process: BusinessProcess }) => {
  const s = statusMeta[process.status];
  const systems = systemsForProcess(process);

  return (
    <header className="relative overflow-hidden rounded-2xl border border-border bg-gradient-hero">
      <div className="relative px-8 py-7">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-1 text-xs text-muted-foreground mb-4">
          <Link to="/" className="hover:text-foreground transition-colors">
            Automatiseringen
          </Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-foreground font-medium">{process.name}</span>
        </nav>

        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-2">
              <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-primary/10 text-[11px] uppercase tracking-[0.14em] font-semibold text-primary">
                {process.category}
              </span>
              <span className="text-muted-foreground">·</span>
              <span className="text-[11px] font-mono text-muted-foreground">
                {process.id}
              </span>
            </div>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">
              {process.name}
            </h1>
            <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
              {process.description}
            </p>

            <div className="mt-5 flex flex-wrap items-center gap-2">
              {systems.map((key) => {
                const sys = SYSTEMS[key];
                return (
                  <span
                    key={key}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-card border border-border text-xs font-medium text-foreground/80"
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ background: `hsl(var(${sys.hue}))` }}
                    />
                    {sys.label}
                  </span>
                );
              })}
              <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-card border border-border text-xs font-medium text-foreground/80">
                {process.automationIds.length} automations
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-card border border-border text-xs font-medium ${s.text}`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${s.dot} animate-pulse-soft`} />
              {s.label}
            </span>
            <button className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold shadow-sm hover:shadow-glow transition-shadow focus-ring">
              <Play className="w-3.5 h-3.5" />
              Test run
            </button>
          </div>
        </div>

        <div className="mt-7 grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat icon={Repeat} label="Trigger" value={process.trigger} />
          <Stat icon={Clock} label="Frequentie" value={process.frequency} />
          <Stat icon={Activity} label="Laatste run" value={process.lastRun} />
          <Stat
            icon={User2}
            label="Eigenaar"
            value={process.owner}
            accent={`${process.successRate}% succes`}
          />
        </div>
      </div>
    </header>
  );
};

const Stat = ({
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
    {accent && (
      <p className="text-[11px] text-success font-medium mt-0.5">{accent}</p>
    )}
  </div>
);
