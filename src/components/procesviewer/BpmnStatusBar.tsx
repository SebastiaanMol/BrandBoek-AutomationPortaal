import type { ProcessStep } from "@/data/processData";

interface BpmnStatusBarProps {
  steps: ProcessStep[];
  activeLanes: string[];
}

export function BpmnStatusBar({ steps, activeLanes }: BpmnStatusBarProps): React.ReactNode {
  const taskCount = steps.filter((s) => !s.type || s.type === "task").length;
  const optionalCount = steps.filter((s) => s.type === "optional" as ProcessStep["type"]).length;
  const endCount = steps.filter((s) => s.type === "end" || s.type === "terminate").length;

  return (
    <div
      className="absolute bottom-3 right-3 z-30 flex items-center gap-1.5"
    >
      <Chip label="Lanes" value={activeLanes.length} />
      <Chip label="Taken" value={taskCount} />
      <Chip label="Optioneel" value={optionalCount} />
      <Chip label="Einde" value={endCount} />
    </div>
  );
}

function Chip({ label, value }: { label: string; value: number }): React.ReactNode {
  return (
    <div
      className="flex items-center gap-1.5 px-2.5 py-1 bg-white text-[#64748B]"
      style={{ border: "0.5px solid #E2E8F0", borderRadius: 6, fontSize: 11 }}
    >
      <span className="font-semibold tabular-nums">{value}</span>
      <span>{label}</span>
    </div>
  );
}
