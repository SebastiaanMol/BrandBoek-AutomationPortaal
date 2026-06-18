import type { Connection, ConnectionWaypoint, ProcessStep } from "@/data/processData";

const ROW_H = 88;

function maxRowInLane(team: string, steps: ProcessStep[]): number {
  const rows = steps.filter(step => step.team === team).map(step => step.row ?? 0);
  return rows.length ? Math.max(...rows) : 0;
}

function laneHeight(team: string, steps: ProcessStep[]): number {
  return (maxRowInLane(team, steps) + 1) * ROW_H;
}

function buildLaneRanges(
  steps: ProcessStep[],
  laneOrder: string[],
): Array<{ lane: string; start: number; end: number }> {
  let y = 0;
  return laneOrder.map((lane) => {
    const height = laneHeight(lane, steps);
    const range = { lane, start: y, end: y + height };
    y += height;
    return range;
  });
}

function laneDeltaForWaypointY(
  y: number,
  previousRanges: Array<{ lane: string; start: number; end: number }>,
  nextStarts: Map<string, number>,
): number {
  const previousRange = previousRanges.find(range => y >= range.start && y < range.end)
    ?? previousRanges.find(range => y === range.end)
    ?? null;
  if (!previousRange) return 0;
  return (nextStarts.get(previousRange.lane) ?? previousRange.start) - previousRange.start;
}

function translateWaypoint(
  waypoint: ConnectionWaypoint,
  previousRanges: Array<{ lane: string; start: number; end: number }>,
  nextStarts: Map<string, number>,
): ConnectionWaypoint {
  const deltaY = laneDeltaForWaypointY(waypoint.y, previousRanges, nextStarts);
  return { ...waypoint, y: waypoint.y + deltaY };
}

export function translateWaypointsForLaneOrderChange({
  connections,
  steps,
  previousLaneOrder,
  nextLaneOrder,
}: {
  connections: Connection[];
  steps: ProcessStep[];
  previousLaneOrder: string[];
  nextLaneOrder: string[];
}): Connection[] {
  const previousRanges = buildLaneRanges(steps, previousLaneOrder);
  const nextStarts = new Map(buildLaneRanges(steps, nextLaneOrder).map(range => [range.lane, range.start]));

  return connections.map((connection) => {
    if (!connection.manual || !connection.waypoints?.length) return connection;
    return {
      ...connection,
      waypoints: connection.waypoints.map(waypoint =>
        translateWaypoint(waypoint, previousRanges, nextStarts),
      ),
    };
  });
}

export function translateWaypointsForLaneVisibilityChange({
  connections,
  steps,
  previousLaneOrder,
  nextLaneOrder,
}: {
  connections: Connection[];
  steps: ProcessStep[];
  previousLaneOrder: string[];
  nextLaneOrder: string[];
}): Connection[] {
  return translateWaypointsForLaneOrderChange({
    connections,
    steps,
    previousLaneOrder,
    nextLaneOrder,
  });
}
