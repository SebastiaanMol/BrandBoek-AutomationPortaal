import { X, ExternalLink, Zap } from "lucide-react";
import { Link } from "react-router-dom";
import type { Automatisering } from "@/lib/types";
import {
  getLaneConfig,
  isPipelineStep,
  type Automation,
  type Connection,
  type CustomLane,
  type ProcessAttachment,
  type ProcessStep,
} from "@/data/processData";

interface ProcessviewerDetailPanelProps {
  selectedAutoId: string | null;
  selectedStepId: string | null;
  dbAutomations: Automatisering[];
  canvasAutomations: Automation[];
  steps: ProcessStep[];
  connections: Connection[];
  attachments: ProcessAttachment[];
  customLanes: CustomLane[];
  onClose: () => void;
  onSelectAuto: (id: string) => void;
}

export function ProcessviewerDetailPanel({
  selectedAutoId,
  selectedStepId,
  dbAutomations,
  canvasAutomations,
  steps,
  connections,
  attachments,
  customLanes,
  onClose,
  onSelectAuto,
}: ProcessviewerDetailPanelProps): React.ReactNode {
  const isVisible = !!(selectedAutoId || selectedStepId);
  if (!isVisible) return null;

  // ── Automation detail view ────────────────────────────────────────────────
  if (selectedAutoId) {
    const db = dbAutomations.find((a) => a.id === selectedAutoId);
    const canvas = canvasAutomations.find((a) => a.id === selectedAutoId);
    const fromStep = canvas?.fromStepId ? steps.find((s) => s.id === canvas.fromStepId) : null;
    const toStep   = canvas?.toStepId   ? steps.find((s) => s.id === canvas.toStepId)   : null;

    return (
      <Panel eyebrow="Automation" onClose={onClose}>
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100">
            <Zap className="h-4 w-4 text-amber-600" />
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Automation</p>
            <h3 className="mt-0.5 text-sm font-bold leading-snug text-slate-900">
              {db?.naam ?? canvas?.name ?? "Onbekend"}
            </h3>
          </div>
        </div>

        {db && (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {db.source && <Badge>{sourceLabel(db.source)}</Badge>}
            {db.status && <Badge tone={db.status === "actief" ? "green" : "neutral"}>{db.status}</Badge>}
            {db.categorie && <Badge tone="blue">{db.categorie}</Badge>}
          </div>
        )}

        {(fromStep || toStep) && (
          <div className="mt-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Koppeling</p>
            <div className="flex items-center gap-2 text-xs text-slate-600">
              {fromStep && <StepChip label={fromStep.label} />}
              {fromStep && toStep && <span className="text-slate-400">→</span>}
              {toStep && <StepChip label={toStep.label} />}
            </div>
          </div>
        )}

        {db?.doel && (
          <div className="mt-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Doel</p>
            <p className="text-xs leading-5 text-slate-600">{db.doel}</p>
          </div>
        )}

        {db?.trigger && (
          <div className="mt-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Trigger</p>
            <p className="text-xs leading-5 text-slate-600">{db.trigger}</p>
          </div>
        )}

        {db?.systemen && db.systemen.length > 0 && (
          <div className="mt-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Systemen</p>
            <div className="flex flex-wrap gap-1">
              {db.systemen.map((s) => <Badge key={s}>{s}</Badge>)}
            </div>
          </div>
        )}

        {db && (
          <div className="mt-5">
            <Link
              to={`/automations/${db.id}`}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-xs font-medium text-white hover:bg-slate-700 transition-colors"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Bekijk volledige automation
            </Link>
          </div>
        )}
      </Panel>
    );
  }

  // ── Step detail view ──────────────────────────────────────────────────────
  const step = steps.find((s) => s.id === selectedStepId);
  if (!step) return null;

  void attachments;

  const incomingRoutes = connections.filter((connection) => connection.toStepId === step.id && !!connection.fromStepId);
  const outgoingRoutes = connections.filter((connection) => connection.fromStepId === step.id);
  const linked = canvasAutomations.filter(
    (a) => a.fromStepId === step.id || a.toStepId === step.id,
  );
  const lane = getLaneConfig(step.team, customLanes);

  return (
    <Panel eyebrow={stepTypeLabel(step.type)} onClose={onClose}>
      <div>
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
          {stepTypeLabel(step.type)}
        </p>
        <h3 className="mt-0.5 text-sm font-bold leading-snug text-slate-900">{step.label}</h3>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <Badge
            style={{
              borderColor: lane.stroke,
              backgroundColor: lane.bg,
              color: lane.text,
            }}
          >
            {lane.label}
          </Badge>
          {isPipelineStep(step) && <Badge tone="blue">Pipeline</Badge>}
        </div>
      </div>

      <Section title="Overzicht">
        <DetailText>{step.description || "Geen beschrijving beschikbaar."}</DetailText>
      </Section>

      <Section title="Route">
        <div className="grid gap-3">
          <RouteList title="Inkomend" routes={incomingRoutes} steps={steps} direction="incoming" />
          <RouteList title="Uitgaand" routes={outgoingRoutes} steps={steps} direction="outgoing" />
        </div>
      </Section>

      {linked.length > 0 ? (
        <div className="mt-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">
            Gekoppelde automations ({linked.length})
          </p>
          <ul className="flex flex-col gap-1.5">
            {linked.map((auto) => {
              const db = dbAutomations.find((a) => a.id === auto.id);
              const isFrom = auto.fromStepId === step.id;
              return (
                <li key={auto.id}>
                  <button
                    onClick={() => onSelectAuto(auto.id)}
                    className="w-full flex items-start gap-2.5 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-left hover:border-amber-300 hover:bg-amber-50 transition-colors"
                  >
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-100">
                      <Zap className="h-3.5 w-3.5 text-amber-600" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-800 truncate">{auto.name}</p>
                      <p className="text-[10px] text-slate-500 mt-0.5">
                        {isFrom ? "Loopt ná deze stap" : "Loopt vóór deze stap"}
                        {db?.source ? ` · ${sourceLabel(db.source)}` : ""}
                      </p>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <EmptyState>Geen automations gekoppeld aan deze stap.</EmptyState>
      )}
    </Panel>
  );
}

// ── Shared sub-components ─────────────────────────────────────────────────────

function Panel({
  children,
  eyebrow,
  onClose,
}: {
  children: React.ReactNode;
  eyebrow: string;
  onClose: () => void;
}): React.ReactNode {
  return (
    <aside
      role="complementary"
      aria-label={`${eyebrow} detailmenu`}
      className="absolute top-0 right-0 z-20 h-full w-[min(420px,calc(100vw-24px))] overflow-y-auto border-l border-slate-200 bg-white shadow-lg"
      style={{
        maxHeight: "100%",
        animation: "slideInRight 220ms cubic-bezier(0.4,0,0.2,1)",
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
      `}</style>
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white/95 px-5 py-4 backdrop-blur">
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{eyebrow} detailmenu</p>
        <button
          aria-label="Sluit detailmenu"
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="px-5 py-5">{children}</div>
    </aside>
  );
}

function Section({ children, title }: { children: React.ReactNode; title: string }): React.ReactNode {
  return (
    <section className="mt-5 border-t border-slate-100 pt-4">
      <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{title}</h4>
      <div className="mt-2">{children}</div>
    </section>
  );
}

function EmptyState({ children }: { children: React.ReactNode }): React.ReactNode {
  return <p className="mt-4 text-xs text-slate-400">{children}</p>;
}

function DetailText({ children }: { children: React.ReactNode }): React.ReactNode {
  return <p className="text-sm leading-6 text-slate-600">{children}</p>;
}

function RouteList({
  direction,
  routes,
  steps,
  title,
}: {
  direction: "incoming" | "outgoing";
  routes: Connection[];
  steps: ProcessStep[];
  title: string;
}): React.ReactNode {
  if (routes.length === 0) {
    return (
      <div>
        <h5 className="text-[11px] font-semibold text-slate-700">{title}</h5>
        <p className="mt-1 text-xs text-slate-400">
          {direction === "incoming" ? "Geen inkomende routes" : "Geen uitgaande routes"}
        </p>
      </div>
    );
  }

  return (
    <div>
      <h5 className="text-[11px] font-semibold text-slate-700">{title}</h5>
      <ul className="mt-2 flex flex-col gap-1.5">
        {routes.map((route) => {
          const stepId = direction === "incoming" ? route.fromStepId : route.toStepId;
          const routeStep = steps.find((item) => item.id === stepId);

          return (
            <li
              key={route.id}
              className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 truncate text-xs font-semibold text-slate-800">
                  {routeStep?.label ?? "Onbekende stap"}
                </p>
                <Badge>{routeTypeLabel(route.routeType)}</Badge>
              </div>
              {route.label && <p className="mt-1 text-[11px] leading-4 text-slate-500">{route.label}</p>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Badge({
  children,
  tone = "neutral",
  style,
}: {
  children: React.ReactNode;
  tone?: "neutral" | "green" | "blue";
  style?: React.CSSProperties;
}): React.ReactNode {
  const cls =
    tone === "green"   ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
    tone === "blue"    ? "bg-blue-50 text-blue-700 border-blue-200" :
    "bg-slate-100 text-slate-600 border-slate-200";
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${cls}`}
      style={style}
    >
      {children}
    </span>
  );
}

function StepChip({ label }: { label: string }): React.ReactNode {
  return (
    <span className="max-w-[120px] truncate rounded-md border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
      {label}
    </span>
  );
}

function sourceLabel(source: string): string {
  if (source === "hubspot") return "HubSpot";
  if (source === "zapier")  return "Zapier";
  if (source === "gitlab")  return "GitLab";
  if (source === "typeform") return "Typeform";
  return source;
}

function routeTypeLabel(routeType?: Connection["routeType"]): string {
  if (routeType === "optional") return "Correctie / optioneel";
  if (routeType === "end") return "Uitzondering / einde";
  return "Hoofdroute";
}

function stepTypeLabel(type?: string): string {
  if (type === "start")    return "Start event";
  if (type === "end")      return "Eind event";
  if (type === "decision") return "Gateway";
  if (type === "optional") return "Optionele taak";
  return "Taak";
}
