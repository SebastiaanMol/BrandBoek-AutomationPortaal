import { Automatisering, getVerificatieStatus } from "@/lib/types";

export function VerificatieBadge({ item }: { item: Automatisering }) {
  const status = getVerificatieStatus(item);
  const config = {
    geverifieerd: { emoji: "🟢", label: "Geverifieerd", cls: "bg-[hsl(var(--status-active)/0.1)] text-[hsl(var(--status-active))]" },
    verouderd: { emoji: "🟡", label: "Verouderd", cls: "bg-[hsl(var(--status-review)/0.1)] text-[hsl(var(--status-review))]" },
    nooit: { emoji: "🔴", label: "Nooit geverifieerd", cls: "bg-[hsl(var(--status-outdated)/0.1)] text-[hsl(var(--status-outdated))]" },
  }[status];

  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${config.cls}`}>
      {config.emoji} {config.label}
    </span>
  );
}
