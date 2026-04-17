import { Link } from "react-router-dom";
import { Fragment } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { X, Zap, ExternalLink, Unlink, ArrowRight, User, Clock, Layers, Lightbulb } from "lucide-react";
import type { Automation, Connection } from "@/data/processData";
import { TEAM_CONFIG } from "@/data/processData";
import type { Automatisering } from "@/lib/types";
import { useAutomatiseringen, usePipelines } from "@/lib/hooks";

interface AutomationDetailPanelProps {
  automation: Automation | null;
  fullData?: Automatisering;
  steps: { id: string; label: string }[];
  branchConnections: Connection[];   // connections where fromAutomationId === automation.id
  onClose: () => void;
  onDetach: (id: string) => void;
}

const STATUS_STYLES: Record<string, string> = {
  Actief:        "bg-emerald-50 text-emerald-700 border-emerald-200",
  Verouderd:     "bg-red-50 text-red-700 border-red-200",
  "In review":   "bg-amber-50 text-amber-700 border-amber-200",
  Uitgeschakeld: "bg-slate-100 text-slate-500 border-slate-200",
};

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="label-uppercase mb-2">
        {label}
      </p>
      {children}
    </div>
  );
}

export function AutomationDetailPanel({
  automation,
  fullData,
  steps,
  branchConnections,
  onClose,
  onDetach,
}: AutomationDetailPanelProps) {

  const { data: allAutomations } = useAutomatiseringen();

  const { data: pipelines } = usePipelines();

  const pipeline = (fullData?.pipelineId && pipelines)
    ? pipelines.find((p) => p.pipelineId === fullData.pipelineId)
    : undefined;

  if (!automation) return null;

  const cfg        = TEAM_CONFIG[automation.team];
  const fromStep   = steps.find(s => s.id === automation.fromStepId);
  const toStep     = steps.find(s => s.id === automation.toStepId);
  const isAttached = !!(automation.fromStepId && automation.toStepId);

  const relatedAutomations = fullData
    ? (allAutomations ?? []).filter(a => {
        if (a.id === fullData.id) return false;
        const sharedFase = a.fasen?.some(f => fullData.fasen?.includes(f));
        const sharedSystem = a.systemen?.some(s => fullData.systemen?.includes(s));
        return sharedFase || sharedSystem;
      }).slice(0, 5)
    : [];

  return (
    <div
      className="w-80 shrink-0 border-l border-border bg-card flex flex-col h-full"
      style={{ borderTop: `3px solid ${cfg.stroke}` }}
    >
      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2.5 min-w-0">
          <span
            className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
            style={{ background: cfg.bg, border: `2px solid ${cfg.stroke}` }}
          >
            <Zap className="h-4 w-4" style={{ color: cfg.stroke }} />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold leading-snug">{automation.name}</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-xs text-muted-foreground">{automation.tool}</span>
              {fullData?.status && (
                <Badge
                  variant="outline"
                  className={`text-[10px] px-1.5 py-0 ${STATUS_STYLES[fullData.status] ?? ""}`}
                >
                  {fullData.status}
                </Badge>
              )}
            </div>
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground transition-colors ml-2 shrink-0 mt-0.5"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* ── Body ────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">

        {/* LINK-01: View on canvas */}
        {fullData && (
          <Link
            to="/processen"
            className="text-xs text-primary flex items-center gap-1 hover:underline"
          >
            <ExternalLink className="h-3 w-3" />
            View on canvas
          </Link>
        )}

        {/* Team + categorie */}
        <div className="flex items-center gap-2 flex-wrap">
          <Badge
            variant="secondary"
            className="text-xs"
            style={{ background: cfg.bg, color: cfg.text, border: `1px solid ${cfg.stroke}30` }}
          >
            {cfg.label}
          </Badge>
          {fullData?.categorie && (
            <Badge variant="outline" className="text-xs text-muted-foreground">
              {fullData.categorie}
            </Badge>
          )}
        </div>

        {/* Doel */}
        <Section label="Doel">
          <p className="text-sm text-foreground leading-relaxed">{automation.goal}</p>
        </Section>

        {/* Trigger */}
        {fullData?.trigger && (
          <Section label="Trigger">
            <p className="text-sm text-foreground leading-relaxed">{fullData.trigger}</p>
          </Section>
        )}

        {/* Pipeline stages */}
        {pipeline && pipeline.stages.length > 0 && (
          <Section label="Pipeline stages">
            <div className="flex items-center gap-1 flex-nowrap overflow-x-auto pb-1">
              {[...pipeline.stages]
                .sort((a, b) => a.display_order - b.display_order)
                .map((stage, i, arr) => {
                  const isActive = stage.stage_id === fullData?.stageId;
                  return (
                    <Fragment key={stage.stage_id}>
                      <div
                        className={`shrink-0 rounded px-2 py-1 text-[10px] font-medium border transition-colors ${
                          isActive
                            ? "bg-primary/10 text-primary border-primary/40"
                            : "bg-secondary text-muted-foreground border-border"
                        }`}
                      >
                        {isActive && <span className="mr-0.5">▶</span>}
                        {stage.label}
                      </div>
                      {i < arr.length - 1 && (
                        <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                      )}
                    </Fragment>
                  );
                })}
            </div>
          </Section>
        )}

        {/* Systemen */}
        {fullData?.systemen && fullData.systemen.length > 0 && (
          <Section label="Systemen">
            <div className="flex flex-wrap gap-1.5">
              {fullData.systemen.map(s => (
                <Link key={s} to={`/systems?system=${encodeURIComponent(s)}`}>
                  <Badge variant="secondary" className="text-xs cursor-pointer hover:opacity-80 transition-opacity">
                    {s}
                  </Badge>
                </Link>
              ))}
            </div>
          </Section>
        )}

        {/* Stappen */}
        {fullData?.stappen && fullData.stappen.length > 0 && (
          <Section label="Stappen">
            <ol className="space-y-1">
              {fullData.stappen.map((stap, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-foreground">
                  <span className="shrink-0 w-4 h-4 rounded-full bg-secondary flex items-center justify-center text-[10px] font-semibold mt-0.5">
                    {i + 1}
                  </span>
                  <span className="leading-relaxed">{stap}</span>
                </li>
              ))}
            </ol>
          </Section>
        )}

        {/* Afhankelijkheden */}
        {fullData?.afhankelijkheden?.trim() && (
          <Section label="Afhankelijkheden">
            <p className="text-xs text-foreground leading-relaxed bg-secondary rounded-md px-3 py-2">
              {fullData.afhankelijkheden}
            </p>
          </Section>
        )}

        {/* Verbeterideeën */}
        {fullData?.verbeterideeën?.trim() && (
          <Section label="Verbeterideeën">
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
              <Lightbulb className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-800 leading-relaxed">{fullData.verbeterideeën}</p>
            </div>
          </Section>
        )}

        {/* Owner + laatste verificatie */}
        {(fullData?.owner || fullData?.geverifieerdDoor) && (
          <Section label="Beheer">
            <div className="space-y-1.5">
              {fullData.owner && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <User className="h-3.5 w-3.5 shrink-0" />
                  <span>Owner: <Link
                    to={`/owners?owner=${encodeURIComponent(fullData.owner)}`}
                    className="font-medium text-foreground hover:underline text-primary"
                  >
                    {fullData.owner}
                  </Link></span>
                </div>
              )}
              {fullData.geverifieerdDoor && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Layers className="h-3.5 w-3.5 shrink-0" />
                  <span>Geverifieerd door: <strong className="text-foreground">{fullData.geverifieerdDoor}</strong></span>
                </div>
              )}
              {fullData.laatstGeverifieerd && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Clock className="h-3.5 w-3.5 shrink-0" />
                  <span>{new Date(fullData.laatstGeverifieerd).toLocaleDateString("nl-NL")}</span>
                </div>
              )}
            </div>
          </Section>
        )}

        {/* Gekoppeld aan */}
        {isAttached && (
          <Section label="Gekoppeld aan">
            <div className="flex items-center gap-2 text-xs bg-secondary rounded-md px-3 py-2">
              <span className="font-medium text-foreground truncate">{fromStep?.label ?? automation.fromStepId}</span>
              <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" />
              <span className="font-medium text-foreground truncate">{toStep?.label ?? automation.toStepId}</span>
            </div>
          </Section>
        )}

        {/* Uitgaande paden */}
        <Section label="Uitgaande paden">
          {branchConnections.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Sleep een lijn van de ⚡ naar een stap om een pad toe te voegen.
            </p>
          ) : (
            <div className="space-y-1.5">
              {branchConnections.map((c, i) => (
                <div key={c.id} className="flex items-center gap-2 text-xs bg-secondary rounded-md px-2.5 py-1.5">
                  <span className="text-muted-foreground w-4 shrink-0">{i + 1}.</span>
                  <span className="font-medium truncate flex-1 text-amber-700">
                    {c.label || <span className="text-muted-foreground italic">geen label</span>}
                  </span>
                  <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                  <span className="text-muted-foreground truncate max-w-[80px]">
                    {steps.find(s => s.id === c.toStepId)?.label ?? c.toStepId}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* LINK-04: Related automations */}
        {relatedAutomations.length > 0 && (
          <Section label="Related">
            <div className="space-y-1">
              {relatedAutomations.map(rel => (
                <Link
                  key={rel.id}
                  to={`/alle?open=${rel.id}`}
                  className="flex items-center gap-1.5 text-xs text-primary hover:underline py-0.5"
                >
                  <ArrowRight className="h-3 w-3 shrink-0" />
                  {rel.naam}
                </Link>
              ))}
            </div>
          </Section>
        )}

        {/* External link */}
        {automation.link && (
          <Section label="Link">
            <a
              href={automation.link}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-primary flex items-center gap-1 hover:underline"
            >
              <ExternalLink className="h-3 w-3" />
              Openen in tool
            </a>
          </Section>
        )}
      </div>

      {/* ── Footer ──────────────────────────────────────────────────── */}
      {isAttached && (
        <div className="p-4 border-t border-border">
          <Button
            variant="outline"
            size="sm"
            className="w-full text-muted-foreground hover:text-foreground"
            onClick={() => { onDetach(automation.id); onClose(); }}
          >
            <Unlink className="h-3.5 w-3.5 mr-2" />
            Loskoppelen
          </Button>
        </div>
      )}

    </div>
  );
}
