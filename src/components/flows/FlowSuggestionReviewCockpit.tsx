import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  CircleDashed,
  GitBranch,
  ShieldCheck,
  Sparkles,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import type {
  FlowSuggestionReviewMetric,
  FlowSuggestionReviewPresentation,
} from "@/lib/flowSuggestionReviewPresentation";
import { cn } from "@/lib/utils";

interface FlowSuggestionReviewCockpitProps {
  presentation: FlowSuggestionReviewPresentation;
  onAccept: () => void;
  onReject: () => void;
  rejectPending: boolean;
}

type Tone = "default" | "success" | "warning" | "danger";

const toneClasses: Record<Tone, string> = {
  default: "border-border bg-muted/30 text-muted-foreground",
  success: "border-emerald-200 bg-emerald-50 text-emerald-800",
  warning: "border-amber-200 bg-amber-50 text-amber-800",
  danger: "border-red-200 bg-red-50 text-red-800",
};

export function FlowSuggestionReviewCockpit({
  presentation,
  onAccept,
  onReject,
  rejectPending,
}: FlowSuggestionReviewCockpitProps): ReactNode {
  const isReady = presentation.approvalState.status === "ready";

  return (
    <div className="min-w-0 space-y-5">
      <section className="min-w-0 rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="flex min-w-0 flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <StatusPill
              tone={isReady ? "success" : "danger"}
              icon={isReady ? CheckCircle2 : AlertTriangle}
            >
              {presentation.approvalState.label}
            </StatusPill>
            <p className="mt-4 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              Concept-procesreis
            </p>
            <h1 className="mt-1 max-w-5xl break-words text-3xl font-semibold tracking-tight text-foreground">
              {presentation.title}
            </h1>
            <p className="mt-3 max-w-4xl text-sm leading-relaxed text-muted-foreground">
              {presentation.approvalState.detail}
            </p>
            <div className="mt-4 flex min-w-0 flex-wrap gap-2">
              {presentation.badges.length > 0 ? (
                presentation.badges.map((badge) => (
                  <span
                    key={badge}
                    className="inline-flex max-w-full items-center rounded-full border border-border bg-muted/40 px-3 py-1 text-xs font-semibold text-muted-foreground"
                  >
                    <span className="truncate">{badge}</span>
                  </span>
                ))
              ) : (
                <span className="text-sm text-muted-foreground">Geen badges</span>
              )}
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Button type="button" variant="outline" onClick={onReject} disabled={rejectPending}>
              <XCircle className="h-4 w-4" />
              Verwerp
            </Button>
            <Button type="button" onClick={onAccept} disabled={!isReady || rejectPending}>
              <ShieldCheck className="h-4 w-4" />
              Goedkeuren
            </Button>
          </div>
        </div>
      </section>

      <MetricsGrid metrics={presentation.metrics} />

      <section className="min-w-0 rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold tracking-tight text-foreground">
            Wat gebeurt er in deze procesreis?
          </h2>
          <StatusPill tone="warning" icon={Sparkles}>
            AI-verrijkt, bewijs apart
          </StatusPill>
        </div>
        <p className="mt-3 max-w-5xl break-words text-sm leading-relaxed text-muted-foreground">
          {presentation.summary || "Geen samenvatting beschikbaar"}
        </p>
      </section>

      <section className="min-w-0 overflow-hidden rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold tracking-tight text-foreground">
            Webhook-bewezen keten
          </h2>
          <StatusPill tone={presentation.transitions.length > 0 ? "success" : "warning"} icon={GitBranch}>
            {presentation.transitions.length} bewezen
          </StatusPill>
        </div>
        <WebhookChain presentation={presentation} />
      </section>

      <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.8fr)]">
        <ReviewSteps steps={presentation.reviewSteps} />

        <div className="min-w-0 space-y-5">
          <ListCard
            title="Bewijs per overgang"
            emptyLabel="Geen bewezen overgangen"
            items={presentation.evidenceItems}
          />
          <ListCard
            title="AI-voorstellen & gaps"
            emptyLabel="Geen AI-voorstellen of gaps"
            items={presentation.aiSuggestions}
          />
          <ListCard
            title="Bronkwaliteit"
            emptyLabel="Geen bronkwaliteitmeldingen"
            items={presentation.sourceQualityMessages}
          />
        </div>
      </div>
    </div>
  );
}

function MetricsGrid({ metrics }: { metrics: FlowSuggestionReviewMetric[] }): ReactNode {
  if (metrics.length === 0) {
    return (
      <section className="rounded-2xl border border-dashed border-border bg-card p-5 text-sm text-muted-foreground">
        Geen metrics
      </section>
    );
  }

  return (
    <section className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {metrics.map((metric) => (
        <article
          key={`${metric.label}-${metric.value}`}
          className={cn("min-w-0 rounded-2xl border bg-card p-4 shadow-sm", toneClasses[metric.tone])}
        >
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] opacity-75">
            {metric.label}
          </p>
          <p className="mt-2 truncate text-2xl font-semibold tracking-tight text-foreground">
            {metric.value}
          </p>
          <p className="mt-1 break-words text-xs leading-relaxed opacity-80">
            {metric.detail}
          </p>
        </article>
      ))}
    </section>
  );
}

function WebhookChain({ presentation }: { presentation: FlowSuggestionReviewPresentation }): ReactNode {
  if (presentation.nodes.length === 0) {
    return (
      <div className="mt-4 rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground">
        Geen nodes
      </div>
    );
  }

  const nodesById = new Map(presentation.nodes.map((node) => [node.id, node]));
  const transitionRows = presentation.transitions
    .map((transition) => ({
      transition,
      from: nodesById.get(transition.fromId),
      to: nodesById.get(transition.toId),
    }))
    .filter((row): row is {
      transition: FlowSuggestionReviewPresentation["transitions"][number];
      from: FlowSuggestionReviewPresentation["nodes"][number];
      to: FlowSuggestionReviewPresentation["nodes"][number];
    } => Boolean(row.from && row.to));

  return (
    <div className="mt-5 max-w-full overflow-x-auto pb-2">
      {transitionRows.length > 0 ? (
        <ol className="grid min-w-max gap-3 pr-2">
          {transitionRows.map(({ transition, from, to }) => (
            <li key={`${transition.fromId}-${transition.toId}`} className="flex shrink-0 items-center gap-3">
              <ChainNode node={from} />
              <div className="flex w-48 shrink-0 flex-col items-center justify-center text-center text-emerald-700">
                <div className="flex w-full items-center gap-2">
                  <span className="h-px min-w-0 flex-1 bg-current/30" />
                  <ArrowRight className="h-4 w-4 shrink-0" />
                  <span className="h-px min-w-0 flex-1 bg-current/30" />
                </div>
                <span className={cn("mt-2 max-w-full rounded-full border px-2 py-0.5 text-[10px] font-semibold", toneClasses.success)}>
                  {transition.label}
                </span>
                <span className="mt-1 max-w-full truncate text-[10px] text-muted-foreground">
                  {transition.normalizedPath}
                </span>
              </div>
              <ChainNode node={to} />
            </li>
          ))}
        </ol>
      ) : (
        <div className="rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground">
          Geen bewezen webhook-overgangen in dit voorstel.
        </div>
      )}
    </div>
  );
}

function ChainNode({
  node,
}: {
  node: FlowSuggestionReviewPresentation["nodes"][number];
}): ReactNode {
  return (
    <div className="w-56 min-w-0 rounded-xl border border-border bg-background p-3">
      <p className="truncate text-sm font-semibold text-foreground">{node.label}</p>
      <div className="mt-2 flex min-w-0 flex-wrap gap-1.5">
        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
          {node.sourceLabel}
        </span>
        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
          {node.status}
        </span>
      </div>
    </div>
  );
}

function ReviewSteps({
  steps,
}: {
  steps: FlowSuggestionReviewPresentation["reviewSteps"];
}): ReactNode {
  return (
    <section className="min-w-0 rounded-2xl border border-border bg-card p-5 shadow-sm">
      <h2 className="text-xl font-semibold tracking-tight text-foreground">Reviewstappen</h2>
      {steps.length > 0 ? (
        <ol className="mt-4 space-y-3">
          {steps.map((step, index) => (
            <li key={`${step.title}-${index}`} className="flex min-w-0 gap-3 rounded-xl border border-border bg-muted/20 p-3">
              <span
                className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                  step.tone === "success"
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-amber-100 text-amber-700",
                )}
              >
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <p className="break-words text-sm font-semibold text-foreground">{step.title}</p>
                  <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-semibold", toneClasses[step.tone])}>
                    {step.tag}
                  </span>
                </div>
                <p className="mt-1 break-words text-sm leading-relaxed text-muted-foreground">
                  {step.description}
                </p>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">Geen reviewstappen</p>
      )}
    </section>
  );
}

function ListCard({
  title,
  emptyLabel,
  items,
}: {
  title: string;
  emptyLabel: string;
  items: Array<{
    label?: string;
    title?: string;
    description: string;
    tag?: string;
    tone: "success" | "warning" | "danger";
  }>;
}): ReactNode {
  return (
    <section className="min-w-0 rounded-2xl border border-border bg-card p-5 shadow-sm">
      <h2 className="text-lg font-semibold tracking-tight text-foreground">{title}</h2>
      {items.length > 0 ? (
        <div className="mt-4 space-y-3">
          {items.map((item, index) => (
            <article
              key={`${item.title ?? item.label ?? title}-${index}`}
              className={cn("min-w-0 rounded-xl border p-3", toneClasses[item.tone])}
            >
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <p className="min-w-0 flex-1 break-words text-sm font-semibold text-foreground">
                  {item.title ?? item.label}
                </p>
                {item.tag && (
                  <span className="shrink-0 rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-semibold">
                    {item.tag}
                  </span>
                )}
              </div>
              <p className="mt-1 break-words text-sm leading-relaxed opacity-80">
                {item.description}
              </p>
            </article>
          ))}
        </div>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">{emptyLabel}</p>
      )}
    </section>
  );
}

function StatusPill({
  tone,
  icon: Icon = CircleDashed,
  children,
}: {
  tone: Tone;
  icon?: LucideIcon;
  children: ReactNode;
}): ReactNode {
  return (
    <span className={cn("inline-flex max-w-full items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold", toneClasses[tone])}>
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{children}</span>
    </span>
  );
}
