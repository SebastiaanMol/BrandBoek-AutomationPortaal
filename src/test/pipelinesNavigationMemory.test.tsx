import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import Pipelines from "@/pages/Pipelines";
import type { Pipeline } from "@/lib/types";

const pipelines: Pipeline[] = [
  makePipeline({ pipelineId: "sales", naam: "Sales pipeline", source: "hubspot" }),
  makePipeline({ pipelineId: "onboarding", naam: "Intern onboarding", source: "custom" }),
];

vi.mock("@/lib/queryHooks/pipelines", () => ({
  usePipelines: () => ({ data: pipelines, isLoading: false }),
  useHubSpotPipelinesSync: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreateCustomPipeline: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

describe("Pipelines navigation memory", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("restores pipeline filter and search from navigation memory", () => {
    sessionStorage.setItem("automationNavigator.navigation.pipelines", JSON.stringify({
      pathname: "/pipelines",
      search: "",
      hash: "",
      scrollY: 0,
      updatedAt: Date.now(),
      data: { filter: "custom", search: "onboarding" },
    }));

    renderPipelines();

    expect(screen.getByLabelText("Zoek pipeline")).toHaveValue("onboarding");
    screen.getByRole("button", { name: "Open Intern onboarding" });
    expect(screen.queryByRole("button", { name: "Open Sales pipeline" })).not.toBeInTheDocument();
  });

  it("remembers pipeline list context before opening a pipeline", () => {
    Object.defineProperty(window, "scrollY", { value: 444, configurable: true });
    renderPipelines();

    fireEvent.change(screen.getByLabelText("Zoek pipeline"), { target: { value: "Sales" } });
    fireEvent.click(screen.getByRole("button", { name: "Open Sales pipeline" }));

    const stored = JSON.parse(sessionStorage.getItem("automationNavigator.navigation.pipelines") ?? "{}");

    expect(stored.pathname).toBe("/");
    expect(stored.scrollY).toBe(444);
    expect(stored.data).toMatchObject({ filter: "all", search: "Sales" });
  });
});

function renderPipelines(): void {
  render(
    <MemoryRouter>
      <Pipelines />
    </MemoryRouter>,
  );
}

function makePipeline(overrides: Partial<Pipeline>): Pipeline {
  return {
    pipelineId: "pipeline",
    naam: "Pipeline",
    stages: [],
    syncedAt: "2026-05-01T08:00:00.000Z",
    updatedAt: "2026-05-02T09:00:00.000Z",
    beschrijving: null,
    isActive: true,
    source: "hubspot",
    ...overrides,
  };
}
