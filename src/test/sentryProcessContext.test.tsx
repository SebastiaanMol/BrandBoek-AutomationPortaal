import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import Procesviewer from "@/pages/Procesviewer";

const sentryMocks = vi.hoisted(() => ({
  setContext: vi.fn(),
  captureException: vi.fn(),
}));

vi.mock("@/lib/sentry", () => ({
  Sentry: {
    setContext: sentryMocks.setContext,
    captureException: sentryMocks.captureException,
    ErrorBoundary: ({ children }: { children: React.ReactNode }) => children,
  },
  createInstrumentedBrowserRouter: vi.fn(),
}));

vi.mock("@/lib/hooks", () => ({
  usePipelines: () => ({
    data: [
      {
        pipelineId: "pipe-1",
        naam: "Sales",
        stages: [{ id: "intake", label: "Intake" }],
        syncedAt: "2026-06-10T00:00:00.000Z",
        updatedAt: "2026-06-10T00:00:00.000Z",
        beschrijving: null,
        isActive: true,
        source: "hubspot",
      },
    ],
  }),
  useProcessState: () => ({
    data: {
      steps: [{ id: "intake", type: "task", label: "Intake", team: "sales", column: 0 }],
      connections: [],
      autoLinks: {},
      parkedSteps: [],
      activeLanes: ["sales"],
      customLanes: [],
      flowLinks: {},
      attachments: [],
      artifacts: [],
    },
  }),
  useAutomatiseringen: () => ({ data: [] }),
}));

vi.mock("@/lib/queryHooks/pipelines", () => ({
  useRenameCustomPipeline: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("@/components/process/ProcessCanvas", () => ({
  ProcessCanvas: ({ steps = [] }: { steps?: Array<{ id: string; label: string }> }) => (
    <div data-testid="shared-process-canvas">
      {steps.map((step) => (
        <span key={step.id}>{step.label}</span>
      ))}
    </div>
  ),
}));

describe("procesviewer Sentry context", () => {
  it("adds selected process context for production diagnostics", async () => {
    HTMLElement.prototype.scrollIntoView = vi.fn();

    render(
      <MemoryRouter>
        <Procesviewer />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("combobox"));
    fireEvent.click(await screen.findByRole("option", { name: "Sales" }));

    expect(await screen.findByTestId("shared-process-canvas")).toBeInTheDocument();

    await waitFor(() => {
      expect(sentryMocks.setContext).toHaveBeenCalledWith(
        "process_viewer",
        expect.objectContaining({
          selectedProcessId: "pipe-1",
          selectedProcessName: "Sales",
          steps: 1,
          connections: 0,
          activeLanes: 1,
          mode: "view",
        }),
      );
    });
  });
});
