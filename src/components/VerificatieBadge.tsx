import { Automatisering, getVerificatieStatus, VERIFICATIE_LABELS } from "@/lib/types";
import { usePortalSettings } from "@/lib/hooks";

export function VerificatieBadge({ item }: { item: Automatisering }) {
  const { data: portalSettings } = usePortalSettings();
  const status = getVerificatieStatus(item, portalSettings?.verificatiePeriodeDagen ?? 90);
  const config = {
    geverifieerd: { emoji: "🟢", cls: "bg-[hsl(var(--status-active)/0.1)] text-[hsl(var(--status-active))]" },
    verouderd:    { emoji: "🟡", cls: "bg-[hsl(var(--status-review)/0.1)] text-[hsl(var(--status-review))]" },
    nooit:        { emoji: "🔴", cls: "bg-[hsl(var(--status-outdated)/0.1)] text-[hsl(var(--status-outdated))]" },
  }[status];

  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${config.cls}`}>
      {config.emoji} {VERIFICATIE_LABELS[status] ?? status}
    </span>
  );
}
