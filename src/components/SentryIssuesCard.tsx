import { useState } from "react";
import { AlertTriangle, ChevronDown, ChevronUp, ExternalLink, Loader2 } from "lucide-react";
import type { SentryIssueMatch } from "@/lib/sentryIssueMatching";

interface SentryIssuesCardProps {
  isLoading: boolean;
  error: Error | null;
  matches: SentryIssueMatch[];
  limited: boolean;
}

const LEVEL_RANK: Record<string, number> = {
  fatal: 5,
  error: 4,
  warning: 3,
  info: 2,
  debug: 1,
};

export function SentryIssuesCard({
  isLoading,
  error,
  matches,
  limited,
}: SentryIssuesCardProps): JSX.Element {
  const [isExpanded, setIsExpanded] = useState(true);
  const orderedMatches = [...matches].sort(compareMatches);
  const linked = orderedMatches.filter((match) => match.confidence === "exact" || match.confidence === "strong");
  const possible = orderedMatches.filter((match) => match.confidence === "possible");
  const canToggle = !isLoading && !error && matches.length > 0;

  return (
    <section
      aria-label="Sentry issues"
      className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold uppercase tracking-widest text-slate-500">Sentry issues</p>
          <h2 className="mt-1 text-lg font-semibold text-slate-950">Foutsignalen</h2>
          {!isLoading && !error && matches.length > 0 && (
            <p className="mt-1 text-sm text-slate-600">{formatIssueCount(matches.length)}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {canToggle && (
            <button
              type="button"
              aria-expanded={isExpanded}
              aria-label={isExpanded ? "Sentry issues inklappen" : "Sentry issues uitklappen"}
              onClick={() => setIsExpanded((current) => !current)}
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-950 shadow-sm transition-colors hover:bg-slate-50"
            >
              {isExpanded ? "Inklappen" : "Uitklappen"}
              {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
          )}
          {isLoading && <Loader2 aria-hidden="true" className="h-5 w-5 animate-spin text-slate-400" />}
        </div>
      </div>

      {isLoading && (
        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          Sentry issues worden opgehaald
        </div>
      )}

      {!isLoading && error && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <div className="flex items-center gap-2 font-semibold">
            <AlertTriangle className="h-4 w-4" />
            Sentry issues niet beschikbaar
          </div>
          <p className="mt-1 text-amber-800">
            De read-only koppeling kon niet worden gelezen. De automation blijft normaal beschikbaar.
          </p>
        </div>
      )}

      {!isLoading && !error && matches.length === 0 && (
        <div className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          Geen gekoppelde Sentry issues
        </div>
      )}

      {!isLoading && !error && isExpanded && linked.length > 0 && (
        <IssueList title="Gekoppelde issues" matches={linked} />
      )}

      {!isLoading && !error && isExpanded && possible.length > 0 && (
        <IssueList title="Mogelijke matches" matches={possible} muted />
      )}

      {!isLoading && !error && limited && (
        <p className="mt-3 text-xs text-slate-500">Resultaat beperkt door de Sentry API limiet.</p>
      )}
    </section>
  );
}

function IssueList({
  title,
  matches,
  muted = false,
}: {
  title: string;
  matches: SentryIssueMatch[];
  muted?: boolean;
}): JSX.Element {
  return (
    <div className="mt-4 space-y-2">
      <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
      {matches.map((match) => {
        const sentryPermalink = getSafeSentryPermalink(match.issue.permalink);

        return (
          <article
            key={match.issue.id}
            className={`rounded-xl border px-4 py-3 ${
              muted ? "border-amber-200 bg-amber-50" : "border-red-200 bg-red-50"
            }`}
          >
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div className="min-w-0">
                <p className="break-words font-semibold text-slate-950">{sanitizeIssueText(match.issue.title)}</p>
                <dl className="mt-2 flex flex-wrap gap-2 text-sm text-slate-700">
                  <IssueMeta label="Level" value={match.issue.level || "level onbekend"} />
                  <IssueMeta label="Status" value={match.issue.status} />
                  <IssueMeta label="Events" value={`${formatNumber(match.issue.count)} events`} />
                  {typeof match.issue.userCount === "number" && (
                    <IssueMeta label="Users" value={`${formatNumber(match.issue.userCount)} users`} />
                  )}
                </dl>
                <p className="mt-2 text-xs text-slate-500">
                  Match: {match.confidence} - {match.reason}
                  {match.issue.lastSeen ? ` - Laatst gezien ${formatDate(match.issue.lastSeen)}` : ""}
                </p>
              </div>
              {sentryPermalink && (
                <a
                  href={sentryPermalink}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-950 shadow-sm transition-colors hover:bg-slate-50"
                >
                  Open in Sentry
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}

function getSafeSentryPermalink(permalink: string): string | null {
  try {
    const url = new URL(permalink);
    const hostname = url.hostname.toLowerCase();

    if (url.protocol !== "https:" || (hostname !== "sentry.io" && !hostname.endsWith(".sentry.io"))) {
      return null;
    }

    return url.href;
  } catch {
    return null;
  }
}

function IssueMeta({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="inline-flex items-center gap-1 rounded-full border border-white/70 bg-white/70 px-2 py-0.5">
      <dt className="sr-only">{label}</dt>
      <dd>{sanitizeIssueText(value)}</dd>
    </div>
  );
}

function compareMatches(a: SentryIssueMatch, b: SentryIssueMatch): number {
  return (
    getLevelRank(b.issue.level) - getLevelRank(a.issue.level) ||
    Math.max(0, b.issue.count) - Math.max(0, a.issue.count) ||
    getTime(b.issue.lastSeen) - getTime(a.issue.lastSeen) ||
    a.issue.id.localeCompare(b.issue.id)
  );
}

function getLevelRank(level: string | undefined): number {
  return LEVEL_RANK[String(level ?? "").toLowerCase()] ?? 0;
}

function getTime(value: string | undefined): number {
  const time = Date.parse(value ?? "");
  return Number.isFinite(time) ? time : 0;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("nl-NL").format(Math.max(0, value));
}

function formatIssueCount(value: number): string {
  return value === 1 ? "1 issue" : `${formatNumber(value)} issues`;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "onbekend";
  return date.toLocaleDateString("nl-NL", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function sanitizeIssueText(value: string): string {
  const singleLine = value.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();
  return singleLine.length > 160 ? `${singleLine.slice(0, 157)}...` : singleLine;
}
