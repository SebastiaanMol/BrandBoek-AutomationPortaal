import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { X, GitMerge, ExternalLink, Unlink, ArrowRight } from "lucide-react";
import type { Flow } from "@/lib/types";

interface FlowDetailPanelProps {
  flow: Flow;
  fromStep?: { id: string; label: string };
  toStep?:   { id: string; label: string };
  isAttached: boolean;
  placementLabel?: string;
  onClose: () => void;
  onDetach?: (flowId: string) => void;
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

export function FlowDetailPanel({
  flow,
  fromStep,
  toStep,
  isAttached,
  placementLabel,
  onClose,
  onDetach,
  readOnly = false,
}: FlowDetailPanelProps): React.ReactNode {
  const detachLabel = placementLabel ? `Loskoppelen van ${placementLabel}` : "Loskoppelen";

  return (
    <div
      className="w-80 shrink-0 border-l border-border bg-card flex flex-col h-full"
      style={{ borderTop: "3px solid #6366F1" }}
    >
      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
            style={{ background: "#EEF2FF", border: "2px solid #6366F1" }}>
            <GitMerge className="h-4 w-4" style={{ color: "#6366F1" }} />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold leading-snug">{flow.naam}</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-indigo-50 text-indigo-700 border-indigo-200">
                {flow.automationIds.length} automations
              </Badge>
            </div>
          </div>
        </div>
        <button onClick={onClose}
          className="text-muted-foreground hover:text-foreground transition-colors ml-2 shrink-0 mt-0.5">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* ── Body ────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">

        {/* Link to full procesreis page */}
        <Link to={`/flows/${flow.id}`}
          className="text-xs text-primary flex items-center gap-1 hover:underline">
          <ExternalLink className="h-3 w-3" />
          Bekijk volledige procesreis
        </Link>

        {/* Beschrijving */}
        {flow.beschrijving?.trim() && (
          <Section label="Beschrijving">
            <p className="text-sm text-foreground leading-relaxed">{flow.beschrijving}</p>
          </Section>
        )}

        {/* Systemen */}
        {flow.systemen?.length > 0 && (
          <Section label="Systemen">
            <div className="flex flex-wrap gap-1.5">
              {flow.systemen.map(s => (
                <Badge key={s} variant="secondary" className="text-xs">{s}</Badge>
              ))}
            </div>
          </Section>
        )}

        {/* Gekoppeld aan */}
        {isAttached && (
          <Section label="Gekoppeld aan">
            {placementLabel ? (
              <div className="text-xs bg-secondary rounded-md px-3 py-2 font-medium text-foreground">
                {placementLabel}
              </div>
            ) : fromStep && toStep ? (
              <div className="flex items-center gap-2 text-xs bg-secondary rounded-md px-3 py-2">
                <span className="font-medium text-foreground truncate">{fromStep.label}</span>
                <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                <span className="font-medium text-foreground truncate">{toStep.label}</span>
              </div>
            ) : null}
          </Section>
        )}

      </div>

      {/* ── Footer ──────────────────────────────────────────────────── */}
      {isAttached && !readOnly && onDetach && (
        <div className="p-4 border-t border-border">
          <Button
            variant="outline"
            size="sm"
            className="w-full text-muted-foreground hover:text-foreground"
            onClick={() => { onDetach(flow.id); onClose(); }}
          >
            <Unlink className="h-3.5 w-3.5 mr-2" />
            {detachLabel}
          </Button>
        </div>
      )}
    </div>
  );
}
