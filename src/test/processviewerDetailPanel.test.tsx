import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { ProcessviewerDetailPanel } from "@/components/procesviewer/ProcessviewerDetailPanel";
import type { Automatisering } from "@/lib/types";
import type { Automation, Connection, CustomLane, ProcessAttachment, ProcessStep } from "@/data/processData";

const steps: ProcessStep[] = [
  { id: "start", type: "start", label: "Start", team: "intake", column: 0 },
  { id: "task-betaalregeling", type: "task", label: "Betalingsregeling", team: "escalatie", column: 1, description: "Maak een betalingsregeling met de klant." },
  { id: "task-herinnering", type: "optional", label: "1e herinnering", team: "herinneringen", column: 2 },
];

const customLanes: CustomLane[] = [
  { key: "intake", label: "Intake", bg: "#fff", stroke: "#64748b", text: "#334155", dot: "#64748b" },
  { key: "escalatie", label: "Escalatie", bg: "#fff", stroke: "#10b981", text: "#065f46", dot: "#10b981" },
  { key: "herinneringen", label: "Herinneringen", bg: "#fff", stroke: "#2563eb", text: "#1d4ed8", dot: "#2563eb" },
];

const connections: Connection[] = [
  { id: "c-in", fromStepId: "start", toStepId: "task-betaalregeling", routeType: "main" },
  { id: "c-out", fromStepId: "task-betaalregeling", toStepId: "task-herinnering", routeType: "optional", label: "Klant reageert niet" },
];

const canvasAutomations: Automation[] = [];
const dbAutomations: Automatisering[] = [];
const attachments: ProcessAttachment[] = [];

function renderPanel(overrides: Partial<React.ComponentProps<typeof ProcessviewerDetailPanel>> = {}) {
  const onClose = vi.fn();
  const onSelectAuto = vi.fn();
  render(
    <MemoryRouter>
      <ProcessviewerDetailPanel
        selectedAutoId={null}
        selectedStepId="task-betaalregeling"
        dbAutomations={dbAutomations}
        canvasAutomations={canvasAutomations}
        steps={steps}
        connections={connections}
        attachments={attachments}
        customLanes={customLanes}
        onClose={onClose}
        onSelectAuto={onSelectAuto}
        {...overrides}
      />
    </MemoryRouter>,
  );
  return { onClose, onSelectAuto };
}

describe("ProcessviewerDetailPanel", () => {
  it("renders a sticky task detail menu with a close button and overview", () => {
    const { onClose } = renderPanel();

    expect(screen.getByRole("complementary", { name: "Taak detailmenu" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Betalingsregeling" })).toBeInTheDocument();
    expect(screen.getByText("Taak")).toBeInTheDocument();
    expect(screen.getByText("Escalatie")).toBeInTheDocument();
    expect(screen.getByText("Maak een betalingsregeling met de klant.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Sluit detailmenu" }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not render when there is no selected step or automation", () => {
    renderPanel({ selectedStepId: null, selectedAutoId: null });

    expect(screen.queryByRole("complementary", { name: /detailmenu/i })).not.toBeInTheDocument();
  });
});
