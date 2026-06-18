import { describe, expect, it } from "vitest";
import {
  translateWaypointsForLaneOrderChange,
  translateWaypointsForLaneVisibilityChange,
} from "@/lib/processLaneWaypoints";
import type { Connection, ProcessStep } from "@/data/processData";

const steps: ProcessStep[] = [
  { id: "campaign", label: "Campagne", team: "marketing", column: 0 },
  { id: "open", label: "Open", team: "sales", column: 0 },
  { id: "qualified", label: "Qualified", team: "sales", column: 1 },
];

describe("process lane waypoint transforms", () => {
  it("moves manual route waypoints with their lane when lanes are reordered", () => {
    const connections: Connection[] = [
      {
        id: "sales-route",
        fromStepId: "open",
        toStepId: "qualified",
        manual: true,
        waypoints: [
          { x: 260, y: 132 },
          { x: 320, y: 132 },
          { x: 380, y: 132 },
        ],
      },
    ];

    expect(translateWaypointsForLaneOrderChange({
      connections,
      steps,
      previousLaneOrder: ["marketing", "sales"],
      nextLaneOrder: ["sales", "marketing"],
    })[0].waypoints).toEqual([
      { x: 260, y: 44 },
      { x: 320, y: 44 },
      { x: 380, y: 44 },
    ]);
  });

  it("moves manual route waypoints when a visible lane above them is hidden", () => {
    const connections: Connection[] = [
      {
        id: "sales-route",
        fromStepId: "open",
        toStepId: "qualified",
        manual: true,
        waypoints: [
          { x: 260, y: 132 },
          { x: 320, y: 132 },
          { x: 380, y: 132 },
        ],
      },
    ];

    expect(translateWaypointsForLaneVisibilityChange({
      connections,
      steps,
      previousLaneOrder: ["marketing", "sales"],
      nextLaneOrder: ["sales"],
    })[0].waypoints).toEqual([
      { x: 260, y: 44 },
      { x: 320, y: 44 },
      { x: 380, y: 44 },
    ]);
  });
});
