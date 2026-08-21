import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { UnassignedPanel } from "@/components/process/UnassignedPanel";
import type { Automation, ProcessStep } from "@/data/processData";
import type { Flow } from "@/lib/types";

const steps: ProcessStep[] = [
  { id: "start", label: "Start", team: "sales", column: 0 },
  { id: "done", label: "Klaar", team: "sales", column: 1 },
];

function automation(overrides: Partial<Automation>): Automation {
  return {
    id: "auto-1",
    name: "Automation",
    team: "sales",
    tool: "HubSpot",
    goal: "Doel",
    ...overrides,
  };
}

function flow(overrides: Partial<Flow>): Flow {
  return {
    id: "flow-1",
    naam: "Procesreis",
    beschrijving: "Beschrijving",
    systemen: ["HubSpot"],
    automationIds: [],
    createdAt: "2026-06-23T00:00:00.000Z",
    updatedAt: "2026-06-23T00:00:00.000Z",
    ...overrides,
  };
}

describe("UnassignedPanel automation search", () => {
  it("allows linked automations to be dragged again and detached from the linked list", () => {
    const setData = vi.fn();
    const onDetachAutomation = vi.fn();
    render(
      <UnassignedPanel
        automations={[
          automation({
            id: "auto-linked-step",
            name: "Stap automation",
            placement: { kind: "step", stepId: "start", order: 0 },
          }),
        ]}
        flows={[]}
        flowLinks={{}}
        steps={steps}
        onAutomationClick={vi.fn()}
        onFlowClick={vi.fn()}
        onDetachAutomation={onDetachAutomation}
      />,
    );

    const row = screen.getByTestId("linked-automation-auto-linked-step");
    fireEvent.dragStart(row, {
      dataTransfer: {
        setData,
        effectAllowed: "move",
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Automation Stap automation loskoppelen" }));

    expect(setData).toHaveBeenCalledWith("automationId", "auto-linked-step");
    expect(onDetachAutomation).toHaveBeenCalledWith("auto-linked-step");
  });

  it("allows linked process journeys to be dragged again from the linked list", () => {
    const setData = vi.fn();
    render(
      <UnassignedPanel
        automations={[]}
        flows={[flow({ id: "flow-linked-step", naam: "Stap procesreis" })]}
        flowLinks={{
          "flow-linked-step": { kind: "step", stepId: "start", order: 0 },
        }}
        steps={steps}
        onAutomationClick={vi.fn()}
        onFlowClick={vi.fn()}
        onDetachFlow={vi.fn()}
      />,
    );

    const row = screen.getByTestId("linked-flow-flow-linked-step");
    fireEvent.dragStart(row, {
      dataTransfer: {
        setData,
        effectAllowed: "move",
      },
    });

    expect(setData).toHaveBeenCalledWith("flowId", "flow-linked-step");
  });

  it("filters loose automations by name, tool, goal, and id", () => {
    render(
      <UnassignedPanel
        automations={[
          automation({
            id: "auto-hubspot-ib",
            name: "Update IB deal",
            tool: "HubSpot",
            goal: "Jaarrekening klaarzetten",
            status: "Actief",
          }),
          automation({
            id: "auto-typeform-contact",
            name: "Typeform webhook",
            tool: "Typeform",
            goal: "Nieuwe contactaanvraag verwerken",
            status: "active",
          }),
          automation({
            id: "auto-linked",
            name: "Al geplaatst",
            fromStepId: "start",
            toStepId: "done",
          }),
        ]}
        flows={[]}
        flowLinks={{}}
        steps={steps}
        onAutomationClick={vi.fn()}
        onFlowClick={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Losse automations/i }));

    const looseSection = screen.getByRole("region", { name: /Losse automations/i });
    expect(within(looseSection).getByText("Update IB deal")).toBeInTheDocument();
    expect(within(looseSection).getByText("Typeform webhook")).toBeInTheDocument();
    expect(within(looseSection).queryByText("Al geplaatst")).not.toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Zoek automation..."), {
      target: { value: "jaarrekening" },
    });

    expect(within(looseSection).getByText("Update IB deal")).toBeInTheDocument();
    expect(within(looseSection).queryByText("Typeform webhook")).not.toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Zoek automation..."), {
      target: { value: "typeform" },
    });

    expect(within(looseSection).queryByText("Update IB deal")).not.toBeInTheDocument();
    expect(within(looseSection).getByText("Typeform webhook")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Zoek automation..."), {
      target: { value: "niet-bestaand" },
    });

    expect(within(looseSection).getByText("Geen automations gevonden")).toBeInTheDocument();
  });

  it("shows only active workflows in the loose automations list", () => {
    render(
      <UnassignedPanel
        automations={[
          automation({
            id: "auto-active",
            name: "Actieve workflow",
            status: "Actief",
          }),
          automation({
            id: "auto-disabled",
            name: "Uitgeschakelde workflow",
            status: "Uitgeschakeld",
          }),
          automation({
            id: "auto-linked-disabled",
            name: "Geplaatste uitgeschakelde workflow",
            status: "Uitgeschakeld",
            placement: { kind: "step", stepId: "start", order: 0 },
          }),
        ]}
        flows={[]}
        flowLinks={{}}
        steps={steps}
        onAutomationClick={vi.fn()}
        onFlowClick={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Losse automations/i }));

    const looseSection = screen.getByRole("region", { name: /Losse automations/i });
    expect(within(looseSection).getByText("Actieve workflow")).toBeInTheDocument();
    expect(within(looseSection).queryByText("Uitgeschakelde workflow")).not.toBeInTheDocument();
    expect(screen.getByText("Geplaatste uitgeschakelde workflow")).toBeInTheDocument();
  });

  it("filters process journeys by name, description, system, and id", () => {
    render(
      <UnassignedPanel
        automations={[]}
        flows={[
          flow({
            id: "flow-sales-ib",
            naam: "IB aangifte proces",
            beschrijving: "Jaarrekening naar inkomstenbelasting",
            systemen: ["HubSpot"],
            automationIds: ["auto-1", "auto-2"],
          }),
          flow({
            id: "flow-onboarding-typeform",
            naam: "Onboarding intake",
            beschrijving: "Nieuwe klant via formulier",
            systemen: ["Typeform"],
            automationIds: ["auto-3"],
          }),
        ]}
        flowLinks={{}}
        steps={steps}
        onAutomationClick={vi.fn()}
        onFlowClick={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Procesreizen/i }));

    const flowSection = screen.getByRole("region", { name: /Procesreizen/i });
    expect(within(flowSection).getByText("IB aangifte proces")).toBeInTheDocument();
    expect(within(flowSection).getByText("Onboarding intake")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Zoek procesreis..."), {
      target: { value: "inkomstenbelasting" },
    });

    expect(within(flowSection).getByText("IB aangifte proces")).toBeInTheDocument();
    expect(within(flowSection).queryByText("Onboarding intake")).not.toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Zoek procesreis..."), {
      target: { value: "typeform" },
    });

    expect(within(flowSection).queryByText("IB aangifte proces")).not.toBeInTheDocument();
    expect(within(flowSection).getByText("Onboarding intake")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Zoek procesreis..."), {
      target: { value: "niet-bestaand" },
    });

    expect(within(flowSection).getByText("Geen procesreizen gevonden")).toBeInTheDocument();
  });
});
