import { Link } from "react-router-dom";
import type { Automatisering, Flow } from "@/lib/types";
import { getSystemMeta } from "@/lib/systemMeta";
import { GitLabLocationCard } from "@/components/GitLabLocationCard";
import { AutomationFunnel } from "@/components/AutomationFunnel";
import { buildAutomationFunnel } from "@/lib/automationFunnel";
import { displayAutomationName } from "@/lib/automationDisplay";
import {
  getPresentationAutomationLabel,
  getPresentationAutomationSummary,
  type FlowDetailPresentation,
} from "@/lib/flowDetailPresentation";
import { ExternalLink } from "lucide-react";

interface AutomationDetailProps {
  automationId: string | null;
  currentFlowId: string;
  autoMap: Map<string, Automatisering>;
  allFlows: Flow[];
  presentation?: FlowDetailPresentation | null;
}

export const AutomationDetail = ({
  automationId,
  currentFlowId,
  autoMap,
  allFlows,
  presentation = null,
}: AutomationDetailProps) => {
  if (!automationId) return null;
  const auto = autoMap.get(automationId);
  if (!auto) return null;

  const primarySysteem = auto.systemen[0] ?? "Anders";
  const sys = getSystemMeta(primarySysteem);
  const isGitLab = auto.source === "gitlab" || Boolean(auto.gitlabFilePath);
  const funnel = buildAutomationFunnel(auto);

  const displayName = getPresentationAutomationLabel(presentation, auto, displayAutomationName(auto));
  const description = getPresentationAutomationSummary(
    presentation,
    auto,
    funnel?.narrative ||
      auto.aiDescription ||
      auto.beschrijvingInSimpeleTaal?.[0] ||
      auto.doel,
  );
  const visibleSteps = presentation || isGitLab ? [] : auto.stappen;

  return (
    <div className="card-elevated p-5 animate-fade-in">
      <div className="flex items-center gap-3 mb-4 min-w-0">
        <span
          className="inline-flex items-center justify-center w-10 h-10 rounded-lg flex-shrink-0"
          style={{
            background: `color-mix(in oklab, hsl(var(${sys.hue})) 14%, transparent)`,
            color: `hsl(var(${sys.hue}))`,
          }}
        >
          <span className="text-xs font-bold">{sys.label.slice(0, 2).toUpperCase()}</span>
        </span>
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">
            Automation · {sys.label}
          </p>
          <h3 className="text-base font-semibold text-foreground leading-tight break-words">
            {displayName}
          </h3>
        </div>
      </div>

      <p className="text-sm text-foreground leading-relaxed">{description}</p>

      <div className="mt-4">
        <GitLabLocationCard automation={auto} compact />
      </div>

      <div className="mt-4">
        <AutomationFunnel automation={auto} compact />
      </div>

      {visibleSteps.length > 0 && (
        <div className="mt-4">
          <p className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-2">
            Processtappen ({visibleSteps.length})
          </p>
          <ol className="relative space-y-0.5">
            <span
              className="absolute left-[15px] top-3 bottom-3 w-px bg-border"
              aria-hidden
            />
            {visibleSteps.map((stap, idx) => (
              <li key={idx} className="relative pl-10 py-1.5">
                <span
                  className="absolute left-1 top-2 inline-flex items-center justify-center w-7 h-7 rounded-full bg-card border border-border text-[10px] font-mono font-bold"
                  style={{ color: `hsl(var(${sys.hue}))` }}
                >
                  {String(idx + 1).padStart(2, "0")}
                </span>
                <p className="text-xs text-foreground leading-relaxed break-words">{stap}</p>
              </li>
            ))}
          </ol>
        </div>
      )}

      <div className="mt-4 pt-4 border-t border-border">
        <Link
          to={`/automations/${encodeURIComponent(auto.id)}`}
          className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
        >
          Open in portaal
          <ExternalLink className="w-3 h-3" />
        </Link>
      </div>
    </div>
  );
};
