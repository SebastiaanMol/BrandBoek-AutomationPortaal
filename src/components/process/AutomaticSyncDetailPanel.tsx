import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Automation, ProcessArtifact } from "@/data/processData";
import type { Flow } from "@/lib/types";
import { GitMerge, RefreshCw, X, Zap } from "lucide-react";

interface AutomaticSyncDetailPanelProps {
  artifact: ProcessArtifact;
  linkedAutomations: Automation[];
  linkedFlows: Flow[];
  onClose: () => void;
  onOpenAutomation?: (automation: Automation) => void;
  onOpenFlow?: (flowId: string) => void;
  onUpdateArtifact?: (artifactId: string, patch: Partial<Pick<ProcessArtifact, "title" | "description">>) => void;
  readOnly?: boolean;
}

function Section({ label, children }: { label: string; children: React.ReactNode }): React.ReactNode {
  return (
    <div>
      <p className="label-uppercase mb-2">{label}</p>
      {children}
    </div>
  );
}

export function AutomaticSyncDetailPanel({
  artifact,
  linkedAutomations,
  linkedFlows,
  onClose,
  onOpenAutomation,
  onOpenFlow,
  onUpdateArtifact,
  readOnly = false,
}: AutomaticSyncDetailPanelProps): React.ReactNode {
  const description = artifact.description?.trim()
    || "Beschrijf wat deze sync controleert en welke acties automatisch worden uitgevoerd.";

  return (
    <aside
      className="w-80 shrink-0 border-l border-border bg-card flex flex-col h-full"
      style={{ borderTop: "3px solid #2563eb" }}
    >
      <div className="flex items-start justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 bg-blue-50 border-2 border-blue-600">
            <RefreshCw className="h-4 w-4 text-blue-700" />
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold leading-snug">{artifact.title}</h2>
            <div className="flex items-center gap-1.5 mt-0.5">
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-blue-50 text-blue-700 border-blue-200">
                Automatic sync
              </Badge>
            </div>
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground transition-colors ml-2 shrink-0 mt-0.5"
          aria-label="Automatic sync paneel sluiten"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <Section label="Doel">
          {readOnly || !onUpdateArtifact ? (
            <p className="text-sm text-foreground leading-relaxed">{description}</p>
          ) : (
            <textarea
              aria-label="Automatic sync doel"
              value={artifact.description ?? ""}
              onChange={event => onUpdateArtifact(artifact.id, { description: event.target.value })}
              placeholder="Beschrijf wat deze sync controleert en welke acties automatisch worden uitgevoerd."
              rows={4}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm leading-relaxed outline-none focus:border-primary"
            />
          )}
        </Section>

        <Section label="Wat betekent dit?">
          <div className="rounded-md border border-blue-100 bg-blue-50 px-3 py-2 text-xs leading-relaxed text-blue-900">
            Deze items zijn pipeline-breed en hangen niet aan een enkele stap of pijl.
          </div>
        </Section>

        <Section label="Gekoppelde procesreizen">
          {linkedFlows.length > 0 ? (
            <div className="space-y-2">
              {linkedFlows.map(flow => (
                <Button
                  key={flow.id}
                  variant="outline"
                  size="sm"
                  className="w-full justify-start gap-2 text-left"
                  onClick={() => onOpenFlow?.(flow.id)}
                  aria-label={`Open procesreis ${flow.naam}`}
                >
                  <GitMerge className="h-3.5 w-3.5 text-indigo-600" />
                  <span className="truncate">{flow.naam}</span>
                </Button>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Geen procesreizen gekoppeld.</p>
          )}
        </Section>

        <Section label="Gekoppelde automations">
          {linkedAutomations.length > 0 ? (
            <div className="space-y-2">
              {linkedAutomations.map(automation => (
                <Button
                  key={automation.id}
                  variant="outline"
                  size="sm"
                  className="w-full justify-start gap-2 text-left"
                  onClick={() => onOpenAutomation?.(automation)}
                  aria-label={`Open automation ${automation.name}`}
                >
                  <Zap className="h-3.5 w-3.5 text-orange-600" />
                  <span className="truncate">{automation.name}</span>
                </Button>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Geen automations gekoppeld.</p>
          )}
        </Section>
      </div>
    </aside>
  );
}
