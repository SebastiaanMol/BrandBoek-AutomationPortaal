import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AutomaticSyncDetailPanel } from "@/components/process/AutomaticSyncDetailPanel";
import type { Automation, ProcessArtifact } from "@/data/processData";
import type { Flow } from "@/lib/types";

const artifact: ProcessArtifact = {
  id: "artifact-sync",
  type: "automaticSyncBlock",
  title: "Pipeline-brede automatische sync",
  description: "Controleert property-syncs tussen pipelines.",
  position: { x: 360, y: 220 },
  automationIds: ["automation-sync"],
};

const automation: Automation = {
  id: "automation-sync",
  name: "JR boekers instellen",
  team: "sales",
  tool: "HubSpot",
  goal: "Zet JR boeker velden gelijk",
};

const flow: Flow = {
  id: "flow-sync",
  naam: "JR boekers procesreis",
  beschrijving: "",
  systemen: ["HubSpot"],
  automationIds: ["automation-sync"],
  createdAt: "2026-08-13T00:00:00.000Z",
  updatedAt: "2026-08-13T00:00:00.000Z",
};

describe("AutomaticSyncDetailPanel", () => {
  it("explains the automatic sync block and lists linked items", () => {
    const onClose = vi.fn();
    const onOpenFlow = vi.fn();
    const onOpenAutomation = vi.fn();

    render(
      <AutomaticSyncDetailPanel
        artifact={artifact}
        linkedAutomations={[automation]}
        linkedFlows={[flow]}
        onClose={onClose}
        onOpenAutomation={onOpenAutomation}
        onOpenFlow={onOpenFlow}
      />,
    );

    expect(screen.getByRole("heading", { name: "Pipeline-brede automatische sync" })).toBeInTheDocument();
    expect(screen.getByText("Controleert property-syncs tussen pipelines.")).toBeInTheDocument();
    expect(screen.getByText("Deze items zijn pipeline-breed en hangen niet aan een enkele stap of pijl.")).toBeInTheDocument();
    expect(screen.getByText("JR boekers procesreis")).toBeInTheDocument();
    expect(screen.getByText("JR boekers instellen")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Open procesreis JR boekers procesreis" }));
    fireEvent.click(screen.getByRole("button", { name: "Open automation JR boekers instellen" }));

    expect(onOpenFlow).toHaveBeenCalledWith("flow-sync");
    expect(onOpenAutomation).toHaveBeenCalledWith(automation);
  });
});
