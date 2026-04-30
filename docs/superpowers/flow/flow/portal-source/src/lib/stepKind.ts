import { Zap, Cog, GitBranch, Wand2, Bell, Flag, type LucideIcon } from "lucide-react";
import type { StepKind } from "@/data/portal";

export const stepKindMeta: Record<StepKind, { label: string; Icon: LucideIcon }> = {
  trigger: { label: "Trigger", Icon: Zap },
  action: { label: "Actie", Icon: Cog },
  condition: { label: "Conditie", Icon: GitBranch },
  transform: { label: "Transformatie", Icon: Wand2 },
  notify: { label: "Notificatie", Icon: Bell },
  end: { label: "Afronding", Icon: Flag },
};
