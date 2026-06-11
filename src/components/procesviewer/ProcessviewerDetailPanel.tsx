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

  if (selectedAutoId) {
    const db = dbAutomations.find((a) => a.id === selectedAutoId);
    const canvas = canvasAutomations.find((a) => a.id === selectedAutoId);
    const fromStep = canvas?.fromStepId ? steps.find((s) => s.id === canvas.fromStepId) : null;
    const toStep = canvas?.toStepId ? steps.find((s) => s.id === canvas.toStepId) : null;
    const title = db?.naam ?? canvas?.name ?? "Onbekende automation";
    const source = db?.source ? sourceLabel(db.source) : canvas?.tool;
    const goal = db?.doel || canvas?.goal;
    const verifiedDate = formatDate(db?.laatstGeverifieerd);

    return (
      <Panel eyebrow="Automation" onClose={onClose}>
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100">
            <Zap className="h-4 w-4 text-amber-600" />
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Automation</p>
            <h3 className="mt-0.5 text-sm font-bold leading-snug text-slate-900">
              {title}
            </h3>
          </div>
        </div>

        {(source || db?.status || db?.categorie) && (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {source && <Badge>{source}</Badge>}
            {db?.status && <Badge tone={db.status.toLowerCase() === "actief" ? "green" : "neutral"}>{db.status}</Badge>}
            {db?.categorie && <Badge tone="blue">{db.categorie}</Badge>}
          </div>
        )}

        <Section title="Koppeling">
          {fromStep || toStep ? (
            <div className="flex items-center gap-2 text-xs text-slate-600">
              {fromStep && <StepChip label={fromStep.label} />}
              {fromStep && toStep && <span className="text-slate-400">-&gt;</span>}
              {toStep && <StepChip label={toStep.label} />}
            </div>
          ) : (
            <EmptyState>Geen proceskoppeling bekend.</EmptyState>
          )}
        </Section>

        <Section title="Doel">
          {goal ? <DetailText>{goal}</DetailText> : <EmptyState>Geen doel beschikbaar.</EmptyState>}
        </Section>

        <Section title="Trigger">
          {db?.trigger ? <DetailText>{db.trigger}</DetailText> : <EmptyState>Geen trigger beschikbaar.</EmptyState>}
        </Section>

        <Section title="Systemen en eigenaar">
          {db?.systemen && db.systemen.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {db.systemen.map((s) => <Badge key={s}>{s}</Badge>)}
            </div>
          ) : (
            <EmptyState>Geen systemen bekend.</EmptyState>
          )}
          {db?.owner && <p className="mt-2 text-xs leading-5 text-slate-600">Eigenaar: {db.owner}</p>}
        </Section>

        <Section title="Verificatie">
          {verifiedDate ? (
            <div>
              <p className="text-[11px] font-semibold text-slate-700">Laatst geverifieerd</p>
              <p className="mt-1 text-xs leading-5 text-slate-600">{verifiedDate}</p>
            </div>
          ) : (
            <EmptyState>Geen verificatiedatum beschikbaar.</EmptyState>
          )}
        </Section>

        {db && (
          <div className="mt-5">
            <Link
              to={`/automations/${db.id}`}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-slate-700"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Bekijk volledige automation
            </Link>
          </div>
        )}
      </Panel>
    );
  }

  const step = steps.find((s) => s.id === selectedStepId);
  if (!step) return null;

  const incomingRoutes = connections.filter((connection) => connection.toStepId === step.id && !!connection.fromStepId);
  const outgoingRoutes = connections.filter((connection) => connection.fromStepId === step.id);
  const linkedAutomations = canvasAutomations.filter(
    (automation) => automation.fromStepId === step.id || automation.toStepId === step.id,
  );
  const taskAttachments = attachments.filter(
    (attachment) => attachment.attachedTo.kind === "step" && attachment.attachedTo.id === step.id,
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

      <Section title="Gekoppelde automations">
        {linkedAutomations.length > 0 ? (
          <ul className="flex flex-col gap-1.5">
            {linkedAutomations.map((automation) => {
              const db = dbAutomations.find((item) => item.id === automation.id);
              return (
                <li key={automation.id}>
                  <AutomationSummaryCard
                    automation={automation}
                    db={db}
                    stepId={step.id}
                    onSelectAuto={onSelectAuto}
                  />
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState>Geen automations gekoppeld aan deze taak</EmptyState>
        )}
      </Section>

      <Section title="Bijlagen">
        {taskAttachments.length > 0 ? (
          <ul className="flex flex-col gap-1.5">
            {taskAttachments.map((attachment) => (
              <li key={attachment.id}>
                <AttachmentCard attachment={attachment} />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState>Geen bijlagen gekoppeld aan deze taak</EmptyState>
        )}
      </Section>
    </Panel>
  );
}

function formatDate(value?: string | null): string | null {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return new Intl.DateTimeFormat("nl-NL", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

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

function AutomationSummaryCard({
  automation,
  db,
  onSelectAuto,
  stepId,
}: {
  automation: Automation;
  db?: Automatisering;
  onSelectAuto: (id: string) => void;
  stepId: string;
}): React.ReactNode {
  const name = db?.naam ?? automation.name;
  const source = db?.source ? sourceLabel(db.source) : automation.tool;
  const direction = automation.fromStepId === stepId ? "Loopt na deze taak" : "Loopt voor deze taak";
  const goal = db?.doel || automation.goal;
  const systems = db?.systemen ?? [];

  return (
    <button
      aria-label={`Open automation ${name}`}
      onClick={() => onSelectAuto(automation.id)}
      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-left transition-colors hover:border-amber-300 hover:bg-amber-50"
    >
      <span className="flex items-start gap-2.5">
        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-100">
          <Zap className="h-3.5 w-3.5 text-amber-600" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-semibold text-slate-800">{name}</span>
          <span className="mt-1 flex flex-wrap gap-1">
            <Badge>{direction}</Badge>
            {source && <Badge>{db ? `Bron: ${source}` : source}</Badge>}
            {db?.status && <Badge tone={db.status.toLowerCase() === "actief" ? "green" : "neutral"}>{db.status}</Badge>}
            {db?.categorie && <Badge tone="blue">{db.categorie}</Badge>}
          </span>
          {db?.trigger && <span className="mt-2 block text-[11px] leading-4 text-slate-500">{db.trigger}</span>}
          {goal && <span className="mt-1 block text-[11px] leading-4 text-slate-600">{goal}</span>}
          {db?.owner && <span className="mt-1 block text-[11px] leading-4 text-slate-500">{db.owner}</span>}
          {systems.length > 0 && (
            <span className="mt-2 flex flex-wrap gap-1">
              {systems.map((system) => <Badge key={system}>{system}</Badge>)}
            </span>
          )}
        </span>
      </span>
    </button>
  );
}

function AttachmentCard({ attachment }: { attachment: ProcessAttachment }): React.ReactNode {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 text-xs font-semibold leading-5 text-slate-800">{attachment.label}</p>
        <Badge>{attachmentTypeLabel(attachment.type)}</Badge>
      </div>
      {attachment.description && (
        <p className="mt-1 text-[11px] leading-4 text-slate-500">{attachment.description}</p>
      )}
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
    tone === "green" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
    tone === "blue" ? "bg-blue-50 text-blue-700 border-blue-200" :
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
  if (source === "zapier") return "Zapier";
  if (source === "gitlab") return "GitLab";
  if (source === "typeform") return "Typeform";
  return source;
}

function routeTypeLabel(routeType?: Connection["routeType"]): string {
  if (routeType === "optional") return "Correctie / optioneel";
  if (routeType === "end") return "Uitzondering / einde";
  return "Hoofdroute";
}

function attachmentTypeLabel(type: ProcessAttachment["type"]): string {
  if (type === "annotation") return "Notitie";
  if (type === "dataObject") return "Data/document";
  if (type === "dataStore") return "Databron";
  return type;
}

function stepTypeLabel(type?: string): string {
  if (type === "start") return "Start event";
  if (type === "end") return "Eind event";
  if (type === "decision") return "Gateway";
  if (type === "optional") return "Optionele taak";
  return "Taak";
}
