import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProcessCanvas } from "@/components/process/ProcessCanvas";
import type { ProcessStep } from "@/data/processData";

describe("ProcessCanvas task labels", () => {
  it("wraps long task labels inside the fixed step box without resizing the box", () => {
    const steps: ProcessStep[] = [
      {
        id: "long-task",
        type: "task",
        label: "Open nieuwe bedrijfsinformatie na omzetting",
        team: "sales",
        column: 0,
      },
    ];

    const { container } = render(
      <ProcessCanvas
        steps={steps}
        connections={[]}
        automations={[]}
        activeLanes={["sales"]}
        readOnly
      />,
    );

    const step = container.querySelector('[data-step-id="long-task"]');
    expect(step).toBeTruthy();

    const box = step!.querySelector("rect");
    expect(box).toHaveAttribute("width", "122");
    expect(box).toHaveAttribute("height", "42");

    const lines = Array.from(step!.querySelectorAll("text tspan")).map((line) => line.textContent);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join(" ")).toContain("bedrijfsinformatie");
    expect(lines.join(" ")).not.toBe("Open nieuwe bedri...");
  });
});
