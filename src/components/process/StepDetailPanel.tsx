import { X, LayoutList } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { ProcessStep } from "@/data/processData";
import { TEAM_CONFIG } from "@/data/processData";

interface StepDetailPanelProps {
  step: ProcessStep | null;
  onClose: () => void;
}

export function StepDetailPanel({ step, onClose }: StepDetailPanelProps): React.ReactNode {
  if (!step) return null;

  const cfg = TEAM_CONFIG[step.team];

  return (
    <div
      className="w-80 shrink-0 border-l border-border bg-card flex flex-col h-full"
      style={{ borderTop: `3px solid ${cfg.stroke}` }}
    >
      {/* Header */}
      <div className="flex items-start justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2.5 min-w-0">
          <span
            className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
            style={{ background: cfg.bg, border: `2px solid ${cfg.stroke}` }}
          >
            <LayoutList className="h-4 w-4" style={{ color: cfg.stroke }} />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold leading-snug">{step.label}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{cfg.label}</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground transition-colors ml-2 shrink-0 mt-0.5"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Team badge */}
        <Badge
          variant="secondary"
          className="text-xs"
          style={{ background: cfg.bg, color: cfg.text, border: `1px solid ${cfg.stroke}30` }}
        >
          {cfg.label}
        </Badge>

        {/* Description */}
        {step.description ? (
          <div>
            <p className="label-uppercase mb-2">Omschrijving</p>
            <p className="text-sm text-foreground leading-relaxed">{step.description}</p>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Geen omschrijving beschikbaar.</p>
        )}
      </div>
    </div>
  );
}
