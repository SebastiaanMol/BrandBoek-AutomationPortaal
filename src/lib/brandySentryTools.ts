import type { BrandyContext, BrandyResponse } from "@/lib/brandy";
import { matchSentryIssuesToAutomations, type PortalSentryIssue, type SentryIssueMatch } from "@/lib/sentryIssueMatching";
import type { FetchSentryIssuesResult } from "@/lib/storage/sentryIssues";
import type { Automatisering } from "@/lib/types";

const SENTRY_WORD_RE = /\bsentry\b/i;
const ERROR_WORD_RE = /\b(?:fout|error|issue|exception|mis ging|kapot)\b/i;
const LATEST_WORD_RE = /\b(?:laatste|recentste|nieuwste)\b/i;
const LOG_WORD_RE = /\b(?:log|logs|logging)\b/i;

export interface SentryErrorQuestion {
  wantsLatestSentryError: true;
}

export function parseSentryErrorQuestion(question: string): SentryErrorQuestion | null {
  const value = question.trim();
  if (!value) return null;
  if (!SENTRY_WORD_RE.test(value)) {
    return null;
  }

  if (!(LOG_WORD_RE.test(value) || (ERROR_WORD_RE.test(value) && LATEST_WORD_RE.test(value)))) {
    return null;
  }

  return { wantsLatestSentryError: true };
}

export function resolveSentryAutomation(
  question: string,
  automations: Automatisering[],
  context?: BrandyContext,
): Automatisering | null {
  if (context?.automationId) {
    return automations.find((automation) => automation.id === context.automationId)
      ?? createContextAutomation(context);
  }

  const normalizedQuestion = normalizeText(question);
  return automations.find((automation) => {
    const names = [automation.id, automation.naam, automation.externalId].filter(Boolean).map(normalizeText);
    return names.some((name) => name.length >= 4 && normalizedQuestion.includes(name));
  }) ?? null;
}

function createContextAutomation(context: BrandyContext): Automatisering | null {
  if (!context.automationId) return null;

  return {
    id: context.automationId,
    naam: context.automationNaam || context.automationId,
    categorie: "API",
    doel: "",
    trigger: "",
    systemen: ["API"],
    stappen: [],
    afhankelijkheden: "",
    owner: "",
    status: "Actief",
    verbeterideeën: "",
    mermaidDiagram: "",
    koppelingen: [],
    fasen: [],
    createdAt: "",
    laatstGeverifieerd: null,
    geverifieerdDoor: "",
  };
}

export function buildSentryErrorBrandyResponse(
  automation: Automatisering,
  sentryResult: FetchSentryIssuesResult,
  allAutomations: Automatisering[],
): BrandyResponse {
  const matches = matchSentryIssuesToAutomations(sentryResult.issues, allAutomations);
  const automationMatches = matches.byAutomationId[automation.id] ?? [];
  const match = pickLatestSentryMatch(automationMatches);
  const issue = match?.issue ?? pickLatestIssue(sentryResult.issues);

  if (!issue) {
    return {
      antwoord: `Ik heb Sentry gecontroleerd voor ${automation.naam}, maar ik vond geen gekoppelde open Sentry issues.`,
      bronnen: ["Sentry issues", "Automation catalog"],
      entiteiten: [`automation ${automation.id}`],
      zekerheid: "gemiddeld",
      diagnose_modus: true,
    };
  }

  const company = extractCompany(issue);
  const cause = summarizeCause(issue);
  const latestSeen = formatDutchDateTime(issue.lastSeen);
  const firstSeen = formatDutchDateTime(issue.firstSeen);
  const issueLabel = issue.shortId || issue.id;

  const lines = [
    `Ik heb de laatste Sentry fout voor ${automation.naam} gevonden.`,
    "",
    `Issue: ${issue.title}`,
    `Sentry: ${issueLabel}`,
    `Status: ${issue.status}${issue.level ? `, level ${issue.level}` : ""}`,
    `Events: ${formatNumber(issue.count)} events${typeof issue.userCount === "number" ? `, users: ${formatNumber(issue.userCount)}` : ""}`,
    firstSeen ? `Eerst gezien: ${firstSeen}` : null,
    latestSeen ? `Laatst gezien: ${latestSeen}` : null,
    issue.culprit ? `Locatie: ${issue.culprit}` : null,
    cause ? `Wat ging er mis: ${cause}` : null,
    company
      ? `Gekoppeld bedrijf: ${company.name}${company.id ? ` (${company.id})` : ""}`
      : "Gekoppeld bedrijf: Geen bedrijf gevonden in de beschikbare Sentry-data.",
  ].filter((line): line is string => line !== null);

  return {
    antwoord: lines.join("\n"),
    bronnen: ["Sentry issues", "Automation catalog"],
    entiteiten: buildEntities(automation, issue, company),
    zekerheid: match ? (match.confidence === "possible" ? "gemiddeld" : "hoog") : "gemiddeld",
    diagnose_modus: true,
  };
}

function pickLatestSentryMatch(matches: SentryIssueMatch[]): SentryIssueMatch | null {
  return [...matches].sort((a, b) => compareIssueDateDesc(a.issue, b.issue))[0] ?? null;
}

function pickLatestIssue(issues: PortalSentryIssue[]): PortalSentryIssue | null {
  return [...issues].sort(compareIssueDateDesc)[0] ?? null;
}

function compareIssueDateDesc(a: PortalSentryIssue, b: PortalSentryIssue): number {
  return timestamp(b.lastSeen) - timestamp(a.lastSeen) || timestamp(b.firstSeen) - timestamp(a.firstSeen);
}

function timestamp(value: string | undefined): number {
  const parsed = Date.parse(value ?? "");
  return Number.isFinite(parsed) ? parsed : 0;
}

function summarizeCause(issue: PortalSentryIssue): string {
  return sanitizeText([getIssueMetadataText(issue), issue.culprit, issue.title].filter(Boolean).join(" | "));
}

function extractCompany(issue: PortalSentryIssue): { name?: string; id?: string } | null {
  const tags = normalizeTags(issue.tags);
  const name = firstString(tags.company_name, tags.company, tags.bedrijf, tags.companyName);
  const id = firstString(tags.company_id, tags.hubspot_company_id, tags.companyId, tags.bedrijf_id);
  if (name || id) return { name: name ?? "Naam onbekend", id };

  const text = [getIssueMetadataText(issue), issue.title, issue.culprit].filter(Boolean).join(" ");
  const metadataCompany = text.match(/\bcompany\s+([A-Z0-9][\w .&'-]{2,80})/i)?.[1]?.trim();
  const metadataCompanyId = text.match(/\b(?:company_id|hubspot_company_id|company id|bedrijf_id)\s*[:=]?\s*([A-Za-z0-9_-]+)/i)?.[1]?.trim();
  if (metadataCompany || metadataCompanyId) {
    return {
      name: metadataCompany ?? "Naam onbekend",
      id: metadataCompanyId,
    };
  }

  return null;
}

function firstString(...values: Array<string | undefined>): string | undefined {
  return values.find((value) => typeof value === "string" && value.trim())?.trim();
}

function getIssueMetadataText(issue: PortalSentryIssue): string | undefined {
  const directText = firstString(issue.metadataText);
  if (directText) return directText;

  const metadata = (issue as { metadata?: unknown }).metadata;
  if (typeof metadata === "string") {
    return metadata.trim() || undefined;
  }

  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return undefined;
  }

  const record = metadata as Record<string, unknown>;
  return firstString(
    stringValue(record.value),
    stringValue(record.message),
    stringValue(record.title),
    stringValue(record.type),
  );
}

function normalizeTags(tags: unknown): Record<string, string> {
  if (!tags) return {};
  if (!Array.isArray(tags) && typeof tags === "object") {
    return Object.fromEntries(
      Object.entries(tags as Record<string, unknown>)
        .map(([key, value]) => [key, stringValue(value)])
        .filter((entry): entry is [string, string] => typeof entry[1] === "string"),
    );
  }

  if (!Array.isArray(tags)) return {};

  return Object.fromEntries(
    tags
      .map((tag) => {
        if (!tag || typeof tag !== "object") return null;
        const record = tag as Record<string, unknown>;
        const key = firstString(stringValue(record.key), stringValue(record.name));
        const value = stringValue(record.value);
        return key && value ? [key, value] : null;
      })
      .filter((entry): entry is [string, string] => Array.isArray(entry)),
  );
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function buildEntities(
  automation: Automatisering,
  issue: PortalSentryIssue,
  company: { name?: string; id?: string } | null,
): string[] {
  const entities = [
    `automation ${automation.id}`,
    `issue ${issue.shortId || issue.id}`,
    company?.name ? `bedrijf ${company.name}` : null,
    company?.id ? `company_id ${company.id}` : null,
  ].filter((entity): entity is string => Boolean(entity));
  return Array.from(new Set(entities));
}

function sanitizeText(value: string): string {
  return value.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[e-mail verborgen]");
}

function formatDutchDateTime(value: string | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("nl-NL", {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(date);
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("nl-NL").format(value);
}

function normalizeText(value: string | undefined | null): string {
  return String(value ?? "").toLowerCase().replace(/\s+/g, " ").trim();
}
