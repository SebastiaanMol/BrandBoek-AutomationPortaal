import JSZip from "jszip";
import { describe, expect, it, vi } from "vitest";
import { exportProcessViewsZip } from "@/lib/processExport";
import type { SavedProcessStateWithUpdatedAt } from "@/lib/storage/processState";

function state(): SavedProcessStateWithUpdatedAt {
  return {
    steps: [{ id: "stage-1", label: "Open", type: "task", team: "sales", column: 0 }],
    connections: [],
    autoLinks: {},
    parkedSteps: [],
    activeLanes: ["sales"],
    customLanes: [],
    flowLinks: {},
    attachments: [],
    artifacts: [],
    updatedAt: "2026-06-24T09:00:00.000Z",
  };
}

describe("exportProcessViewsZip", () => {
  it("packages selected process views as JSON backups inside one zip", async () => {
    const click = vi.fn();
    const appendChild = vi.spyOn(document.body, "appendChild");
    const removeChild = vi.spyOn(document.body, "removeChild");
    const createObjectURL = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:process-zip");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    vi.spyOn(document, "createElement").mockImplementation((tagName) => {
      const element = document.createElementNS("http://www.w3.org/1999/xhtml", tagName);
      if (tagName === "a") {
        Object.defineProperty(element, "click", { value: click });
      }
      return element as HTMLElement;
    });

    const blob = await exportProcessViewsZip({
      items: [
        {
          pipelineId: "pipe-sales",
          pipelineName: "Sales Pipeline",
          state: state(),
        },
      ],
      formats: { json: true, png: false, pdf: false },
      date: new Date("2026-06-24T12:00:00.000Z"),
    });

    const zip = await JSZip.loadAsync(blob);
    const backupText = await zip.file("sales-pipeline/proces-backup.json")?.async("string");

    expect(backupText).toContain('"pipelineName": "Sales Pipeline"');
    expect(backupText).toContain('"steps"');
    expect(createObjectURL).toHaveBeenCalledWith(blob);
    expect(appendChild).toHaveBeenCalled();
    expect(click).toHaveBeenCalled();
    expect(removeChild).toHaveBeenCalled();
  });
});
