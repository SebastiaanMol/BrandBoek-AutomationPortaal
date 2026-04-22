import { useNavigate } from "react-router-dom";
import type { Flow } from "@/lib/types";

interface FlowCardProps {
  flow: Flow;
  hasUpdate?: boolean;
}

export function FlowCard({ flow, hasUpdate }: FlowCardProps): React.ReactNode {
  const navigate = useNavigate();

  return (
    <div
      className="border border-border rounded-lg p-4 bg-card hover:border-primary/40 cursor-pointer transition-colors"
      onClick={() => navigate(`/flows/${flow.id}`)}
    >
      <div className="flex items-start justify-between gap-2 mb-1">
        <h3 className="font-semibold text-sm">{flow.naam}</h3>
        {hasUpdate && (
          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 shrink-0">
            Update beschikbaar
          </span>
        )}
      </div>
      {flow.beschrijving && (
        <p className="text-xs text-muted-foreground mb-3 line-clamp-2">{flow.beschrijving}</p>
      )}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-muted-foreground">
          {flow.automationIds.length} automatiseringen
        </span>
        {flow.systemen.map((s) => (
          <span
            key={s}
            className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground"
          >
            {s}
          </span>
        ))}
      </div>
    </div>
  );
}
