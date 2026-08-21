import { useMemo } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Bot,
  Clock3,
  ExternalLink,
  GitBranch,
  Loader2,
  RefreshCw,
  ShieldAlert,
  Unplug,
  Workflow,
} from "lucide-react";

import {
  buildDashboardControlCenterModel,
  type DashboardSentryAutomationRow,
  type DashboardSentryInsights,
  type DashboardSourceWarning,
  type DashboardVerificationItem,
} from "@/lib/dashboardControlCenter";
import { useAllConfirmedAutomationLinks, useFlowSuggesties } from "@/lib/queryHooks/automationLinks";
import { useAutomatiseringen } from "@/lib/queryHooks/automations";
import { useFlows } from "@/lib/queryHooks/flows";
import { usePipelines } from "@/lib/queryHooks/pipelines";
import { usePortalSettings } from "@/lib/queryHooks/portalSettings";
import { useAutomationSentryIssueOverview } from "@/lib/queryHooks/sentryIssues";
import type { PortalSentryIssue, SentryIssueMatch } from "@/lib/sentryIssueMatching";
import type { FlowSuggestie } from "@/lib/storage/automationLinks";
import type { Automatisering, Systeem } from "@/lib/types";

const DASHBOARD_SENTRY_ROW_LIMIT = 4;

export default function Dashboard() {
  const { data, isLoading } = useAutomatiseringen();
  const { data: portalSettings } = usePortalSettings();
  const { data: flows = [] } = useFlows();
  const { data: pipelines = [] } = usePipelines();
  const { data: suggestions = [] } = useFlowSuggesties();
  const { data: confirmedLinks = [] } = useAllConfirmedAutomationLinks();

  const all = useMemo(() => data ?? [], [data]);
  const sentryOverview = useAutomationSentryIssueOverview(all, { enabled: all.length > 0 });
  const periodeDagen = portalSettings?.verificatiePeriodeDagen ?? 90;

  const dashboard = useMemo(
    () =>
      buildDashboardControlCenterModel({
        automations: all,
        flows,
        pipelines,
        suggestions,
        confirmedLinks,
        sentry: sentryOverview.data,
        periodeDagen,
      }),
    [all, confirmedLinks, flows, periodeDagen, pipelines, sentryOverview.data, suggestions],
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <p className="label-uppercase">Automatiseringsportaal</p>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Control Center
          </h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Operationeel overzicht voor errors, bronkwaliteit, verificatie, flows en procesdekking.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ButtonLink to="/flows" variant="secondary" icon={GitBranch}>
            Flows
          </ButtonLink>
          <ButtonLink to="/procesviewer" icon={RefreshCw}>
            Proces-canvas openen
          </ButtonLink>
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <KpiCard
          icon={ShieldAlert}
          label="Open Sentry issues"
          value={dashboard.sentry.totalIssues}
          helper={`${dashboard.sentry.totalEvents} events gekoppeld`}
          tone={dashboard.sentry.totalIssues > 0 ? "danger" : "default"}
        />
        <KpiCard
          icon={Bot}
          label="Affected automations"
          value={dashboard.sentry.affectedAutomations.length}
          helper={`${dashboard.sentry.linkedIssues} linked issues`}
          tone={dashboard.sentry.affectedAutomations.length > 0 ? "warning" : "default"}
        />
        <KpiCard
          icon={Unplug}
          label="Unmatched Sentry"
          value={dashboard.sentry.unmatchedIssues.length}
          helper="mapping nodig"
          tone={dashboard.sentry.unmatchedIssues.length > 0 ? "warning" : "default"}
        />
        <KpiCard
          icon={AlertTriangle}
          label="Source warnings"
          value={dashboard.workQueue.sourceWarnings.length}
          helper="broncontrole"
          tone={dashboard.workQueue.sourceWarnings.length > 0 ? "warning" : "default"}
        />
        <KpiCard
          icon={Clock3}
          label="Overdue verificatie"
          value={dashboard.workQueue.verificationItems.length}
          helper={`${periodeDagen} dagen norm`}
          tone={dashboard.workQueue.verificationItems.length > 0 ? "warning" : "default"}
        />
        <KpiCard
          icon={Workflow}
          label="Flow-suggesties"
          value={dashboard.workQueue.flowSuggestions.length}
          helper="open review"
          tone={dashboard.workQueue.flowSuggestions.length > 0 ? "warning" : "default"}
        />
      </section>

      <SentryInsightsPanel insights={dashboard.sentry.insights} />

      <section className="grid gap-4 xl:grid-cols-[1.35fr_1fr]">
        <div className="card-elevated p-5">
          <SectionHeader
            eyebrow="Errors first"
            title="Automations met Sentry errors"
            action={<InlineLink to="/alle">Automations bekijken</InlineLink>}
          />
          <SentryStatus isLoading={sentryOverview.isLoading} error={sentryOverview.error} />
          <SentryAutomationList rows={dashboard.sentry.affectedAutomations} />
        </div>

        <div className="card-elevated p-5">
          <SectionHeader
            eyebrow="Mapping nodig"
            title="Ongekoppelde Sentry issues"
            action={<span className="text-xs text-muted-foreground">Read-only</span>}
          />
          <UnmatchedSentryList issues={dashboard.sentry.unmatchedIssues} />
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-4">
        <WorkQueuePanel
          icon={AlertTriangle}
          eyebrow="Bronkwaliteit"
          title="Source warnings"
          empty="Geen source warnings"
          action={<InlineLink to="/alle">Alles controleren</InlineLink>}
        >
          {dashboard.workQueue.sourceWarnings.length > 0 ? (
            <SourceWarningList items={dashboard.workQueue.sourceWarnings} />
          ) : null}
        </WorkQueuePanel>

        <WorkQueuePanel
          icon={Clock3}
          eyebrow="Verificatie"
          title="Verouderd of nooit gecheckt"
          empty="Alles recent geverifieerd"
          action={<InlineLink to="/alle">Alles controleren</InlineLink>}
        >
          {dashboard.workQueue.verificationItems.length > 0 ? (
            <VerificationList items={dashboard.workQueue.verificationItems} periodeDagen={periodeDagen} />
          ) : null}
        </WorkQueuePanel>

        <WorkQueuePanel
          icon={Unplug}
          eyebrow="Procesdekking"
          title="Zonder koppeling"
          empty="Geen losse automations"
          action={<InlineLink to="/procesviewer">Zonder koppeling</InlineLink>}
        >
          {dashboard.workQueue.unlinkedAutomations.length > 0 ? (
            <UnlinkedAutomationList items={dashboard.workQueue.unlinkedAutomations} />
          ) : null}
        </WorkQueuePanel>

        <WorkQueuePanel
          icon={Workflow}
          eyebrow="Flow review"
          title="Flow-suggesties"
          empty="Geen flow-suggesties open"
          action={<InlineLink to="/flows">Flows openen</InlineLink>}
        >
          {dashboard.workQueue.flowSuggestions.length > 0 ? (
            <FlowSuggestionList items={dashboard.workQueue.flowSuggestions} />
          ) : null}
        </WorkQueuePanel>
      </section>

      <section aria-label="System process health" className="grid gap-4 xl:grid-cols-[1fr_1fr_1fr]">
        <div className="card-elevated p-5">
          <SectionHeader
            eyebrow="Procesgezondheid"
            title="Pipelines en flows"
            action={<InlineLink to="/pipelines">Pipelines bekijken</InlineLink>}
          />
          <div className="grid gap-3 sm:grid-cols-3">
            <MiniStat label="Actieve pipelines" value={dashboard.health.pipelines.active} />
            <MiniStat label="Flows" value={dashboard.health.flows.total} />
            <MiniStat label="Bevestigde links" value={dashboard.health.flows.confirmedLinks} />
          </div>
        </div>

        <div className="card-elevated p-5">
          <SectionHeader eyebrow="Systemen" title="Dekking per systeem" />
          <SystemList systems={dashboard.health.systems} />
        </div>

        <div className="card-elevated p-5">
          <SectionHeader eyebrow="Status" title="Automation verdeling" />
          <StatusList counts={dashboard.health.statusCounts} />
        </div>
      </section>
    </div>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  helper,
  tone = "default",
}: {
  icon: typeof Activity;
  label: string;
  value: number;
  helper: string;
  tone?: "default" | "warning" | "danger";
}) {
  const toneClass =
    tone === "danger"
      ? "text-red-600"
      : tone === "warning"
        ? "text-[hsl(var(--status-review))]"
        : "text-muted-foreground";

  return (
    <div className="card-elevated min-w-0 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="label-uppercase truncate">{label}</p>
        <Icon className={`h-4 w-4 ${toneClass}`} />
      </div>
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-3xl font-bold text-foreground">{value}</span>
        <span className="min-w-0 truncate text-xs text-muted-foreground">{helper}</span>
      </div>
    </div>
  );
}

function SectionHeader({
  eyebrow,
  title,
  action,
}: {
  eyebrow: string;
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="label-uppercase">{eyebrow}</p>
        <h2 className="mt-1 text-lg font-semibold text-foreground">{title}</h2>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

function SentryStatus({ isLoading, error }: { isLoading: boolean; error: unknown }) {
  if (isLoading) {
    return (
      <div className="mb-3 flex items-center gap-2 rounded-lg border border-border bg-secondary/40 px-3 py-2 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Sentry issues worden gelezen
      </div>
    );
  }

  if (error) {
    return (
      <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
        Sentry issues niet beschikbaar
      </div>
    );
  }

  return null;
}

function SentryAutomationList({ rows }: { rows: DashboardSentryAutomationRow[] }) {
  if (rows.length === 0) {
    return <EmptyState>Geen open Sentry issues gevonden</EmptyState>;
  }

  const visibleRows = rows.slice(0, DASHBOARD_SENTRY_ROW_LIMIT);
  const hiddenCount = Math.max(0, rows.length - visibleRows.length);

  return (
    <div className="space-y-2">
      {visibleRows.map((row) => {
        const primaryMatch = getPrimarySentryMatch(row.matches);
        const primaryIssue = primaryMatch?.issue ?? null;

        return (
        <Link
          key={row.automation.id}
          to={`/automations/${encodeURIComponent(row.automation.id)}`}
          className="group flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-card p-3 transition-colors hover:border-primary/30 hover:bg-secondary/50"
        >
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <ShieldAlert className="h-4 w-4 shrink-0 text-red-600" />
              <span className="truncate text-sm font-semibold text-foreground">{row.automation.naam}</span>
            </div>
            <p className="mt-1 truncate text-xs text-muted-foreground">
              {row.summary.linkedIssueCount} issues gekoppeld · {row.summary.possibleIssueCount} mogelijke matches
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
            <span className="font-mono text-sm font-semibold text-foreground">{row.summary.eventCount} events</span>
            <span>{formatShortDate(row.summary.latestSeen)}</span>
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </div>
          <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2 xl:grid-cols-4">
            <SentryMeta label="Level" value={primaryIssue?.level || "onbekend"} />
            <SentryMeta label="Match" value={primaryMatch?.confidence ?? "onbekend"} />
            <SentryMeta label="Users" value={String(primaryIssue?.userCount ?? 0)} />
            <SentryMeta label="Status" value={primaryIssue?.status || "onbekend"} />
            <SentryMeta label="Eerst" value={formatDateTime(primaryIssue?.firstSeen)} />
            <SentryMeta label="Laatst" value={formatDateTime(primaryIssue?.lastSeen ?? row.summary.latestSeen)} />
            <SentryMeta label="Issue" value={primaryIssue?.shortId || primaryIssue?.id || "onbekend"} />
          </div>
        </Link>
        );
      })}
      {hiddenCount > 0 && (
        <MoreRowsNotice>
          + {hiddenCount} {hiddenCount === 1 ? "automation met Sentry errors" : "automations met Sentry errors"} niet getoond
        </MoreRowsNotice>
      )}
    </div>
  );
}

function UnmatchedSentryList({ issues }: { issues: PortalSentryIssue[] }) {
  if (issues.length === 0) {
    return <EmptyState>Geen open Sentry issues gevonden</EmptyState>;
  }

  const visibleIssues = issues.slice(0, DASHBOARD_SENTRY_ROW_LIMIT);
  const hiddenCount = Math.max(0, issues.length - visibleIssues.length);

  return (
    <div className="space-y-2">
      {visibleIssues.map((issue) => {
        const safeHref = getSafeSentryPermalink(issue.permalink);
        const content = (
          <>
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-2">
                <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold uppercase text-red-700">
                  {issue.level || "issue"}
                </span>
                <span className="truncate text-sm font-medium text-foreground">{issue.title}</span>
              </div>
              <p className="mt-1 truncate text-xs text-muted-foreground">
                {issue.shortId || issue.id} · {issue.status}
              </p>
              <div className="mt-2 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
                <span>Users: {issue.userCount ?? 0}</span>
                <span>Eerst: {formatDateTime(issue.firstSeen)}</span>
                <span>Laatst: {formatDateTime(issue.lastSeen)}</span>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
              <span className="font-mono text-sm font-semibold text-foreground">{issue.count} events</span>
              <ExternalLink className="h-3.5 w-3.5" />
            </div>
          </>
        );

        if (!safeHref) {
          return (
            <div key={issue.id} className="flex min-w-0 items-center justify-between gap-3 rounded-lg border border-border bg-card p-3">
              {content}
            </div>
          );
        }

        return (
          <a
            key={issue.id}
            href={safeHref}
            target="_blank"
            rel="noreferrer noopener"
            className="flex min-w-0 items-center justify-between gap-3 rounded-lg border border-border bg-card p-3 transition-colors hover:border-primary/30 hover:bg-secondary/50"
          >
            {content}
          </a>
        );
      })}
      {hiddenCount > 0 && (
        <MoreRowsNotice>
          + {hiddenCount} {hiddenCount === 1 ? "ongekoppelde Sentry issue" : "ongekoppelde Sentry issues"} niet getoond
        </MoreRowsNotice>
      )}
    </div>
  );
}

function MoreRowsNotice({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed border-border bg-secondary/30 px-3 py-2 text-xs font-medium text-muted-foreground">
      {children}
    </p>
  );
}

function SentryInsightsPanel({ insights }: { insights: DashboardSentryInsights }) {
  return (
    <section className="card-elevated p-5" aria-label="Sentry incident insights">
      <SectionHeader eyebrow="Sentry incidenten" title="Exacte foutinzichten" />
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <InsightCard
          label="Nieuwste fout"
          title={insights.newestIssue?.title ?? "Geen open Sentry issues gevonden"}
          detail={`Laatst: ${formatDateTime(insights.newestIssue?.lastSeen)}`}
        />
        <InsightCard
          label="Oudste open fout"
          title={insights.oldestOpenIssue?.title ?? "Geen open Sentry issues gevonden"}
          detail={`Eerst: ${formatDateTime(insights.oldestOpenIssue?.firstSeen)}`}
        />
        <InsightCard
          label="Hoogste severity"
          title={insights.highestLevel ?? "geen"}
          detail="Gebaseerd op open issues"
        />
        <InsightCard
          label="Users geraakt"
          title={`${insights.totalUsers} users`}
          detail="Som van Sentry userCount"
        />
        <InsightCard
          label="Read-only sync"
          title="Sentry"
          detail={`Opgehaald: ${formatDateTime(insights.fetchedAt)}`}
        />
      </div>
    </section>
  );
}

function InsightCard({ label, title, detail }: { label: string; title: string; detail: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-border bg-card p-3">
      <p className="label-uppercase">{label}</p>
      <p className="mt-2 truncate text-sm font-semibold text-foreground">{title}</p>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

function SentryMeta({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <span
      className={`min-w-0 truncate ${strong ? "font-mono text-sm font-semibold text-foreground" : ""}`}
    >
      {label}: {value}
    </span>
  );
}

function WorkQueuePanel({
  icon: Icon,
  eyebrow,
  title,
  empty,
  action,
  children,
}: {
  icon: typeof Activity;
  eyebrow: string;
  title: string;
  empty: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  const hasContent = hasRenderableChildren(children);
  return (
    <div className="card-elevated p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-1 flex items-center gap-2">
            <Icon className="h-4 w-4 text-muted-foreground" />
            <p className="label-uppercase">{eyebrow}</p>
          </div>
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {hasContent ? children : <EmptyState>{empty}</EmptyState>}
    </div>
  );
}

function SourceWarningList({ items }: { items: DashboardSourceWarning[] }) {
  if (items.length === 0) return null;
  return (
    <div className="space-y-2">
      {items.slice(0, 5).map((item) => (
        <Link
          key={item.finding.id}
          to={`/automations/${encodeURIComponent(item.automation.id)}`}
          className="block rounded-lg border border-border bg-card p-3 transition-colors hover:bg-secondary/50"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-sm font-medium text-foreground">{item.finding.message}</span>
            <SeverityBadge severity={item.finding.severity} />
          </div>
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {item.automation.naam} · {item.finding.source} · {formatShortDate(item.finding.lastSeenAt)}
          </p>
        </Link>
      ))}
    </div>
  );
}

function VerificationList({ items, periodeDagen }: { items: DashboardVerificationItem[]; periodeDagen: number }) {
  if (items.length === 0) return null;
  return (
    <div className="space-y-2">
      {items.slice(0, 5).map((item) => (
        <Link
          key={item.automation.id}
          to="/alle"
          className="block rounded-lg border border-border bg-card p-3 transition-colors hover:bg-secondary/50"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-sm font-medium text-foreground">{item.automation.naam}</span>
            <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-semibold uppercase text-muted-foreground">
              {item.status === "nooit" ? "Nooit" : "Verouderd"}
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Norm: iedere {periodeDagen} dagen · laatst: {formatShortDate(item.automation.laatstGeverifieerd)}
          </p>
        </Link>
      ))}
    </div>
  );
}

function UnlinkedAutomationList({ items }: { items: Automatisering[] }) {
  if (items.length === 0) return null;
  return (
    <div className="space-y-2">
      {items.slice(0, 5).map((automation) => (
        <Link
          key={automation.id}
          to="/procesviewer"
          className="block rounded-lg border border-border bg-card p-3 transition-colors hover:bg-secondary/50"
        >
          <span className="block truncate text-sm font-medium text-foreground">{automation.naam}</span>
          <span className="mt-1 block truncate text-xs text-muted-foreground">{automation.id}</span>
        </Link>
      ))}
    </div>
  );
}

function FlowSuggestionList({ items }: { items: FlowSuggestie[] }) {
  if (items.length === 0) return null;
  return (
    <div className="space-y-2">
      {items.slice(0, 5).map((suggestion) => (
        <Link
          key={`${suggestion.fromId}-${suggestion.toId}`}
          to="/flows"
          className="block rounded-lg border border-border bg-card p-3 transition-colors hover:bg-secondary/50"
        >
          <span className="block truncate text-sm font-medium text-foreground">
            {suggestion.fromNaam || suggestion.fromId} naar {suggestion.toNaam || suggestion.toId}
          </span>
          <span className="mt-1 block truncate text-xs text-muted-foreground">
            {suggestion.zekerheid} · {suggestion.redenering || "Geen toelichting"}
          </span>
        </Link>
      ))}
    </div>
  );
}

function SystemList({ systems }: { systems: Array<{ system: Systeem; count: number }> }) {
  if (systems.length === 0) {
    return <EmptyState>Nog geen systemen gevonden</EmptyState>;
  }

  return (
    <div className="space-y-2">
      {systems.slice(0, 7).map((item) => (
        <div key={item.system} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2">
          <span className="text-sm font-medium text-foreground">{item.system}</span>
          <span className="font-mono text-sm font-semibold text-muted-foreground">{item.count}</span>
        </div>
      ))}
    </div>
  );
}

function StatusList({ counts }: { counts: Array<{ status: string; count: number }> }) {
  if (counts.length === 0) {
    return <EmptyState>Nog geen statusdata</EmptyState>;
  }

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {counts.map((item) => (
        <div key={item.status} className="rounded-lg border border-border bg-card px-3 py-2">
          <p className="text-xs text-muted-foreground">{item.status}</p>
          <p className="font-mono text-xl font-bold text-foreground">{item.count}</p>
        </div>
      ))}
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-mono text-2xl font-bold text-foreground">{value}</p>
    </div>
  );
}

function InlineLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
      {children}
      <ArrowRight className="h-3.5 w-3.5" />
    </Link>
  );
}

function ButtonLink({
  to,
  children,
  icon: Icon,
  variant = "default",
}: {
  to: string;
  children: ReactNode;
  icon: typeof Activity;
  variant?: "default" | "secondary";
}) {
  const className =
    variant === "secondary"
      ? "inline-flex h-10 items-center justify-center gap-2 rounded-md bg-secondary px-4 py-2 text-sm font-medium text-secondary-foreground transition-colors hover:bg-secondary/80"
      : "inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90";

  return (
    <Link to={to} className={className}>
      <Icon className="h-4 w-4" />
      {children}
    </Link>
  );
}

function EmptyState({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed border-border bg-secondary/30 p-4 text-sm text-muted-foreground">
      {children}
    </p>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  const className =
    severity === "critical"
      ? "bg-red-600 text-white"
      : severity === "warning"
        ? "bg-amber-100 text-amber-800"
        : "bg-secondary text-muted-foreground";

  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase ${className}`}>
      {severity}
    </span>
  );
}

function formatShortDate(value: string | null | undefined): string {
  if (!value) return "geen datum";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "geen datum";
  return new Intl.DateTimeFormat("nl-NL", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "geen datum";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "geen datum";
  return new Intl.DateTimeFormat("nl-NL", {
    timeZone: "Europe/Amsterdam",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

function getPrimarySentryMatch(matches: SentryIssueMatch[]): SentryIssueMatch | null {
  return [...matches].sort(compareSentryMatches)[0] ?? null;
}

function compareSentryMatches(a: SentryIssueMatch, b: SentryIssueMatch): number {
  return (
    getSentryLevelRank(b.issue.level) - getSentryLevelRank(a.issue.level) ||
    Math.max(0, b.issue.count) - Math.max(0, a.issue.count) ||
    parseDate(b.issue.lastSeen) - parseDate(a.issue.lastSeen)
  );
}

function getSentryLevelRank(level: string | undefined): number {
  if (level === "fatal") return 5;
  if (level === "error") return 4;
  if (level === "warning") return 3;
  if (level === "info") return 2;
  if (level === "debug") return 1;
  return 0;
}

function parseDate(value: string | null | undefined): number {
  if (!value) return 0;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function getSafeSentryPermalink(value: string | undefined): string | null {
  try {
    const url = new URL(value ?? "");
    if (url.protocol !== "https:") return null;
    if (!url.hostname.endsWith(".sentry.io")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function hasRenderableChildren(children: ReactNode): boolean {
  return Array.isArray(children) ? children.some(Boolean) : Boolean(children);
}
