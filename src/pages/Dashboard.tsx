import { useMemo } from "react";
import { Link } from "react-router-dom";
import {
  Activity,
  ArrowRight,
  Bot,
  CheckCircle2,
  ClipboardCheck,
  GitBranch,
  Layers3,
  Loader2,
  Network,
  Plus,
  RefreshCw,
  Server,
  Sparkles,
} from "lucide-react";

import { CategorieBadge, StatusBadge } from "@/components/Badges";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useAllConfirmedAutomationLinks, useFlowSuggesties } from "@/lib/queryHooks/automationLinks";
import { useAutomatiseringen } from "@/lib/queryHooks/automations";
import { useFlows } from "@/lib/queryHooks/flows";
import { usePipelines } from "@/lib/queryHooks/pipelines";
import { usePortalSettings } from "@/lib/queryHooks/portalSettings";
import type { Automatisering, Systeem } from "@/lib/types";
import { getVerificatieStatus } from "@/lib/types";

export default function Dashboard() {
  const { data, isLoading } = useAutomatiseringen();
  const { data: portalSettings } = usePortalSettings();
  const { data: flows = [] } = useFlows();
  const { data: pipelines = [] } = usePipelines();
  const { data: suggestions = [] } = useFlowSuggesties();
  const { data: confirmedLinks = [] } = useAllConfirmedAutomationLinks();

  const all = useMemo(() => data ?? [], [data]);
  const periodeDagen = portalSettings?.verificatiePeriodeDagen ?? 90;

  const dashboard = useMemo(() => {
    const totaal = all.length;
    const actief = all.filter((a) => a.status === "Actief").length;
    const verouderd = all.filter((a) => a.status === "Verouderd").length;
    const uitgeschakeld = all.filter((a) => a.status === "Uitgeschakeld").length;
    const inReview = all.filter((a) => a.status === "In review").length;

    const vGeverifieerd = all.filter((a) => getVerificatieStatus(a, periodeDagen) === "geverifieerd").length;
    const vVerouderd = all.filter((a) => getVerificatieStatus(a, periodeDagen) === "verouderd").length;
    const vNooit = all.filter((a) => getVerificatieStatus(a, periodeDagen) === "nooit").length;
    const vProgress = totaal > 0 ? Math.round((vGeverifieerd / totaal) * 100) : 0;

    const linkedAutomationIds = new Set<string>();
    confirmedLinks.forEach((link) => {
      linkedAutomationIds.add(link.sourceId);
      linkedAutomationIds.add(link.targetId);
    });
    const withoutLinks = all.filter((automation) => !linkedAutomationIds.has(automation.id));

    const staleVerification = all
      .filter((automation) => getVerificatieStatus(automation, periodeDagen) !== "geverifieerd")
      .sort(sortByOldestVerification)
      .slice(0, 4);

    const recentAutomations = [...all].sort(sortByNewestCreated).slice(0, 5);
    const activePipelines = pipelines.filter((pipeline) => pipeline.isActive);
    const customPipelines = pipelines.filter((pipeline) => pipeline.source === "custom");
    const systems = getSystemStats(all);

    return {
      totaal,
      actief,
      verouderd,
      uitgeschakeld,
      inReview,
      vGeverifieerd,
      vVerouderd,
      vNooit,
      vProgress,
      withoutLinks,
      staleVerification,
      recentAutomations,
      activePipelines,
      customPipelines,
      systems,
    };
  }, [all, confirmedLinks, periodeDagen, pipelines]);

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
            Dashboard
          </h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Snel zicht op automations, flows, pipelines en plekken waar actie nodig is.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="secondary">
            <Link to="/flows">
              <GitBranch className="h-4 w-4" />
              Flows
            </Link>
          </Button>
          <Button asChild>
            <Link to="/nieuw">
              <Plus className="h-4 w-4" />
              Automation
            </Link>
          </Button>
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard icon={Bot} label="Automations" value={dashboard.totaal} helper={`${dashboard.actief} actief`} />
        <MetricCard icon={GitBranch} label="Flows" value={flows.length} helper={`${confirmedLinks.length} koppelingen`} />
        <MetricCard icon={Network} label="Suggesties" value={suggestions.length} helper="wachten op review" tone="warning" />
        <MetricCard icon={Layers3} label="Pipelines" value={dashboard.activePipelines.length} helper={`${dashboard.customPipelines.length} intern`} />
        <MetricCard icon={Server} label="Systemen" value={dashboard.systems.length} helper="in gebruik" />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.35fr_0.9fr]">
        <div className="card-elevated p-5">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="label-uppercase">Vandaag aandacht nodig</p>
              <h2 className="text-lg font-semibold text-foreground">Werkvoorraad</h2>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link to="/flows">
                Bekijk flows
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <ActionTile
              icon={Sparkles}
              label="Flow-suggesties"
              value={suggestions.length}
              description="Nieuwe mogelijke koppelingen beoordelen."
              to="/flows"
            />
            <ActionTile
              icon={ClipboardCheck}
              label="Verificatie"
              value={dashboard.vVerouderd + dashboard.vNooit}
              description={`Niet gecheckt binnen ${periodeDagen} dagen.`}
              to="/alle"
            />
            <ActionTile
              icon={Network}
              label="Zonder koppeling"
              value={dashboard.withoutLinks.length}
              description="Automations die nog los staan."
              to="/procesviewer"
            />
          </div>

          <div className="mt-5 rounded-lg border border-border bg-secondary/40 p-4">
            <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-[hsl(var(--status-active))]" />
                <span className="text-sm font-medium text-foreground">Verificatie status</span>
              </div>
              <span className="text-xs text-muted-foreground">
                {dashboard.vGeverifieerd}/{dashboard.totaal} up-to-date
              </span>
            </div>
            <Progress value={dashboard.vProgress} className="h-2" />
            <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
              <span>{dashboard.vGeverifieerd} geverifieerd</span>
              <span>{dashboard.vVerouderd} verouderd</span>
              <span>{dashboard.vNooit} nooit gecheckt</span>
            </div>
          </div>
        </div>

        <div className="card-elevated p-5">
          <p className="label-uppercase mb-3">Quick actions</p>
          <div className="grid gap-2">
            <QuickAction icon={Sparkles} label="Detecteer suggesties" to="/flows" />
            <QuickAction icon={GitBranch} label="Flow maken" to="/flows" />
            <QuickAction icon={Layers3} label="Pipelines beheren" to="/pipelines" />
            <QuickAction icon={RefreshCw} label="Proces-canvas openen" to="/procesviewer" />
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1fr_0.85fr]">
        <div className="card-elevated p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="label-uppercase">Recent toegevoegd</p>
              <h2 className="text-lg font-semibold text-foreground">Laatste automations</h2>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link to="/alle">Alles</Link>
            </Button>
          </div>
          <AutomationList items={dashboard.recentAutomations} />
        </div>

        <div className="card-elevated p-5">
          <div className="mb-4">
            <p className="label-uppercase">Systeemdekking</p>
            <h2 className="text-lg font-semibold text-foreground">Waar zit de automatisering?</h2>
          </div>
          <SystemList systems={dashboard.systems} total={dashboard.totaal} />
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatusSummary label="Actief" value={dashboard.actief} className="text-[hsl(var(--status-active))]" />
        <StatusSummary label="In review" value={dashboard.inReview} className="text-[hsl(var(--status-review))]" />
        <StatusSummary label="Verouderd" value={dashboard.verouderd} className="text-[hsl(var(--status-outdated))]" />
        <StatusSummary label="Uitgeschakeld" value={dashboard.uitgeschakeld} className="text-[hsl(var(--status-disabled))]" />
      </section>
    </div>
  );
}

function MetricCard({
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
  tone?: "default" | "warning";
}) {
  return (
    <div className="card-elevated min-w-0 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="label-uppercase truncate">{label}</p>
        <span className={tone === "warning" ? "text-[hsl(var(--status-review))]" : "text-muted-foreground"}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-3xl font-bold text-foreground">{value}</span>
        <span className="min-w-0 truncate text-xs text-muted-foreground">{helper}</span>
      </div>
    </div>
  );
}

function ActionTile({
  icon: Icon,
  label,
  value,
  description,
  to,
}: {
  icon: typeof Activity;
  label: string;
  value: number;
  description: string;
  to: string;
}) {
  return (
    <Link
      to={to}
      className="group rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/30 hover:bg-accent/40"
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <Icon className="h-4 w-4 text-muted-foreground group-hover:text-primary" />
        <span className="font-mono text-2xl font-bold text-foreground">{value}</span>
      </div>
      <h3 className="text-sm font-semibold text-foreground">{label}</h3>
      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{description}</p>
    </Link>
  );
}

function QuickAction({ icon: Icon, label, to }: { icon: typeof Activity; label: string; to: string }) {
  return (
    <Button asChild variant="outline" className="h-11 justify-between px-3">
      <Link to={to}>
        <span className="flex min-w-0 items-center gap-2">
          <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="truncate">{label}</span>
        </span>
        <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
      </Link>
    </Button>
  );
}

function AutomationList({ items }: { items: Automatisering[] }) {
  if (items.length === 0) {
    return <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">Nog geen automations.</p>;
  }

  return (
    <div className="space-y-2">
      {items.map((automation) => (
        <Link
          key={automation.id}
          to={`/automations/${encodeURIComponent(automation.id)}`}
          className="flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-card p-3 transition-colors hover:bg-secondary/60 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <span className="font-mono text-xs text-muted-foreground">{automation.id}</span>
              <span className="truncate text-sm font-medium text-foreground">{automation.naam}</span>
            </div>
            <p className="mt-1 truncate text-xs text-muted-foreground">{automation.doel || "Geen doel ingevuld"}</p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <CategorieBadge categorie={automation.categorie} />
            <StatusBadge status={automation.status} />
          </div>
        </Link>
      ))}
    </div>
  );
}

function SystemList({ systems, total }: { systems: Array<{ system: Systeem; count: number }>; total: number }) {
  if (systems.length === 0) {
    return <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">Nog geen systemen gevonden.</p>;
  }

  return (
    <div className="space-y-4">
      {systems.slice(0, 7).map((item) => {
        const percentage = total > 0 ? Math.round((item.count / total) * 100) : 0;
        return (
          <div key={item.system} className="space-y-1.5">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="font-medium text-foreground">{item.system}</span>
              <span className="font-mono text-xs text-muted-foreground">{item.count}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-secondary">
              <div className="h-full rounded-full bg-primary" style={{ width: `${percentage}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function StatusSummary({ label, value, className }: { label: string; value: number; className: string }) {
  return (
    <div className="card-elevated p-4">
      <p className="label-uppercase mb-2">{label}</p>
      <span className={`font-mono text-2xl font-bold ${className}`}>{value}</span>
    </div>
  );
}

function getSystemStats(automations: Automatisering[]): Array<{ system: Systeem; count: number }> {
  const counts = new Map<Systeem, number>();
  automations.forEach((automation) => {
    automation.systemen.forEach((system) => {
      counts.set(system, (counts.get(system) ?? 0) + 1);
    });
  });

  return [...counts.entries()]
    .map(([system, count]) => ({ system, count }))
    .sort((a, b) => b.count - a.count || a.system.localeCompare(b.system));
}

function sortByNewestCreated(a: Automatisering, b: Automatisering) {
  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
}

function sortByOldestVerification(a: Automatisering, b: Automatisering) {
  const aTime = a.laatstGeverifieerd ? new Date(a.laatstGeverifieerd).getTime() : 0;
  const bTime = b.laatstGeverifieerd ? new Date(b.laatstGeverifieerd).getTime() : 0;
  return aTime - bTime;
}
