import { useId } from "react";
import type { Automatisering } from "@/lib/types";
import { getSystemMeta } from "@/lib/systemMeta";

interface MiniFlowPreviewProps {
  automationIds: string[];
  autoMap: Map<string, Automatisering>;
  className?: string;
}

/**
 * Tiny stylised flow preview for cards.
 * Shows up to 6 dots coloured by the automation's primary system.
 */
export const MiniFlowPreview = ({ automationIds, autoMap, className = "" }: MiniFlowPreviewProps) => {
  const id = useId();
  const gradId = `line-grad-${id.replace(/:/g, "")}`;
  const ids = automationIds.slice(0, 6);
  const overflow = automationIds.length - ids.length;

  return (
    <div className={`relative h-14 w-full ${className}`}>
      <svg
        viewBox="0 0 240 56"
        className="absolute inset-0 w-full h-full"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id={gradId} x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor="hsl(var(--border))" />
            <stop offset="100%" stopColor="hsl(var(--border))" />
          </linearGradient>
        </defs>
        <path
          d="M 16 28 Q 60 8 100 28 T 180 28 L 224 28"
          fill="none"
          stroke={`url(#${gradId})`}
          strokeWidth="1.5"
          strokeDasharray="3 3"
        />
        {ids.map((id, i) => {
          const auto = autoMap.get(id);
          if (!auto) return null;
          const primarySysteem = auto.systemen[0] ?? "Anders";
          const meta = getSystemMeta(primarySysteem);
          const t = ids.length === 1 ? 0.5 : i / (ids.length - 1);
          const cx = 16 + t * 208;
          const cy = 28 + Math.sin(i * 1.2) * 10;
          const hue = `hsl(var(${meta.hue}))`;
          return (
            <g key={id}>
              <circle cx={cx} cy={cy} r={7} fill="hsl(var(--card))" />
              <circle cx={cx} cy={cy} r={5} fill={hue} opacity={0.18} />
              <circle cx={cx} cy={cy} r={3.5} fill={hue} />
            </g>
          );
        })}
      </svg>
      {overflow > 0 && (
        <span className="absolute right-1 bottom-0 text-[10px] font-mono text-muted-foreground">
          +{overflow}
        </span>
      )}
    </div>
  );
};
