import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProcessCanvas } from "@/components/process/ProcessCanvas";
import type { ProcessStep } from "@/data/processData";

describe("ProcessCanvas active lanes", () => {
  it("treats an empty activeLanes array as all lanes instead of rendering a blank canvas", () => {
    const steps: ProcessStep[] = [
      { id: "btw-open", type: "task", label: "BTW Q Open", team: "sales", column: 0, row: 0 },
      { id: "btw-ready", type: "task", label: "Gegevens gereed", team: "boekhouding", column: 1, row: 0 },
    ];

    render(
      <ProcessCanvas
        steps={steps}
        connections={[]}
        automations={[]}
        activeLanes={[]}
      />,
    );

    expect(screen.getByText("BTW Q Open")).toBeInTheDocument();
    expect(screen.getByText("Gegevens gereed")).toBeInTheDocument();
  });

  it("falls back to all lanes when saved activeLanes only contains stale lane keys", () => {
    const steps: ProcessStep[] = [
      { id: "btw-open", type: "task", label: "BTW Q Open", team: "sales", column: 0, row: 0 },
    ];

    render(
      <ProcessCanvas
        steps={steps}
        connections={[]}
        automations={[]}
        activeLanes={["deleted-lane"]}
      />,
    );

    expect(screen.getByText("BTW Q Open")).toBeInTheDocument();
  });
});
