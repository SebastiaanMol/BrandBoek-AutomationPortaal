import type { Automatisering, Pipeline } from "@/lib/types";
import {
  buildProcessJourneyNarrative,
  getHubSpotWorkflowBranchPaths,
  getHubSpotTriggerValueList,
  getPrimaryWebhookPath,
} from "@/lib/processJourneyCopy";

interface ProcessJourneyNarrativeProps {
  automations: Automatisering[];
  pipelines: Pipeline[];
  autoMap: Map<string, Automatisering>;
  endpoint?: string;
  approvedDescription?: string;
}

export function ProcessJourneyNarrative({
  automations,
  pipelines,
  autoMap,
  endpoint,
  approvedDescription,
}: ProcessJourneyNarrativeProps): React.ReactNode {
  const approvedParagraphs = approvedDescription
    ?.split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  if (approvedParagraphs?.length) {
    return (
      <div className="mt-3 min-w-0 max-w-4xl space-y-4 break-words text-base leading-relaxed text-muted-foreground">
        {approvedParagraphs.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
      </div>
    );
  }

  const context = { pipelines, autoMap };
  const hubspot = automations.find((automation) => automation.source === "hubspot");
  const startAutomation =
    hubspot ?? automations.find((automation) => automation.source === "zapier") ?? automations[0];
  const resolvedEndpoint = endpoint ?? (startAutomation ? getPrimaryWebhookPath(startAutomation) : undefined);
  const narrative = buildProcessJourneyNarrative({ automations, endpoint: resolvedEndpoint, context });
  const triggerValues = hubspot ? getHubSpotTriggerValueList(hubspot, context) : undefined;
  const branchPaths = hubspot ? getHubSpotWorkflowBranchPaths(hubspot, context) : [];

  return (
    <div className="mt-3 min-w-0 max-w-4xl space-y-4 break-words text-base leading-relaxed text-muted-foreground">
      {narrative.opening && <p>{narrative.opening}</p>}
      <p>{narrative.triggerIntro}</p>
      {triggerValues && (
        <ul className="ml-5 list-disc space-y-1 text-sm leading-relaxed text-foreground">
          {narrative.triggerValues.map((value) => (
            <li key={value}>{value}</li>
          ))}
        </ul>
      )}
      <p>{narrative.hubspotStep}</p>
      {branchPaths.length > 0 && (
        <div className="rounded-xl border border-orange-200 bg-orange-50/60 p-4 text-orange-950">
          <p className="text-sm font-semibold">
            HubSpot splitst deze workflow in {branchPaths.length} paden op basis van de gekozen waarde.
          </p>
          <div className="mt-3 grid gap-2">
            {branchPaths.map((path) => (
              <div key={path.id} className="rounded-lg border border-orange-200 bg-white/70 px-3 py-2">
                <p className="text-sm font-semibold">{path.label}</p>
                <p className="mt-1 text-xs leading-relaxed text-orange-900/75">
                  Als de deal in dit pad valt: {path.conditionLabel}.
                </p>
                {path.updates.map((update) => (
                  <p key={`${path.id}-${update.property}`} className="mt-1 text-xs leading-relaxed text-orange-900/75">
                    Dan zet HubSpot {update.property} op {update.value}.
                  </p>
                ))}
                {path.webhookPath && (
                  <p className="mt-1 text-xs leading-relaxed text-orange-900/75">
                    Daarna geeft dit pad het werk door aan een backendverwerking.
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      <p>{narrative.backendStep}</p>
      <p>{narrative.hubspotUpdate}</p>
      <p>{narrative.downstream}</p>
      <p>{narrative.chainSummary}</p>
    </div>
  );
}
