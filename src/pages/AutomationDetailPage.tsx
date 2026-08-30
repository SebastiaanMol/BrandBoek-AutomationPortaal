import { useLayoutEffect, useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { AlertTriangle, ArrowLeft, CheckCircle2, ChevronDown, Clipboard, ExternalLink, Loader2, Pencil, Sparkles } from "lucide-react";
import { StatusBadge, CategorieBadge, SystemBadge, SourceBadge } from "@/components/Badges";
import { HubSpotAutomationDetailTemplate } from "@/components/HubSpotAutomationDetailTemplate";
import { ZapierAutomationDetailTemplate } from "@/components/ZapierAutomationDetailTemplate";
import { GitLabAutomationDetailTemplate } from "@/components/GitLabAutomationDetailTemplate";
import { TypeformAutomationDetailTemplate } from "@/components/TypeformAutomationDetailTemplate";
import { AutomationWhatHappensCard } from "@/components/AutomationWhatHappensCard";
import { AutomationChainReactionCard } from "@/components/AutomationChainReactionCard";
import { SentryIssuesCard } from "@/components/SentryIssuesCard";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  useAllConfirmedAutomationLinks,
  useAutomationSentryIssues,
  useAutomatiseringen,
  useAutomatiseringenIncludingLegacyGitlab,
  useFlowSuggesties,
  usePipelines,
  useSetCleanupDeleteCandidate,
} from "@/lib/hooks";
import type { Automatisering, Status } from "@/lib/types";
import { STATUS_LABELS } from "@/lib/types";
import { AutomatiseringDetailPanel } from "./AlleAutomatiseringen";
import { getAutomationDetailDisplayName } from "@/lib/automationDetailPresentation";
import { getHubSpotWorkflowSourceUrl, isHubSpotAutomation as isHubSpotAutomationRecord } from "@/lib/hubspotSourceUrl";
import { getZapierAutomationDetailPresentation, isZapierAutomation as isZapierAutomationRecord } from "@/lib/zapierAutomationDetailPresentation";
import {
  getGitLabAutomationDetailPresentation,
  isGitLabAutomation as isGitLabAutomationRecord,
} from "@/lib/gitlabAutomationDetailPresentation";
import {
  getTypeformAutomationDetailPresentation,
  isTypeformAutomation as isTypeformAutomationRecord,
} from "@/lib/typeformAutomationDetailPresentation";
import { getAutomationSourceQualityPresentation } from "@/lib/automationSourceQuality";
import type { FlowSuggestie } from "@/lib/storage/automationLinks";
import { getNavigationReturnHref } from "@/lib/navigationMemory";

export default function AutomationDetailPage(): React.ReactNode {
  const { id } = useParams<{ id: string }>();
  const { data: automations = [], isLoading } = useAutomatiseringenIncludingLegacyGitlab();
  const { data: sentryMatchAutomations = [] } = useAutomatiseringen();
  const { data: pipelines = [] } = usePipelines();
  const { data: confirmedLinks = [] } = useAllConfirmedAutomationLinks();
  const { data: flowSuggesties = [] } = useFlowSuggesties();
  const cleanupMarker = useSetCleanupDeleteCandidate();
  const automation = automations.find((item) => item.id === id);
  const sentryIssuesQuery = useAutomationSentryIssues(automation ?? null, sentryMatchAutomations);

  useLayoutEffect(() => {
    const scrollingElement = document.scrollingElement ?? document.documentElement;
    scrollingElement.scrollTop = 0;
    scrollingElement.scrollLeft = 0;
    document.documentElement.scrollTop = 0;
    document.documentElement.scrollLeft = 0;
    document.body.scrollTop = 0;
    document.body.scrollLeft = 0;
  }, [id]);

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!automation) return <Navigate to="/alle" replace />;

  const primarySystem = automation.systemen[0] || "Anders";
  const sourceMissingFinding = automation.sourceFindings?.find((finding) => finding.type === "source_missing" && !finding.resolvedAt);
  const displayName = getAutomationDetailDisplayName(automation);
  const isHubSpotAutomation = isHubSpotAutomationRecord(automation);
  const isZapierAutomation = isZapierAutomationRecord(automation);
  const isGitLabAutomation = isGitLabAutomationRecord(automation);
  const isTypeformAutomation = isTypeformAutomationRecord(automation);
  const sourceUrl = getHubSpotWorkflowSourceUrl(automation);
  const sourceQuality = getAutomationSourceQualityPresentation(automation);
  const sentryIssueMatches = sentryIssuesQuery.data?.matches.byAutomationId[automation.id] ?? [];

  return (
    <div className="mx-auto max-w-[1320px] space-y-4 overflow-x-hidden px-6 py-8 lg:px-10">
      {isHubSpotAutomation ? (
        <>
          <BackToAutomationsLink />
          <HubSpotDetailHeader automation={automation} displayName={displayName} sourceUrl={sourceUrl} />
        </>
      ) : isZapierAutomation ? (
        <>
          <BackToAutomationsLink />
          <ZapierDetailHeader automation={automation} displayName={displayName} />
        </>
      ) : isGitLabAutomation ? (
        <>
          <BackToAutomationsLink />
          <GitLabDetailHeader
            automation={automation}
            displayName={displayName}
            allAutomations={automations}
            confirmedLinks={confirmedLinks}
            flowSuggesties={flowSuggesties}
          />
        </>
      ) : isTypeformAutomation ? (
        <>
          <BackToAutomationsLink />
          <TypeformDetailHeader automation={automation} displayName={displayName} />
        </>
      ) : (
        <DefaultDetailHeader
          automation={automation}
          displayName={displayName}
          primarySystem={primarySystem}
        />
      )}

      {sourceMissingFinding && (
        <section role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-950 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-700">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div className="min-w-0 space-y-2">
              <div>
                <p className="text-sm font-semibold uppercase tracking-widest text-red-700">Bronwaarschuwing</p>
                <h2 className="mt-1 text-lg font-semibold">
                  {sourceMissingFinding.message || `Deze automation kan niet meer worden teruggevonden bij ${formatSourceName(sourceMissingFinding.source)}.`}
                </h2>
              </div>
              <div className="flex flex-wrap gap-3 text-sm text-red-800">
                <span>Voor het eerst gezien: {formatFindingDate(sourceMissingFinding.firstSeenAt)}</span>
                <span>Laatst bevestigd: {formatFindingDate(sourceMissingFinding.lastSeenAt)}</span>
              </div>
            </div>
          </div>
        </section>
      )}

      {isHubSpotAutomation || isZapierAutomation || isGitLabAutomation || isTypeformAutomation ? (
        <>
          {/* De boekhouders-lens: bron-onafhankelijk, leest `ai_enrichment` ongeacht
              of de automation uit HubSpot, Zapier, GitLab of Typeform komt. Zie
              `AutomationWhatHappensCard.tsx` en architectuur-audit.md, aanbeveling 3. */}
          <AutomationWhatHappensCard automation={automation} />

          <details className="group rounded-2xl border border-border bg-card shadow-sm">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-2xl p-5 text-sm font-semibold text-foreground marker:content-none [&::-webkit-details-marker]:hidden">
              <span>Technische details</span>
              <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
            </summary>

            <div className="space-y-4 border-t border-border p-5 pt-4">
              <SourceQualityCard presentation={sourceQuality} />

              <SentryIssuesCard
                isLoading={sentryIssuesQuery.isLoading}
                error={sentryIssuesQuery.error instanceof Error ? sentryIssuesQuery.error : null}
                matches={sentryIssueMatches}
                limited={Boolean(sentryIssuesQuery.data?.limited)}
              />

              {isHubSpotAutomation ? (
                <HubSpotAutomationDetailTemplate automation={automation} />
              ) : isZapierAutomation ? (
                <ZapierAutomationDetailTemplate automation={automation} allAutomations={automations} pipelines={pipelines} />
              ) : isGitLabAutomation ? (
                <GitLabAutomationDetailTemplate
                  automation={automation}
                  allAutomations={automations}
                  confirmedLinks={confirmedLinks}
                  flowSuggesties={flowSuggesties}
                />
              ) : (
                <TypeformAutomationDetailTemplate automation={automation} allAutomations={automations} />
              )}

              <AutomationChainReactionCard startAutomation={automation} automations={automations} />
            </div>
          </details>
        </>
      ) : (
        <>
          <SourceQualityCard presentation={sourceQuality} />

          <SentryIssuesCard
            isLoading={sentryIssuesQuery.isLoading}
            error={sentryIssuesQuery.error instanceof Error ? sentryIssuesQuery.error : null}
            matches={sentryIssueMatches}
            limited={Boolean(sentryIssuesQuery.data?.limited)}
          />

          <section className="rounded-2xl border border-border bg-card shadow-sm">
            <AutomatiseringDetailPanel
              a={automation}
              cleanupMarker={cleanupMarker}
              variant="page"
            />
          </section>

          <AutomationChainReactionCard startAutomation={automation} automations={automations} />
        </>
      )}
    </div>
  );
}

function GitLabDetailHeader({
  automation,
  displayName,
  allAutomations,
  confirmedLinks,
  flowSuggesties,
}: {
  automation: Automatisering;
  displayName: string;
  allAutomations: Automatisering[];
  confirmedLinks: Array<{ sourceId: string; targetId: string }>;
  flowSuggesties: FlowSuggestie[];
}): React.ReactNode {
  const presentation = getGitLabAutomationDetailPresentation(automation, {
    allAutomations,
    confirmedLinks,
    flowSuggesties,
  });

  return (
    <header className="rounded-[22px] border border-slate-200 bg-white p-7 shadow-sm">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <GitLabStatusPill status={presentation.statusLabel} />
            <span className="inline-flex h-8 items-center rounded-full bg-slate-950 px-3 text-sm font-bold text-white">
              GitLab
            </span>
          </div>
          <h1 className="mt-4 text-3xl font-bold leading-tight tracking-normal text-slate-950 md:text-4xl">
            {displayName}
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-base text-slate-600">
            {presentation.headerMeta.map((item) => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap gap-3 lg:pt-0">
          <Link
            to={`/bewerk/${automation.id}`}
            className="inline-flex h-12 items-center justify-center rounded-xl border border-slate-200 bg-white px-5 text-base font-semibold text-slate-950 shadow-sm transition-colors hover:bg-slate-50"
          >
            Edit
          </Link>
          <RawGitLabDataDialog automationId={automation.id} rawData={presentation.rawData} />
          {presentation.sourceUrl ? (
            <a
              href={presentation.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 text-base font-semibold text-white shadow-sm transition-colors hover:bg-slate-800"
            >
              Open in GitLab
              <ExternalLink className="h-4 w-4" />
            </a>
          ) : (
            <span className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-5 text-base font-semibold text-slate-500">
              Bronlink niet beschikbaar
              <ExternalLink className="h-4 w-4" />
            </span>
          )}
        </div>
      </div>
    </header>
  );
}

function TypeformDetailHeader({
  automation,
  displayName,
}: {
  automation: Automatisering;
  displayName: string;
}): React.ReactNode {
  const presentation = getTypeformAutomationDetailPresentation(automation);

  return (
    <header className="rounded-[22px] border border-slate-200 bg-white p-7 shadow-sm">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <TypeformStatusPill status={presentation.statusLabel} />
            <span className="inline-flex h-8 items-center rounded-full bg-slate-950 px-3 text-sm font-bold text-white">
              Typeform
            </span>
          </div>
          <h1 className="mt-4 text-3xl font-bold leading-tight tracking-normal text-slate-950 md:text-4xl">
            {displayName}
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-base text-slate-600">
            {presentation.headerMeta.map((item) => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap gap-3 lg:pt-0">
          <Link
            to={`/bewerk/${automation.id}`}
            className="inline-flex h-12 items-center justify-center rounded-xl border border-slate-200 bg-white px-5 text-base font-semibold text-slate-950 shadow-sm transition-colors hover:bg-slate-50"
          >
            Edit
          </Link>
          <RawTypeformDataDialog formId={presentation.formId} rawData={presentation.rawData} />
          {presentation.openInTypeformUrl ? (
            <a
              href={presentation.openInTypeformUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 text-base font-semibold text-white shadow-sm transition-colors hover:bg-slate-800"
            >
              Open in Typeform
              <ExternalLink className="h-4 w-4" />
            </a>
          ) : (
            <span className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-5 text-base font-semibold text-slate-500">
              Bronlink niet beschikbaar
              <ExternalLink className="h-4 w-4" />
            </span>
          )}
        </div>
      </div>
    </header>
  );
}

function TypeformStatusPill({ status }: { status: string }): React.ReactNode {
  const colorClass = status === "Active"
    ? "bg-green-100 text-green-800"
    : status === "Disabled" || status === "Niet publiek"
      ? "bg-red-100 text-red-800"
      : "bg-amber-100 text-amber-800";

  return (
    <span className={`inline-flex h-8 items-center gap-2 rounded-full px-3 text-sm font-bold ${colorClass}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {status}
    </span>
  );
}

function SourceQualityCard({
  presentation,
}: {
  presentation: ReturnType<typeof getAutomationSourceQualityPresentation>;
}): React.ReactNode {
  const isReady = presentation.qualityStatus === "ready";
  const isUnknown = presentation.qualityStatus === "unknown";
  const toneClass = isReady
    ? "border-emerald-200 bg-emerald-50 text-emerald-950"
    : isUnknown
      ? "border-slate-200 bg-white text-slate-950"
      : "border-amber-200 bg-amber-50 text-amber-950";
  const iconClass = isReady
    ? "bg-emerald-100 text-emerald-700"
    : isUnknown
      ? "bg-slate-100 text-slate-600"
      : "bg-amber-100 text-amber-700";
  const statusLabel = isReady
    ? "Procesreis-klaar"
    : isUnknown
      ? "Bronkwaliteit onbekend"
      : "Procesreis nog niet klaar";
  const visibleChecks = presentation.sourceSpecificChecks.length > 0
    ? presentation.sourceSpecificChecks
    : presentation.missingEvidence.map((item) => ({
      key: item.key,
      label: item.label,
      status: "missing" as const,
      detail: item.description,
    }));

  return (
    <section className={`rounded-2xl border p-5 shadow-sm ${toneClass}`}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${iconClass}`}>
            {isReady ? <CheckCircle2 className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold uppercase tracking-widest opacity-75">Bronkwaliteit</p>
            <h2 className="mt-1 text-lg font-semibold">{statusLabel}</h2>
            <p className="mt-1 max-w-4xl text-sm leading-relaxed opacity-80">
              {presentation.summary}
            </p>
          </div>
        </div>
        {presentation.blockingFindings.length > 0 && (
          <span className="inline-flex w-fit shrink-0 rounded-full border border-current/20 bg-white/60 px-3 py-1 text-xs font-semibold">
            {presentation.blockingFindings.length} actieve finding{presentation.blockingFindings.length === 1 ? "" : "s"}
          </span>
        )}
      </div>

      {visibleChecks.length > 0 && (
        <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          {visibleChecks.map((check) => (
            <div
              key={check.key}
              className="rounded-xl border border-white/70 bg-white/70 px-3 py-3 text-sm shadow-sm"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-slate-950">{check.label}</span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                  check.status === "pass"
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-amber-100 text-amber-700"
                }`}>
                  {check.status === "pass" ? "OK" : "Mist"}
                </span>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-slate-600">{check.detail}</p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function RawTypeformDataDialog({
  formId,
  rawData,
}: {
  formId: string;
  rawData: unknown;
}): React.ReactNode {
  const [copied, setCopied] = useState(false);
  const rawJson = useMemo(() => JSON.stringify(rawData, null, 2), [rawData]);

  async function copyRawJson(): Promise<void> {
    if (!rawJson || !navigator.clipboard) return;
    await navigator.clipboard.writeText(rawJson);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className="inline-flex h-12 items-center justify-center rounded-xl border border-slate-200 bg-white px-5 text-base font-semibold text-slate-950 shadow-sm transition-colors hover:bg-slate-50"
        >
          Raw data
        </button>
      </DialogTrigger>
      <DialogContent className="max-h-[86vh] w-[calc(100vw-2rem)] max-w-5xl overflow-hidden p-0">
        <DialogHeader className="border-b border-slate-200 px-6 py-5 text-left">
          <DialogTitle>Raw Typeform data</DialogTitle>
          <DialogDescription>
            Form ID {formId || "onbekend"}
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-6 py-3">
          <p className="text-sm text-slate-600">Read-only Typeform brondata zoals opgeslagen in het portaal.</p>
          <button
            type="button"
            onClick={copyRawJson}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-950 shadow-sm transition-colors hover:bg-slate-50"
          >
            <Clipboard className="h-4 w-4" />
            {copied ? "Gekopieerd" : "Kopieer JSON"}
          </button>
        </div>
        <div className="max-h-[62vh] overflow-auto bg-slate-950 p-6">
          <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-5 text-slate-100">
            {rawJson}
          </pre>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function GitLabStatusPill({ status }: { status: string }): React.ReactNode {
  const colorClass = status === "Active"
    ? "bg-green-100 text-green-800"
    : status === "Disabled"
      ? "bg-red-100 text-red-800"
      : "bg-amber-100 text-amber-800";

  return (
    <span className={`inline-flex h-8 items-center gap-2 rounded-full px-3 text-sm font-bold ${colorClass}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {status}
    </span>
  );
}

function RawGitLabDataDialog({
  automationId,
  rawData,
}: {
  automationId: string;
  rawData: unknown;
}): React.ReactNode {
  const [copied, setCopied] = useState(false);
  const rawJson = useMemo(() => JSON.stringify(rawData, null, 2), [rawData]);

  async function copyRawJson(): Promise<void> {
    if (!rawJson || !navigator.clipboard) return;
    await navigator.clipboard.writeText(rawJson);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className="inline-flex h-12 items-center justify-center rounded-xl border border-slate-200 bg-white px-5 text-base font-semibold text-slate-950 shadow-sm transition-colors hover:bg-slate-50"
        >
          Raw data
        </button>
      </DialogTrigger>
      <DialogContent className="max-h-[86vh] w-[calc(100vw-2rem)] max-w-5xl overflow-hidden p-0">
        <DialogHeader className="border-b border-slate-200 px-6 py-5 text-left">
          <DialogTitle>Raw GitLab data</DialogTitle>
          <DialogDescription>
            Automation ID {automationId}
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-6 py-3">
          <p className="text-sm text-slate-600">Read-only GitLab/source payload zoals opgeslagen in het portaal.</p>
          <button
            type="button"
            onClick={copyRawJson}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-950 shadow-sm transition-colors hover:bg-slate-50"
          >
            <Clipboard className="h-4 w-4" />
            {copied ? "Gekopieerd" : "Kopieer JSON"}
          </button>
        </div>
        <div className="max-h-[62vh] overflow-auto bg-slate-950 p-6">
          <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-5 text-slate-100">
            {rawJson}
          </pre>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ZapierDetailHeader({
  automation,
  displayName,
}: {
  automation: Automatisering;
  displayName: string;
}): React.ReactNode {
  const presentation = getZapierAutomationDetailPresentation(automation);

  return (
    <header className="rounded-[22px] border border-slate-200 bg-white p-7 shadow-sm">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <ZapierStatusPill status={presentation.metrics[0]?.value ?? "Onbekend"} />
            <span className="inline-flex h-8 items-center rounded-full bg-orange-100 px-3 text-sm font-bold text-orange-700">
              Zapier
            </span>
          </div>
          <h1 className="mt-4 text-3xl font-bold leading-tight tracking-normal text-slate-950 md:text-4xl">
            {displayName}
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-base text-slate-600">
            {presentation.headerMeta.map((item) => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap gap-3 lg:pt-0">
          <Link
            to={`/bewerk/${automation.id}`}
            className="inline-flex h-12 items-center justify-center rounded-xl border border-slate-200 bg-white px-5 text-base font-semibold text-slate-950 shadow-sm transition-colors hover:bg-slate-50"
          >
            Edit
          </Link>
          <RawZapierDataDialog zapId={presentation.zapId} rawData={presentation.rawData} />
          {presentation.openInZapierUrl && (
            <a
              href={presentation.openInZapierUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 text-base font-semibold text-white shadow-sm transition-colors hover:bg-slate-800"
            >
              Open in Zapier
              <ExternalLink className="h-4 w-4" />
            </a>
          )}
        </div>
      </div>
    </header>
  );
}

function ZapierStatusPill({ status }: { status: string }): React.ReactNode {
  const colorClass = status === "Enabled"
    ? "bg-green-100 text-green-800"
    : status === "Disabled"
      ? "bg-red-100 text-red-800"
      : "bg-slate-100 text-slate-700";

  return (
    <span className={`inline-flex h-8 items-center gap-2 rounded-full px-3 text-sm font-bold ${colorClass}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {status}
    </span>
  );
}

function RawZapierDataDialog({
  zapId,
  rawData,
}: {
  zapId: string;
  rawData: unknown | null;
}): React.ReactNode {
  const [copied, setCopied] = useState(false);
  const rawJson = useMemo(() => rawData ? JSON.stringify(rawData, null, 2) : "", [rawData]);

  async function copyRawJson(): Promise<void> {
    if (!rawJson || !navigator.clipboard) return;
    await navigator.clipboard.writeText(rawJson);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  if (!rawData) {
    return (
      <span className="inline-flex h-12 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 px-5 text-base font-semibold text-slate-500">
        Raw data niet beschikbaar
      </span>
    );
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className="inline-flex h-12 items-center justify-center rounded-xl border border-slate-200 bg-white px-5 text-base font-semibold text-slate-950 shadow-sm transition-colors hover:bg-slate-50"
        >
          Raw data
        </button>
      </DialogTrigger>
      <DialogContent className="max-h-[86vh] w-[calc(100vw-2rem)] max-w-5xl overflow-hidden p-0">
        <DialogHeader className="border-b border-slate-200 px-6 py-5 text-left">
          <DialogTitle>Raw Zapier data</DialogTitle>
          <DialogDescription>
            Zap ID {zapId || "onbekend"}
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-6 py-3">
          <p className="text-sm text-slate-600">Read-only Zapier brondata zoals opgeslagen in het portaal.</p>
          <button
            type="button"
            onClick={copyRawJson}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-950 shadow-sm transition-colors hover:bg-slate-50"
          >
            <Clipboard className="h-4 w-4" />
            {copied ? "Gekopieerd" : "Kopieer JSON"}
          </button>
        </div>
        <div className="max-h-[62vh] overflow-auto bg-slate-950 p-6">
          <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-5 text-slate-100">
            {rawJson}
          </pre>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function BackToAutomationsLink(): React.ReactNode {
  return (
    <Link
      to={getNavigationReturnHref("automations", "/alle")}
      className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 transition-colors hover:text-slate-950"
    >
      <ArrowLeft className="h-4 w-4" />
      Terug naar automations
    </Link>
  );
}

function HubSpotDetailHeader({
  automation,
  displayName,
  sourceUrl,
}: {
  automation: Automatisering;
  displayName: string;
  sourceUrl: string | null;
}): React.ReactNode {
  const metaItems = getHubSpotHeaderMeta(automation);
  const rawData = getHubSpotRawData(automation);

  return (
    <header className="rounded-[22px] border border-slate-200 bg-white p-7 shadow-sm">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <StatusPill status={automation.status} />
          <h1 className="mt-4 text-3xl font-bold leading-tight tracking-normal text-slate-950 md:text-4xl">
            {displayName}
          </h1>
          {automation.aiEnrichment?.summary && (
            <p className="mt-2 max-w-2xl text-base leading-relaxed text-slate-600">
              {automation.aiEnrichment.summary}
            </p>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-base text-slate-600">
            {metaItems.map((item) => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap gap-3 lg:pt-0">
          <Link
            to={`/bewerk/${automation.id}`}
            className="inline-flex h-12 items-center justify-center rounded-xl border border-slate-200 bg-white px-5 text-base font-semibold text-slate-950 shadow-sm transition-colors hover:bg-slate-50"
          >
            Edit
          </Link>
          <RawHubSpotDataDialog automation={automation} rawData={rawData} />
          {sourceUrl ? (
            <a
              href={sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 text-base font-semibold text-white shadow-sm transition-colors hover:bg-slate-800"
            >
              Open in HubSpot
              <ExternalLink className="h-4 w-4" />
            </a>
          ) : (
            <span className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-5 text-base font-semibold text-slate-500">
              Bronlink niet beschikbaar
              <ExternalLink className="h-4 w-4" />
            </span>
          )}
        </div>
      </div>
    </header>
  );
}

function RawHubSpotDataDialog({
  automation,
  rawData,
}: {
  automation: Automatisering;
  rawData: unknown | null;
}): React.ReactNode {
  const [copied, setCopied] = useState(false);
  const rawJson = useMemo(() => rawData ? JSON.stringify(rawData, null, 2) : "", [rawData]);
  const workflowId = automation.hubspotWorkflow?.workflowId
    || stringFromRecord(rawData, "id")
    || automation.externalId
    || automation.id;

  async function copyRawJson(): Promise<void> {
    if (!rawJson || !navigator.clipboard) return;
    await navigator.clipboard.writeText(rawJson);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  if (!rawData) {
    return (
      <span className="inline-flex h-12 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 px-5 text-base font-semibold text-slate-500">
        Raw data niet beschikbaar
      </span>
    );
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className="inline-flex h-12 items-center justify-center rounded-xl border border-slate-200 bg-white px-5 text-base font-semibold text-slate-950 shadow-sm transition-colors hover:bg-slate-50"
        >
          Raw data
        </button>
      </DialogTrigger>
      <DialogContent className="max-h-[86vh] w-[calc(100vw-2rem)] max-w-5xl overflow-hidden p-0">
        <DialogHeader className="border-b border-slate-200 px-6 py-5 text-left">
          <DialogTitle>Raw HubSpot data</DialogTitle>
          <DialogDescription>
            Workflow ID {workflowId}
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-6 py-3">
          <p className="text-sm text-slate-600">Read-only brondata zoals opgeslagen in het portaal.</p>
          <button
            type="button"
            onClick={copyRawJson}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-950 shadow-sm transition-colors hover:bg-slate-50"
          >
            <Clipboard className="h-4 w-4" />
            {copied ? "Gekopieerd" : "Kopieer JSON"}
          </button>
        </div>
        <div className="max-h-[62vh] overflow-auto bg-slate-950 p-6">
          <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-5 text-slate-100">
            {rawJson}
          </pre>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DefaultDetailHeader({
  automation,
  displayName,
  primarySystem,
}: {
  automation: Automatisering;
  displayName: string;
  primarySystem: string;
}): React.ReactNode {
  return (
    <header className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <Link
        to={getNavigationReturnHref("automations", "/alle")}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Terug naar automations
      </Link>

      <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <SourceBadge source={automation.source} />
            <StatusBadge status={automation.status} />
            <CategorieBadge categorie={automation.categorie} />
            <SystemBadge systeem={primarySystem} />
          </div>
          <p className="font-mono text-xs text-muted-foreground">{automation.id}</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-foreground">
            {displayName}
          </h1>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            to={`/brandy?context=${automation.id}&naam=${encodeURIComponent(displayName)}`}
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-background px-3 text-sm font-semibold text-foreground transition-colors hover:bg-secondary"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Vraag Brandy
          </Link>
          <Link
            to={`/bewerk/${automation.id}`}
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <Pencil className="h-3.5 w-3.5" />
            Bewerken
          </Link>
        </div>
      </div>
    </header>
  );
}

function StatusPill({ status }: { status: Status }): React.ReactNode {
  const colorClass = status === "Actief"
    ? "bg-green-100 text-green-800"
    : status === "Uitgeschakeld"
      ? "bg-red-100 text-red-800"
      : "bg-amber-100 text-amber-800";

  return (
    <span className={`inline-flex h-8 items-center gap-2 rounded-full px-3 text-sm font-bold ${colorClass}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

function getHubSpotHeaderMeta(automation: Automatisering): string[] {
  const rawWorkflow = (automation.importProposal?.hubspot_workflow ?? {}) as {
    id?: string;
    objectType?: string;
    objectTypeId?: string;
    revisionId?: string;
    updatedAt?: string;
    updated_at?: string;
  };
  const workflowId = automation.hubspotWorkflow?.workflowId || rawWorkflow.id || automation.externalId;
  const objectType = automation.hubspotWorkflow?.objectType || rawWorkflow.objectType;
  const objectTypeId = getHubSpotObjectTypeId(objectType, rawWorkflow.objectTypeId);
  const objectLabel = formatHubSpotHeaderObjectLabel(objectTypeId, objectType);
  const updatedAt = rawWorkflow.updatedAt || rawWorkflow.updated_at || automation.lastSyncedAt || automation.hubspotLastRunAt;

  return [
    "HubSpot workflow",
    `${objectLabel} object${objectTypeId ? ` · ${objectTypeId}` : ""}`,
    workflowId ? `ID ${workflowId}` : null,
    rawWorkflow.revisionId ? `Revision ${rawWorkflow.revisionId}` : null,
    updatedAt ? `Updated ${formatHeaderDate(updatedAt)}` : null,
  ].filter((item): item is string => Boolean(item));
}

function getHubSpotRawData(automation: Automatisering): unknown | null {
  const rawWorkflow = automation.importProposal?.hubspot_workflow;
  if (isNonEmptyRecord(rawWorkflow)) return rawWorkflow;
  return automation.hubspotWorkflow ?? null;
}

function isNonEmptyRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length > 0;
}

function stringFromRecord(value: unknown, key: string): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const maybeString = (value as Record<string, unknown>)[key];
  return typeof maybeString === "string" ? maybeString : "";
}

function getHubSpotObjectTypeId(objectType: string | undefined | null, rawObjectTypeId: string | undefined): string {
  if (typeof objectType === "string" && /^0-\d+/.test(objectType)) return objectType;
  return rawObjectTypeId || "";
}

function formatHubSpotHeaderObjectLabel(objectTypeId: string, objectType: string | undefined | null): string {
  const normalizedObjectType = String(objectType || "").toLowerCase();
  if (objectTypeId === "0-3" || normalizedObjectType.includes("deal")) return "Deal";
  if (objectTypeId === "0-1" || normalizedObjectType.includes("contact")) return "Contact";
  if (objectTypeId === "0-2" || normalizedObjectType.includes("company")) return "Company";
  if (objectTypeId === "0-8" || normalizedObjectType.includes("line")) return "Line item";
  return "Record";
}

function formatHeaderDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "unknown";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatSourceName(source: string | undefined | null): string {
  if (source === "hubspot") return "HubSpot";
  if (source === "gitlab") return "GitLab";
  if (source === "zapier") return "Zapier";
  if (source === "typeform") return "Typeform";
  return "de bron";
}

function formatFindingDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "onbekend";
  return date.toLocaleDateString("nl-NL", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
