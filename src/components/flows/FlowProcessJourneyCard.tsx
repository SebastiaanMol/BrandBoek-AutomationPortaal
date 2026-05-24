import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ArrowDown,
  Database,
  GitBranch,
  GitFork,
  Radio,
  Route,
  Send,
  Workflow,
} from "lucide-react";
import type { ComponentType } from "react";
import type { Automatisering } from "@/lib/types";
import { buildFlowRuntimeChain, type FlowRuntimeStepType } from "@/lib/flowRuntimeChain";

interface FlowProcessJourneyCardProps {
  title: string;
  description: string;
  automationIds: string[];
  autoMap: Map<string, Automatisering>;
  href: string;
  sourceLabel: string;
  sourceTone: "confirmed" | "concept";
  evidenceLabel?: string;
  structureSummary?: string;
}

const ICONS: Record<FlowRuntimeStepType, ComponentType<{ className?: string }>> = {
  signal: Radio,
  zapier_step: Route,
  typeform_step: Route,
  hubspot_workflow: Workflow,
  hubspot_branching: GitFork,
  gitlab_backend_block: GitBranch,
  gitlab_worker: GitBranch,
  automation: Route,
  return_to_hubspot: Send,
  state_write: Database,
  emitted_signal: Send,
  downstream: ArrowDown,
};

const STEP_COPY: Partial<Record<FlowRuntimeStepType, string>> = {
  signal: "Hier begint de kettingreactie.",
  zapier_step: "Zapier voert een concrete stap uit.",
  typeform_step: "Typeform verwerkt een formulierstap.",
  hubspot_workflow: "HubSpot herkent de wijziging en routeert het werk.",
  hubspot_branching: "HubSpot kiest het juiste pad.",
  gitlab_backend_block: "Een of meer backend automations verwerken de stap.",
  gitlab_worker: "De backend worker voert de berekening of actie uit.",
  return_to_hubspot: "Het resultaat gaat terug naar HubSpot.",
  state_write: "Hier staat de bewezen einduitkomst.",
  emitted_signal: "Deze nieuwe state wordt alleen gekoppeld met trigger-bewijs.",
  downstream: "Bewijscontrole voor vervolg.",
};

const STEP_STYLE: Record<FlowRuntimeStepType, string> = {
  signal: "border-blue-200 bg-blue-50 text-blue-900",
  zapier_step: "border-orange-200 bg-orange-50 text-orange-950",
  typeform_step: "border-slate-200 bg-slate-50 text-slate-950",
  hubspot_workflow: "border-orange-200 bg-orange-50 text-orange-900",
  hubspot_branching: "border-orange-200 bg-orange-50/70 text-orange-900",
  gitlab_backend_block: "border-purple-200 bg-purple-50 text-purple-900",
  gitlab_worker: "border-purple-200 bg-purple-50 text-purple-900",
  automation: "border-slate-200 bg-slate-50 text-slate-900",
  return_to_hubspot: "border-blue-200 bg-white text-blue-900",
  state_write: "border-emerald-200 bg-emerald-50 text-emerald-900",
  emitted_signal: "border-sky-200 bg-sky-50 text-sky-900",
  downstream: "border-dashed border-indigo-200/60 bg-indigo-50/50 text-indigo-900 opacity-70",
};

export function FlowProcessJourneyCard({
  title,
  description,
  automationIds,
  autoMap,
  href,
  sourceLabel,
  sourceTone,
  evidenceLabel,
  structureSummary,
}: FlowProcessJourneyCardProps): React.ReactNode {
  const steps = buildFlowRuntimeChain(automationIds, autoMap);
  const automations = automationIds
    .map((id) => autoMap.get(id))
    .filter((automation): automation is Automatisering => automation !== undefined);
  const impact = buildJourneyImpact(automations);
  const visibleSteps = steps.slice(0, 8);
  const hiddenStepCount = Math.max(0, steps.length - visibleSteps.length);

  return (
    <article className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className="grid gap-5 border-b border-border bg-muted/20 p-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span
              className={[
                "inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider",
                sourceTone === "confirmed"
                  ? "bg-green-100 text-green-700"
                  : "bg-amber-100 text-amber-800",
              ].join(" ")}
            >
              {sourceLabel}
            </span>
            {evidenceLabel && (
              <span className="inline-flex items-center rounded-full bg-background px-2.5 py-1 text-[10px] font-semibold text-muted-foreground">
                {evidenceLabel}
              </span>
            )}
          </div>
          <h2 className="text-xl font-semibold tracking-tight text-foreground">{title}</h2>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
            {description || buildFallbackStory(automations)}
          </p>
          {structureSummary && (
            <p className="mt-3 rounded-lg border border-border bg-background px-3 py-2 text-xs text-muted-foreground">
              {structureSummary}
            </p>
          )}
        </div>

        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-950">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            <p className="text-[11px] font-bold uppercase tracking-wider">Impact</p>
          </div>
          <p className="mt-2 text-lg font-semibold">{impact.title}</p>
          <ul className="mt-3 space-y-1.5 text-sm text-red-900">
            {impact.items.map((item) => (
              <li key={item} className="flex gap-2">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="p-5">
        {visibleSteps.length > 0 ? (
          <ol className="space-y-3">
            {visibleSteps.map((step, index) => {
              const Icon = ICONS[step.type];
              const isDownstream = step.type === "downstream";
              return (
                <li key={step.id} className="grid gap-3 sm:grid-cols-[2.75rem_minmax(0,1fr)]">
                  <div className="flex sm:flex-col sm:items-center">
                    <span className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow-sm">
                      <Icon className="h-5 w-5" />
                    </span>
                    {index < visibleSteps.length - 1 && (
                      <span className="ml-3 h-px flex-1 bg-border sm:ml-0 sm:mt-2 sm:h-6 sm:w-px" />
                    )}
                  </div>
                  <div className={`rounded-xl border px-4 py-3 ${STEP_STYLE[step.type]} ${isDownstream ? "shadow-none" : ""}`}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">
                        {index + 1}. {step.label}
                      </span>
                      <span className="text-xs text-current/65">
                        {STEP_COPY[step.type] ?? "Processtap in deze flow."}
                      </span>
                    </div>
                    <p className="mt-1 text-sm font-semibold leading-snug text-current">{step.title}</p>
                    <p className="mt-1 text-xs leading-relaxed text-current/75">{step.description}</p>
                    {step.branchPaths && step.branchPaths.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {step.branchPaths.slice(0, 4).map((path) => (
                          <span
                            key={path.id}
                            className="rounded-full border border-orange-200 bg-white/70 px-2 py-0.5 text-[10px] font-semibold text-orange-900"
                          >
                            {path.label}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        ) : (
          <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            Deze procesreis heeft nog onvoldoende automation-data om stappen te tonen.
          </div>
        )}

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
          <p className="text-xs text-muted-foreground">
            {automations.length} automation{automations.length === 1 ? "" : "s"} in deze procesreis
            {hiddenStepCount > 0 ? ` · +${hiddenStepCount} extra runtime-stappen` : ""}
          </p>
          <Link
            to={href}
            className="inline-flex h-9 items-center justify-center rounded-lg border border-border bg-background px-3 text-sm font-semibold text-foreground transition-colors hover:bg-secondary"
          >
            Bekijk details
          </Link>
        </div>
      </div>
    </article>
  );
}

function buildFallbackStory(automations: Automatisering[]): string {
  const first = automations[0];
  const gitlab = automations.find((automation) => automation.source === "gitlab" || automation.gitlabFilePath);
  const downstream = inferDomains(automations).join(" / ");

  if (!first) return "Deze procesreis laat zien hoe werk van signaal naar vervolgproces beweegt.";

  return [
    `Wanneer "${first.naam}" start, wordt werk doorgezet naar de volgende automation.`,
    gitlab ? `De backend worker "${gitlab.naam}" verwerkt de runtime-stap.` : "",
    downstream
      ? `Daarna wordt gecontroleerd of er bewezen ${downstream}-vervolg is.`
      : "Daarna wordt gecontroleerd of er een bewezen vervolgproces is.",
  ].filter(Boolean).join(" ");
}

function buildJourneyImpact(automations: Automatisering[]) {
  const domains = inferDomains(automations);
  const systems = new Set(automations.flatMap((automation) => automation.systemen));
  const hasGitLab = automations.some((automation) => automation.source === "gitlab" || automation.gitlabFilePath);
  const hasHubSpot = systems.has("HubSpot");
  const highImpact = domains.length >= 2 || (hasGitLab && hasHubSpot);

  return {
    title: highImpact ? "Kettingreactie mogelijk" : "Beperkte procesimpact",
    items: [
      domains.length > 0 ? `${domains.join(" / ")} proces kan geraakt worden` : "Vervolgproces wordt alleen gekoppeld met bewijs",
      hasGitLab ? "Backend worker kan HubSpot-state wijzigen" : "HubSpot workflow routeert het proces",
      hasHubSpot ? "Nieuwe HubSpot-state krijgt pas vervolg met trigger-bewijs" : "Downstream effect nog niet volledig herkend",
    ],
  };
}

function inferDomains(automations: Automatisering[]): string[] {
  const text = automations
    .map((automation) => `${automation.naam} ${automation.doel} ${automation.trigger} ${automation.fasen.join(" ")}`)
    .join(" ")
    .toUpperCase();
  return ["BTW", "JR", "IB", "VPB", "VA", "Sales"].filter((domain) => text.includes(domain.toUpperCase()));
}
