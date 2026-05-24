import { AlertTriangle, ChevronDown, GitBranch } from "lucide-react";
import type { Automatisering } from "@/lib/types";
import { isGitLabEndpointAutomation, parseGitLabExternalEndpoint } from "@/lib/automationFunnel";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface GitLabLocationCardProps {
  automation: Automatisering;
  compact?: boolean;
}

export function GitLabLocationCard({ automation, compact = false }: GitLabLocationCardProps): React.ReactNode {
  const isGitLab = automation.source === "gitlab" || Boolean(automation.gitlabFilePath);
  if (!isGitLab) return null;

  const parsed = parseGitLabExternalEndpoint(automation.externalId);
  const endpoint = automation.gitlabEndpoint?.endpoint ?? parsed.endpoint;
  const method = automation.gitlabEndpoint?.method ?? parsed.method;
  const file = automation.gitlabEndpoint?.api_file ?? automation.gitlabFilePath ?? automation.externalId;
  const handler = automation.gitlabEndpoint?.handler;
  const isEndpoint = isGitLabEndpointAutomation(automation);
  const legacyEndpoints = !isEndpoint ? automation.endpoints ?? [] : [];
  const route = [method, endpoint].filter(Boolean).join(" ");

  if (compact) {
    return (
      <Collapsible>
        <div className="rounded-lg border border-border bg-secondary/20 px-3 py-2.5">
          <div className="flex items-start gap-2 text-muted-foreground">
            {isEndpoint ? (
              <GitBranch className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            ) : (
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-wider">
                Technisch bewijs
              </p>
              <p className="mt-0.5 text-xs leading-relaxed">
                GitLab-locatie, route en handler staan hier voor controle.
              </p>
              <CollapsibleTrigger className="mt-2 flex min-h-[36px] items-center gap-1 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-secondary focus:outline-none focus:ring-2 focus:ring-ring">
                Technisch bewijs tonen
                <ChevronDown className="h-3.5 w-3.5" />
              </CollapsibleTrigger>
            </div>
          </div>

          <CollapsibleContent className="mt-3 rounded-md border border-border bg-background px-3 py-3">
            <div className="grid gap-2">
              <LocationField label="Bestand" value={file} />
              {isEndpoint && <LocationField label="Endpoint" value={route} />}
              {handler && <LocationField label="Handler" value={handler} />}
              {automation.externalId && <LocationField label="Bron-id" value={automation.externalId} />}
            </div>

            {!isEndpoint && legacyEndpoints.length > 0 && (
              <div className="mt-3">
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-orange-700">
                  Routes in dit bestand
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {legacyEndpoints.slice(0, 8).map((legacyRoute) => (
                    <span key={legacyRoute} className="rounded border border-orange-200 bg-white/70 px-2 py-0.5 font-mono text-[11px] text-orange-950">
                      {legacyRoute}
                    </span>
                  ))}
                  {legacyEndpoints.length > 8 && (
                    <span className="rounded border border-orange-200 bg-white/70 px-2 py-0.5 text-[11px] text-orange-800">
                      +{legacyEndpoints.length - 8} meer
                    </span>
                  )}
                </div>
              </div>
            )}
          </CollapsibleContent>
        </div>
      </Collapsible>
    );
  }

  return (
    <div className="rounded-lg border border-orange-200 bg-orange-50/50 px-3 py-2.5">
      <div className="flex items-start gap-2 text-orange-800">
        {isEndpoint ? (
          <GitBranch className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        ) : (
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-orange-700">
            {isEndpoint ? "Terug te vinden in GitLab" : "Oude GitLab bestandsimport"}
          </p>
          <p className="mt-0.5 break-words text-sm leading-relaxed text-orange-950">
            {file}
            {route && <span className="text-orange-700"> · {route}</span>}
          </p>
          {!isEndpoint && (
            <p className="mt-1 text-xs text-orange-800">
              Dit record verwijst naar een heel bestand. De exacte endpoint-automation staat in de nieuwe GitLab-sync records.
            </p>
          )}
        </div>
      </div>

      <Collapsible>
        <CollapsibleTrigger className="mt-2 flex items-center gap-1 text-xs font-semibold text-orange-700 hover:text-orange-900">
          Details tonen
          <ChevronDown className="h-3.5 w-3.5" />
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-2">
          <div className={`grid gap-2 ${compact ? "" : "sm:grid-cols-2"}`}>
            <LocationField label="Bestand" value={file} />
            {isEndpoint && <LocationField label="Endpoint" value={route} />}
            {handler && <LocationField label="Handler" value={handler} />}
            {automation.externalId && <LocationField label="Bron-id" value={automation.externalId} />}
          </div>

          {!isEndpoint && legacyEndpoints.length > 0 && (
            <div className="mt-3">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-orange-700">
                Routes in dit bestand
              </p>
              <div className="flex flex-wrap gap-1.5">
                {legacyEndpoints.slice(0, 8).map((legacyRoute) => (
                  <span key={legacyRoute} className="rounded border border-orange-200 bg-white/70 px-2 py-0.5 font-mono text-[11px] text-orange-950">
                    {legacyRoute}
                  </span>
                ))}
                {legacyEndpoints.length > 8 && (
                  <span className="rounded border border-orange-200 bg-white/70 px-2 py-0.5 text-[11px] text-orange-800">
                    +{legacyEndpoints.length - 8} meer
                  </span>
                )}
              </div>
            </div>
          )}
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

function LocationField({ label, value }: { label: string; value?: string | null }): React.ReactNode {
  if (!value) return null;
  return (
    <div className="min-w-0">
      <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-orange-700">
        {label}
      </p>
      <p className="break-all font-mono text-xs leading-relaxed text-orange-950">
        {value}
      </p>
    </div>
  );
}
