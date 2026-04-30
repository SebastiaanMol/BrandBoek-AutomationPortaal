import { ATOMIC_AUTOMATIONS, type BusinessProcess } from "@/data/portal";

interface MiniFlowPreviewProps {
  process: BusinessProcess;
  className?: string;
}

/**
 * Tiny stylised flow preview for cards.
 * Shows up to 6 dots colored by their atomic automation's system.
 */
export const MiniFlowPreview = ({ process, className = "" }: MiniFlowPreviewProps) => {
  const ids = process.automationIds.slice(0, 6);
  const overflow = process.automationIds.length - ids.length;

  return (
    <div className={`relative h-14 w-full ${className}`}>
      <svg
        viewBox="0 0 240 56"
        className="absolute inset-0 w-full h-full"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="line-grad" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor="hsl(var(--border))" />
            <stop offset="100%" stopColor="hsl(var(--border))" />
          </linearGradient>
        </defs>
        {/* connector */}
        <path
          d="M 16 28 Q 60 8 100 28 T 180 28 L 224 28"
          fill="none"
          stroke="url(#line-grad)"
          strokeWidth="1.5"
          strokeDasharray="3 3"
        />
        {ids.map((id, i) => {
          const a = ATOMIC_AUTOMATIONS[id];
          if (!a) return null;
          const t = ids.length === 1 ? 0.5 : i / (ids.length - 1);
          const cx = 16 + t * 208;
          // gentle wave
          const cy = 28 + Math.sin(i * 1.2) * 10;
          const hue = `hsl(var(--system-${a.system}))`;
          return (
            <g key={id}>
              <circle cx={cx} cy={cy} r={7} fill="hsl(var(--card))" />
              <circle
                cx={cx}
                cy={cy}
                r={5}
                fill={hue}
                opacity={0.18}
              />
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
