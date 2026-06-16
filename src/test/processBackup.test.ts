import { describe, expect, it } from "vitest";
import { importProcessBackup } from "@/lib/processBackup";

function jsonFile(name: string, value: unknown): File {
  const text = JSON.stringify(value);
  return {
    name,
    size: text.length,
    text: async () => text,
  } as File;
}

describe("processBackup", () => {
  it("imports artifacts from JSON backups", async () => {
    const saved = await importProcessBackup(jsonFile("backup.json", {
      version: 1,
      pipelineName: "Sales",
      exportedAt: "2026-06-16T00:00:00.000Z",
      state: {
        steps: [{ id: "s1", label: "Intake", team: "sales", column: 0 }],
        connections: [],
        autoLinks: {},
        parkedSteps: [],
        activeLanes: ["sales"],
        customLanes: [],
        flowLinks: {},
        attachments: [],
        artifacts: [
          {
            id: "artifact-1",
            type: "manualExceptionBlock",
            title: "Betalingsregeling",
            description: "Mogelijk vanuit elke pipeline stage",
            position: { x: 320, y: 240 },
            size: { width: 250, height: 112 },
            association: { anchor: "process", label: "Mogelijk vanuit elke pipeline stage" },
          },
        ],
      },
    }));

    expect(saved.artifacts).toEqual([
      expect.objectContaining({
        id: "artifact-1",
        type: "manualExceptionBlock",
        title: "Betalingsregeling",
        position: { x: 320, y: 240 },
      }),
    ]);
  });

  it("keeps old backups without artifacts valid", async () => {
    const saved = await importProcessBackup(jsonFile("old-backup.json", {
      version: 1,
      pipelineName: "Sales",
      exportedAt: "2026-06-16T00:00:00.000Z",
      state: {
        steps: [],
        connections: [],
        autoLinks: {},
        parkedSteps: [],
      },
    }));

    expect(saved.artifacts).toEqual([]);
  });
});
