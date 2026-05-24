import { Link } from "react-router-dom";
import { ArrowRight, Route } from "lucide-react";
import { SourceBadge, StatusBadge } from "@/components/Badges";
import { expandFlowAutomationIds, type RuntimeChainLink } from "@/lib/flowRuntimeChain";
import { containsTechnicalDetail, getAutomationDetailDisplayName } from "@/lib/automationDetailPresentation";
import type { Automatisering, Flow } from "@/lib/types";

export interface ProcessJourneyMembership {
  flow: Flow;
  automationIds: string[];
  automations: Automatisering[];
}

export function getProcessJourneyMemberships({
  automationId,
  automations,
  flows,
  confirmedLinks,
}: {
  automationId: string;
  automations: Automatisering[];
  flows: Flow[];
  confirmedLinks: RuntimeChainLink[];
}): ProcessJourneyMembership[] {
  const autoMap = new Map(automations.map((automation) => [automation.id, automation]));

  return flows
    .map((flow) => {
      const automationIds = expandFlowAutomationIds(flow.automationIds, confirmedLinks);
      return {
        flow,
        automationIds,
        automations: automationIds
          .map((id) => autoMap.get(id))
          .filter((automation): automation is Automatisering => Boolean(automation)),
      };
    })
    .filter((membership) => membership.automationIds.includes(automationId));
}

export function AutomationProcessJourneyMembership({
  automation,
  automations,
  flows,
  confirmedLinks,
}: {
  automation: Automatisering;
  automations: Automatisering[];
  flows: Flow[];
  confirmedLinks: RuntimeChainLink[];
}) {
  const memberships = getProcessJourneyMemberships({
    automationId: automation.id,
    automations,
    flows,
    confirmedLinks,
  });

  if (memberships.length === 0) {
    return (
      <div className="border-t border-border pt-4">
        <p className="label-uppercase mb-2">Procesreiscontext</p>
        <article
          aria-label="Nog niet gekoppeld aan een procesreis"
          className="rounded-xl border border-border bg-background/80 p-4"
        >
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-secondary/50 text-muted-foreground">
              <Route className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-foreground">
                Nog niet gekoppeld aan een procesreis
              </h3>
              <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted-foreground">
                Deze automation staat op dit moment los in het portaal. Er is nog geen bevestigde procesreis gevonden waarin deze automation meedoet. Een koppeling wordt pas getoond wanneer een procesreis of bewezen overgang dit expliciet bevestigt.
              </p>
            </div>
          </div>
        </article>
      </div>
    );
  }

  return (
    <div className="border-t border-border pt-4">
      <p className="label-uppercase mb-2">
        {memberships.length === 1 ? "Onderdeel van procesreis" : "Onderdeel van procesreizen"}
      </p>
      <div className="space-y-3">
        {memberships.map((membership) => (
          <ProcessJourneyMembershipCard
            key={membership.flow.id}
            membership={membership}
            currentAutomationId={automation.id}
          />
        ))}
      </div>
    </div>
  );
}

function ProcessJourneyMembershipCard({
  membership,
  currentAutomationId,
}: {
  membership: ProcessJourneyMembership;
  currentAutomationId: string;
}) {
  const safeDescription = getSafeDescription(membership.flow.beschrijving);

  return (
          <article
            aria-label={`Procesreis ${membership.flow.naam}`}
            className="rounded-xl border border-border bg-secondary/40 p-4"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <Link
                  to={`/flows/${encodeURIComponent(membership.flow.id)}`}
                  className="inline-flex items-center gap-2 text-sm font-semibold text-foreground transition-colors hover:text-primary"
                  aria-label={`Open procesreis ${membership.flow.naam}`}
                >
                  <Route className="h-4 w-4 text-primary" />
                  <span className="truncate">{membership.flow.naam}</span>
                </Link>
                {safeDescription && (
                  <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                    {safeDescription}
                  </p>
                )}
              </div>
              <span className="shrink-0 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                Bevestigde procesreis
              </span>
            </div>

            <ol className="mt-4 space-y-2">
              {membership.automations.map((item, index) => {
                const isCurrent = item.id === currentAutomationId;
                const displayName = getAutomationDetailDisplayName(item);
                return (
                  <li
                    key={item.id}
                    className={`flex items-start gap-3 rounded-lg border px-3 py-2 ${
                      isCurrent
                        ? "border-primary/30 bg-primary/5"
                        : "border-border bg-background/80"
                    }`}
                  >
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-muted-foreground">
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-foreground">{displayName}</span>
                        {isCurrent && (
                          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                            Huidige automation
                          </span>
                        )}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <SourceBadge source={item.source} />
                        <StatusBadge status={item.status} />
                      </div>
                    </div>
                    {index < membership.automations.length - 1 && (
                      <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    )}
                  </li>
                );
              })}
            </ol>
          </article>
  );
}

function getSafeDescription(description: string | undefined | null): string | null {
  const text = description?.trim();
  if (!text) return null;
  if (containsTechnicalDetail(text)) return null;
  return text;
}
