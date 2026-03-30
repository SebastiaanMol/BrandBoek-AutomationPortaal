import { Loader2 } from "lucide-react";
import { useBpmnGraph } from "@/hooks/useBpmnGraph";
import { AutomationSwimlaneBoard } from "@/components/AutomationSwimlaneBoard";

export default function Proceskaart() {
  const { graph, isLoading, error } = useBpmnGraph();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-sm text-destructive">{error.message}</p>
      </div>
    );
  }

  if (!graph) return null;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Proceskaart</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Alle automatiseringen per team en procesfase — pijlen tonen AI-inferred flows met betrouwbaarheid ≥ 70 %.
        </p>
      </div>
      <div className="border border-border rounded-[var(--radius-outer)] overflow-hidden bg-card shadow-sm">
        <AutomationSwimlaneBoard graph={graph} />
      </div>
    </div>
  );
}
