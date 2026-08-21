import { useRef, useMemo, useState, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import type {
  ProcessStep,
  Connection,
  Automation,
  CustomLane,
  ConnectionRouteType,
  ConnectionSide,
  ConnectionWaypoint,
  ProcessArtifact,
  ProcessAttachment,
  ProcessAttachmentTarget,
  ProcessAttachmentType,
  ProcessPlacementLink,
  ProcessAction,
  ProcessActionType,
} from "@/data/processData";
import type { Flow } from "@/lib/types";
import {
  getLaneConfig,
  isPipelineStep,
  resolveActiveLanes,
  TEAM_ORDER,
} from "@/data/processData";
import { isConnectionPlacement, normalizePlacementLink } from "@/lib/processFlowLinks";


// ── Layout constants ──────────────────────────────────────────────────────────

const ROW_H        = 88;    // height of one row within a swimlane  (110 × 0.80)
const LANE_HDR_W   = 106;   // (132 × 0.80)
const STEP_W       = 122;   // (152 × 0.80)
const STEP_H       = 42;    // (52 × 0.80)
const STEP_LABEL_MAX_LINES = 3;
const STEP_LABEL_LINE_H = 9;
const DECISION_H   = 29;    // half-diagonal of decision diamond
const BASE_COL_W   = 198;   // (248 × 0.80)
const EVT_COL_W    = BASE_COL_W; // same width as task cols — prevents narrow snap zone causing drift to wrong column
const DOT_R        = 11;    // (14 × 0.80)
const DOT_SPACING  = 29;    // (36 × 0.80)
const STEP_DOT_R   = 13;
const STEP_DOT_SPACING = 28;
const STEP_DOT_VISIBLE_MAX = 3;
const EDGE_PAD     = 19;    // (24 × 0.80)
const ARROW_MARGIN = 13;    // (16 × 0.80)
const EVT_R        = 18;    // (22 × 0.80)
const ROUTE_MAIN   = "#1d4ed8";
const ROUTE_HOVER  = "#2563eb";
const ROUTE_OPTIONAL = "#ea580c";
const ROUTE_END    = "#dc2626";
const ROUTE_VIEWER_SELECTED = "#0891b2";
const ROUTE_VIEWER_HALO = "#67e8f9";
const PHASE_BAR_BG = "#0759d6";
const PLACEMENT_DOT_R = 13;
const ROUTE_DROP_TOLERANCE = 7;
const AUTOMATION_DOT_FILL = "#fed7aa";
const AUTOMATION_DOT_STROKE = "#fb923c";
const AUTOMATION_DOT_ICON = "#9a3412";
const FLOW_DOT_FILL = "#2563eb";
const FLOW_DOT_STROKE = "#1d4ed8";
const FLOW_DOT_ICON = "#ffffff";
const PLACEMENT_ALERT_FILL = "#fecaca";
const PLACEMENT_ALERT_STROKE = "#dc2626";
const PLACEMENT_ALERT_ICON = "#7f1d1d";
const PROCESS_ACTION_DOT_FILL = "#e5e7eb";
const PROCESS_ACTION_DOT_STROKE = "#94a3b8";
const PROCESS_ACTION_DOT_ICON = "#334155";
const GRID_SIZE    = 28;
const CANVAS_LEGEND_H = 44;
const PIPELINE_HUB_W = 332;
const PIPELINE_HUB_H = 82;
const PIPELINE_HUB_GAP = 14;
const PIPELINE_HUB_TOP_PAD = 14;
const PIPELINE_HUB_BOTTOM_PAD = 16;
const PORT_DROP_RADIUS = GRID_SIZE / 2;
const MICRO_BEND_TOLERANCE = GRID_SIZE / 2;
const ATTACHMENT_W = 86;
const ATTACHMENT_H = 44;
const MANUAL_EXCEPTION_DEFAULT_W = 250;
const MANUAL_EXCEPTION_DEFAULT_H = 112;
const MANUAL_EXCEPTION_HEADER_TOP = 14;
const MANUAL_EXCEPTION_TITLE_TOP = 38;
const MANUAL_EXCEPTION_DESCRIPTION_GAP = 6;
const MANUAL_EXCEPTION_STEP_GAP_FROM_DESCRIPTION = 12;
const MANUAL_EXCEPTION_STEP_GAP = 10;
const MANUAL_EXCEPTION_STEP_BOTTOM = 14;
const MANUAL_EXCEPTION_TEXT_PAD_X = 14;
const MANUAL_EXCEPTION_TITLE_LINE_H = 15;
const MANUAL_EXCEPTION_DESCRIPTION_LINE_H = 14;
const MANUAL_EXCEPTION_STEP_LINE_H = 12;
const MANUAL_EXCEPTION_STEP_PAD_Y = 9;
const STEP_ATTACHMENT_DEFAULT_OFFSET = { x: 72, y: 24 };
const CONNECTION_ATTACHMENT_DEFAULT_OFFSET = { x: 16, y: 34 };
const ADD_ATTACHMENT_CONTROLS: { type: ProcessAttachmentType; label: string }[] = [
  { type: "annotation", label: "Notitie toevoegen" },
  { type: "dataObject", label: "Data/document toevoegen" },
  { type: "dataStore", label: "Databron toevoegen" },
];

// Viewer-mode lane accent colours (spec)
const VIEWER_LANE_COLORS: Record<string, string> = {
  marketing:    "#6366F1",
  sales:        "#2563EB",
  onboarding:   "#059669",
  klantrelaties:"#DB2877",
};

// ── Helper types ──────────────────────────────────────────────────────────────

interface Pt { x: number; y: number }
interface ArrowData { path: string; points: Pt[]; preDotPath: string; postDotPath: string; postDotMid: Pt; postDotMidVertical: boolean; dotCenter: Pt; isVertical: boolean; length: number }
interface BendInsertionTarget { point: Pt; insertIndex: number }

function isEvent(step: ProcessStep) {
  return step.type === "start" || step.type === "end"
    || step.type === "timer" || step.type === "terminate" || step.type === "send" || step.type === "receive";
}

function isEventType(type?: ProcessStep["type"] | "") {
  return type === "start" || type === "end"
    || type === "timer" || type === "terminate" || type === "send" || type === "receive";
}

function isDecision(step: ProcessStep) {
  return step.type === "decision" || step.type === "and";
}

function stepRow(step: ProcessStep) {
  return step.row ?? 0;
}

function clampContextMenuScale(scale: number): number {
  return Math.min(1, Math.max(0.85, scale));
}

// ── Lane / row layout helpers ─────────────────────────────────────────────────

// Max row across tasks only — used for column layout and task clamping
function maxRowInLane(team: string, steps: ProcessStep[]): number {
  const rows = steps.filter(s => s.team === team && !isEvent(s)).map(s => stepRow(s));
  return rows.length ? Math.max(...rows) : 0;
}

// Max row across ALL steps including events — used for lane height
function maxRowInLaneFull(team: string, steps: ProcessStep[]): number {
  const rows = steps.filter(s => s.team === team).map(s => stepRow(s));
  return rows.length ? Math.max(...rows) : 0;
}

function laneHeightFn(team: string, steps: ProcessStep[]): number {
  return (maxRowInLaneFull(team, steps) + 1) * ROW_H;
}

function buildLaneStarts(steps: ProcessStep[], teams: string[] = TEAM_ORDER): Record<string, number> {
  const map: Record<string, number> = {};
  let y = 0;
  for (const team of teams) {
    map[team] = y;
    y += laneHeightFn(team, steps);
  }
  return map;
}

function stepCY(step: ProcessStep, laneStarts: Record<string, number>): number {
  return (laneStarts[step.team] ?? 0) + stepRow(step) * ROW_H + ROW_H / 2;
}

// ── Column layout ─────────────────────────────────────────────────────────────

function computeColX(
  steps: ProcessStep[],
  connections: Connection[],
  automations: Automation[],
): number[] {
  if (!steps.length) return [];
  const maxCol = Math.max(...steps.map(s => s.column));

  const eventOnlyCols = new Set<number>();
  for (let c = 0; c <= maxCol; c++) {
    const inCol = steps.filter(s => s.column === c);
    if (inCol.length > 0 && inCol.every(s => isEvent(s))) eventOnlyCols.add(c);
  }

  const gapW: number[] = Array.from({ length: maxCol }, (_, i) =>
    eventOnlyCols.has(i) ? EVT_COL_W : BASE_COL_W,
  );

  for (const conn of connections) {
    const from = steps.find(s => s.id === conn.fromStepId);
    const to   = steps.find(s => s.id === conn.toStepId);
    if (!from || !to || to.column - from.column !== 1) continue;
    const dots = automations.filter(
      a => a.fromStepId === conn.fromStepId && a.toStepId === conn.toStepId,
    ).length;
    if (!dots) continue;
    const required = STEP_W + (dots - 1) * DOT_SPACING + DOT_R * 2 + ARROW_MARGIN * 2;
    gapW[from.column] = Math.max(gapW[from.column], required);
  }

  const col0HasTask = steps.some(s => s.column === 0 && !isEvent(s));
  const colX: number[] = new Array(maxCol + 1);
  colX[0] = LANE_HDR_W + (col0HasTask ? STEP_W / 2 : EVT_R) + EDGE_PAD;
  for (let c = 1; c <= maxCol; c++) colX[c] = colX[c - 1] + gapW[c - 1];
  return colX;
}

// ── Arrow builder ─────────────────────────────────────────────────────────────

function edgeRight(s: ProcessStep, cx: number) { return cx + (isEvent(s) ? EVT_R : isDecision(s) ? DECISION_H : STEP_W / 2); }
function edgeLeft (s: ProcessStep, cx: number) { return cx - (isEvent(s) ? EVT_R : isDecision(s) ? DECISION_H : STEP_W / 2); }
function edgeDown (s: ProcessStep, cy: number) { return cy + (isEvent(s) ? EVT_R : isDecision(s) ? DECISION_H : STEP_H / 2); }
function edgeUp   (s: ProcessStep, cy: number) { return cy - (isEvent(s) ? EVT_R : isDecision(s) ? DECISION_H : STEP_H / 2); }

const CONNECTION_SIDES: ConnectionSide[] = ["top", "right", "bottom", "left"];

function sideLabel(side: ConnectionSide): string {
  if (side === "top") return "boven";
  if (side === "bottom") return "onder";
  if (side === "left") return "links";
  return "";
}

function portAriaLabel(label: string, side: ConnectionSide): string {
  const suffix = sideLabel(side);
  return suffix ? `Verbindingspoort ${label} ${suffix}` : `Verbindingspoort ${label}`;
}

function wrapStepLabel(label: string): { lines: string[]; fontSize: number } {
  const normalized = label.replace(/\s+/g, " ").trim();
  if (!normalized) return { lines: [""], fontSize: 9 };
  if (normalized.length <= 18) return { lines: [normalized], fontSize: 9 };

  const charsPerLine = normalized.length > 54 ? 24 : 21;
  const lines: string[] = [];
  const words = normalized.split(" ");
  let current = "";

  for (const word of words) {
    if (word.length > charsPerLine) {
      if (current) {
        lines.push(current);
        current = "";
      }
      let rest = word;
      while (rest.length > charsPerLine && lines.length < STEP_LABEL_MAX_LINES) {
        lines.push(rest.slice(0, charsPerLine));
        rest = rest.slice(charsPerLine);
      }
      current = rest;
      continue;
    }

    const next = current ? `${current} ${word}` : word;
    if (next.length <= charsPerLine) {
      current = next;
    } else {
      lines.push(current);
      current = word;
    }

    if (lines.length >= STEP_LABEL_MAX_LINES) break;
  }

  if (current && lines.length < STEP_LABEL_MAX_LINES) {
    lines.push(current);
  }

  const fullText = lines.join(" ");
  if (fullText.length < normalized.length && lines.length > 0) {
    const lastIndex = lines.length - 1;
    lines[lastIndex] = ellipsize(lines[lastIndex], charsPerLine);
  }

  return {
    lines: lines.length ? lines : [ellipsize(normalized, charsPerLine)],
    fontSize: normalized.length > 54 ? 7.5 : 8,
  };
}

function ellipsize(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(1, maxLength - 3)).trimEnd()}...`;
}

function connectionPoint(
  step: ProcessStep,
  side: ConnectionSide,
  colX: number[],
  laneStarts: Record<string, number>,
): Pt {
  const cx = colX[step.column];
  const cy = stepCY(step, laneStarts);
  if (side === "top") return { x: cx, y: edgeUp(step, cy) };
  if (side === "bottom") return { x: cx, y: edgeDown(step, cy) };
  if (side === "left") return { x: edgeLeft(step, cx), y: cy };
  return { x: edgeRight(step, cx), y: cy };
}

function defaultConnectionSide(step: ProcessStep, other: ProcessStep, role: "from" | "to"): ConnectionSide {
  if (step.column < other.column) return "right";
  if (step.column > other.column) return "left";
  const stepY = stepRow(step);
  const otherY = stepRow(other);
  if (stepY < otherY) return "bottom";
  if (stepY > otherY) return "top";
  return role === "from" ? "right" : "left";
}

function nearestConnectionSide(
  step: ProcessStep,
  point: Pt,
  colX: number[],
  laneStarts: Record<string, number>,
): ConnectionSide {
  let best: ConnectionSide = "right";
  let bestDistance = Infinity;
  for (const side of CONNECTION_SIDES) {
    const port = connectionPoint(step, side, colX, laneStarts);
    const distance = Math.hypot(point.x - port.x, point.y - port.y);
    if (distance < bestDistance) {
      best = side;
      bestDistance = distance;
    }
  }
  return best;
}

function connectionSideForDrop(
  source: ProcessStep,
  target: ProcessStep,
  point: Pt,
  colX: number[],
  laneStarts: Record<string, number>,
): ConnectionSide {
  const nearestSide = nearestConnectionSide(target, point, colX, laneStarts);
  const nearestPort = connectionPoint(target, nearestSide, colX, laneStarts);
  const isExplicitSideDrop = Math.hypot(point.x - nearestPort.x, point.y - nearestPort.y) <= GRID_SIZE / 2;
  return isExplicitSideDrop ? nearestSide : defaultConnectionSide(target, source, "to");
}

function pointInsideStepBody(
  step: ProcessStep,
  point: Pt,
  colX: number[],
  laneStarts: Record<string, number>,
): boolean {
  const scx = colX[step.column] ?? 0;
  const scy = stepCY(step, laneStarts);
  if (isEvent(step)) return Math.hypot(point.x - scx, point.y - scy) <= EVT_R * 1.5;
  return Math.abs(point.x - scx) <= STEP_W / 2 && Math.abs(point.y - scy) <= STEP_H / 2;
}

function findPortDropTarget(
  steps: ProcessStep[],
  point: Pt,
  colX: number[],
  laneStarts: Record<string, number>,
  excludeStepId?: string,
): { step: ProcessStep; side: ConnectionSide } | null {
  let best: { step: ProcessStep; side: ConnectionSide; distance: number } | null = null;

  for (const step of steps) {
    if (step.id === excludeStepId || colX[step.column] === undefined) continue;
    for (const side of CONNECTION_SIDES) {
      const port = connectionPoint(step, side, colX, laneStarts);
      const distance = Math.hypot(point.x - port.x, point.y - port.y);
      if (distance <= PORT_DROP_RADIUS && (!best || distance < best.distance)) {
        best = { step, side, distance };
      }
    }
  }

  return best ? { step: best.step, side: best.side } : null;
}

function findStepBodyDropTarget(
  steps: ProcessStep[],
  point: Pt,
  colX: number[],
  laneStarts: Record<string, number>,
  excludeStepId?: string,
): ProcessStep | undefined {
  return steps.find(step =>
    step.id !== excludeStepId && pointInsideStepBody(step, point, colX, laneStarts),
  );
}

function snapValueToRoutingGrid(value: number): number {
  const unit = GRID_SIZE / 2;
  return Math.round(value / unit) * unit;
}

function snapPointToRoutingGrid(point: Pt): Pt {
  return {
    x: snapValueToRoutingGrid(point.x),
    y: snapValueToRoutingGrid(point.y),
  };
}

function buildArrow(
  from: ProcessStep,
  to: ProcessStep,
  colX: number[],
  laneStarts: Record<string, number>,
  midXOffset = 0,
  fromSide?: ConnectionSide,
  toSide?: ConnectionSide,
): ArrowData {
  const sourceSide = fromSide ?? defaultConnectionSide(from, to, "from");
  const targetSide = toSide ?? defaultConnectionSide(to, from, "to");
  const start = connectionPoint(from, sourceSide, colX, laneStarts);
  const end = connectionPoint(to, targetSide, colX, laneStarts);

  if (Math.abs(start.x - end.x) < 4 || Math.abs(start.y - end.y) < 4) {
    return arrowDataFromPoints([start, end]);
  }

  if (firstRoutingAxis(sourceSide, targetSide, from, to) === "y") {
    const midY = (start.y + end.y) / 2;
    return arrowDataFromPoints([
      start,
      { x: start.x, y: midY },
      { x: end.x, y: midY },
      end,
    ]);
  }

  const midX = (start.x + end.x) / 2 + midXOffset;
  return arrowDataFromPoints([
    start,
    { x: midX, y: start.y },
    { x: midX, y: end.y },
    end,
  ]);
}
function cleanWaypoints(points?: ConnectionWaypoint[]): ConnectionWaypoint[] {
  return points?.filter(point => Number.isFinite(point.x) && Number.isFinite(point.y)) ?? [];
}

function pushPoint(points: Pt[], point: Pt) {
  const previous = points[points.length - 1];
  if (!previous || previous.x !== point.x || previous.y !== point.y) points.push(point);
}

function buildOrthogonalPoints(
  start: Pt,
  end: Pt,
  waypoints: ConnectionWaypoint[],
  firstAxis: "x" | "y",
  lastAxis: "x" | "y" = firstAxis,
): Pt[] {
  const points: Pt[] = [start];
  let current = start;

  for (const waypoint of waypoints) {
    if (firstAxis === "x") {
      pushPoint(points, { x: waypoint.x, y: current.y });
      pushPoint(points, { x: waypoint.x, y: waypoint.y });
    } else {
      pushPoint(points, { x: current.x, y: waypoint.y });
      pushPoint(points, { x: waypoint.x, y: waypoint.y });
    }
    current = points[points.length - 1];
  }

  current = points[points.length - 1];
  if (lastAxis === "x") {
    pushPoint(points, { x: current.x, y: end.y });
    pushPoint(points, end);
  } else {
    pushPoint(points, { x: end.x, y: current.y });
    pushPoint(points, end);
  }

  return points;
}

function snapWaypointToRouteAxis(
  waypoint: ConnectionWaypoint,
  start: Pt,
  end: Pt,
): ConnectionWaypoint {
  return {
    x: Math.abs(waypoint.x - start.x) <= MICRO_BEND_TOLERANCE
      ? start.x
      : Math.abs(waypoint.x - end.x) <= MICRO_BEND_TOLERANCE
        ? end.x
        : waypoint.x,
    y: Math.abs(waypoint.y - start.y) <= MICRO_BEND_TOLERANCE
      ? start.y
      : Math.abs(waypoint.y - end.y) <= MICRO_BEND_TOLERANCE
        ? end.y
        : waypoint.y,
  };
}

function shouldStraightenVerticalRoute(
  waypoints: ConnectionWaypoint[],
  sourceSide: ConnectionSide,
  targetSide: ConnectionSide,
  start: Pt,
  end: Pt,
): boolean {
  return (sourceSide === "top" || sourceSide === "bottom")
    && (targetSide === "top" || targetSide === "bottom")
    && Math.abs(start.x - end.x) <= MICRO_BEND_TOLERANCE
    && waypoints.every(waypoint => Math.abs(waypoint.x - start.x) <= MICRO_BEND_TOLERANCE);
}

function normalizeWaypointsForRoute(
  waypoints: ConnectionWaypoint[],
  sourceSide: ConnectionSide,
  targetSide: ConnectionSide,
  start: Pt,
  end: Pt,
): ConnectionWaypoint[] {
  if (shouldStraightenVerticalRoute(waypoints, sourceSide, targetSide, start, end)) {
    return waypoints.map((waypoint) => ({ ...waypoint, x: start.x }));
  }
  return waypoints.map(waypoint => snapWaypointToRouteAxis(waypoint, start, end));
}

function buildPathFromPoints(points: Pt[]): string {
  return points.reduce((path, point, index) => {
    if (index === 0) return `M ${point.x} ${point.y}`;
    const previous = points[index - 1];
    if (point.y === previous.y) return `${path} H ${point.x}`;
    if (point.x === previous.x) return `${path} V ${point.y}`;
    return `${path} L ${point.x} ${point.y}`;
  }, "");
}

function midpointOnPoints(points: Pt[]): Pt {
  if (points.length === 0) return { x: 0, y: 0 };
  if (points.length === 1) return points[0];

  const segments = points.slice(1).map((point, index) => ({
    from: points[index],
    to: point,
    length: Math.abs(point.x - points[index].x) + Math.abs(point.y - points[index].y),
  }));
  const total = segments.reduce((sum, segment) => sum + segment.length, 0);
  if (total <= 0) return points[Math.floor(points.length / 2)];

  let cursor = 0;
  const halfway = total / 2;
  for (const segment of segments) {
    if (cursor + segment.length >= halfway) {
      const remaining = halfway - cursor;
      const directionX = Math.sign(segment.to.x - segment.from.x);
      const directionY = Math.sign(segment.to.y - segment.from.y);
      return {
        x: segment.from.x + directionX * remaining,
        y: segment.from.y + directionY * remaining,
      };
    }
    cursor += segment.length;
  }

  return points[points.length - 1];
}

function routeLength(points: Pt[]): number {
  return points.slice(1).reduce((sum, point, index) => {
    const previous = points[index];
    return sum + Math.abs(point.x - previous.x) + Math.abs(point.y - previous.y);
  }, 0);
}

function distanceToRoute(points: Pt[], point: Pt): number {
  if (points.length === 0) return Number.POSITIVE_INFINITY;
  if (points.length === 1) return Math.hypot(point.x - points[0].x, point.y - points[0].y);

  return points.slice(1).reduce((best, segmentEnd, index) => {
    const segmentStart = points[index];
    const dx = segmentEnd.x - segmentStart.x;
    const dy = segmentEnd.y - segmentStart.y;
    const lengthSq = dx * dx + dy * dy;
    if (lengthSq <= 0) return best;

    const t = Math.max(0, Math.min(1, ((point.x - segmentStart.x) * dx + (point.y - segmentStart.y) * dy) / lengthSq));
    const projected = {
      x: segmentStart.x + t * dx,
      y: segmentStart.y + t * dy,
    };
    return Math.min(best, Math.hypot(point.x - projected.x, point.y - projected.y));
  }, Number.POSITIVE_INFINITY);
}

function routeDistanceAtPoint(points: Pt[], point: Pt): number {
  if (points.length === 0) return Number.POSITIVE_INFINITY;
  if (points.length === 1) return 0;

  let cursor = 0;
  let best = { distanceToSegment: Number.POSITIVE_INFINITY, routeDistance: 0 };
  for (let index = 1; index < points.length; index++) {
    const segmentStart = points[index - 1];
    const segmentEnd = points[index];
    const dx = segmentEnd.x - segmentStart.x;
    const dy = segmentEnd.y - segmentStart.y;
    const length = Math.abs(dx) + Math.abs(dy);
    const lengthSq = dx * dx + dy * dy;
    if (lengthSq <= 0) continue;

    const t = Math.max(0, Math.min(1, ((point.x - segmentStart.x) * dx + (point.y - segmentStart.y) * dy) / lengthSq));
    const projected = {
      x: segmentStart.x + t * dx,
      y: segmentStart.y + t * dy,
    };
    const distanceToSegment = Math.hypot(point.x - projected.x, point.y - projected.y);
    if (distanceToSegment < best.distanceToSegment) {
      best = {
        distanceToSegment,
        routeDistance: cursor + length * t,
      };
    }
    cursor += length;
  }
  return best.routeDistance;
}

function insertionOrderFromRouteDrop(points: Pt[], point: Pt, existingCount: number): number {
  if (existingCount <= 0) return 0;
  const total = routeLength(points);
  if (total <= 0) return existingCount;
  const distance = routeDistanceAtPoint(points, point);
  if (!Number.isFinite(distance)) return existingCount;
  return Math.max(0, Math.min(existingCount, Math.round((distance / total) * existingCount)));
}

function routePositionFromDrop(points: Pt[], point: Pt): number {
  const total = routeLength(points);
  if (total <= 0) return 0.5;
  const distance = routeDistanceAtPoint(points, point);
  if (!Number.isFinite(distance)) return 0.5;
  return Math.max(0, Math.min(1, distance / total));
}

function pointForConnectionPlacement(arrow: ArrowData, placement: CanvasPlacement | undefined): Pt | null {
  if (placement?.kind !== "connection" || typeof placement.position !== "number") return null;
  return pointAtRouteDistance(arrow.points, arrow.length * Math.max(0, Math.min(1, placement.position)));
}

function pointAtRouteDistance(points: Pt[], distance: number): Pt {
  if (points.length === 0) return { x: 0, y: 0 };
  if (points.length === 1) return points[0];

  const total = routeLength(points);
  const target = Math.max(0, Math.min(distance, total));
  let cursor = 0;

  for (let index = 1; index < points.length; index++) {
    const from = points[index - 1];
    const to = points[index];
    const length = Math.abs(to.x - from.x) + Math.abs(to.y - from.y);
    if (length <= 0) continue;

    if (cursor + length >= target) {
      const remaining = target - cursor;
      return {
        x: from.x + Math.sign(to.x - from.x) * remaining,
        y: from.y + Math.sign(to.y - from.y) * remaining,
      };
    }
    cursor += length;
  }

  return points[points.length - 1];
}

function sliceRoutePoints(points: Pt[], startDistance: number, endDistance: number): Pt[] {
  if (points.length <= 1) return points;
  const total = routeLength(points);
  const start = Math.max(0, Math.min(startDistance, total));
  const end = Math.max(start, Math.min(endDistance, total));
  const result: Pt[] = [pointAtRouteDistance(points, start)];
  let cursor = 0;

  for (let index = 1; index < points.length; index++) {
    const to = points[index];
    const from = points[index - 1];
    const length = Math.abs(to.x - from.x) + Math.abs(to.y - from.y);
    const segmentEnd = cursor + length;
    if (length > 0 && segmentEnd > start && segmentEnd < end) {
      pushPoint(result, to);
    }
    cursor = segmentEnd;
  }

  pushPoint(result, pointAtRouteDistance(points, end));
  return result;
}

function arrowDataFromPoints(points: Pt[]): ArrowData {
  const path = buildPathFromPoints(points);
  const mid = midpointOnPoints(points);
  const total = routeLength(points);
  const preDotPath = total > DOT_R * 2
    ? buildPathFromPoints(sliceRoutePoints(points, 0, total / 2 - DOT_R))
    : path;
  const postDotPoints = total > DOT_R * 2
    ? sliceRoutePoints(points, total / 2 + DOT_R, total)
    : points;
  const postDotPath = buildPathFromPoints(postDotPoints);
  return {
    path,
    points,
    preDotPath,
    postDotPath,
    postDotMid: midpointOnPoints(postDotPoints),
    postDotMidVertical: false,
    dotCenter: mid,
    isVertical: points.every(point => point.x === points[0]?.x),
    length: total,
  };
}

function firstRoutingAxis(sourceSide: ConnectionSide, targetSide: ConnectionSide, from: ProcessStep, to: ProcessStep): "x" | "y" {
  if (sourceSide === "top" || sourceSide === "bottom") return "y";
  if (sourceSide === "left" || sourceSide === "right") return "x";
  if (targetSide === "top" || targetSide === "bottom") return "x";
  if (targetSide === "left" || targetSide === "right") return "y";
  return from.column === to.column ? "y" : "x";
}

function targetRoutingAxis(targetSide: ConnectionSide): "x" | "y" {
  return targetSide === "left" || targetSide === "right" ? "x" : "y";
}

function buildWaypointArrow(
  from: ProcessStep,
  to: ProcessStep,
  waypoints: ConnectionWaypoint[],
  colX: number[],
  laneStarts: Record<string, number>,
  fromSide?: ConnectionSide,
  toSide?: ConnectionSide,
): ArrowData {
  const sourceSide = fromSide ?? defaultConnectionSide(from, to, "from");
  const targetSide = toSide ?? defaultConnectionSide(to, from, "to");
  const start = connectionPoint(from, sourceSide, colX, laneStarts);
  const end = connectionPoint(to, targetSide, colX, laneStarts);
  const normalizedWaypoints = normalizeWaypointsForRoute(waypoints, sourceSide, targetSide, start, end);
  const points = buildOrthogonalPoints(
    start,
    end,
    normalizedWaypoints,
    firstRoutingAxis(sourceSide, targetSide, from, to),
    targetRoutingAxis(targetSide),
  );
  return arrowDataFromPoints(points);
}

function buildConnectionArrow(
  conn: Connection,
  from: ProcessStep,
  to: ProcessStep,
  colX: number[],
  laneStarts: Record<string, number>,
  midXOffset = 0,
): ArrowData {
  const manualWaypoints = editableWaypointsForConnection(conn, from, to, colX, laneStarts);
  return manualWaypoints.length
    ? buildWaypointArrow(from, to, manualWaypoints, colX, laneStarts, conn.fromSide, conn.toSide)
    : buildArrow(from, to, colX, laneStarts, midXOffset, conn.fromSide, conn.toSide);
}

function defaultWaypointForConnection(
  from: ProcessStep,
  to: ProcessStep,
  colX: number[],
  laneStarts: Record<string, number>,
  fromSide?: ConnectionSide,
  toSide?: ConnectionSide,
): ConnectionWaypoint {
  const sourceSide = fromSide ?? defaultConnectionSide(from, to, "from");
  const targetSide = toSide ?? defaultConnectionSide(to, from, "to");
  const start = connectionPoint(from, sourceSide, colX, laneStarts);
  const end = connectionPoint(to, targetSide, colX, laneStarts);
  return snapPointToRoutingGrid({ x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 });
}

function defaultWaypointsForConnection(
  from: ProcessStep,
  to: ProcessStep,
  colX: number[],
  laneStarts: Record<string, number>,
  fromSide?: ConnectionSide,
  toSide?: ConnectionSide,
): ConnectionWaypoint[] {
  const sourceSide = fromSide ?? defaultConnectionSide(from, to, "from");
  const targetSide = toSide ?? defaultConnectionSide(to, from, "to");
  const start = connectionPoint(from, sourceSide, colX, laneStarts);
  const end = connectionPoint(to, targetSide, colX, laneStarts);
  const axis = firstRoutingAxis(sourceSide, targetSide, from, to);

  if (axis === "y") {
    return [
      snapPointToRoutingGrid({ x: start.x, y: start.y + (end.y - start.y) * 0.25 }),
      snapPointToRoutingGrid({ x: start.x + (end.x - start.x) * 0.5, y: start.y + (end.y - start.y) * 0.5 }),
      snapPointToRoutingGrid({ x: end.x, y: start.y + (end.y - start.y) * 0.75 }),
    ];
  }

  return [
    snapPointToRoutingGrid({ x: start.x + (end.x - start.x) * 0.25, y: start.y }),
    snapPointToRoutingGrid({ x: start.x + (end.x - start.x) * 0.5, y: start.y + (end.y - start.y) * 0.5 }),
    snapPointToRoutingGrid({ x: start.x + (end.x - start.x) * 0.75, y: end.y }),
  ];
}

function defaultWaypointsForNewManualConnection(
  from: ProcessStep,
  to: ProcessStep,
  colX: number[],
  laneStarts: Record<string, number>,
  fromSide: ConnectionSide,
  toSide: ConnectionSide,
): ConnectionWaypoint[] {
  return defaultWaypointsForConnection(from, to, colX, laneStarts, fromSide, toSide);
}

function expandSingleWaypointForConnection(
  from: ProcessStep,
  to: ProcessStep,
  waypoint: ConnectionWaypoint,
  colX: number[],
  laneStarts: Record<string, number>,
  fromSide?: ConnectionSide,
  toSide?: ConnectionSide,
): ConnectionWaypoint[] {
  const sourceSide = fromSide ?? defaultConnectionSide(from, to, "from");
  const targetSide = toSide ?? defaultConnectionSide(to, from, "to");
  const start = connectionPoint(from, sourceSide, colX, laneStarts);
  const end = connectionPoint(to, targetSide, colX, laneStarts);
  const axis = firstRoutingAxis(sourceSide, targetSide, from, to);

  if (axis === "y") {
    const sameReturnX = Math.abs(start.x - end.x) < 4 && Math.abs(waypoint.x - start.x) > 4;
    return sameReturnX
      ? [
          snapPointToRoutingGrid({ x: start.x, y: waypoint.y - GRID_SIZE }),
          waypoint,
          snapPointToRoutingGrid({ x: end.x, y: waypoint.y + GRID_SIZE }),
        ]
      : [
          snapPointToRoutingGrid({ x: start.x + (waypoint.x - start.x) / 2, y: waypoint.y }),
          waypoint,
          snapPointToRoutingGrid({ x: waypoint.x + (end.x - waypoint.x) / 2, y: waypoint.y }),
        ];
  }

  const sameReturnY = Math.abs(start.y - end.y) < 4 && Math.abs(waypoint.y - start.y) > 4;
  return sameReturnY
    ? [
        snapPointToRoutingGrid({ x: waypoint.x - GRID_SIZE, y: start.y }),
        waypoint,
        snapPointToRoutingGrid({ x: waypoint.x + GRID_SIZE, y: end.y }),
      ]
    : [
        snapPointToRoutingGrid({ x: waypoint.x, y: start.y + (waypoint.y - start.y) / 2 }),
        waypoint,
        snapPointToRoutingGrid({ x: waypoint.x, y: waypoint.y + (end.y - waypoint.y) / 2 }),
      ];
}

function editableWaypointsForConnection(
  conn: Connection,
  from: ProcessStep,
  to: ProcessStep,
  colX: number[],
  laneStarts: Record<string, number>,
): ConnectionWaypoint[] {
  const waypoints = cleanWaypoints(conn.waypoints);
  if (!conn.manual) return waypoints;
  if (waypoints.length === 1) {
    return expandSingleWaypointForConnection(from, to, waypoints[0], colX, laneStarts, conn.fromSide, conn.toSide);
  }
  return waypoints;
}

function resolveRouteType(conn: Connection, from: ProcessStep, to: ProcessStep): ConnectionRouteType {
  if (conn.routeType) return conn.routeType;
  if (to.type === "end" || to.type === "terminate") return "end";
  if (from.type === "decision") return "optional";
  return "main";
}

function routeLabel(type: ConnectionRouteType, manual?: boolean): string {
  if (!manual) {
    if (type === "end") return "Uitzondering of einde route";
    if (type === "optional") return "Correctie of optionele route";
    return "Hoofdproces route";
  }
  const label =
    type === "end" ? "uitzondering/einde" :
    type === "optional" ? "correctie/optioneel" :
    "hoofdroute";
  return `${manual ? "Handmatige " : ""}${label} route`;
}

function routeStroke(type: ConnectionRouteType, hovered: boolean): string {
  if (type === "end") return ROUTE_END;
  if (type === "optional") return ROUTE_OPTIONAL;
  return hovered ? ROUTE_HOVER : ROUTE_MAIN;
}

function routeMarker(type: ConnectionRouteType): string {
  if (type === "end") return "ah-end";
  if (type === "optional") return "ah-branch";
  return "ah-main";
}

function attachmentAriaLabel(attachment: ProcessAttachment): string {
  if (attachment.type === "annotation") return `BPMN notitie ${attachment.label}`;
  if (attachment.type === "dataObject") return `BPMN data/document ${attachment.label}`;
  return `BPMN databron ${attachment.label}`;
}

function estimatedWrappedLineCount(text: string, availableWidth: number, averageCharWidth = 6): number {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return 1;
  const maxChars = Math.max(8, Math.floor(availableWidth / averageCharWidth));
  let lines = 1;
  let current = 0;
  for (const word of words) {
    if (!current) {
      current = word.length;
      continue;
    }
    if (current + 1 + word.length > maxChars) {
      lines += 1;
      current = word.length;
    } else {
      current += 1 + word.length;
    }
  }
  return lines;
}

function manualExceptionStepHeight(label: string, width: number): number {
  const textWidth = Math.max(56, width - 34);
  const lines = estimatedWrappedLineCount(label, textWidth, 5.2);
  return Math.max(STEP_H, lines * MANUAL_EXCEPTION_STEP_LINE_H + MANUAL_EXCEPTION_STEP_PAD_Y * 2);
}

function manualExceptionTextLayout(artifact: ProcessArtifact, containedSteps: ProcessStep[] = []) {
  const width = artifact.size?.width ?? MANUAL_EXCEPTION_DEFAULT_W;
  const textWidth = width - MANUAL_EXCEPTION_TEXT_PAD_X * 2;
  const description = artifact.description ?? "Mogelijk vanuit elke pipeline stage. Geen verplichte processtap.";
  const titleHeight = estimatedWrappedLineCount(artifact.title, textWidth, 6.1) * MANUAL_EXCEPTION_TITLE_LINE_H;
  const descriptionHeight = estimatedWrappedLineCount(description, textWidth, 5.7) * MANUAL_EXCEPTION_DESCRIPTION_LINE_H;
  const stepHeights = containedSteps.map(step => manualExceptionStepHeight(step.label, STEP_W));
  const contentTop = MANUAL_EXCEPTION_TITLE_TOP;
  const descriptionTop = contentTop + titleHeight + MANUAL_EXCEPTION_DESCRIPTION_GAP;
  const stepsTop = descriptionTop + descriptionHeight + MANUAL_EXCEPTION_STEP_GAP_FROM_DESCRIPTION;
  const stepsHeight = stepHeights.reduce((sum, height) => sum + height, 0)
    + Math.max(0, stepHeights.length - 1) * MANUAL_EXCEPTION_STEP_GAP;
  const contentHeight = stepsTop + stepsHeight + MANUAL_EXCEPTION_STEP_BOTTOM;

  return {
    width,
    textWidth,
    description,
    titleHeight,
    descriptionHeight,
    descriptionTop,
    stepsTop,
    stepHeights,
    contentHeight,
  };
}

function manualExceptionBlockHeight(artifact: ProcessArtifact, containedSteps: ProcessStep[] = []): number {
  const configuredHeight = artifact.size?.height ?? MANUAL_EXCEPTION_DEFAULT_H;
  const layout = manualExceptionTextLayout(artifact, containedSteps);
  return Math.max(configuredHeight, layout.contentHeight);
}

function automaticSyncTextLayout(
  artifact: ProcessArtifact,
  linkedAutomations: Automation[] = [],
  linkedFlows: Flow[] = [],
) {
  const width = artifact.size?.width ?? 280;
  const textWidth = width - MANUAL_EXCEPTION_TEXT_PAD_X * 2;
  const description = artifact.description ?? "Beschrijf wat deze automatische sync controleert en uitvoert.";
  const titleHeight = estimatedWrappedLineCount(artifact.title, textWidth, 6.1) * MANUAL_EXCEPTION_TITLE_LINE_H;
  const descriptionHeight = estimatedWrappedLineCount(description, textWidth, 5.7) * MANUAL_EXCEPTION_DESCRIPTION_LINE_H;
  const chipRows = Math.min(Math.max(linkedAutomations.length + linkedFlows.length, 1), 4);
  const chipsTop = MANUAL_EXCEPTION_TITLE_TOP + titleHeight + MANUAL_EXCEPTION_DESCRIPTION_GAP + descriptionHeight + 12;
  const contentHeight = chipsTop + chipRows * 24 + 14;

  return {
    width,
    textWidth,
    description,
    titleHeight,
    descriptionHeight,
    descriptionTop: MANUAL_EXCEPTION_TITLE_TOP + titleHeight + MANUAL_EXCEPTION_DESCRIPTION_GAP,
    chipsTop,
    contentHeight,
  };
}

function automaticSyncBlockHeight(
  artifact: ProcessArtifact,
  linkedAutomations: Automation[] = [],
  linkedFlows: Flow[] = [],
): number {
  const configuredHeight = artifact.size?.height ?? 132;
  const layout = automaticSyncTextLayout(artifact, linkedAutomations, linkedFlows);
  return Math.max(configuredHeight, layout.contentHeight);
}

function artifactCanvasHeight(
  artifact: ProcessArtifact,
  stepsById: Map<string, ProcessStep>,
  automationById: Map<string, Automation>,
  linkedFlows: Flow[] = [],
): number {
  if (artifact.type === "manualExceptionBlock") {
    const containedSteps = (artifact.stepIds ?? [])
      .map(stepId => stepsById.get(stepId))
      .filter(Boolean) as ProcessStep[];
    return manualExceptionBlockHeight(artifact, containedSteps);
  }

  const linkedAutomations = (artifact.automationIds ?? [])
    .map(automationId => automationById.get(automationId))
    .filter(Boolean) as Automation[];
  return automaticSyncBlockHeight(artifact, linkedAutomations, linkedFlows);
}

function attachmentDefaultOffset(attachment: ProcessAttachment): Pt {
  return attachment.attachedTo.kind === "step"
    ? STEP_ATTACHMENT_DEFAULT_OFFSET
    : CONNECTION_ATTACHMENT_DEFAULT_OFFSET;
}

function attachmentAnchorForStep(
  step: ProcessStep,
  colX: number[],
  laneStarts: Record<string, number>,
): Pt | null {
  const cx = colX[step.column];
  if (cx === undefined) return null;
  const cy = stepCY(step, laneStarts);
  return {
    x: edgeRight(step, cx),
    y: edgeUp(step, cy) + 8,
  };
}

function renderAttachmentShape(attachment: ProcessAttachment, x: number, y: number) {
  if (attachment.type === "annotation") {
    return (
      <>
        <rect x={x} y={y} width={ATTACHMENT_W} height={ATTACHMENT_H} rx={3}
          fill="#fff7ed" stroke="#94a3b8" strokeWidth={1.4} />
        <line x1={x + 10} y1={y + 14} x2={x + ATTACHMENT_W - 10} y2={y + 14}
          stroke="#cbd5e1" strokeWidth={1} />
        <line x1={x + 10} y1={y + 24} x2={x + ATTACHMENT_W - 18} y2={y + 24}
          stroke="#cbd5e1" strokeWidth={1} />
      </>
    );
  }

  if (attachment.type === "dataObject") {
    const fold = 12;
    return (
      <>
        <path
          d={`M ${x} ${y} H ${x + ATTACHMENT_W - fold} L ${x + ATTACHMENT_W} ${y + fold} V ${y + ATTACHMENT_H} H ${x} Z`}
          fill="#f8fafc"
          stroke="#64748b"
          strokeWidth={1.4}
        />
        <path
          d={`M ${x + ATTACHMENT_W - fold} ${y} V ${y + fold} H ${x + ATTACHMENT_W}`}
          fill="none"
          stroke="#64748b"
          strokeWidth={1.1}
        />
      </>
    );
  }

  return (
    <>
      <path
        d={`M ${x} ${y + 9} C ${x} ${y + 3} ${x + ATTACHMENT_W} ${y + 3} ${x + ATTACHMENT_W} ${y + 9} V ${y + ATTACHMENT_H - 9} C ${x + ATTACHMENT_W} ${y + ATTACHMENT_H - 3} ${x} ${y + ATTACHMENT_H - 3} ${x} ${y + ATTACHMENT_H - 9} Z`}
        fill="#eff6ff"
        stroke="#64748b"
        strokeWidth={1.4}
      />
      <ellipse cx={x + ATTACHMENT_W / 2} cy={y + 9} rx={ATTACHMENT_W / 2} ry={8}
        fill="#dbeafe" stroke="#64748b" strokeWidth={1.4} />
      <path d={`M ${x} ${y + ATTACHMENT_H - 9} C ${x} ${y + ATTACHMENT_H - 3} ${x + ATTACHMENT_W} ${y + ATTACHMENT_H - 3} ${x + ATTACHMENT_W} ${y + ATTACHMENT_H - 9}`}
        fill="none" stroke="#64748b" strokeWidth={1.1} />
    </>
  );
}

function dotPositions(center: Pt, n: number): Pt[] {
  return Array.from({ length: n }, (_, i) => ({
    x: center.x - ((n - 1) * DOT_SPACING) / 2 + i * DOT_SPACING,
    y: center.y,
  }));
}

function stepDotPositions(cx: number, bottomY: number, n: number): Pt[] {
  const safeOffsets = [-48, -24, 24, 48];
  if (n <= safeOffsets.length) {
    const start = Math.max(0, Math.floor((safeOffsets.length - n) / 2));
    return safeOffsets.slice(start, start + n).map(offset => ({
      x: cx + offset,
      y: bottomY,
    }));
  }
  return Array.from({ length: n }, (_, i) => ({
    x: cx - ((n - 1) * STEP_DOT_SPACING) / 2 + i * STEP_DOT_SPACING,
    y: bottomY,
  })).filter(point => Math.abs(point.x - cx) > STEP_DOT_R + 4);
}

function isAutomationActive(auto: Pick<Automation, "status"> | undefined): boolean {
  const status = auto?.status?.trim().toLowerCase();
  return status === "actief" || status === "active" || status === "enabled";
}

function flowHasInactiveAutomation(
  flow: import("@/lib/types").Flow | undefined,
  automations: Automation[],
): boolean {
  if (!flow?.automationIds?.length) return false;
  const byId = new Map(automations.map(automation => [automation.id, automation]));
  return flow.automationIds.some(id => {
    const automation = byId.get(id);
    return automation ? !isAutomationActive(automation) : false;
  });
}

function automationPlacement(auto: Automation, fallbackOrder = 0) {
  if (auto.placement) return { ...auto.placement, order: auto.placement.order ?? fallbackOrder };
  if (auto.fromStepId && auto.toStepId) {
    return {
      kind: "connection" as const,
      fromStepId: auto.fromStepId,
      toStepId: auto.toStepId,
      order: fallbackOrder,
    };
  }
  return null;
}

function processActionPlacement(action: ProcessAction, fallbackOrder = 0) {
  if (!action.placement) return null;
  return { ...action.placement, order: action.placement.order ?? fallbackOrder };
}

function pipelineWidePlacement(auto: Automation, fallbackOrder = 0) {
  const placement = automationPlacement(auto, fallbackOrder);
  return placement?.kind === "pipeline_wide" ? placement : null;
}

function placementOrder(value: { order?: number } | null | undefined, fallback: number): number {
  return typeof value?.order === "number" ? value.order : fallback;
}

function compactHubText(value: string | undefined, fallback: string, max = 58): string {
  const text = value?.replace(/\s+/g, " ").trim() || fallback;
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function pipelineWideAutomationSummary(auto: Automation, fallbackOrder = 0) {
  const placement = pipelineWidePlacement(auto, fallbackOrder);
  return {
    timing: compactHubText(placement?.syncTiming ?? auto.syncTiming, "Timing onbekend", 34),
    checks: compactHubText(placement?.checksSummary ?? auto.checksSummary ?? auto.goal, "Controleert pipeline en brondata"),
    action: compactHubText(placement?.actionSummary ?? auto.actionSummary, "Werkt stages en uitzonderingen bij"),
    affectedStageCount: (placement?.affectedStageIds ?? auto.affectedStageIds ?? []).length,
  };
}

function bendTarget(point: Pt, insertIndex: number): BendInsertionTarget {
  return { point: snapPointToRoutingGrid(point), insertIndex };
}

function buildBendInsertionTargets(waypoints: ConnectionWaypoint[], fallback: Pt): BendInsertionTarget[] {
  if (!waypoints.length) {
    return [
      bendTarget(fallback, 0),
    ];
  }

  const first = waypoints[0];
  const last = waypoints[waypoints.length - 1];

  if (waypoints.length === 1) {
    return [
      bendTarget({ x: first.x - GRID_SIZE, y: first.y }, 0),
      bendTarget({ x: first.x + GRID_SIZE, y: first.y }, 1),
    ];
  }

  const middleInsertIndex = Math.ceil(waypoints.length / 2);
  const beforeMiddle = waypoints[middleInsertIndex - 1];
  const afterMiddle = waypoints[middleInsertIndex] ?? beforeMiddle;

  return [
    bendTarget({ x: first.x, y: first.y - GRID_SIZE }, 0),
    bendTarget({
      x: (beforeMiddle.x + afterMiddle.x) / 2,
      y: (beforeMiddle.y + afterMiddle.y) / 2,
    }, middleInsertIndex),
    bendTarget({ x: last.x + GRID_SIZE, y: last.y }, waypoints.length),
  ];
}

function orderedStepConnectionsForRender(
  connections: Connection[],
  selectedConnectionId: string | null,
): Connection[] {
  if (!selectedConnectionId) return connections;
  const selected = connections.find(connection => connection.id === selectedConnectionId);
  if (!selected) return connections;
  return [
    ...connections.filter(connection => connection.id !== selectedConnectionId),
    selected,
  ];
}

function routeVisibleStrokeWidth(selected: boolean): number {
  return selected ? 2.8 : 1.7;
}

function routeFocusOutlineStrokeWidth(selected: boolean): number {
  return selected ? 7 : 0;
}

function routeFlowDotDuration(length: number): string {
  const seconds = Math.min(6, Math.max(1.6, length / 260));
  return `${Number(seconds.toFixed(1))}s`;
}

function RouteFlowDot({ path, length }: { path: string; length: number }) {
  return (
    <g data-route-flow-dot="true" style={{ pointerEvents: "none" }}>
      <circle r="4.5" fill="#ecfeff" stroke={ROUTE_VIEWER_SELECTED} strokeWidth="1.5">
        <animateMotion dur={routeFlowDotDuration(length)} repeatCount="indefinite" path={path} />
      </circle>
    </g>
  );
}

function waypointOuterRadius(selected: boolean): number {
  return selected ? 12 : 10;
}

function waypointInnerRadius(selected: boolean): number {
  return selected ? 7 : 5;
}

function ConnectionPortHandles({
  label,
  ports,
  fill,
  onPortMouseDown,
}: {
  label: string;
  ports: Record<ConnectionSide, Pt>;
  fill: string;
  onPortMouseDown?: (e: React.MouseEvent, side: ConnectionSide) => void;
}) {
  if (!onPortMouseDown) return null;
  return (
    <>
      {CONNECTION_SIDES.map(side => (
        <circle
          key={side}
          cx={ports[side].x}
          cy={ports[side].y}
          r={5}
          role="button"
          aria-label={portAriaLabel(label, side)}
          tabIndex={0}
          fill={fill}
          stroke="white"
          strokeWidth="1.5"
          style={{ cursor: "crosshair" }}
          onMouseDown={e => { e.stopPropagation(); onPortMouseDown(e, side); }}
        />
      ))}
    </>
  );
}

// ── AutomationDot ─────────────────────────────────────────────────────────────

function DragOverlay({ cx, cy, radius, onClick, onDragStart }: {
  cx: number;
  cy: number;
  radius: number;
  onClick: (e: React.MouseEvent) => void;
  onDragStart: (e: React.DragEvent) => void;
}) {
  return (
    <foreignObject x={cx - radius} y={cy - radius} width={radius * 2} height={radius * 2}>
      <div
        draggable
        onClick={onClick}
        onDragStart={onDragStart}
        style={{
          borderRadius: "9999px",
          cursor: "grab",
          height: "100%",
          opacity: 0,
          width: "100%",
        }}
      />
    </foreignObject>
  );
}

function ProcessActionIcon({ type, size = 9, color = "currentColor" }: {
  type: ProcessActionType;
  size?: number;
  color?: string;
}) {
  if (type === "email" || type === "message") {
    return (
      <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="M3 7l9 6 9-6" />
      </svg>
    );
  }
  if (type === "task") {
    return (
      <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 11l2 2 4-5" />
        <rect x="4" y="4" width="16" height="16" rx="3" />
      </svg>
    );
  }
  if (type === "webhook") {
    return (
      <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 7h8" />
        <path d="M8 17h8" />
        <path d="M7 7a3 3 0 100 6h10a3 3 0 100-6" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="8" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

function AutomationDot({ auto, cx, cy, ariaLabel, alert = false, onClick, onPortMouseDown }: {
  auto: Automation; cx: number; cy: number;
  ariaLabel?: string;
  alert?: boolean;
  onClick: (e: React.MouseEvent) => void;
  onPortMouseDown?: (e: React.MouseEvent) => void;
}) {
  const [hov, setHov] = useState(false);
  const label = auto.name;
  const estW = Math.max(64, label.length * 6 + 16);
  const radius = PLACEMENT_DOT_R;
  const dragEnabled = !!onPortMouseDown;
  const handleDragStart = (e: React.DragEvent) => {
    if (!dragEnabled) return;
    e.dataTransfer.setData("automationId", auto.id);
    e.dataTransfer.effectAllowed = "move";
  };
  return (
    <g onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      role={ariaLabel ? "button" : undefined}
      aria-label={ariaLabel}
      draggable={dragEnabled || undefined}
      onDragStart={handleDragStart}
      className="cursor-pointer"
      style={{ filter: hov ? "drop-shadow(0 2px 4px rgba(0,0,0,.2))" : undefined }}>
      <circle cx={cx} cy={cy} r={radius + 2} fill="white" onClick={onClick}
        draggable={dragEnabled || undefined} onDragStart={handleDragStart} />
      <circle cx={cx} cy={cy} r={radius} fill={alert ? PLACEMENT_ALERT_FILL : AUTOMATION_DOT_FILL} stroke={alert ? PLACEMENT_ALERT_STROKE : AUTOMATION_DOT_STROKE} strokeWidth="1.5" onClick={onClick}
        draggable={dragEnabled || undefined} onDragStart={handleDragStart} />
      <foreignObject x={cx - 6} y={cy - 6} width={12} height={12} style={{ pointerEvents: "none" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 12, height: 12 }}>
          <svg viewBox="0 0 24 24" width={8} height={8} fill={alert ? PLACEMENT_ALERT_ICON : AUTOMATION_DOT_ICON} stroke="none">
            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
          </svg>
        </div>
      </foreignObject>
      {dragEnabled && <DragOverlay cx={cx} cy={cy} radius={radius + 2} onClick={onClick} onDragStart={handleDragStart} />}
      {/* Tooltip — name of automation, always horizontal, appears on hover */}
      {hov && (
        <g style={{ pointerEvents: "none" }}>
          <rect x={cx - estW / 2} y={cy - DOT_R - 20} width={estW} height={14}
            rx="4" fill="#1e293b" fillOpacity={0.88} />
          <text x={cx} y={cy - DOT_R - 13} textAnchor="middle" dominantBaseline="middle"
            fontSize="8" fontWeight="500" fill="white"
            style={{ fontFamily: "IBM Plex Sans, system-ui, sans-serif" }}>
            {label}
          </text>
        </g>
      )}
      {/* Port handle — appears on hover for drawing branch connections */}
      {hov && (
        <circle cx={cx + radius} cy={cy} r={5}
          fill={AUTOMATION_DOT_STROKE} stroke="white" strokeWidth="1.5"
          style={{ cursor: "crosshair" }}
          onMouseDown={e => { e.stopPropagation(); onPortMouseDown?.(e); }} />
      )}
    </g>
  );
}

function FlowDot({ flowId, flowName, cx, cy, ariaLabel, alert = false, onClick }: {
  flowId: string; flowName: string; cx: number; cy: number;
  ariaLabel?: string;
  alert?: boolean;
  onClick: (e: React.MouseEvent) => void;
}) {
  const [hov, setHov] = useState(false);
  const label = flowName;
  const estW = Math.max(72, label.length * 6 + 16);
  const FLOW_R = PLACEMENT_DOT_R;
  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData("flowId", flowId);
    e.dataTransfer.effectAllowed = "move";
  };
  return (
    <g onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
       role={ariaLabel ? "button" : undefined}
       aria-label={ariaLabel}
       draggable
       onDragStart={handleDragStart}
       className="cursor-pointer"
       style={{ filter: hov ? "drop-shadow(0 2px 4px rgba(0,0,0,.2))" : undefined }}>
      <circle cx={cx} cy={cy} r={FLOW_R + 2} fill="white" onClick={onClick}
        draggable onDragStart={handleDragStart} />
      <circle cx={cx} cy={cy} r={FLOW_R} fill={alert ? PLACEMENT_ALERT_FILL : FLOW_DOT_FILL} stroke={alert ? PLACEMENT_ALERT_STROKE : FLOW_DOT_STROKE} strokeWidth="1.5" onClick={onClick}
        draggable onDragStart={handleDragStart} />
      <foreignObject x={cx - 6} y={cy - 6} width={12} height={12} style={{ pointerEvents: "none" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "100%", height: "100%" }}>
          <svg viewBox="0 0 24 24" width={8} height={8} fill={alert ? PLACEMENT_ALERT_ICON : FLOW_DOT_ICON} stroke="none">
            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
          </svg>
        </div>
      </foreignObject>
      <DragOverlay cx={cx} cy={cy} radius={FLOW_R + 2} onClick={onClick} onDragStart={handleDragStart} />
      {hov && (
        <g style={{ pointerEvents: "none" }}>
          <rect x={cx - estW / 2} y={cy - FLOW_R - 20} width={estW} height={14}
            rx="4" fill="#1e293b" fillOpacity={0.88} />
          <text x={cx} y={cy - FLOW_R - 13} textAnchor="middle" fontSize="8" fill="white" fontWeight="500">
            {label.length > 24 ? label.slice(0, 23) + "…" : label}
          </text>
        </g>
      )}
    </g>
  );
}

// ── EventCircle ───────────────────────────────────────────────────────────────

function ProcessActionDot({ action, cx, cy, ariaLabel, onClick }: {
  action: ProcessAction; cx: number; cy: number;
  ariaLabel?: string;
  onClick: (e: React.MouseEvent) => void;
}) {
  const [hov, setHov] = useState(false);
  const label = action.label;
  const estW = Math.max(72, label.length * 6 + 16);
  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData("processActionId", action.id);
    e.dataTransfer.effectAllowed = "move";
  };
  return (
    <g onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
       role={ariaLabel ? "button" : undefined}
       aria-label={ariaLabel}
       draggable
       onDragStart={handleDragStart}
       className="cursor-pointer"
       style={{ filter: hov ? "drop-shadow(0 2px 4px rgba(0,0,0,.2))" : undefined }}>
      <circle cx={cx} cy={cy} r={PLACEMENT_DOT_R + 2} fill="white" onClick={onClick}
        draggable onDragStart={handleDragStart} />
      <circle cx={cx} cy={cy} r={PLACEMENT_DOT_R} fill={PROCESS_ACTION_DOT_FILL} stroke={PROCESS_ACTION_DOT_STROKE} strokeWidth="1.5" onClick={onClick}
        draggable onDragStart={handleDragStart} />
      <foreignObject x={cx - 8} y={cy - 8} width={16} height={16} style={{ pointerEvents: "none" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 16, height: 16 }}>
          <ProcessActionIcon type={action.type} size={12} color={PROCESS_ACTION_DOT_ICON} />
        </div>
      </foreignObject>
      <DragOverlay cx={cx} cy={cy} radius={PLACEMENT_DOT_R + 2} onClick={onClick} onDragStart={handleDragStart} />
      {hov && (
        <g style={{ pointerEvents: "none" }}>
          <rect x={cx - estW / 2} y={cy - PLACEMENT_DOT_R - 20} width={estW} height={14}
            rx="4" fill="#1e293b" fillOpacity={0.88} />
          <text x={cx} y={cy - PLACEMENT_DOT_R - 13} textAnchor="middle" dominantBaseline="middle"
            fontSize="8" fontWeight="500" fill="white"
            style={{ fontFamily: "IBM Plex Sans, system-ui, sans-serif" }}>
            {label.length > 24 ? `${label.slice(0, 23)}...` : label}
          </text>
        </g>
      )}
    </g>
  );
}

function StepPlacementDot({ id, label, ariaLabel, cx, cy, kind, actionType, alert = false, onClick }: {
  id: string;
  label: string;
  ariaLabel: string;
  cx: number;
  cy: number;
  kind: "automation" | "flow" | "action";
  actionType?: ProcessActionType;
  alert?: boolean;
  onClick: (e: React.MouseEvent) => void;
}) {
  const [hov, setHov] = useState(false);
  const colors = alert
    ? { fill: PLACEMENT_ALERT_FILL, stroke: PLACEMENT_ALERT_STROKE, icon: PLACEMENT_ALERT_ICON }
    : kind === "automation"
    ? { fill: AUTOMATION_DOT_FILL, stroke: AUTOMATION_DOT_STROKE, icon: AUTOMATION_DOT_ICON }
    : kind === "flow"
    ? { fill: FLOW_DOT_FILL, stroke: FLOW_DOT_STROKE, icon: FLOW_DOT_ICON }
    : { fill: PROCESS_ACTION_DOT_FILL, stroke: PROCESS_ACTION_DOT_STROKE, icon: PROCESS_ACTION_DOT_ICON };
  const estW = Math.max(64, label.length * 6 + 16);
  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData(kind === "automation" ? "automationId" : kind === "flow" ? "flowId" : "processActionId", id);
    e.dataTransfer.effectAllowed = "move";
  };
  return (
    <g
      role="button"
      aria-label={ariaLabel}
      draggable
      onDragStart={handleDragStart}
      className="cursor-pointer"
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{ filter: hov ? "drop-shadow(0 2px 4px rgba(0,0,0,.2))" : undefined }}
    >
      <circle cx={cx} cy={cy} r={STEP_DOT_R + 2} fill="white" onClick={onClick}
        draggable onDragStart={handleDragStart} />
      <circle cx={cx} cy={cy} r={STEP_DOT_R} fill={colors.fill} stroke={colors.stroke} strokeWidth="1.5" onClick={onClick}
        draggable onDragStart={handleDragStart} />
      <foreignObject x={cx - 8} y={cy - 8} width={16} height={16} style={{ pointerEvents: "none" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 16, height: 16 }}>
          {kind === "action" && actionType
            ? <ProcessActionIcon type={actionType} size={12} color={colors.icon} />
            : (
              <svg viewBox="0 0 24 24" width={8} height={8} fill={colors.icon} stroke="none">
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
              </svg>
          )}
        </div>
      </foreignObject>
      <DragOverlay cx={cx} cy={cy} radius={STEP_DOT_R + 2} onClick={onClick} onDragStart={handleDragStart} />
      {hov && (
        <g style={{ pointerEvents: "none" }}>
          <rect x={cx - estW / 2} y={cy - STEP_DOT_R - 20} width={estW} height={14}
            rx="4" fill="#1e293b" fillOpacity={0.88} />
          <text x={cx} y={cy - STEP_DOT_R - 13} textAnchor="middle" dominantBaseline="middle"
            fontSize="8" fontWeight="500" fill="white"
            style={{ fontFamily: "IBM Plex Sans, system-ui, sans-serif" }}>
            {label}
          </text>
        </g>
      )}
    </g>
  );
}

function PipelineWideAutomationHub({ auto, x, y, index, onClick }: {
  auto: Automation;
  x: number;
  y: number;
  index: number;
  onClick?: (event: React.MouseEvent) => void;
}) {
  const summary = pipelineWideAutomationSummary(auto, index);
  const label = compactHubText(auto.name, "Pipeline sync", 36);
  return (
    <g
      role="button"
      tabIndex={0}
      aria-label={`Pipeline-brede automation ${auto.name} openen`}
      onClick={onClick}
      onKeyDown={event => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        onClick?.(event as unknown as React.MouseEvent);
      }}
      style={{ cursor: "pointer" }}
    >
      <line
        x1={x + PIPELINE_HUB_W / 2}
        y1={y + PIPELINE_HUB_H}
        x2={x + PIPELINE_HUB_W / 2}
        y2={y + PIPELINE_HUB_H + 18}
        stroke="#94a3b8"
        strokeWidth={1.2}
        strokeDasharray="4 5"
        style={{ pointerEvents: "none" }}
      />
      <rect
        x={x}
        y={y}
        width={PIPELINE_HUB_W}
        height={PIPELINE_HUB_H}
        rx={8}
        fill="#f8fafc"
        stroke="#94a3b8"
        strokeWidth={1.2}
        strokeDasharray="6 4"
      />
      <circle cx={x + 24} cy={y + 23} r={12} fill="#e0f2fe" stroke="#0284c7" strokeWidth={1.5} />
      <path
        d={`M ${x + 19} ${y + 23} h 10 m -4 -4 l 4 4 -4 4`}
        fill="none"
        stroke="#0369a1"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ pointerEvents: "none" }}
      />
      <text
        x={x + 44}
        y={y + 17}
        fontSize={8.5}
        fontWeight={800}
        fill="#0369a1"
        style={{ fontFamily: "IBM Plex Sans, system-ui, sans-serif", pointerEvents: "none", textTransform: "uppercase" }}
      >
        Pipeline-breed
      </text>
      <text
        x={x + 44}
        y={y + 32}
        fontSize={12}
        fontWeight={800}
        fill="#0f172a"
        style={{ fontFamily: "IBM Plex Sans, system-ui, sans-serif", pointerEvents: "none" }}
      >
        {label}
      </text>
      <text x={x + PIPELINE_HUB_W - 14} y={y + 18} textAnchor="end" fontSize={10} fontWeight={800} fill="#475569"
        style={{ fontFamily: "IBM Plex Sans, system-ui, sans-serif", pointerEvents: "none" }}>
        {summary.timing}
      </text>
      <text x={x + 14} y={y + 52} fontSize={10} fontWeight={700} fill="#334155"
        style={{ fontFamily: "IBM Plex Sans, system-ui, sans-serif", pointerEvents: "none" }}>
        {summary.checks}
      </text>
      <text x={x + 14} y={y + 68} fontSize={10} fontWeight={700} fill="#475569"
        style={{ fontFamily: "IBM Plex Sans, system-ui, sans-serif", pointerEvents: "none" }}>
        {summary.action}
      </text>
      {summary.affectedStageCount > 0 && (
        <text x={x + PIPELINE_HUB_W - 14} y={y + 68} textAnchor="end" fontSize={10} fontWeight={800} fill="#0369a1"
          style={{ fontFamily: "IBM Plex Sans, system-ui, sans-serif", pointerEvents: "none" }}>
          +{summary.affectedStageCount} geraakte stages
        </text>
      )}
    </g>
  );
}

function EventCircle({ step, cx, cy, isDragging, isTarget, onMouseDown, onPortMouseDown, onContextMenu }: {
  step: ProcessStep; cx: number; cy: number;
  isDragging?: boolean; isTarget?: boolean;
  onMouseDown?: (e: React.MouseEvent) => void;
  onPortMouseDown?: (e: React.MouseEvent, side: ConnectionSide) => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}) {
  const [hov, setHov] = useState(false);
  const isStart = step.type === "start";
  const fill    = isStart ? "#dcfce7" : "#fee2e2";
  const stroke  = isStart ? "#16a34a" : "#dc2626";
  const sw      = isStart ? 2.5 : 4;

  return (
    <g style={{ opacity: isDragging ? 0.35 : 1, cursor: "move" }}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      onMouseDown={onMouseDown} onContextMenu={onContextMenu}>
      {isTarget && (
        <circle cx={cx} cy={cy} r={EVT_R + 6}
          fill="none" stroke={stroke} strokeWidth="2" strokeDasharray="5 3" opacity="0.7" />
      )}
      <circle cx={cx} cy={cy} r={EVT_R} fill={fill} stroke={stroke} strokeWidth={sw}
        style={{ filter: hov ? `drop-shadow(0 2px 8px ${stroke}88)` : undefined }} />
      <circle cx={cx} cy={cy} r={isStart ? EVT_R * 0.38 : EVT_R * 0.55}
        fill={stroke} style={{ pointerEvents: "none" }} />
      <text x={cx} y={cy + EVT_R + 10} textAnchor="middle" dominantBaseline="middle"
        fontSize="8" fontWeight="600" fill={stroke}
        style={{ pointerEvents: "none", fontFamily: "IBM Plex Sans, system-ui, sans-serif" }}>
        {isStart ? "Start" : "Einde"}
      </text>
      {hov && (
        <ConnectionPortHandles
          label={step.label}
          fill={stroke}
          ports={{
            top: { x: cx, y: cy - EVT_R },
            right: { x: cx + EVT_R, y: cy },
            bottom: { x: cx, y: cy + EVT_R },
            left: { x: cx - EVT_R, y: cy },
          }}
          onPortMouseDown={onPortMouseDown}
        />
      )}
    </g>
  );
}

// ── StepBox ───────────────────────────────────────────────────────────────────

function StepBox({ step, cx, cy, isDragging, isTarget, sourceMissing, onClick, onPortMouseDown, onStepMouseDown, onContextMenu, onPlacementDragOver, onPlacementDrop, customLanes, viewerMode }: {
  step: ProcessStep; cx: number; cy: number;
  isDragging?: boolean; isTarget?: boolean;
  sourceMissing?: boolean;
  onClick?: () => void;
  onPortMouseDown?: (e: React.MouseEvent, side: ConnectionSide) => void;
  onStepMouseDown?: (e: React.MouseEvent) => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  onPlacementDragOver?: (e: React.DragEvent<SVGGElement>) => void;
  onPlacementDrop?: (e: React.DragEvent<SVGGElement>) => void;
  customLanes?: CustomLane[];
  viewerMode?: boolean;
}) {
  const [hov, setHov] = useState(false);
  const cfg = getLaneConfig(step.team, customLanes);
  const x = cx - STEP_W / 2, y = cy - STEP_H / 2;
  const labelLayout = wrapStepLabel(step.label);
  const labelX = viewerMode ? cx : cx + 4;

  const isOptional = step.type === "optional";
  const isPipeline = isPipelineStep(step);
  const fill    = sourceMissing ? "#fef2f2" : isPipeline ? "#FFF1EE" : (viewerMode ? (isOptional ? "#FFF7ED" : "#EFF6FF") : "white");
  const stroke  = sourceMissing ? "#dc2626" : isPipeline ? "#FF7A59" : (viewerMode ? (isOptional ? "#F97316" : "#3B82F6") : (hov ? cfg.stroke : "#cbd5e1"));
  const sw      = viewerMode ? 1.5 : (hov ? 2 : 1.5);
  const dashArr = sourceMissing ? "5 3" : isOptional ? "6 3" : undefined;
  const txtFill = sourceMissing ? "#991b1b" : isPipeline ? "#C45200" : (viewerMode ? (isOptional ? "#C2410C" : "#1D4ED8") : "#1e293b");

  return (
    <g data-step-id={step.id}
      style={{ opacity: isDragging ? 0.3 : 1 }}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      onDragOver={onPlacementDragOver}
      onDrop={onPlacementDrop}
      onContextMenu={onContextMenu}>
      {isTarget && (
        <rect x={x - 3} y={y - 3} width={STEP_W + 6} height={STEP_H + 6}
          rx="10" fill="none" stroke={viewerMode ? "#3B82F6" : cfg.stroke} strokeWidth="2" strokeDasharray="5 3" opacity="0.7" />
      )}
      <rect data-step-body="true" x={x} y={y} width={STEP_W} height={STEP_H} rx="8" fill={fill}
        stroke={stroke} strokeWidth={sw} strokeDasharray={dashArr}
        style={{ cursor: "pointer", filter: hov ? "drop-shadow(0 2px 6px rgba(0,0,0,.1))" : undefined }}
        onMouseDown={onStepMouseDown} onClick={onClick} />
      {!viewerMode && <rect x={x} y={y} width={4} height={STEP_H} rx="2" fill={sourceMissing ? "#dc2626" : isPipeline ? "#FF7A59" : cfg.stroke} style={{ pointerEvents: "none" }} />}
      <text x={labelX} y={cy} textAnchor="middle" dominantBaseline="middle"
        fontSize={labelLayout.fontSize} fontWeight="500" fill={txtFill}
        style={{ pointerEvents: "none", fontFamily: "IBM Plex Sans, system-ui, sans-serif" }}>
        {labelLayout.lines.map((line, index) => (
          <tspan
            key={`${line}-${index}`}
            x={labelX}
            dy={index === 0 ? -((labelLayout.lines.length - 1) * STEP_LABEL_LINE_H) / 2 : STEP_LABEL_LINE_H}
          >
            {line}
          </tspan>
        ))}
      </text>
      <ConnectionPortHandles
        label={step.label}
        fill={isPipeline ? "#FF7A59" : (viewerMode ? "#3B82F6" : cfg.stroke)}
        ports={{
          top: { x: cx, y },
          right: { x: x + STEP_W, y: cy },
          bottom: { x: cx, y: y + STEP_H },
          left: { x, y: cy },
        }}
        onPortMouseDown={onPortMouseDown}
      />
      {sourceMissing ? (
        <g style={{ pointerEvents: "none" }}>
          <rect
            x={cx + STEP_W / 2 - 3 - 42}
            y={cy - STEP_H / 2 + 3}
            width={42}
            height={9}
            rx="2.5"
            fill="#fee2e2"
            stroke="#dc2626"
            strokeWidth="0.5"
          />
          <text
            x={cx + STEP_W / 2 - 3 - 21}
            y={cy - STEP_H / 2 + 3 + 4.5}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize="6"
            fontWeight="700"
            fill="#991b1b"
            style={{ fontFamily: "IBM Plex Sans, system-ui, sans-serif" }}
          >
            Niet in bron
          </text>
        </g>
      ) : isPipelineStep(step) && (
        <g style={{ pointerEvents: "none" }}>
          <rect
            x={cx + STEP_W / 2 - 3 - 30}
            y={cy - STEP_H / 2 + 3}
            width={30}
            height={9}
            rx="2.5"
            fill="#FFF1EE"
            stroke="#FF7A59"
            strokeWidth="0.5"
          />
          <text
            x={cx + STEP_W / 2 - 3 - 15}
            y={cy - STEP_H / 2 + 3 + 4.5}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize="6"
            fontWeight="600"
            fill="#C45200"
            style={{ fontFamily: "IBM Plex Sans, system-ui, sans-serif" }}
          >
            Pipeline
          </text>
        </g>
      )}
    </g>
  );
}

// ── DecisionDiamond ───────────────────────────────────────────────────────────

function DecisionDiamond({ step, cx, cy, isDragging, isTarget, onClick, onPortMouseDown, onStepMouseDown, onContextMenu, customLanes, viewerMode }: {
  step: ProcessStep; cx: number; cy: number;
  isDragging?: boolean; isTarget?: boolean;
  onClick?: () => void;
  onPortMouseDown?: (e: React.MouseEvent, side: ConnectionSide) => void;
  onStepMouseDown?: (e: React.MouseEvent) => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  customLanes?: CustomLane[];
  viewerMode?: boolean;
}) {
  const [hov, setHov] = useState(false);
  const cfg = getLaneConfig(step.team, customLanes);
  const h = DECISION_H;
  const pts = `${cx},${cy - h} ${cx + h},${cy} ${cx},${cy + h} ${cx - h},${cy}`;
  const ptsTarget = `${cx},${cy - h - 6} ${cx + h + 6},${cy} ${cx},${cy + h + 6} ${cx - h - 6},${cy}`;
  const label = step.label.length > 13 ? step.label.slice(0, 12) + "…" : step.label;

  const fill   = viewerMode ? "#EFF6FF" : "white";
  const stroke = viewerMode ? "#3B82F6" : (hov ? cfg.stroke : "#cbd5e1");
  const crossColor = viewerMode ? "#3B82F6" : (hov ? cfg.stroke : "#64748b");

  return (
    <g style={{ opacity: isDragging ? 0.3 : 1 }}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      onContextMenu={onContextMenu}>
      {isTarget && (
        <polygon points={ptsTarget} fill="none" stroke={viewerMode ? "#3B82F6" : cfg.stroke}
          strokeWidth="2" strokeDasharray="5 3" opacity="0.7" />
      )}
      <polygon
        points={pts}
        fill={fill}
        stroke={stroke}
        strokeWidth={hov ? 2 : 1.5}
        style={{ cursor: "pointer", filter: hov ? "drop-shadow(0 2px 6px rgba(0,0,0,.1))" : undefined }}
        onMouseDown={onStepMouseDown}
        onClick={onClick}
      />
      <line x1={cx - h * 0.45} y1={cy - h * 0.45} x2={cx + h * 0.45} y2={cy + h * 0.45}
        stroke={crossColor} strokeWidth="2" style={{ pointerEvents: "none" }} />
      <line x1={cx + h * 0.45} y1={cy - h * 0.45} x2={cx - h * 0.45} y2={cy + h * 0.45}
        stroke={crossColor} strokeWidth="2" style={{ pointerEvents: "none" }} />
      <text x={cx} y={cy + h + 10} textAnchor="middle" dominantBaseline="middle"
        fontSize="8" fontWeight="500" fill={viewerMode ? "#1D4ED8" : "#1e293b"}
        style={{ pointerEvents: "none", fontFamily: "IBM Plex Sans, system-ui, sans-serif" }}>
        {label}
      </text>
      <ConnectionPortHandles
        label={step.label}
        fill={viewerMode ? "#3B82F6" : cfg.stroke}
        ports={{
          top: { x: cx, y: cy - h },
          right: { x: cx + h, y: cy },
          bottom: { x: cx, y: cy + h },
          left: { x: cx - h, y: cy },
        }}
        onPortMouseDown={onPortMouseDown}
      />
    </g>
  );
}

// ── TerminateCircle ───────────────────────────────────────────────────────────

function TerminateCircle({ step, cx, cy, isDragging, isTarget, onMouseDown, onClick, onPortMouseDown, onContextMenu }: {
  step: ProcessStep; cx: number; cy: number;
  isDragging?: boolean; isTarget?: boolean;
  onMouseDown?: (e: React.MouseEvent) => void;
  onClick?: () => void;
  onPortMouseDown?: (e: React.MouseEvent, side: ConnectionSide) => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}) {
  const [hov, setHov] = useState(false);
  const str = ROUTE_END;
  const fill = str;
  const label = step.label.length > 14 ? step.label.slice(0, 13) + "…" : step.label;

  return (
    <g style={{ opacity: isDragging ? 0.35 : 1, cursor: "move" }}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      onMouseDown={onMouseDown} onClick={onClick} onContextMenu={onContextMenu}>
      {isTarget && (
        <circle cx={cx} cy={cy} r={EVT_R + 6}
          fill="none" stroke={str} strokeWidth="2" strokeDasharray="5 3" opacity="0.7" />
      )}
      <circle cx={cx} cy={cy} r={EVT_R} fill={fill} stroke={str} strokeWidth="3"
        style={{ filter: hov ? `drop-shadow(0 2px 8px ${str}88)` : undefined }} />
      <circle cx={cx} cy={cy} r={EVT_R * 0.5} fill="#ffffff" style={{ pointerEvents: "none" }} />
      <text x={cx} y={cy + EVT_R + 10} textAnchor="middle" dominantBaseline="middle"
        fontSize="8" fontWeight="600" fill={str}
        style={{ pointerEvents: "none", fontFamily: "IBM Plex Sans, system-ui, sans-serif" }}>
        {label}
      </text>
      {hov && (
        <ConnectionPortHandles
          label={step.label}
          fill={str}
          ports={{
            top: { x: cx, y: cy - EVT_R },
            right: { x: cx + EVT_R, y: cy },
            bottom: { x: cx, y: cy + EVT_R },
            left: { x: cx - EVT_R, y: cy },
          }}
          onPortMouseDown={onPortMouseDown}
        />
      )}
    </g>
  );
}

// ── SendCircle ────────────────────────────────────────────────────────────────

function SendCircle({ step, cx, cy, isDragging, isTarget, customLanes, onMouseDown, onClick, onPortMouseDown, onContextMenu }: {
  step: ProcessStep; cx: number; cy: number;
  isDragging?: boolean; isTarget?: boolean;
  customLanes?: CustomLane[];
  onMouseDown?: (e: React.MouseEvent) => void;
  onClick?: () => void;
  onPortMouseDown?: (e: React.MouseEvent, side: ConnectionSide) => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}) {
  const [hov, setHov] = useState(false);
  const cfg = getLaneConfig(step.team, customLanes);
  const str = cfg.stroke;
  const label = step.label.length > 14 ? step.label.slice(0, 13) + "…" : step.label;

  return (
    <g style={{ opacity: isDragging ? 0.35 : 1, cursor: "move" }}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      onMouseDown={onMouseDown} onClick={onClick} onContextMenu={onContextMenu}>
      {isTarget && (
        <circle cx={cx} cy={cy} r={EVT_R + 6}
          fill="none" stroke={str} strokeWidth="2" strokeDasharray="5 3" opacity="0.7" />
      )}
      <circle cx={cx} cy={cy} r={EVT_R} fill="white" stroke={str} strokeWidth="1.5"
        style={{ filter: hov ? `drop-shadow(0 2px 8px ${str}88)` : undefined }} />
      <rect x={cx - 7} y={cy - 5} width="14" height="10" rx="1" fill={str}
        style={{ pointerEvents: "none" }} />
      <polyline points={`${cx - 7},${cy - 5} ${cx},${cy + 1} ${cx + 7},${cy - 5}`}
        stroke="white" strokeWidth="1.2" fill="none" style={{ pointerEvents: "none" }} />
      <text x={cx} y={cy + EVT_R + 10} textAnchor="middle" dominantBaseline="middle"
        fontSize="8" fontWeight="600" fill={str}
        style={{ pointerEvents: "none", fontFamily: "IBM Plex Sans, system-ui, sans-serif" }}>
        {label}
      </text>
      {hov && (
        <ConnectionPortHandles
          label={step.label}
          fill={str}
          ports={{
            top: { x: cx, y: cy - EVT_R },
            right: { x: cx + EVT_R, y: cy },
            bottom: { x: cx, y: cy + EVT_R },
            left: { x: cx - EVT_R, y: cy },
          }}
          onPortMouseDown={onPortMouseDown}
        />
      )}
    </g>
  );
}

// ── ReceiveCircle ─────────────────────────────────────────────────────────────

function ReceiveCircle({ step, cx, cy, isDragging, isTarget, customLanes, onMouseDown, onClick, onPortMouseDown, onContextMenu }: {
  step: ProcessStep; cx: number; cy: number;
  isDragging?: boolean; isTarget?: boolean;
  customLanes?: CustomLane[];
  onMouseDown?: (e: React.MouseEvent) => void;
  onClick?: () => void;
  onPortMouseDown?: (e: React.MouseEvent, side: ConnectionSide) => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}) {
  const [hov, setHov] = useState(false);
  const cfg = getLaneConfig(step.team, customLanes);
  const str = cfg.stroke;
  const label = step.label.length > 14 ? step.label.slice(0, 13) + "…" : step.label;

  return (
    <g style={{ opacity: isDragging ? 0.35 : 1, cursor: "move" }}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      onMouseDown={onMouseDown} onClick={onClick} onContextMenu={onContextMenu}>
      {isTarget && (
        <circle cx={cx} cy={cy} r={EVT_R + 6}
          fill="none" stroke={str} strokeWidth="2" strokeDasharray="5 3" opacity="0.7" />
      )}
      <circle cx={cx} cy={cy} r={EVT_R} fill="white" stroke={str} strokeWidth="1.5"
        style={{ filter: hov ? `drop-shadow(0 2px 8px ${str}88)` : undefined }} />
      <rect x={cx - 7} y={cy - 5} width="14" height="10" rx="1"
        fill="none" stroke={str} strokeWidth="1.2" style={{ pointerEvents: "none" }} />
      <polyline points={`${cx - 7},${cy - 5} ${cx},${cy + 1} ${cx + 7},${cy - 5}`}
        stroke={str} strokeWidth="1.2" fill="none" style={{ pointerEvents: "none" }} />
      <text x={cx} y={cy + EVT_R + 10} textAnchor="middle" dominantBaseline="middle"
        fontSize="8" fontWeight="600" fill={str}
        style={{ pointerEvents: "none", fontFamily: "IBM Plex Sans, system-ui, sans-serif" }}>
        {label}
      </text>
      {hov && (
        <ConnectionPortHandles
          label={step.label}
          fill={str}
          ports={{
            top: { x: cx, y: cy - EVT_R },
            right: { x: cx + EVT_R, y: cy },
            bottom: { x: cx, y: cy + EVT_R },
            left: { x: cx - EVT_R, y: cy },
          }}
          onPortMouseDown={onPortMouseDown}
        />
      )}
    </g>
  );
}

// Timer / wait event
function TimerCircle({ step, cx, cy, isDragging, isTarget, customLanes, onMouseDown, onClick, onPortMouseDown, onContextMenu }: {
  step: ProcessStep; cx: number; cy: number;
  isDragging?: boolean; isTarget?: boolean;
  customLanes?: CustomLane[];
  onMouseDown?: (e: React.MouseEvent) => void;
  onClick?: () => void;
  onPortMouseDown?: (e: React.MouseEvent, side: ConnectionSide) => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}) {
  const [hov, setHov] = useState(false);
  const cfg = getLaneConfig(step.team, customLanes);
  const str = cfg.stroke;
  const label = step.label.length > 16 ? step.label.slice(0, 15) + "…" : step.label;

  return (
    <g
      aria-label={`BPMN timer event ${step.label}`}
      style={{ opacity: isDragging ? 0.35 : 1, cursor: "move" }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      onMouseDown={onMouseDown}
      onClick={onClick}
      onContextMenu={onContextMenu}
    >
      {isTarget && (
        <circle cx={cx} cy={cy} r={EVT_R + 6}
          fill="none" stroke={str} strokeWidth="2" strokeDasharray="5 3" opacity="0.7" />
      )}
      <circle cx={cx} cy={cy} r={EVT_R} fill="white" stroke={str} strokeWidth="1.5"
        style={{ filter: hov ? `drop-shadow(0 2px 8px ${str}88)` : undefined }} />
      <circle cx={cx} cy={cy} r={EVT_R * 0.46} fill="none" stroke={str} strokeWidth="1.4"
        style={{ pointerEvents: "none" }} />
      <line x1={cx} y1={cy} x2={cx} y2={cy - EVT_R * 0.28}
        stroke={str} strokeWidth="1.4" strokeLinecap="round" style={{ pointerEvents: "none" }} />
      <line x1={cx} y1={cy} x2={cx + EVT_R * 0.32} y2={cy}
        stroke={str} strokeWidth="1.4" strokeLinecap="round" style={{ pointerEvents: "none" }} />
      <text x={cx} y={cy + EVT_R + 10} textAnchor="middle" dominantBaseline="middle"
        fontSize="8" fontWeight="600" fill={str}
        style={{ pointerEvents: "none", fontFamily: "IBM Plex Sans, system-ui, sans-serif" }}>
        {label}
      </text>
      {hov && (
        <ConnectionPortHandles
          label={step.label}
          fill={str}
          ports={{
            top: { x: cx, y: cy - EVT_R },
            right: { x: cx + EVT_R, y: cy },
            bottom: { x: cx, y: cy + EVT_R },
            left: { x: cx - EVT_R, y: cy },
          }}
          onPortMouseDown={onPortMouseDown}
        />
      )}
    </g>
  );
}

// ── AndDiamond ────────────────────────────────────────────────────────────────

function AndDiamond({ step, cx, cy, isDragging, isTarget, onClick, onPortMouseDown, onStepMouseDown, onContextMenu, customLanes }: {
  step: ProcessStep; cx: number; cy: number;
  isDragging?: boolean; isTarget?: boolean;
  onClick?: () => void;
  onPortMouseDown?: (e: React.MouseEvent, side: ConnectionSide) => void;
  onStepMouseDown?: (e: React.MouseEvent) => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  customLanes?: CustomLane[];
}) {
  const [hov, setHov] = useState(false);
  const cfg = getLaneConfig(step.team, customLanes);
  const h = DECISION_H;
  const pts = `${cx},${cy - h} ${cx + h},${cy} ${cx},${cy + h} ${cx - h},${cy}`;
  const ptsTarget = `${cx},${cy - h - 6} ${cx + h + 6},${cy} ${cx},${cy + h + 6} ${cx - h - 6},${cy}`;
  const label = step.label.length > 13 ? step.label.slice(0, 12) + "…" : step.label;

  return (
    <g style={{ opacity: isDragging ? 0.3 : 1 }}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      onContextMenu={onContextMenu}>
      {isTarget && (
        <polygon points={ptsTarget} fill="none" stroke={cfg.stroke}
          strokeWidth="2" strokeDasharray="5 3" opacity="0.7" />
      )}
      <polygon
        points={pts}
        fill="white"
        stroke={hov ? cfg.stroke : "#cbd5e1"}
        strokeWidth={hov ? 2 : 1.5}
        style={{ cursor: "pointer", filter: hov ? "drop-shadow(0 2px 6px rgba(0,0,0,.1))" : undefined }}
        onMouseDown={onStepMouseDown}
        onClick={onClick}
      />
      <line x1={cx} y1={cy - h * 0.55} x2={cx} y2={cy + h * 0.55}
        stroke={hov ? cfg.stroke : "#64748b"} strokeWidth="2" style={{ pointerEvents: "none" }} />
      <line x1={cx - h * 0.55} y1={cy} x2={cx + h * 0.55} y2={cy}
        stroke={hov ? cfg.stroke : "#64748b"} strokeWidth="2" style={{ pointerEvents: "none" }} />
      <text x={cx} y={cy + h + 10} textAnchor="middle" dominantBaseline="middle"
        fontSize="8" fontWeight="500" fill="#1e293b"
        style={{ pointerEvents: "none", fontFamily: "IBM Plex Sans, system-ui, sans-serif" }}>
        {label}
      </text>
      <ConnectionPortHandles
        label={step.label}
        fill={cfg.stroke}
        ports={{
          top: { x: cx, y: cy - h },
          right: { x: cx + h, y: cy },
          bottom: { x: cx, y: cy + h },
          left: { x: cx - h, y: cy },
        }}
        onPortMouseDown={onPortMouseDown}
      />
    </g>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────

function ProcessCanvasLegend() {
  const itemClass = "flex items-center gap-2 text-[11px] text-muted-foreground whitespace-nowrap";
  const iconClass = "relative inline-flex h-4 w-6 shrink-0 items-center justify-center";
  return (
    <div className="absolute bottom-0 left-0 right-0 z-10 border-t border-border bg-card/95 px-4 py-2 backdrop-blur-sm">
      <div className="flex items-center gap-4 overflow-x-auto">
        <span className="text-[11px] font-semibold text-foreground">Legenda</span>
        <span className={itemClass}>
          <span className="h-0.5 w-8 rounded-full" style={{ background: ROUTE_MAIN }} />
          Hoofdproces
        </span>
        <span className={itemClass}>
          <span className="h-0.5 w-8 border-t-2 border-dashed" style={{ borderColor: ROUTE_OPTIONAL }} />
          Correctie / optioneel
        </span>
        <span className={itemClass}>
          <span className="h-0.5 w-8 rounded-full" style={{ background: ROUTE_END }} />
          Uitzondering / einde
        </span>
        <span className={itemClass}>
          <span className="h-3 w-3 rounded-full border-2 border-green-600 bg-green-50" />
          Start/einde
        </span>
        <span className={itemClass}>
          <span className="h-3 w-3 rounded-full border-2 border-red-600 bg-red-600">
            <span className="m-[3px] block h-1.5 w-1.5 rounded-full bg-white" />
          </span>
          Terminate
        </span>
        <span className={itemClass}>
          <span className="relative h-3.5 w-3.5 rounded-full border border-slate-500 bg-white">
            <span className="absolute left-1/2 top-1.5 h-1.5 w-px -translate-x-1/2 bg-slate-500" />
            <span className="absolute left-1/2 top-1/2 h-px w-1.5 bg-slate-500" />
          </span>
          Timer
        </span>
        <span className={itemClass}>
          <span className={iconClass}>
            <span className="h-3 w-4 rounded-sm border border-slate-500 bg-white" />
            <span className="absolute left-[6px] top-[5px] h-1.5 w-2 rotate-45 border-b border-r border-slate-500" />
          </span>
          Bericht
        </span>
        <span className={itemClass}>
          <span className="h-3 w-5 rounded-sm border border-slate-300 bg-white" />
          Taak
        </span>
        <span className={itemClass}>
          <span className="h-3 w-5 rounded-sm border border-dashed border-orange-500 bg-white" />
          Optionele taak
        </span>
        <span className={itemClass}>
          <span className="h-3 w-3 rotate-45 border border-blue-500 bg-white" />
          Gateway
        </span>
        <span className={itemClass}>
          <span className="relative h-3 w-3 rotate-45 border border-blue-500 bg-white">
            <span className="absolute left-1/2 top-0.5 h-2 w-px -translate-x-1/2 bg-blue-500" />
            <span className="absolute left-0.5 top-1/2 h-px w-2 -translate-y-1/2 bg-blue-500" />
          </span>
          AND gateway
        </span>
        <span className={itemClass}>
          <span className="h-3 w-4 rounded-sm border border-slate-400 bg-slate-50" />
          Notitie
        </span>
        <span className={itemClass}>
          <span className={iconClass}>
            <span className="h-4 w-3 rounded-[2px] border border-blue-500 bg-blue-50" />
            <span className="absolute right-[7px] top-0 h-1.5 w-1.5 border-b border-l border-blue-500 bg-white" />
          </span>
          Data/document
        </span>
        <span className={itemClass}>
          <span className="flex h-4 w-3 items-center justify-center rounded-[50%/18%] border border-violet-500 bg-violet-50">
            <span className="h-2 w-2 rounded-[50%/18%] border border-violet-500" />
          </span>
          Databron
        </span>
        <span className={itemClass}>
          <span className="h-3.5 w-6 rounded border border-dashed border-amber-500 bg-amber-50" />
          Manual block
        </span>
      </div>
    </div>
  );
}

interface ProcessCanvasProps {
  steps: ProcessStep[];
  connections: Connection[];
  automations: Automation[];
  processActions?: ProcessAction[];
  attachments?: ProcessAttachment[];
  artifacts?: ProcessArtifact[];
  activeLanes?: string[];    // visible lane keys; undefined = all (TEAM_ORDER)
  customLanes?: CustomLane[];
  readOnly?: boolean;
  displayStyle?: "viewer";
  showLegend?: boolean;
  viewportScale?: number;
  disableInternalPan?: boolean;
  sourceMissingStepIds?: string[];
  selectedRouteType?: ConnectionRouteType;
  onRenameLane?: (laneKey: string) => void;
  onStepClick?: (s: ProcessStep) => void;
  onAutomationClick?: (a: Automation) => void;
  onAttachmentClick?: (attachment: ProcessAttachment) => void;
  onArtifactClick?: (artifact: ProcessArtifact) => void;
  onMoveAttachment?: (attachmentId: string, offset: { x: number; y: number }) => void;
  onUpdateAttachment?: (attachmentId: string, patch: Partial<Pick<ProcessAttachment, "label" | "description">>) => void;
  onDeleteAttachment?: (attachmentId: string) => void;
  onAddAttachment?: (type: ProcessAttachmentType, target: ProcessAttachmentTarget) => void;
  onMoveArtifact?: (artifactId: string, position: { x: number; y: number }) => void;
  onUpdateArtifact?: (
    artifactId: string,
    patch: Partial<Pick<ProcessArtifact, "title" | "description" | "position" | "size" | "association">>,
  ) => void;
  onDeleteArtifact?: (artifactId: string) => void;
  onAddConnection?: (
    fromId: string,
    toId: string,
    routeType?: ConnectionRouteType,
    fromSide?: ConnectionSide,
    toSide?: ConnectionSide,
    waypoints?: ConnectionWaypoint[],
  ) => void;
  onDeleteConnection?: (id: string) => void;
  onMoveStep?: (stepId: string, newTeam: string, newColumn: number, newRow: number) => void;
  onMoveStepToArtifact?: (stepId: string, artifactId: string) => void;
  onMoveManualStepToCanvas?: (
    artifactId: string,
    stepId: string,
    target: { team: string; column: number; row: number },
  ) => void;
  onReorderManualArtifactStep?: (artifactId: string, stepId: string, targetIndex: number) => void;
  onAttachAutomation?: (autoId: string, fromStepId: string, toStepId: string, order?: number, position?: number) => void;
  onAttachAutomationToStep?: (autoId: string, stepId: string, order: number) => void;
  onAttachAutomationToArtifact?: (autoId: string, artifactId: string) => void;
  onAttachProcessAction?: (actionId: string, fromStepId: string, toStepId: string, order?: number, position?: number) => void;
  onAttachProcessActionToStep?: (actionId: string, stepId: string, order: number) => void;
  onProcessActionClick?: (action: ProcessAction) => void;
  onAddStep?: (team: string, column: number, row: number, type?: ProcessStep["type"]) => void;
  onAddBranch?: (automationId: string, toStepId: string) => void;
  onUpdateConnectionLabel?: (connId: string, label: string) => void;
  onUpdateConnectionWaypoints?: (connId: string, waypoints: ConnectionWaypoint[]) => void;
  onParkStep?: (stepId: string) => void;
  onDeleteStep?: (stepId: string) => void;
  onPlaceStagedStep?: (step: ProcessStep, team: string, column: number, row: number) => void;
  onInsertRowAfter?: (team: string, afterRow: number) => void;
  onInsertMoveStep?: (stepId: string, team: string, column: number, afterRow: number) => void;
  onInsertAddStep?: (team: string, afterRow: number, column: number, type?: ProcessStep["type"]) => void;
  flows?: import("@/lib/types").Flow[];
  flowLinks?: Record<string, ProcessPlacementLink>;
  onAttachFlow?: (flowId: string, fromStepId: string, toStepId: string, order?: number, position?: number) => void;
  onAttachFlowToStep?: (flowId: string, stepId: string, order: number) => void;
  onAttachFlowToPipelineWide?: (flowId: string) => void;
  onFlowClick?: (flowId: string) => void;
}

// ── Main component ────────────────────────────────────────────────────────────

function renderManualExceptionBlock(
  artifact: ProcessArtifact,
  containedSteps: ProcessStep[],
  readOnly: boolean,
  editingField?: "title" | "description",
  onStartEditing?: (field: "title" | "description") => void,
  onStopEditing?: () => void,
  onUpdateArtifact?: ProcessCanvasProps["onUpdateArtifact"],
  onStepClick?: ProcessCanvasProps["onStepClick"],
) {
  const layout = manualExceptionTextLayout(artifact, containedSteps);
  const width = layout.width;
  const height = manualExceptionBlockHeight(artifact, containedSteps);
  const x = artifact.position.x;
  const y = artifact.position.y;

  return (
    <>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx={8}
        fill="#fff7ed"
        stroke="#d97706"
        strokeWidth={1.5}
        strokeDasharray="7 4"
      />
      <circle cx={x + 20} cy={y + 22} r={9} fill="#fffbeb" stroke="#d97706" strokeWidth={1.5} />
      <text x={x + 38} y={y + 24} fontSize={11} fontWeight={800} fill="#92400e"
        style={{ fontFamily: "IBM Plex Sans, system-ui, sans-serif", pointerEvents: "none" }}>
        Manual
      </text>
      {editingField === "title" && onUpdateArtifact ? (
        <foreignObject
          x={x + MANUAL_EXCEPTION_TEXT_PAD_X}
          y={y + MANUAL_EXCEPTION_TITLE_TOP - 3}
          width={layout.textWidth}
          height={Math.max(layout.titleHeight + 8, 28)}
          style={{ overflow: "visible" }}
        >
          <input
            aria-label="Manual exception titel"
            autoFocus
            value={artifact.title}
            onMouseDown={event => event.stopPropagation()}
            onClick={event => event.stopPropagation()}
            onDoubleClick={event => event.stopPropagation()}
            onChange={event => onUpdateArtifact(artifact.id, { title: event.target.value })}
            onBlur={() => onStopEditing?.()}
            onKeyDown={event => {
              if (event.key !== "Enter" && event.key !== "Escape") return;
              event.preventDefault();
              event.stopPropagation();
              onStopEditing?.();
            }}
            style={{
              background: "rgba(255,255,255,0.96)",
              border: "1px solid #f59e0b",
              borderRadius: 5,
              color: "#111827",
              fontFamily: "IBM Plex Sans, system-ui, sans-serif",
              fontSize: 12,
              fontWeight: 800,
              height: "100%",
              lineHeight: `${MANUAL_EXCEPTION_TITLE_LINE_H}px`,
              outline: "none",
              padding: "2px 6px",
              width: "100%",
            }}
          />
        </foreignObject>
      ) : (
        <foreignObject
          aria-label="Manual exception titel tekst"
          x={x + MANUAL_EXCEPTION_TEXT_PAD_X}
          y={y + MANUAL_EXCEPTION_TITLE_TOP}
          width={layout.textWidth}
          height={layout.titleHeight}
          onMouseDown={!readOnly && onStartEditing ? event => event.stopPropagation() : undefined}
          onDoubleClick={!readOnly && onStartEditing ? event => {
            event.preventDefault();
            event.stopPropagation();
            onStartEditing("title");
          } : undefined}
          style={{
            cursor: !readOnly && onStartEditing ? "text" : undefined,
            overflow: "visible",
            pointerEvents: !readOnly && onStartEditing ? "auto" : "none",
          }}
        >
          <div
            style={{
              color: "#111827",
              fontFamily: "IBM Plex Sans, system-ui, sans-serif",
              fontSize: 12,
              fontWeight: 800,
              lineHeight: `${MANUAL_EXCEPTION_TITLE_LINE_H}px`,
              overflow: "visible",
              overflowWrap: "anywhere",
              wordBreak: "break-word",
            }}
          >
            {artifact.title}
          </div>
        </foreignObject>
      )}
      {editingField === "description" && onUpdateArtifact ? (
        <foreignObject
          x={x + MANUAL_EXCEPTION_TEXT_PAD_X}
          y={y + layout.descriptionTop - 3}
          width={layout.textWidth}
          height={Math.max(layout.descriptionHeight + 10, 42)}
          style={{ overflow: "visible" }}
        >
          <textarea
            aria-label="Manual exception beschrijving"
            autoFocus
            value={artifact.description ?? ""}
            onMouseDown={event => event.stopPropagation()}
            onClick={event => event.stopPropagation()}
            onDoubleClick={event => event.stopPropagation()}
            onChange={event => onUpdateArtifact(artifact.id, { description: event.target.value })}
            onBlur={() => onStopEditing?.()}
            onKeyDown={event => {
              if (event.key === "Escape" || (event.key === "Enter" && event.ctrlKey)) {
                event.preventDefault();
                event.stopPropagation();
                onStopEditing?.();
              }
            }}
            style={{
              background: "rgba(255,255,255,0.96)",
              border: "1px solid #f59e0b",
              borderRadius: 5,
              color: "#78716c",
              fontFamily: "IBM Plex Sans, system-ui, sans-serif",
              fontSize: 11,
              height: "100%",
              lineHeight: `${MANUAL_EXCEPTION_DESCRIPTION_LINE_H}px`,
              outline: "none",
              padding: "4px 6px",
              resize: "none",
              width: "100%",
            }}
          />
        </foreignObject>
      ) : (
        <foreignObject
          aria-label="Manual exception beschrijving tekst"
          x={x + MANUAL_EXCEPTION_TEXT_PAD_X}
          y={y + layout.descriptionTop}
          width={layout.textWidth}
          height={layout.descriptionHeight}
          onMouseDown={!readOnly && onStartEditing ? event => event.stopPropagation() : undefined}
          onDoubleClick={!readOnly && onStartEditing ? event => {
            event.preventDefault();
            event.stopPropagation();
            onStartEditing("description");
          } : undefined}
          style={{
            cursor: !readOnly && onStartEditing ? "text" : undefined,
            overflow: "visible",
            pointerEvents: !readOnly && onStartEditing ? "auto" : "none",
          }}
        >
          <div
            style={{
              color: "#78716c",
              fontFamily: "IBM Plex Sans, system-ui, sans-serif",
              fontSize: 11,
              lineHeight: `${MANUAL_EXCEPTION_DESCRIPTION_LINE_H}px`,
              overflow: "visible",
              overflowWrap: "anywhere",
              wordBreak: "break-word",
            }}
          >
            {layout.description}
          </div>
        </foreignObject>
      )}
      {containedSteps.map((step, index) => {
        const stepX = x + width / 2;
        const previousHeight = layout.stepHeights
          .slice(0, index)
          .reduce((sum, itemHeight) => sum + itemHeight + MANUAL_EXCEPTION_STEP_GAP, 0);
        const stepHeight = layout.stepHeights[index] ?? STEP_H;
        const stepTop = y + layout.stepsTop + previousHeight;
        const stepY = stepTop + stepHeight / 2;
        return (
          <g
            key={step.id}
            role={!readOnly && onStepClick ? "button" : undefined}
            tabIndex={!readOnly && onStepClick ? 0 : undefined}
            aria-label={`Manual exception step ${step.label}`}
            data-manual-step-id={step.id}
            onClick={!readOnly && onStepClick ? event => {
              event.stopPropagation();
              onStepClick(step);
            } : undefined}
            onMouseDown={!readOnly && onStepClick ? event => event.stopPropagation() : undefined}
            onKeyDown={!readOnly && onStepClick ? event => {
              if (event.key !== "Enter" && event.key !== " ") return;
              event.preventDefault();
              event.stopPropagation();
              onStepClick(step);
            } : undefined}
            onDoubleClick={!readOnly && onStepClick ? event => event.stopPropagation() : undefined}
            style={{
              cursor: !readOnly && onStepClick ? "pointer" : undefined,
              pointerEvents: !readOnly && onStepClick ? "auto" : "none",
            }}
          >
            <rect
              x={stepX - STEP_W / 2}
              y={stepTop}
              width={STEP_W}
              height={stepHeight}
              rx={8}
              fill="white"
              stroke="#f59e0b"
              strokeWidth={1.4}
            />
            <rect
              x={stepX - STEP_W / 2}
              y={stepTop}
              width={4}
              height={stepHeight}
              rx={2}
              fill="#d97706"
            />
            <foreignObject
              x={stepX - STEP_W / 2 + 12}
              y={stepTop + MANUAL_EXCEPTION_STEP_PAD_Y}
              width={STEP_W - 24}
              height={stepHeight - MANUAL_EXCEPTION_STEP_PAD_Y * 2}
              style={{ pointerEvents: "none", overflow: "visible" }}
            >
              <div
                style={{
                  alignItems: "center",
                  color: "#1e293b",
                  display: "flex",
                  fontFamily: "IBM Plex Sans, system-ui, sans-serif",
                  fontSize: 9,
                  fontWeight: 600,
                  height: "100%",
                  justifyContent: "center",
                  lineHeight: `${MANUAL_EXCEPTION_STEP_LINE_H}px`,
                  overflow: "visible",
                  overflowWrap: "anywhere",
                  textAlign: "center",
                  wordBreak: "break-word",
                }}
              >
                {step.label}
              </div>
            </foreignObject>
          </g>
        );
      })}
    </>
  );
}

function renderAutomaticSyncBlock(
  artifact: ProcessArtifact,
  linkedAutomations: Automation[],
  linkedFlows: Flow[],
  readOnly: boolean,
  editingField?: "title" | "description",
  onStartEditing?: (field: "title" | "description") => void,
  onStopEditing?: () => void,
  onUpdateArtifact?: ProcessCanvasProps["onUpdateArtifact"],
) {
  const layout = automaticSyncTextLayout(artifact, linkedAutomations, linkedFlows);
  const width = layout.width;
  const height = automaticSyncBlockHeight(artifact, linkedAutomations, linkedFlows);
  const x = artifact.position.x;
  const y = artifact.position.y;
  const visibleAutomations = linkedAutomations.slice(0, 3);
  const remainingRows = Math.max(0, 4 - visibleAutomations.length);
  const visibleFlows = linkedFlows.slice(0, remainingRows);
  const hiddenCount = Math.max(0, linkedAutomations.length - visibleAutomations.length)
    + Math.max(0, linkedFlows.length - visibleFlows.length);

  return (
    <>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx={8}
        fill="#eff6ff"
        stroke="#2563eb"
        strokeWidth={1.5}
        strokeDasharray="7 4"
      />
      <circle cx={x + 20} cy={y + 22} r={9} fill="#dbeafe" stroke="#2563eb" strokeWidth={1.5} />
      <path
        d={`M ${x + 16} ${y + 22} H ${x + 24} M ${x + 21} ${y + 18} L ${x + 25} ${y + 22} L ${x + 21} ${y + 26}`}
        fill="none"
        stroke="#1d4ed8"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <text x={x + 38} y={y + 24} fontSize={11} fontWeight={800} fill="#1d4ed8"
        style={{ fontFamily: "IBM Plex Sans, system-ui, sans-serif", pointerEvents: "none" }}>
        Automatic sync
      </text>
      {editingField === "title" && onUpdateArtifact ? (
        <foreignObject
          x={x + MANUAL_EXCEPTION_TEXT_PAD_X}
          y={y + MANUAL_EXCEPTION_TITLE_TOP - 3}
          width={layout.textWidth}
          height={Math.max(layout.titleHeight + 8, 28)}
          style={{ overflow: "visible" }}
        >
          <input
            aria-label="Automatic sync titel"
            autoFocus
            value={artifact.title}
            onMouseDown={event => event.stopPropagation()}
            onClick={event => event.stopPropagation()}
            onDoubleClick={event => event.stopPropagation()}
            onChange={event => onUpdateArtifact(artifact.id, { title: event.target.value })}
            onBlur={() => onStopEditing?.()}
            onKeyDown={event => {
              if (event.key !== "Enter" && event.key !== "Escape") return;
              event.preventDefault();
              event.stopPropagation();
              onStopEditing?.();
            }}
            style={{
              background: "rgba(255,255,255,0.96)",
              border: "1px solid #60a5fa",
              borderRadius: 5,
              color: "#111827",
              fontFamily: "IBM Plex Sans, system-ui, sans-serif",
              fontSize: 12,
              fontWeight: 800,
              height: "100%",
              lineHeight: `${MANUAL_EXCEPTION_TITLE_LINE_H}px`,
              outline: "none",
              padding: "2px 6px",
              width: "100%",
            }}
          />
        </foreignObject>
      ) : (
        <foreignObject
          aria-label="Automatic sync titel tekst"
          x={x + MANUAL_EXCEPTION_TEXT_PAD_X}
          y={y + MANUAL_EXCEPTION_TITLE_TOP}
          width={layout.textWidth}
          height={layout.titleHeight}
          onMouseDown={!readOnly && onStartEditing ? event => event.stopPropagation() : undefined}
          onDoubleClick={!readOnly && onStartEditing ? event => {
            event.preventDefault();
            event.stopPropagation();
            onStartEditing("title");
          } : undefined}
          style={{
            cursor: !readOnly && onStartEditing ? "text" : undefined,
            overflow: "visible",
            pointerEvents: !readOnly && onStartEditing ? "auto" : "none",
          }}
        >
          <div
            style={{
              color: "#0f172a",
              fontFamily: "IBM Plex Sans, system-ui, sans-serif",
              fontSize: 12,
              fontWeight: 800,
              lineHeight: `${MANUAL_EXCEPTION_TITLE_LINE_H}px`,
              overflow: "visible",
              overflowWrap: "anywhere",
              wordBreak: "break-word",
            }}
          >
            {artifact.title}
          </div>
        </foreignObject>
      )}
      {editingField === "description" && onUpdateArtifact ? (
        <foreignObject
          x={x + MANUAL_EXCEPTION_TEXT_PAD_X}
          y={y + layout.descriptionTop - 3}
          width={layout.textWidth}
          height={Math.max(layout.descriptionHeight + 10, 42)}
          style={{ overflow: "visible" }}
        >
          <textarea
            aria-label="Automatic sync beschrijving"
            autoFocus
            value={artifact.description ?? ""}
            onMouseDown={event => event.stopPropagation()}
            onClick={event => event.stopPropagation()}
            onDoubleClick={event => event.stopPropagation()}
            onChange={event => onUpdateArtifact(artifact.id, { description: event.target.value })}
            onBlur={() => onStopEditing?.()}
            onKeyDown={event => {
              if (event.key === "Escape" || (event.key === "Enter" && event.ctrlKey)) {
                event.preventDefault();
                event.stopPropagation();
                onStopEditing?.();
              }
            }}
            style={{
              background: "rgba(255,255,255,0.96)",
              border: "1px solid #60a5fa",
              borderRadius: 5,
              color: "#475569",
              fontFamily: "IBM Plex Sans, system-ui, sans-serif",
              fontSize: 11,
              height: "100%",
              lineHeight: `${MANUAL_EXCEPTION_DESCRIPTION_LINE_H}px`,
              outline: "none",
              padding: "4px 6px",
              resize: "none",
              width: "100%",
            }}
          />
        </foreignObject>
      ) : (
        <foreignObject
          aria-label="Automatic sync beschrijving tekst"
          x={x + MANUAL_EXCEPTION_TEXT_PAD_X}
          y={y + layout.descriptionTop}
          width={layout.textWidth}
          height={layout.descriptionHeight}
          onMouseDown={!readOnly && onStartEditing ? event => event.stopPropagation() : undefined}
          onDoubleClick={!readOnly && onStartEditing ? event => {
            event.preventDefault();
            event.stopPropagation();
            onStartEditing("description");
          } : undefined}
          style={{
            cursor: !readOnly && onStartEditing ? "text" : undefined,
            overflow: "visible",
            pointerEvents: !readOnly && onStartEditing ? "auto" : "none",
          }}
        >
          <div
            style={{
              color: "#475569",
              fontFamily: "IBM Plex Sans, system-ui, sans-serif",
              fontSize: 11,
              lineHeight: `${MANUAL_EXCEPTION_DESCRIPTION_LINE_H}px`,
              overflow: "visible",
              overflowWrap: "anywhere",
              wordBreak: "break-word",
            }}
          >
            {layout.description}
          </div>
        </foreignObject>
      )}
      <foreignObject
        x={x + MANUAL_EXCEPTION_TEXT_PAD_X}
        y={y + layout.chipsTop}
        width={layout.textWidth}
        height={Math.max(24, height - layout.chipsTop - 10)}
        style={{ pointerEvents: "none", overflow: "visible" }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 5,
            fontFamily: "IBM Plex Sans, system-ui, sans-serif",
          }}
        >
          {visibleAutomations.length > 0 || visibleFlows.length > 0 ? (
            <>
              {visibleAutomations.map(automation => (
            <div
              key={automation.id}
              style={{
                background: "rgba(255,255,255,0.86)",
                border: "1px solid #bfdbfe",
                borderRadius: 5,
                color: "#1e3a8a",
                fontSize: 10,
                fontWeight: 700,
                lineHeight: "18px",
                overflow: "hidden",
                padding: "0 7px",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {automation.name}
            </div>
              ))}
              {visibleFlows.map(flow => (
                <div
                  key={flow.id}
                  aria-label={`Procesreis ${flow.naam} op Automatic sync`}
                  style={{
                    background: "rgba(255,255,255,0.9)",
                    border: "1px solid #93c5fd",
                    borderRadius: 5,
                    color: "#1d4ed8",
                    fontSize: 10,
                    fontWeight: 800,
                    lineHeight: "18px",
                    overflow: "hidden",
                    padding: "0 7px",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  Procesreis: {flow.naam}
                </div>
              ))}
            </>
          ) : (
            <div
              style={{
                border: "1px dashed #93c5fd",
                borderRadius: 5,
                color: "#2563eb",
                fontSize: 10,
                fontWeight: 700,
                lineHeight: "20px",
                padding: "0 7px",
              }}
            >
              Geen automation of procesreis gekoppeld
            </div>
          )}
          {hiddenCount > 0 && (
            <div style={{ color: "#2563eb", fontSize: 10, fontWeight: 800 }}>
              +{hiddenCount} gekoppelde items
            </div>
          )}
        </div>
      </foreignObject>
    </>
  );
}

export function ProcessCanvas({
  steps, connections, automations,
  processActions = [],
  attachments = [],
  artifacts = [],
  activeLanes, customLanes,
  readOnly = false,
  displayStyle,
  showLegend = true,
  viewportScale = 1,
  disableInternalPan = false,
  sourceMissingStepIds = [],
  selectedRouteType = "main",
  onRenameLane,
  onStepClick, onAutomationClick, onAttachmentClick,
  onArtifactClick,
  onMoveAttachment,
  onUpdateAttachment,
  onDeleteAttachment,
  onAddAttachment,
  onMoveArtifact,
  onUpdateArtifact,
  onDeleteArtifact,
  onAddConnection, onDeleteConnection,
  onMoveStep,
  onMoveStepToArtifact,
  onMoveManualStepToCanvas,
  onReorderManualArtifactStep,
  onAttachAutomation, onAttachAutomationToStep, onAttachAutomationToArtifact,
  onAttachProcessAction, onAttachProcessActionToStep, onProcessActionClick,
  onAddStep, onAddBranch, onUpdateConnectionLabel,
  onUpdateConnectionWaypoints,
  onParkStep, onDeleteStep, onPlaceStagedStep, onInsertRowAfter,
  onInsertMoveStep, onInsertAddStep,
  flows = [] as import("@/lib/types").Flow[],
  flowLinks = {} as Record<string, ProcessPlacementLink>,
  onAttachFlow,
  onAttachFlowToStep,
  onAttachFlowToPipelineWide,
  onFlowClick,
}: ProcessCanvasProps) {
  const viewerMode = displayStyle === "viewer";
  const svgRef = useRef<SVGSVGElement>(null);
  const [openStepPlacementOverflow, setOpenStepPlacementOverflow] = useState<string | null>(null);

  // Visible lanes — preset order + any custom lanes appended
  const visibleTeams = useMemo(
    () => resolveActiveLanes(activeLanes, customLanes),
    [activeLanes, customLanes],
  );

  const stepsById = useMemo(
    () => new Map(steps.map(step => [step.id, step])),
    [steps],
  );
  const automationById = useMemo(
    () => new Map(automations.map(automation => [automation.id, automation])),
    [automations],
  );
  const sourceMissingStepIdSet = useMemo(
    () => new Set(sourceMissingStepIds),
    [sourceMissingStepIds],
  );

  const pipelineWideAutomations = useMemo(
    () => automations
      .map((automation, index) => ({ automation, placement: pipelineWidePlacement(automation, index), index }))
      .filter((item): item is { automation: Automation; placement: NonNullable<ReturnType<typeof pipelineWidePlacement>>; index: number } =>
        item.placement !== null,
      )
      .sort((a, b) => placementOrder(a.placement, a.index) - placementOrder(b.placement, b.index)),
    [automations],
  );
  const pipelineHubReserve = pipelineWideAutomations.length
    ? PIPELINE_HUB_TOP_PAD + PIPELINE_HUB_BOTTOM_PAD
      + pipelineWideAutomations.length * PIPELINE_HUB_H
      + Math.max(0, pipelineWideAutomations.length - 1) * PIPELINE_HUB_GAP
    : 0;

  const manualStepIds = useMemo(() => {
    const ids = new Set<string>();
    for (const artifact of artifacts) {
      if (artifact.type !== "manualExceptionBlock") continue;
      artifact.stepIds?.forEach(stepId => ids.add(stepId));
    }
    return ids;
  }, [artifacts]);

  const canvasSteps = useMemo(
    () => {
      const visibleTeamSet = new Set(visibleTeams);
      return steps.filter(step => visibleTeamSet.has(step.team) && !manualStepIds.has(step.id));
    },
    [manualStepIds, steps, visibleTeams],
  );

  // Step-to-step connections only (not branch edges), excluding steps contained in manual blocks.
  const stepConnections = useMemo(
    () => connections.filter(c =>
      !!c.fromStepId
      && !c.fromAutomationId
      && !manualStepIds.has(c.fromStepId)
      && !manualStepIds.has(c.toStepId),
    ),
    [connections, manualStepIds],
  );

  // Branch edges only (automation -> step), excluding manual-contained targets from main-canvas rendering.
  const branchConnections = useMemo(
    () => connections.filter(c => !!c.fromAutomationId && !manualStepIds.has(c.toStepId)),
    [connections, manualStepIds],
  );

  const colX = useMemo(
    () => computeColX(canvasSteps, stepConnections, automations),
    [canvasSteps, stepConnections, automations],
  );

  const artifactTopPadding = useMemo(() => {
    return artifacts.reduce((padding, artifact) => {
      return Math.max(padding, -Math.min(artifact.position.y, 0));
    }, 0);
  }, [artifacts]);

  const artifactPoolBottom = useMemo(() => {
    return artifacts.reduce((bottom, artifact) => {
      return Math.max(bottom, artifact.position.y + artifactCanvasHeight(artifact, stepsById, automationById));
    }, 0);
  }, [artifacts, automationById, stepsById]);

  const laneHeights = useMemo(() => {
    const heights = Object.fromEntries(
      visibleTeams.map(team => [team, laneHeightFn(team, canvasSteps)]),
    ) as Record<string, number>;
    const lastTeam = visibleTeams.at(-1);
    if (!lastTeam) return heights;

    const currentPoolBottom = pipelineHubReserve + visibleTeams.reduce((sum, team) => sum + heights[team], 0);
    if (artifactPoolBottom > currentPoolBottom) {
      heights[lastTeam] += artifactPoolBottom - currentPoolBottom;
    }
    return heights;
  }, [artifactPoolBottom, canvasSteps, pipelineHubReserve, visibleTeams]);

  // Dynamic lane heights and starts (only for visible lanes)
  const laneStarts = useMemo(() => {
    const starts: Record<string, number> = {};
    let y = pipelineHubReserve;
    for (const team of visibleTeams) {
      starts[team] = y;
      y += laneHeights[team] ?? laneHeightFn(team, canvasSteps);
    }
    return starts;
  }, [canvasSteps, laneHeights, pipelineHubReserve, visibleTeams]);
  const svgHeight  = useMemo(
    () => pipelineHubReserve + visibleTeams.reduce((sum, t) => sum + (laneHeights[t] ?? laneHeightFn(t, canvasSteps)), 0),
    [canvasSteps, laneHeights, pipelineHubReserve, visibleTeams],
  );
  const artifactBounds = useMemo(() => {
    return artifacts.reduce(
      (bounds, artifact) => {
        const width = artifact.size?.width ?? (artifact.type === "automaticSyncBlock" ? 280 : MANUAL_EXCEPTION_DEFAULT_W);
        const height = artifactCanvasHeight(artifact, stepsById, automationById);
        return {
          width: Math.max(bounds.width, artifact.position.x + width + 260),
          height: Math.max(bounds.height, artifact.position.y + height),
        };
      },
      { width: 0, height: 0 },
    );
  }, [artifacts, automationById, stepsById]);

  const lastCol = colX.length - 1;
  const lastColHasTask = canvasSteps.some(s => s.column === lastCol && !isEvent(s));
  // Extra trailing space so there's always room to drag/add after the last step
  const svgWidth = colX.length
    ? colX[lastCol] + (lastColHasTask ? STEP_W / 2 : EVT_R) + EDGE_PAD + BASE_COL_W * 2 + STEP_W
    : 800;
  const canvasWidth = Math.max(svgWidth, artifactBounds.width);
  const canvasHeight = Math.max(svgHeight, artifactBounds.height);

  // Interaction state
  const [hoveredConn, setHoveredConn] = useState<string | null>(null);
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);
  const [drawing, setDrawing] = useState<{
    fromId: string; fromSide: ConnectionSide; fromX: number; fromY: number; curX: number; curY: number;
  } | null>(null);
  const [dragging, setDragging] = useState<{
    stepId: string; startX: number; startY: number; curX: number; curY: number; moved: boolean;
  } | null>(null);
  // Always-current ref — assigned in render body (not useEffect) so it's synchronously up-to-date
  const draggingRef = useRef(dragging);
  draggingRef.current = dragging;
  const onParkStepRef = useRef(onParkStep);
  onParkStepRef.current = onParkStep;
  const [newStepDrag, setNewStepDrag] = useState<{ col: number; team: string; row: number } | null>(null);
  const [drawingBranch, setDrawingBranch] = useState<{
    automationId: string; startX: number; startY: number; curX: number; curY: number;
  } | null>(null);
  const [contextMenu, setContextMenu] = useState<
    | { type: "conn"; connId: string; x: number; y: number }
    | { type: "step"; stepId: string; x: number; y: number }
    | { type: "attachment"; attachmentId: string; x: number; y: number }
    | { type: "artifact"; artifactId: string; x: number; y: number }
    | null
  >(null);
  const [editingLabel, setEditingLabel] = useState<{
    connId: string; x: number; y: number; value: string;
  } | null>(null);
  const [editingAttachmentId, setEditingAttachmentId] = useState<string | null>(null);
  const [editingManualArtifact, setEditingManualArtifact] = useState<{
    artifactId: string;
    field: "title" | "description";
  } | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const panningRef = useRef<{ startX: number; scrollLeft: number } | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [hoverSep, setHoverSep] = useState<{ team: string; afterRow: number } | null>(null);
  const waypointDragRef = useRef<{ connectionId: string; waypointIndex: number } | null>(null);
  const attachmentDragRef = useRef<{
    attachmentId: string;
    startPoint: Pt;
    startOffset: Pt;
  } | null>(null);
  const artifactDragRef = useRef<{
    artifactId: string;
    startPoint: Pt;
    startPosition: Pt;
  } | null>(null);
  const manualStepDragRef = useRef<{
    artifactId: string;
    stepId: string;
    mode: "sort" | "return";
    startPoint: Pt;
  } | null>(null);

  // Stagger offsets for parallel orthogonal connections sharing the same column corridor.
  // Groups connections by (fromColumn, toColumn). Within each group, orthogonal connections
  // (different rows) get a midX offset so their vertical segments don't overlap.
  const connOffsets = useMemo(() => {
    const groups = new Map<string, string[]>();
    for (const conn of stepConnections) {
      const from = canvasSteps.find(s => s.id === conn.fromStepId);
      const to   = canvasSteps.find(s => s.id === conn.toStepId);
      if (!from || !to) continue;
      if (from.team === to.team && stepRow(from) === stepRow(to)) continue; // same-row = straight, no overlap
      if (from.column === to.column) continue; // same-col = vertical, no midX
      const key = `${from.column}-${to.column}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(conn.id);
    }
    const offsets = new Map<string, number>();
    for (const ids of groups.values()) {
      if (ids.length < 2) continue; // single connection in corridor — no offset needed
      ids.forEach((id, i) => {
        offsets.set(id, (i - (ids.length - 1) / 2) * 16);
      });
    }
    return offsets;
  }, [canvasSteps, stepConnections]);

  // Build a map of automationId → SVG dot center position
  const autoPositions = useMemo(() => {
    const map = new Map<string, Pt>();
    for (const conn of stepConnections) {
      const from = canvasSteps.find(s => s.id === conn.fromStepId);
      const to   = canvasSteps.find(s => s.id === conn.toStepId);
      if (!from || !to || colX[from.column] === undefined || colX[to.column] === undefined) continue;
      const connAutos = automations.filter(a => a.fromStepId === conn.fromStepId && a.toStepId === conn.toStepId);
      if (!connAutos.length) continue;
      const arrow = buildConnectionArrow(conn, from, to, colX, laneStarts, connOffsets.get(conn.id) ?? 0);
      dotPositions(arrow.dotCenter, connAutos.length).forEach((pos, i) => {
        map.set(connAutos[i].id, pos);
      });
    }
    return map;
  }, [canvasSteps, stepConnections, automations, colX, laneStarts, connOffsets]);

  const stepAutomationPlacements = useMemo(() => {
    const byStep = new Map<string, Automation[]>();
    automations.forEach((automation, index) => {
      const placement = automationPlacement(automation, index);
      if (placement?.kind !== "step") return;
      const items = byStep.get(placement.stepId) ?? [];
      items.push(automation);
      byStep.set(placement.stepId, items);
    });
    for (const [stepId, items] of byStep) {
      byStep.set(stepId, [...items].sort((a, b) =>
        placementOrder(automationPlacement(a), 0) - placementOrder(automationPlacement(b), 0),
      ));
    }
    return byStep;
  }, [automations]);

  const stepFlowPlacements = useMemo(() => {
    const byStep = new Map<string, import("@/lib/types").Flow[]>();
    Object.entries(flowLinks).forEach(([flowId, link], index) => {
      const placement = normalizePlacementLink(link, index);
      if (placement.kind !== "step") return;
      const flow = flows.find(item => item.id === flowId);
      if (!flow) return;
      const items = byStep.get(placement.stepId) ?? [];
      items.push(flow);
      byStep.set(placement.stepId, items);
    });
    for (const [stepId, items] of byStep) {
      byStep.set(stepId, [...items].sort((a, b) => {
        const aPlacement = normalizePlacementLink(flowLinks[a.id], 0);
        const bPlacement = normalizePlacementLink(flowLinks[b.id], 0);
        return placementOrder(aPlacement, 0) - placementOrder(bPlacement, 0);
      }));
    }
    return byStep;
  }, [flowLinks, flows]);

  const stepProcessActionPlacements = useMemo(() => {
    const byStep = new Map<string, ProcessAction[]>();
    processActions.forEach((action, index) => {
      const placement = processActionPlacement(action, index);
      if (placement?.kind !== "step") return;
      const items = byStep.get(placement.stepId) ?? [];
      items.push(action);
      byStep.set(placement.stepId, items);
    });
    for (const [stepId, items] of byStep) {
      byStep.set(stepId, [...items].sort((a, b) =>
        placementOrder(processActionPlacement(a), 0) - placementOrder(processActionPlacement(b), 0),
      ));
    }
    return byStep;
  }, [processActions]);

  const attachmentPlacements = useMemo(() => {
    return attachments.flatMap((attachment) => {
      let anchor: Pt | null = null;

      if (attachment.attachedTo.kind === "step") {
        const step = canvasSteps.find(s => s.id === attachment.attachedTo.id);
        if (step) anchor = attachmentAnchorForStep(step, colX, laneStarts);
      } else {
        const conn = stepConnections.find(c => c.id === attachment.attachedTo.id);
        const from = conn ? canvasSteps.find(s => s.id === conn.fromStepId) : undefined;
        const to = conn ? canvasSteps.find(s => s.id === conn.toStepId) : undefined;
        if (conn && from && to && colX[from.column] !== undefined && colX[to.column] !== undefined) {
          anchor = buildConnectionArrow(conn, from, to, colX, laneStarts, connOffsets.get(conn.id) ?? 0).dotCenter;
        }
      }

      if (!anchor) return [];
      const offset = attachment.offset ?? attachmentDefaultOffset(attachment);
      return [{
        attachment,
        anchor,
        origin: {
          x: anchor.x + offset.x,
          y: anchor.y + offset.y,
        },
      }];
    });
  }, [attachments, canvasSteps, stepConnections, colX, laneStarts, connOffsets]);

  const clientToSvg = useCallback((clientX: number, clientY: number): Pt => {
    const svg = svgRef.current;
    if (!svg) return { x: clientX, y: clientY };
    const r = svg.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return { x: clientX, y: clientY };
    return {
      x: (clientX - r.left) * (canvasWidth / r.width),
      y:  (clientY - r.top) / viewportScale - artifactTopPadding,
    };
  }, [artifactTopPadding, canvasWidth, viewportScale]);

  const toSvg = useCallback((e: React.MouseEvent): Pt => {
    return clientToSvg(e.clientX, e.clientY);
  }, [clientToSvg]);

  const handleStepPlacementDragOver = useCallback((e: React.DragEvent<SVGGElement>) => {
    if (readOnly) return;
    if (
      !e.dataTransfer.types.includes("automationid")
      && !e.dataTransfer.types.includes("flowid")
      && !e.dataTransfer.types.includes("processactionid")
    ) return;
    e.preventDefault();
    e.stopPropagation();
  }, [readOnly]);

  const handleStepPlacementDrop = useCallback((e: React.DragEvent<SVGGElement>, step: ProcessStep) => {
    if (readOnly) return;
    const autoId = e.dataTransfer.getData("automationId");
    const flowId = e.dataTransfer.getData("flowId");
    const processActionId = e.dataTransfer.getData("processActionId");
    if (!autoId && !flowId && !processActionId) return;

    const dropPoint = clientToSvg(e.clientX, e.clientY);
    const nearestRoute = stepConnections.reduce<{
      conn: Connection;
      arrow: ArrowData;
      distance: number;
    } | null>((best, conn) => {
      const from = canvasSteps.find(s => s.id === conn.fromStepId);
      const to = canvasSteps.find(s => s.id === conn.toStepId);
      if (!from || !to || colX[from.column] === undefined || colX[to.column] === undefined) return best;
      const arrow = buildConnectionArrow(conn, from, to, colX, laneStarts, connOffsets.get(conn.id) ?? 0);
      const distance = distanceToRoute(arrow.points, dropPoint);
      if (!Number.isFinite(distance) || distance > ROUTE_DROP_TOLERANCE) return best;
      if (best && best.distance <= distance) return best;
      return { conn, arrow, distance };
    }, null);

    if (nearestRoute) {
      e.preventDefault();
      e.stopPropagation();
      if (flowId && nearestRoute.conn.fromStepId && nearestRoute.conn.toStepId) {
        const existingFlowCount = Object.entries(flowLinks).filter(([id, link]) =>
          id !== flowId && isConnectionPlacement(link, nearestRoute.conn.fromStepId, nearestRoute.conn.toStepId)
        ).length;
        const connectionOrder = insertionOrderFromRouteDrop(nearestRoute.arrow.points, dropPoint, existingFlowCount);
        const connectionPosition = routePositionFromDrop(nearestRoute.arrow.points, dropPoint);
        onAttachFlow?.(flowId, nearestRoute.conn.fromStepId, nearestRoute.conn.toStepId, connectionOrder, connectionPosition);
        return;
      }
      if (autoId) {
        const existingAutomationCount = automations.filter((automation, index) => {
          const placement = automationPlacement(automation, index);
          return automation.id !== autoId
            && placement?.kind === "connection"
            && placement.fromStepId === nearestRoute.conn.fromStepId
            && placement.toStepId === nearestRoute.conn.toStepId;
        }).length;
        const connectionOrder = insertionOrderFromRouteDrop(nearestRoute.arrow.points, dropPoint, existingAutomationCount);
        const connectionPosition = routePositionFromDrop(nearestRoute.arrow.points, dropPoint);
        onAttachAutomation?.(autoId, nearestRoute.conn.fromStepId, nearestRoute.conn.toStepId, connectionOrder, connectionPosition);
        return;
      }
      if (processActionId) {
        const existingActionCount = processActions.filter((action, index) => {
          const placement = processActionPlacement(action, index);
          return action.id !== processActionId
            && placement?.kind === "connection"
            && placement.fromStepId === nearestRoute.conn.fromStepId
            && placement.toStepId === nearestRoute.conn.toStepId;
        }).length;
        const connectionOrder = insertionOrderFromRouteDrop(nearestRoute.arrow.points, dropPoint, existingActionCount);
        const connectionPosition = routePositionFromDrop(nearestRoute.arrow.points, dropPoint);
        onAttachProcessAction?.(processActionId, nearestRoute.conn.fromStepId, nearestRoute.conn.toStepId, connectionOrder, connectionPosition);
        return;
      }
    }

    e.preventDefault();
    e.stopPropagation();
    const order = (stepAutomationPlacements.get(step.id)?.length ?? 0)
      + (stepFlowPlacements.get(step.id)?.length ?? 0)
      + (stepProcessActionPlacements.get(step.id)?.length ?? 0);
    if (autoId) {
      onAttachAutomationToStep?.(autoId, step.id, order);
      return;
    }
    if (flowId) {
      onAttachFlowToStep?.(flowId, step.id, order);
      return;
    }
    if (processActionId) {
      onAttachProcessActionToStep?.(processActionId, step.id, order);
    }
  }, [
    automations,
    canvasSteps,
    clientToSvg,
    colX,
    connOffsets,
    flowLinks,
    laneStarts,
    onAttachAutomation,
    onAttachAutomationToStep,
    onAttachFlow,
    onAttachFlowToStep,
    onAttachProcessAction,
    onAttachProcessActionToStep,
    processActions,
    readOnly,
    stepAutomationPlacements,
    stepConnections,
    stepFlowPlacements,
    stepProcessActionPlacements,
  ]);

  useEffect(() => {
    function onGlobalMove(e: MouseEvent) {
      const drag = attachmentDragRef.current;
      const artifactDrag = artifactDragRef.current;
      if (!drag && !artifactDrag) return;
      if (drag && (readOnly || !onMoveAttachment)) {
        attachmentDragRef.current = null;
      }
      if (artifactDrag && (readOnly || !onMoveArtifact)) {
        artifactDragRef.current = null;
      }

      const pt = clientToSvg(e.clientX, e.clientY);
      if (drag && !readOnly && onMoveAttachment) {
        onMoveAttachment(drag.attachmentId, {
          x: drag.startOffset.x + pt.x - drag.startPoint.x,
          y: drag.startOffset.y + pt.y - drag.startPoint.y,
        });
      }
      if (artifactDrag && !readOnly && onMoveArtifact) {
        onMoveArtifact(artifactDrag.artifactId, {
          x: artifactDrag.startPosition.x + pt.x - artifactDrag.startPoint.x,
          y: artifactDrag.startPosition.y + pt.y - artifactDrag.startPoint.y,
        });
      }
    }

    function onGlobalUp() {
      attachmentDragRef.current = null;
      artifactDragRef.current = null;
    }

    window.addEventListener("mousemove", onGlobalMove);
    window.addEventListener("mouseup", onGlobalUp);
    return () => {
      window.removeEventListener("mousemove", onGlobalMove);
      window.removeEventListener("mouseup", onGlobalUp);
    };
  }, [clientToSvg, onMoveArtifact, onMoveAttachment, readOnly]);

  useEffect(() => {
    function onGlobalMove(e: MouseEvent) {
      const drag = waypointDragRef.current;
      if (readOnly || !drag || !onUpdateConnectionWaypoints) return;
      const connection = connections.find(c => c.id === drag.connectionId);
      if (!connection) return;
      const from = canvasSteps.find(s => s.id === connection.fromStepId);
      const to = canvasSteps.find(s => s.id === connection.toStepId);
      if (!from || !to || colX[from.column] === undefined || colX[to.column] === undefined) return;
      const waypoints = [...editableWaypointsForConnection(connection, from, to, colX, laneStarts)];
      if (drag.waypointIndex >= waypoints.length) return;
      waypoints[drag.waypointIndex] = snapPointToRoutingGrid(clientToSvg(e.clientX, e.clientY));
      onUpdateConnectionWaypoints(drag.connectionId, waypoints);
    }

    function onGlobalUp() {
      waypointDragRef.current = null;
    }

    window.addEventListener("mousemove", onGlobalMove);
    window.addEventListener("mouseup", onGlobalUp);
    return () => {
      window.removeEventListener("mousemove", onGlobalMove);
      window.removeEventListener("mouseup", onGlobalUp);
    };
  }, [canvasSteps, clientToSvg, colX, connections, laneStarts, onUpdateConnectionWaypoints, readOnly]);

  // Cancel drawing/dragging if mouse released outside the SVG
  useEffect(() => {
    function onGlobalUp() {
      setDragging(null);
      setDrawing(null);
      setDrawingBranch(null);
      waypointDragRef.current = null;
    }
    window.addEventListener("mouseup", onGlobalUp);
    return () => window.removeEventListener("mouseup", onGlobalUp);
  }, []);

  // Track cursor position during drag even outside the SVG
  useEffect(() => {
    if (!dragging) return;
    function onGlobalMove(e: MouseEvent) {
      const pt = clientToSvg(e.clientX, e.clientY);
      setDragging(d => d
        ? { ...d, curX: pt.x, curY: pt.y, moved: d.moved || Math.hypot(pt.x - d.startX, pt.y - d.startY) > 6 }
        : null
      );
    }
    window.addEventListener("mousemove", onGlobalMove);
    return () => window.removeEventListener("mousemove", onGlobalMove);
  }, [dragging?.stepId, clientToSvg]); // eslint-disable-line react-hooks/exhaustive-deps

  const setDragCleanupState = useCallback(() => {
    setDrawing(null);
    setDrawingBranch(null);
    setHoverSep(null);
    waypointDragRef.current = null;
  }, []);

  // Returns the pixel X for an existing column, or the next new column position.
  // New column is placed just after the last step's right edge + standard padding.
  const getColX = useCallback((col: number): number | undefined => {
    if (col < colX.length) return colX[col];
    if (col === colX.length)
      return colX.length > 0
        ? colX[colX.length - 1] + STEP_W / 2 + EDGE_PAD * 2 + STEP_W / 2
        : LANE_HDR_W + STEP_W / 2 + EDGE_PAD;
    return undefined;
  }, [colX]);

  const nearestCol = useCallback((x: number): number => {
    let best = 0, bestDist = Infinity;
    colX.forEach((cx, i) => { const d = Math.abs(cx - x); if (d < bestDist) { bestDist = d; best = i; } });
    // Also allow snapping to a new column one step to the right
    const newCX = getColX(colX.length)!;
    if (Math.abs(newCX - x) < bestDist) return colX.length;
    return best;
  }, [colX, getColX]);

  // Snap y → {team, row}, allowing one new row beyond current max.
  // preferredTeam: when dragging a step, keep it in its own lane even if the
  // cursor strays into the extension zone below that lane.
  const nearestTeamRow = useCallback((y: number, isEventDrag = false): { team: string; row: number } => {
    // Find the lane the cursor is currently in
    let best = visibleTeams[0];
    for (const team of visibleTeams) {
      if (y >= laneStarts[team]) best = team;
    }
    const laneStart = laneStarts[best];
    const lh        = laneHeights[best] ?? laneHeightFn(best, canvasSteps);
    const maxR      = maxRowInLane(best, canvasSteps);      // tasks: snap to task rows only
    const visualMaxR = Math.max(maxR, Math.max(0, Math.floor((lh - ROW_H / 2) / ROW_H)));

    // Events are row anchors themselves. They must stay where the cursor drops,
    // even when that row does not contain a task yet.
    const rawRow = (y - laneStart - ROW_H / 2) / ROW_H;
    const halfRow = Math.max(0, Math.round(rawRow * 2) / 2);
    if (isEventDrag) {
      return { team: best, row: halfRow };
    }

    // Bottom 35% of the lane = insert a new row
    if (y >= laneStart + lh - ROW_H * 0.35) {
      return { team: best, row: Math.max(maxR + 1, visualMaxR) };
    }

    // Snap to the nearest half-row (0, 0.5, 1, 1.5, …)
    return { team: best, row: Math.min(halfRow, visualMaxR) };
  }, [canvasSteps, laneHeights, laneStarts, visibleTeams]);

  const isValidCanvasDropPoint = useCallback((point: Pt): boolean => {
    return visibleTeams.length > 0
      && point.x >= LANE_HDR_W
      && point.x <= canvasWidth
      && point.y >= 0
      && point.y < svgHeight;
  }, [canvasWidth, svgHeight, visibleTeams.length]);

  const dropTargetFromPoint = useCallback((point: Pt, step?: ProcessStep): { team: string; column: number; row: number } | null => {
    if (!isValidCanvasDropPoint(point)) return null;
    const column = nearestCol(point.x);
    const { team, row } = nearestTeamRow(point.y, !!step && isEvent(step));
    return { team, column, row };
  }, [isValidCanvasDropPoint, nearestCol, nearestTeamRow]);

  const findArtifactDropTarget = useCallback((point: Pt): ProcessArtifact | null => {
    return artifacts.find((artifact) => {
      if (artifact.type !== "manualExceptionBlock") return false;
      const width = artifact.size?.width ?? MANUAL_EXCEPTION_DEFAULT_W;
      const containedSteps = (artifact.stepIds ?? [])
        .map(stepId => stepsById.get(stepId))
        .filter(Boolean) as ProcessStep[];
      const height = manualExceptionBlockHeight(artifact, containedSteps);
      return point.x >= artifact.position.x
        && point.x <= artifact.position.x + width
        && point.y >= artifact.position.y
        && point.y <= artifact.position.y + height;
    }) ?? null;
  }, [artifacts, stepsById]);

  const findAutomaticSyncDropTarget = useCallback((point: Pt): ProcessArtifact | null => {
    return artifacts.find((artifact) => {
      if (artifact.type !== "automaticSyncBlock") return false;
      const width = artifact.size?.width ?? 280;
      const height = artifactCanvasHeight(artifact, stepsById, automationById);
      return point.x >= artifact.position.x
        && point.x <= artifact.position.x + width
        && point.y >= artifact.position.y
        && point.y <= artifact.position.y + height;
    }) ?? null;
  }, [artifacts, automationById, stepsById]);

  const manualStepIndexAtPoint = useCallback((artifact: ProcessArtifact, point: Pt): number => {
    const containedSteps = (artifact.stepIds ?? [])
      .map(stepId => stepsById.get(stepId))
      .filter(Boolean) as ProcessStep[];
    if (!containedSteps.length) return 0;
    const layout = manualExceptionTextLayout(artifact, containedSteps);
    const relativeY = point.y - artifact.position.y - layout.stepsTop;
    let offset = 0;
    for (let index = 0; index < layout.stepHeights.length; index += 1) {
      const stepHeight = layout.stepHeights[index];
      if (relativeY <= offset + stepHeight + MANUAL_EXCEPTION_STEP_GAP / 2) return index;
      offset += stepHeight + MANUAL_EXCEPTION_STEP_GAP;
    }
    return containedSteps.length - 1;
  }, [stepsById]);

  const completeStepDragToManualArtifact = useCallback((d: NonNullable<typeof dragging>, point: Pt): boolean => {
    if (readOnly || !d.moved || !onMoveStepToArtifact) return false;
    const artifactTarget = findArtifactDropTarget(point);
    if (!artifactTarget) return false;
    onMoveStepToArtifact(d.stepId, artifactTarget.id);
    draggingRef.current = null;
    setDragging(null);
    setDragCleanupState();
    return true;
  }, [findArtifactDropTarget, onMoveStepToArtifact, readOnly, setDragCleanupState]);

  // Global mouseup: detect drag-to-right-of-SVG to park step in staging area.
  // Uses refs for dragging and onParkStep so this stable handler always sees current values.
  // 8px buffer prevents false positives when dropping exactly at the SVG's right edge.
  useEffect(() => {
    function onGlobalUp(e: MouseEvent) {
      const point = clientToSvg(e.clientX, e.clientY);
      const manualDrag = manualStepDragRef.current;
      if (manualDrag && !readOnly) {
        const targetArtifact = findArtifactDropTarget(point);
        if (
          manualDrag.mode === "sort"
          && targetArtifact?.id === manualDrag.artifactId
          && onReorderManualArtifactStep
        ) {
          onReorderManualArtifactStep(
            manualDrag.artifactId,
            manualDrag.stepId,
            manualStepIndexAtPoint(targetArtifact, point),
          );
        } else if (manualDrag.mode === "return" && !targetArtifact && onMoveManualStepToCanvas) {
          const manualStep = stepsById.get(manualDrag.stepId);
          const target = dropTargetFromPoint(point, manualStep);
          if (target) {
            onMoveManualStepToCanvas(manualDrag.artifactId, manualDrag.stepId, target);
          }
        }
        manualStepDragRef.current = null;
        setDragCleanupState();
        return;
      }
      manualStepDragRef.current = null;

      const d = draggingRef.current;
      if (d?.moved) {
        if (completeStepDragToManualArtifact(d, point)) {
          return;
        }
        const svgRect = svgRef.current?.getBoundingClientRect();
        if (svgRect && e.clientX > svgRect.right + 8) {
          onParkStepRef.current?.(d.stepId);
          draggingRef.current = null;
          setDragging(null);
          setDragCleanupState();
          return;
        }
      }
      draggingRef.current = null;
      setDragging(null);
      setDragCleanupState();
    }
    window.addEventListener("mouseup", onGlobalUp);
    return () => window.removeEventListener("mouseup", onGlobalUp);
  }, [
    clientToSvg,
    completeStepDragToManualArtifact,
    dropTargetFromPoint,
    findArtifactDropTarget,
    manualStepIndexAtPoint,
    onMoveManualStepToCanvas,
    onReorderManualArtifactStep,
    readOnly,
    setDragCleanupState,
    stepsById,
  ]);

  // Pan-to-scroll: global handlers read from refs so the effect is stable.
  useEffect(() => {
    function onGlobalMove(e: MouseEvent) {
      const p = panningRef.current;
      const container = scrollContainerRef.current;
      if (!p || !container) return;
      container.scrollLeft = p.scrollLeft - (e.clientX - p.startX);
    }
    function onGlobalUp() {
      if (panningRef.current) {
        panningRef.current = null;
        setIsPanning(false);
      }
    }
    window.addEventListener("mousemove", onGlobalMove);
    window.addEventListener("mouseup", onGlobalUp);
    return () => {
      window.removeEventListener("mousemove", onGlobalMove);
      window.removeEventListener("mouseup", onGlobalUp);
    };
  }, []);

  // Mouse handlers
  function handleAttachmentMouseDown(e: React.MouseEvent, attachment: ProcessAttachment) {
    if (readOnly || !onMoveAttachment || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();

    attachmentDragRef.current = {
      attachmentId: attachment.id,
      startPoint: toSvg(e),
      startOffset: attachment.offset ?? attachmentDefaultOffset(attachment),
    };
  }

  function handleArtifactMouseDown(e: React.MouseEvent, artifact: ProcessArtifact) {
    if (readOnly || !onMoveArtifact || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();

    artifactDragRef.current = {
      artifactId: artifact.id,
      startPoint: toSvg(e),
      startPosition: artifact.position,
    };
  }

  function handleManualStepMouseDown(
    e: React.MouseEvent<SVGElement>,
    artifact: ProcessArtifact,
    step: ProcessStep,
    mode: "sort" | "return",
  ) {
    if (readOnly || e.button !== 0) return;
    if (mode === "sort" && !onReorderManualArtifactStep) return;
    if (mode === "return" && !onMoveManualStepToCanvas) return;
    e.preventDefault();
    e.stopPropagation();

    manualStepDragRef.current = {
      artifactId: artifact.id,
      stepId: step.id,
      mode,
      startPoint: toSvg(e),
    };
  }

  function handlePortMouseDown(e: React.MouseEvent, step: ProcessStep, side: ConnectionSide = "right") {
    if (readOnly) return;
    e.stopPropagation();
    const pt  = toSvg(e);
    const port = connectionPoint(step, side, colX, laneStarts);
    setDrawing({
      fromId: step.id,
      fromSide: side,
      fromX: port.x,
      fromY: port.y,
      curX: pt.x,
      curY: pt.y,
    });
  }

  function handleStepMouseDown(e: React.MouseEvent, step: ProcessStep) {
    if (readOnly) return;
    if (e.button !== 0) return;
    const pt = toSvg(e);
    setDragging({ stepId: step.id, startX: pt.x, startY: pt.y, curX: pt.x, curY: pt.y, moved: false });
  }

  function selectStep(step: ProcessStep) {
    setSelectedConnectionId(null);
    onStepClick?.(step);
  }

  function handleMouseMove(e: React.MouseEvent) {
    if (panningRef.current) return;
    const pt = toSvg(e);
    if (drawing) setDrawing(d => d ? { ...d, curX: pt.x, curY: pt.y } : null);
    if (dragging) {
      const moved = dragging.moved || Math.hypot(pt.x - dragging.startX, pt.y - dragging.startY) > 6;
      setDragging(d => d ? { ...d, curX: pt.x, curY: pt.y, moved } : null);
    }
    if (drawingBranch) setDrawingBranch(d => d ? { ...d, curX: pt.x, curY: pt.y } : null);

    // Separator hover: viewer-style mode (static hover) OR active drag anywhere
    const canInsert = viewerMode && (onInsertRowAfter || onInsertMoveStep || onInsertAddStep);
    const isDraggingStep = !!(dragging && !drawing && !drawingBranch);
    if (canInsert && (!dragging || isDraggingStep)) {
      // Don't show separator when cursor is over an existing step node
      const overStep = canvasSteps.some(s => {
        const scx = colX[s.column] ?? 0;
        const scy = stepCY(s, laneStarts);
        const hw = isEvent(s) ? EVT_R + 4 : isDecision(s) ? DECISION_H + 4 : STEP_W / 2 + 4;
        const hh = isEvent(s) ? EVT_R + 4 : isDecision(s) ? DECISION_H + 4 : STEP_H / 2 + 4;
        return Math.abs(pt.x - scx) <= hw && Math.abs(pt.y - scy) <= hh;
      });
      if (overStep) { setHoverSep(null); return; }

      const SNAP = 14;
      let found = false;
      for (const team of visibleTeams) {
        const startY = laneStarts[team] ?? 0;
        const maxR = maxRowInLane(team, canvasSteps);
        const laneHasSteps = canvasSteps.some(s => s.team === team);
        for (let r = 0; r <= maxR; r++) {
          const lineY = startY + (r + 1) * ROW_H;
          if (Math.abs(pt.y - lineY) < SNAP) {
            if (laneHasSteps) { setHoverSep({ team, afterRow: r }); found = true; break; }
          }
        }
        if (found) break;
      }
      if (!found) setHoverSep(null);
    } else if (hoverSep) {
      setHoverSep(null);
    }
  }

  function handleMouseUp(e: React.MouseEvent) {
    const pt = toSvg(e);

    if (drawing) {
      if (!readOnly) {
        const portDrop = findPortDropTarget(canvasSteps, pt, colX, laneStarts, drawing.fromId);
        const target = portDrop?.step ?? findStepBodyDropTarget(canvasSteps, pt, colX, laneStarts, drawing.fromId);
        if (target) {
          const source = canvasSteps.find(s => s.id === drawing.fromId);
          const targetSide = portDrop?.side ?? (source
            ? connectionSideForDrop(source, target, pt, colX, laneStarts)
            : nearestConnectionSide(target, pt, colX, laneStarts));
          const waypoints = source
            ? defaultWaypointsForNewManualConnection(source, target, colX, laneStarts, drawing.fromSide, targetSide)
            : undefined;
          onAddConnection?.(drawing.fromId, target.id, selectedRouteType, drawing.fromSide, targetSide, waypoints);
        }
      }
      setDrawing(null);
    }

    if (drawingBranch) {
      if (!readOnly) {
        const portDrop = findPortDropTarget(canvasSteps, pt, colX, laneStarts);
        const target = portDrop?.step ?? findStepBodyDropTarget(canvasSteps, pt, colX, laneStarts);
        if (target) onAddBranch?.(drawingBranch.automationId, target.id);
      }
      setDrawingBranch(null);
    }

    if (dragging) {
      if (dragging.moved) {
        if (completeStepDragToManualArtifact(dragging, pt)) {
          return;
        }
        const col = nearestCol(dragging.curX);
        if (hoverSep && onInsertMoveStep) {
          // Drop on a divider line → insert between rows
          onInsertMoveStep(dragging.stepId, hoverSep.team, col, hoverSep.afterRow);
          setHoverSep(null);
        } else {
          const draggingStepData = canvasSteps.find(s => s.id === dragging.stepId);
          const { team, row } = nearestTeamRow(dragging.curY, !!draggingStepData && isEvent(draggingStepData));
          onMoveStep?.(dragging.stepId, team, col, row);
        }
      }
      setDragging(null);
    }
  }

  const draggingStep = dragging ? canvasSteps.find(s => s.id === dragging.stepId) : null;
  const dragTarget = dragging?.moved
    ? (() => {
        const { col: _col, ...teamRow } = { col: nearestCol(dragging.curX), ...nearestTeamRow(dragging.curY, !!draggingStep && isEvent(draggingStep)) };
        const effectiveRow = teamRow.row;
        return { col: _col, team: teamRow.team, row: effectiveRow };
      })()
    : null;
  const manualBlockDropTarget = dragging?.moved && !readOnly && onMoveStepToArtifact
    ? findArtifactDropTarget({ x: dragging.curX, y: dragging.curY })
    : null;

  // Show extension zone when cursor is targeting a new row
  const extensionTeam = dragTarget && dragTarget.row > maxRowInLane(dragTarget.team, canvasSteps)
    ? dragTarget.team : null;
  const legendReserve = showLegend ? CANVAS_LEGEND_H : 0;
  const effectiveSvgHeight = artifactTopPadding + Math.max(canvasHeight, svgHeight + (extensionTeam ? ROW_H : 0)) + legendReserve;
  const viewBoxMinY = -artifactTopPadding;

  const gridStyle = viewerMode ? {
    background: "#F8FAFC",
    backgroundImage: `repeating-linear-gradient(0deg, rgba(0,0,0,0.04) 0px, transparent 1px, transparent ${GRID_SIZE}px), repeating-linear-gradient(90deg, rgba(0,0,0,0.04) 0px, transparent 1px, transparent ${GRID_SIZE}px)`,
    backgroundSize: `${GRID_SIZE}px ${GRID_SIZE}px`,
  } : {};

  function renderRowSeparatorInsertIndicator() {
    if (!hoverSep || !viewerMode) return null;

    const lineY = (laneStarts[hoverSep.team] ?? 0) + (hoverSep.afterRow + 1) * ROW_H;
    const pillW = 80;
    const midX  = (LANE_HDR_W + canvasWidth) / 2;
    return (
      <g
        data-testid="row-separator-insert-indicator"
        style={{ cursor: "copy" }}
        onMouseDown={e => e.stopPropagation()}
        onDoubleClick={e => {
          e.stopPropagation();
          onInsertRowAfter?.(hoverSep.team, hoverSep.afterRow);
          setHoverSep(null);
        }}
      >
        <line
          x1={LANE_HDR_W}
          y1={lineY}
          x2={canvasWidth}
          y2={lineY}
          stroke="#3B82F6"
          strokeWidth={18}
          opacity={0}
          style={{ pointerEvents: "stroke" }}
        />
        <line
          x1={LANE_HDR_W}
          y1={lineY}
          x2={canvasWidth}
          y2={lineY}
          stroke="#3B82F6"
          strokeWidth={1.5}
          strokeDasharray="6 4"
          opacity={0.6}
          style={{ pointerEvents: "none" }}
        />
        <rect
          x={midX - pillW / 2}
          y={lineY - 11}
          width={pillW}
          height={22}
          rx="11"
          fill="#3B82F6"
        />
        <text
          x={midX}
          y={lineY + 1}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize="11"
          fontWeight="700"
          fill="white"
          style={{ pointerEvents: "none", userSelect: "none" }}
        >
          + Stap
        </text>
      </g>
    );
  }

  return (
    <div className="relative w-full bg-card" style={gridStyle}>
      <div ref={scrollContainerRef} className="overflow-x-auto overflow-y-hidden w-full" style={{ height: effectiveSvgHeight }}>
        <svg ref={svgRef} width={canvasWidth} height={effectiveSvgHeight} viewBox={`0 ${viewBoxMinY} ${canvasWidth} ${effectiveSvgHeight}`}
        onMouseMove={handleMouseMove} onMouseUp={handleMouseUp}
        onMouseLeave={() => { setDrawing(null); setDrawingBranch(null); }}
        onClick={() => {
          setSelectedConnectionId(null);
          setContextMenu(null);
          setEditingAttachmentId(null);
          setEditingManualArtifact(null);
        }}
        onMouseDown={e => {
          if (disableInternalPan) return;
          if (e.button !== 0 || dragging || drawing || drawingBranch) return;
          const container = scrollContainerRef.current;
          if (!container) return;
          panningRef.current = { startX: e.clientX, scrollLeft: container.scrollLeft };
          setIsPanning(true);
        }}
        style={{ cursor: isPanning ? "grabbing" : "grab" }}
        onDragOver={e => {
          if (readOnly) return;
          const hasAutomation = e.dataTransfer.types.includes("automationid");
          const hasFlow = e.dataTransfer.types.includes("flowid");
          if (!e.dataTransfer.types.includes("newstep") && !e.dataTransfer.types.includes("stagedstep") && !hasAutomation && !hasFlow) return;
          e.preventDefault();
          if (hasAutomation || hasFlow) return;
          const pt = clientToSvg(e.clientX, e.clientY);
          const col = nearestCol(pt.x);
          const stepType = e.dataTransfer.getData("newStep") as ProcessStep["type"] | "";
          const { team, row } = nearestTeamRow(pt.y, isEventType(stepType));
          setNewStepDrag(prev =>
            prev?.col === col && prev.team === team && prev.row === row ? prev : { col, team, row }
          );
        }}
        onDragLeave={() => { setNewStepDrag(null); setHoverSep(null); }}
        onDrop={e => {
          if (readOnly) return;
          e.preventDefault();
          const pt  = clientToSvg(e.clientX, e.clientY);
          const col = nearestCol(pt.x);
          setNewStepDrag(null);

          const autoId = e.dataTransfer.getData("automationId");
          if (autoId && onAttachAutomationToArtifact) {
            const targetArtifact = findAutomaticSyncDropTarget(pt);
            if (targetArtifact) {
              onAttachAutomationToArtifact(autoId, targetArtifact.id);
              return;
            }
          }

          const flowId = e.dataTransfer.getData("flowId");
          if (flowId && onAttachFlowToPipelineWide) {
            const targetArtifact = findAutomaticSyncDropTarget(pt);
            if (targetArtifact) {
              onAttachFlowToPipelineWide(flowId);
              return;
            }
          }

          const stepType = e.dataTransfer.getData("newStep") as ProcessStep["type"] | "";

          // Divider-drop: insert between rows
          if (hoverSep) {
            setHoverSep(null);
            if (stepType && onInsertAddStep) {
              onInsertAddStep(hoverSep.team, hoverSep.afterRow, col, stepType as ProcessStep["type"]);
            } else if (stepType) {
              // fallback: place at the row below the divider
              onAddStep?.(hoverSep.team, col, hoverSep.afterRow + 1, stepType as ProcessStep["type"]);
            }
            return;
          }

          const { team, row } = nearestTeamRow(pt.y, isEventType(stepType));
          if (stepType) {
            onAddStep?.(team, col, row, stepType);
            return;
          }

          const stagedStepJson = e.dataTransfer.getData("stagedStep");
          if (stagedStepJson) {
            try {
              const step = JSON.parse(stagedStepJson);
              if (step && typeof step.id === "string" && typeof step.team === "string") {
                onPlaceStagedStep?.(step as ProcessStep, team, col, row);
              }
            } catch { /* ignore malformed data */ }
          }
        }}
        className="select-none block">

        <defs>
          {(["ah", "ah-h", "ah-d"] as const).map((id, i) => (
            <marker key={id} id={id} markerWidth="9" markerHeight="7" refX="8" refY="3.5" orient="auto">
              <polygon points="0 0, 9 3.5, 0 7" fill={i === 0 ? "#94a3b8" : "#3b82f6"} />
            </marker>
          ))}
          <marker id="ah-branch" markerWidth="9" markerHeight="7" refX="8" refY="3.5" orient="auto">
            <polygon points="0 0, 9 3.5, 0 7" fill={ROUTE_OPTIONAL} />
          </marker>
          <marker id="ah-main" markerWidth="9" markerHeight="7" refX="8" refY="3.5" orient="auto">
            <polygon points="0 0, 9 3.5, 0 7" fill={ROUTE_MAIN} />
          </marker>
          <marker id="ah-end" markerWidth="9" markerHeight="7" refX="8" refY="3.5" orient="auto">
            <polygon points="0 0, 9 3.5, 0 7" fill={ROUTE_END} />
          </marker>
        </defs>

        {/* ── Lane backgrounds (variable height, row dividers) ── */}
        {pipelineWideAutomations.length > 0 && (
          <g data-testid="pipeline-wide-automation-hubs">
            {pipelineWideAutomations.map(({ automation }, index) => {
              const hubX = Math.max(
                LANE_HDR_W + 18,
                Math.min(
                  canvasWidth - PIPELINE_HUB_W - 18,
                  LANE_HDR_W + (canvasWidth - LANE_HDR_W - PIPELINE_HUB_W) / 2,
                ),
              );
              return (
                <PipelineWideAutomationHub
                  key={automation.id}
                  auto={automation}
                  x={hubX}
                  y={PIPELINE_HUB_TOP_PAD + index * (PIPELINE_HUB_H + PIPELINE_HUB_GAP)}
                  index={index}
                  onClick={event => {
                    event.stopPropagation();
                    setSelectedConnectionId(null);
                    onAutomationClick?.(automation);
                  }}
                />
              );
            })}
          </g>
        )}

        <g data-testid="process-phase-bar">
        {visibleTeams.map((team, idx) => {
          const cfg    = getLaneConfig(team, customLanes);
          const startY = laneStarts[team];
          const lh     = laneHeights[team] ?? laneHeightFn(team, canvasSteps);
          const maxR   = maxRowInLane(team, canvasSteps);

          const laneAccent = VIEWER_LANE_COLORS[team] ?? cfg.stroke;

          return (
            <g key={team} aria-label={`Fase ${idx + 1}: ${cfg.label}`}>
              {viewerMode ? (
                <>
                  <rect x={0} y={startY} width={canvasWidth} height={lh} fill={laneAccent} fillOpacity={0.04} />
                  <rect x={0} y={startY} width={LANE_HDR_W} height={lh} fill={laneAccent} fillOpacity={0.1} />
                  <line x1={LANE_HDR_W} y1={startY} x2={LANE_HDR_W} y2={startY + lh} stroke="#E2E8F0" strokeWidth="0.5" />
                  <foreignObject
                    x={0} y={startY} width={LANE_HDR_W} height={lh}>
                    <div
                      onClick={onRenameLane ? () => onRenameLane(team) : undefined}
                      style={{
                        width: "100%", height: "100%",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        padding: "6px 4px", textAlign: "center",
                        fontSize: "9px", fontWeight: "700", letterSpacing: "0.6px",
                        textTransform: "uppercase", color: laneAccent,
                        lineHeight: 1.3, wordBreak: "break-word", overflowWrap: "break-word",
                        fontFamily: "IBM Plex Sans, system-ui, sans-serif", userSelect: "none",
                        cursor: onRenameLane ? "text" : undefined,
                      }}>
                      {cfg.label}
                    </div>
                  </foreignObject>
                  <line x1={0} y1={startY + lh} x2={canvasWidth} y2={startY + lh} stroke="#E2E8F0" strokeWidth="0.5" />
                  {Array.from({ length: maxR }, (_, r) => (
                    <line key={r}
                      x1={LANE_HDR_W} y1={startY + (r + 1) * ROW_H}
                      x2={canvasWidth}   y2={startY + (r + 1) * ROW_H}
                      stroke="#E2E8F0" strokeWidth="0.5" strokeDasharray="4 4" />
                  ))}
                </>
              ) : (
                <>
                  <rect x={0} y={startY} width={canvasWidth} height={lh} fill="#ffffff" />
                  <rect x={LANE_HDR_W} y={startY} width={canvasWidth - LANE_HDR_W} height={lh} fill={cfg.bg} fillOpacity={0.36} />

                  {/* Row dividers inside lane */}
                  {Array.from({ length: maxR }, (_, r) => (
                    <line key={r}
                      x1={LANE_HDR_W} y1={startY + (r + 1) * ROW_H}
                      x2={canvasWidth}   y2={startY + (r + 1) * ROW_H}
                      stroke="#e2e8f0" strokeWidth="1" strokeDasharray="6 4" />
                  ))}

                  <line x1={0} y1={startY + lh} x2={canvasWidth} y2={startY + lh}
                    stroke="#e2e8f0" strokeWidth="1" />
                  <rect x={0} y={startY} width={LANE_HDR_W} height={lh} fill={PHASE_BAR_BG} />
                  <rect x={0} y={startY} width={4} height={lh} fill={cfg.stroke} />
                  <line x1={LANE_HDR_W} y1={startY} x2={LANE_HDR_W} y2={startY + lh}
                    stroke="#bfdbfe" strokeWidth="1" />
                  <text x={LANE_HDR_W / 2} y={startY + Math.min(36, lh / 2)}
                    textAnchor="middle" dominantBaseline="middle"
                    fontSize="26" fontWeight="800" fill="white"
                    style={{ fontFamily: "IBM Plex Sans, system-ui, sans-serif" }}>
                    {idx + 1}
                  </text>
                  <foreignObject x={10} y={startY + Math.min(50, lh - 32)} width={LANE_HDR_W - 20} height={Math.max(24, lh - 50)}>
                      <div
                        style={{
                          alignItems: "center",
                          color: "white",
                          display: "flex",
                          fontFamily: "IBM Plex Sans, system-ui, sans-serif",
                          fontSize: 13,
                          fontWeight: 700,
                          height: "100%",
                          justifyContent: "center",
                          lineHeight: 1.15,
                          overflowWrap: "anywhere",
                          textAlign: "center",
                        }}
                      >
                        {cfg.label}
                      </div>
                    </foreignObject>
                </>
              )}
            </g>
          );
        })}
        </g>

        {/* ── Extension zone: ghost row below lane when dragging to a new row ── */}
        {extensionTeam && (() => {
          const cfg    = getLaneConfig(extensionTeam, customLanes);
          const startY = laneStarts[extensionTeam];
          const lh     = laneHeights[extensionTeam] ?? laneHeightFn(extensionTeam, canvasSteps);
          return (
            <g>
              <rect x={0} y={startY + lh} width={canvasWidth} height={ROW_H}
                fill={cfg.bg} fillOpacity={0.6} />
              <rect x={0} y={startY + lh} width={4} height={ROW_H} fill={cfg.stroke} />
              <rect x={4} y={startY + lh} width={LANE_HDR_W - 4} height={ROW_H} fill={PHASE_BAR_BG} fillOpacity={0.9} />
              <rect x={LANE_HDR_W} y={startY + lh} width={canvasWidth - LANE_HDR_W} height={ROW_H}
                fill="none" stroke={cfg.stroke} strokeWidth={1.5} strokeDasharray="8 4" opacity={0.5} />
            </g>
          );
        })()}

        {/* ── Row-separator insert indicator sits below routes/handles so they keep click priority ── */}
        {renderRowSeparatorInsertIndicator()}

        {/* ── Connections (step-to-step only) ── */}
        {orderedStepConnectionsForRender(stepConnections, selectedConnectionId).map(conn => {
          const from = canvasSteps.find(s => s.id === conn.fromStepId);
          const to   = canvasSteps.find(s => s.id === conn.toStepId);
          if (!from || !to || colX[from.column] === undefined || colX[to.column] === undefined) return null;
          const arrow = buildConnectionArrow(conn, from, to, colX, laneStarts, connOffsets.get(conn.id) ?? 0);
          const isHov = hoveredConn === conn.id;
          const isSelected = selectedConnectionId === conn.id;
          const isEditSelected = !readOnly && isSelected;
          const isViewerSelected = readOnly && isSelected;
          const connAutos = automations
            .filter((automation, index) => {
              const placement = automationPlacement(automation, index);
              return placement?.kind === "connection"
                && placement.fromStepId === conn.fromStepId
                && placement.toStepId === conn.toStepId;
            })
            .sort((a, b) => placementOrder(automationPlacement(a), 0) - placementOrder(automationPlacement(b), 0));
          const hasAuto = connAutos.length > 0;
          const type = resolveRouteType(conn, from, to);
          const isEndRoute = type === "end";
          const isOptionalRoute = type === "optional";
          const mainStroke = isViewerSelected ? ROUTE_VIEWER_SELECTED : routeStroke(type, isHov || isEditSelected);
          const markerId = routeMarker(type);
          const postStroke = isEndRoute ? ROUTE_END : ROUTE_OPTIONAL;
          const labelForRoute = routeLabel(type, conn.manual);
          const splitForAutomation = hasAuto && !conn.manual && !conn.routeType;
          const effectiveWaypoints = editableWaypointsForConnection(conn, from, to, colX, laneStarts);
          const handleWaypoints = isEditSelected && conn.manual && onUpdateConnectionWaypoints
            ? effectiveWaypoints
            : [];
          const bendInsertionTargets = isEditSelected && conn.manual && onUpdateConnectionWaypoints
            ? buildBendInsertionTargets(effectiveWaypoints, arrow.postDotMid)
            : [];
          const mid = arrow.postDotMid;
          const isEditingPost = !readOnly && editingLabel?.connId === conn.id;
          const postLabelText = conn.label || "";
          const postEstW = Math.max(80, (postLabelText.length) * 5.5 + 16);
          const selectConnection = () => {
            setSelectedConnectionId(conn.id);
            if (!readOnly && !conn.manual) setEditingLabel({ connId: conn.id, x: mid.x, y: mid.y, value: conn.label ?? "" });
          };
          return (
            <g
              key={conn.id}
              data-route-id={conn.id}
              data-route-selected={isSelected ? "true" : undefined}
            >
              {/* Pre-dot segment always in gray; post-dot in amber dashed when automation sits on this connection */}
              {splitForAutomation ? (
                <>
                  {isEditSelected && (
                    <>
                      <path
                        d={arrow.preDotPath}
                        stroke="#ffffff"
                        strokeWidth={routeFocusOutlineStrokeWidth(isSelected)}
                        fill="none"
                        data-route-focus-outline="true"
                        style={{ pointerEvents: "none" }}
                      />
                      <path
                        d={arrow.postDotPath}
                        stroke="#ffffff"
                        strokeWidth={routeFocusOutlineStrokeWidth(isSelected)}
                        fill="none"
                        data-route-focus-outline="true"
                        style={{ pointerEvents: "none" }}
                      />
                    </>
                  )}
                  {isViewerSelected && (
                    <>
                      <path
                        d={arrow.preDotPath}
                        stroke={ROUTE_VIEWER_HALO}
                        strokeWidth="8"
                        fill="none"
                        opacity="0.42"
                        data-route-viewer-highlight="true"
                        style={{ pointerEvents: "none" }}
                      />
                      <path
                        d={arrow.postDotPath}
                        stroke={ROUTE_VIEWER_HALO}
                        strokeWidth="8"
                        fill="none"
                        opacity="0.42"
                        data-route-viewer-highlight="true"
                        style={{ pointerEvents: "none" }}
                      />
                    </>
                  )}
                  <path d={arrow.preDotPath} stroke={mainStroke} strokeWidth={routeVisibleStrokeWidth(isEditSelected)} fill="none"
                    aria-label={labelForRoute}
                    data-route-visible-path="true"
                    strokeDasharray={isHov ? "6 3" : undefined} style={{ pointerEvents: "none" }} />
                  <path d={arrow.postDotPath} stroke={isViewerSelected ? ROUTE_VIEWER_SELECTED : postStroke} strokeWidth={routeVisibleStrokeWidth(isEditSelected)} strokeDasharray={isEndRoute ? undefined : "5 3"} fill="none"
                    aria-label={isEndRoute ? labelForRoute : "correctie/optioneel route"}
                    data-route-visible-path="true"
                    markerEnd={`url(#${isEndRoute ? "ah-end" : "ah-branch"})`} opacity={0.9} style={{ pointerEvents: "none" }} />
                  {isViewerSelected && <RouteFlowDot path={arrow.path} length={arrow.length} />}
                  {/* Label on post-dot segment — edit input when active, badge when label is set */}
                  {isEditingPost ? (
                    <foreignObject x={mid.x - postEstW / 2} y={mid.y - 13} width={Math.max(postEstW, 120)} height={26}>
                      <input autoFocus value={editingLabel!.value}
                        onChange={e => setEditingLabel(prev => prev ? { ...prev, value: e.target.value } : null)}
                        onBlur={() => { onUpdateConnectionLabel?.(conn.id, editingLabel!.value); setEditingLabel(null); }}
                        onKeyDown={e => { if (e.key === "Enter" || e.key === "Escape") { onUpdateConnectionLabel?.(conn.id, editingLabel!.value); setEditingLabel(null); } }}
                        className="w-full h-full text-center text-[10px] font-medium bg-white border border-amber-300 rounded px-1 outline-none" />
                    </foreignObject>
                  ) : postLabelText ? (
                    <g style={{ pointerEvents: "none" }}>
                      <rect x={mid.x - postEstW / 2} y={mid.y - 6} width={postEstW} height={12}
                        fill="white" fillOpacity={0.92} rx={2} />
                      <text x={mid.x} y={mid.y} textAnchor="middle" dominantBaseline="middle"
                        fontSize={8} fontWeight={500} fill="#92400e">
                        {postLabelText}
                      </text>
                    </g>
                  ) : null}
                </>
              ) : (
                <>
                  {isEditSelected && (
                    <path
                      d={arrow.path}
                      stroke="#ffffff"
                      strokeWidth={routeFocusOutlineStrokeWidth(isSelected)}
                      fill="none"
                      data-route-focus-outline="true"
                      style={{ pointerEvents: "none" }}
                    />
                  )}
                  {isViewerSelected && (
                    <path
                      d={arrow.path}
                      stroke={ROUTE_VIEWER_HALO}
                      strokeWidth="8"
                      fill="none"
                      opacity="0.42"
                      data-route-viewer-highlight="true"
                      style={{ pointerEvents: "none" }}
                    />
                  )}
                  <path d={arrow.path} stroke={mainStroke} strokeWidth={routeVisibleStrokeWidth(isEditSelected)} fill="none"
                    aria-label={labelForRoute}
                    data-route-visible-path="true"
                    markerEnd={`url(#${markerId})`}
                    strokeDasharray={isOptionalRoute ? "5 3" : isHov ? "6 3" : undefined}
                    onClick={e => { e.stopPropagation(); selectConnection(); }}
                    style={{
                      filter: isSelected ? `drop-shadow(0 2px 5px ${mainStroke}55)` : undefined,
                      cursor: "pointer",
                      pointerEvents: "stroke",
                    }} />
                  {isViewerSelected && <RouteFlowDot path={arrow.path} length={arrow.length} />}
                </>
              )}
              <path d={arrow.path} stroke="transparent" strokeWidth="22" fill="none" className="cursor-pointer"
                onMouseEnter={() => setHoveredConn(conn.id)}
                onMouseLeave={() => setHoveredConn(null)}
                onClick={e => { e.stopPropagation(); selectConnection(); }}
                onContextMenu={readOnly ? undefined : e => { e.preventDefault(); e.stopPropagation(); setContextMenu({ type: "conn", connId: conn.id, x: e.clientX, y: e.clientY }); }}
                onDragOver={e => {
                  if (readOnly) return;
                  e.preventDefault();
                  const dropPoint = clientToSvg(e.clientX, e.clientY);
                  const routeDistance = distanceToRoute(arrow.points, dropPoint);
                  setHoveredConn(Number.isFinite(routeDistance) && routeDistance <= ROUTE_DROP_TOLERANCE ? conn.id : null);
                }}
                onDragLeave={() => setHoveredConn(null)}
                onDrop={e => {
                  if (readOnly) return;
                  e.preventDefault();
                  const dropPoint = clientToSvg(e.clientX, e.clientY);
                  const routeDistance = distanceToRoute(arrow.points, dropPoint);
                  if (!Number.isFinite(routeDistance) || routeDistance > ROUTE_DROP_TOLERANCE) {
                    setHoveredConn(null);
                    return;
                  }
                  const flowId = e.dataTransfer.getData("flowId");
                  if (flowId && conn.fromStepId && conn.toStepId) {
                    const existingFlowCount = Object.entries(flowLinks).filter(([id, link]) =>
                      id !== flowId && conn.fromStepId && isConnectionPlacement(link, conn.fromStepId, conn.toStepId)
                    ).length;
                    const connectionOrder = insertionOrderFromRouteDrop(arrow.points, dropPoint, existingFlowCount);
                    const connectionPosition = routePositionFromDrop(arrow.points, dropPoint);
                    onAttachFlow?.(flowId, conn.fromStepId, conn.toStepId, connectionOrder, connectionPosition);
                    setHoveredConn(null);
                    return;
                  }
                  const autoId = e.dataTransfer.getData("automationId");
                  if (autoId) {
                    const existingAutomationCount = automations.filter((automation, index) => {
                      const placement = automationPlacement(automation, index);
                      return automation.id !== autoId
                        && placement?.kind === "connection"
                        && placement.fromStepId === conn.fromStepId
                        && placement.toStepId === conn.toStepId;
                    }).length;
                    const connectionOrder = insertionOrderFromRouteDrop(arrow.points, dropPoint, existingAutomationCount);
                    const connectionPosition = routePositionFromDrop(arrow.points, dropPoint);
                    onAttachAutomation?.(autoId, conn.fromStepId, conn.toStepId, connectionOrder, connectionPosition);
                    setHoveredConn(null);
                    return;
                  }
                  const processActionId = e.dataTransfer.getData("processActionId");
                  if (processActionId) {
                    const existingActionCount = processActions.filter((action, index) => {
                      const placement = processActionPlacement(action, index);
                      return action.id !== processActionId
                        && placement?.kind === "connection"
                        && placement.fromStepId === conn.fromStepId
                        && placement.toStepId === conn.toStepId;
                    }).length;
                    const connectionOrder = insertionOrderFromRouteDrop(arrow.points, dropPoint, existingActionCount);
                    const connectionPosition = routePositionFromDrop(arrow.points, dropPoint);
                    onAttachProcessAction?.(processActionId, conn.fromStepId, conn.toStepId, connectionOrder, connectionPosition);
                  }
                  setHoveredConn(null);
                }} />
              {handleWaypoints.map((point, index) => (
                <g key={`${conn.id}-waypoint-${index}`}>
                  <circle
                    cx={point.x}
                    cy={point.y}
                    r={waypointOuterRadius(isSelected)}
                    fill="white"
                    stroke={mainStroke}
                    strokeWidth={1.5}
                  />
                  <circle
                    role="button"
                    aria-label={`Sleep knikpunt ${index + 1}`}
                    tabIndex={0}
                    cx={point.x}
                    cy={point.y}
                    r={waypointInnerRadius(isSelected)}
                    fill={mainStroke}
                    onMouseDown={e => {
                      e.preventDefault();
                      e.stopPropagation();
                      waypointDragRef.current = { connectionId: conn.id, waypointIndex: index };
                      setSelectedConnectionId(conn.id);
                    }}
                    style={{ cursor: "move" }}
                  />
                </g>
              ))}
              {bendInsertionTargets.map(({ point, insertIndex }, index) => (
                <g key={`${conn.id}-insert-${index}`}>
                  <circle
                    cx={point.x}
                    cy={point.y}
                    r={9}
                    fill="white"
                    stroke={mainStroke}
                    strokeWidth={1.5}
                    opacity={0.95}
                  />
                  <circle
                    role="button"
                    aria-label="Knikpunt toevoegen"
                    tabIndex={0}
                    cx={point.x}
                    cy={point.y}
                    r={5}
                    fill="white"
                    stroke={mainStroke}
                    strokeWidth={1.5}
                    onClick={e => {
                      e.preventDefault();
                      e.stopPropagation();
                      const next = [...effectiveWaypoints];
                      next.splice(insertIndex, 0, snapPointToRoutingGrid(point));
                      onUpdateConnectionWaypoints?.(conn.id, next);
                    }}
                    style={{ cursor: "copy" }}
                  />
                  <text
                    x={point.x}
                    y={point.y + 0.5}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize={8}
                    fontWeight={700}
                    fill={mainStroke}
                    style={{ pointerEvents: "none", fontFamily: "IBM Plex Sans, system-ui, sans-serif" }}
                  >
                    +
                  </text>
                </g>
              ))}
            </g>
          );
        })}

        {/* ── Automation dots ── */}
        {stepConnections.flatMap(conn => {
          const from = canvasSteps.find(s => s.id === conn.fromStepId);
          const to   = canvasSteps.find(s => s.id === conn.toStepId);
          if (!from || !to || colX[from.column] === undefined || colX[to.column] === undefined) return [];
          const connAutos = automations
            .filter((automation, index) => {
              const placement = automationPlacement(automation, index);
              return placement?.kind === "connection"
                && placement.fromStepId === conn.fromStepId
                && placement.toStepId === conn.toStepId;
            })
            .sort((a, b) => placementOrder(automationPlacement(a), 0) - placementOrder(automationPlacement(b), 0));
          if (!connAutos.length) return [];
          const arrow = buildConnectionArrow(conn, from, to, colX, laneStarts, connOffsets.get(conn.id) ?? 0);
          const fallbackPositions = dotPositions(arrow.dotCenter, connAutos.length);
          return connAutos.map((automation, i) => {
            const placement = automationPlacement(automation, i);
            const positionedPoint = pointForConnectionPlacement(arrow, placement);
            const pos = positionedPoint ?? fallbackPositions[i] ?? arrow.dotCenter;
            return (
            <AutomationDot key={automation.id} auto={automation} cx={pos.x} cy={pos.y}
              ariaLabel={`Automation ${automation.name} op lijn ${from.label} naar ${to.label}`}
              alert={!isAutomationActive(automation)}
              onClick={ev => { ev.stopPropagation(); setSelectedConnectionId(null); onAutomationClick?.(automation); }}
              onPortMouseDown={readOnly ? undefined : ev => {
                ev.stopPropagation();
                setDrawingBranch({
                  automationId: automation.id,
                  startX: pos.x + DOT_R, startY: pos.y,
                  curX: pos.x + DOT_R, curY: pos.y,
                });
              }} />
            );
          });
        })}

        {/* ── Flow dots on connections ── */}
        {stepConnections.flatMap(conn => {
          const from = canvasSteps.find(s => s.id === conn.fromStepId);
          const to   = canvasSteps.find(s => s.id === conn.toStepId);
          if (!from || !to || colX[from.column] === undefined || colX[to.column] === undefined) return [];
          const connFlows = Object.entries(flowLinks)
            .filter(([, link]) => conn.fromStepId && isConnectionPlacement(link, conn.fromStepId, conn.toStepId))
            .map(([flowId]) => flows.find(f => f.id === flowId))
            .filter(Boolean) as import("@/lib/types").Flow[];
          connFlows.sort((a, b) =>
            placementOrder(normalizePlacementLink(flowLinks[a.id], 0), 0)
            - placementOrder(normalizePlacementLink(flowLinks[b.id], 0), 0),
          );
          if (!connFlows.length) return [];
          const arrow = buildConnectionArrow(conn, from, to, colX, laneStarts, connOffsets.get(conn.id) ?? 0);
          const fallbackPositions = dotPositions(arrow.dotCenter, connFlows.length);
          return connFlows.map((flow, i) => {
            const placement = normalizePlacementLink(flowLinks[flow.id], i);
            const pos = pointForConnectionPlacement(arrow, placement) ?? fallbackPositions[i] ?? arrow.dotCenter;
            return (
              <FlowDot
                key={flow.id}
              flowId={flow.id}
              flowName={flow.naam}
              ariaLabel={`Procesreis ${flow.naam} op lijn ${from.label} naar ${to.label}`}
              alert={flowHasInactiveAutomation(flow, automations)}
              cx={pos.x}
                cy={pos.y}
                onClick={(e) => { e.stopPropagation(); setSelectedConnectionId(null); onFlowClick?.(flow.id); }}
              />
            );
          });
        })}

        {/* ── Steps & Events ── */}
        {stepConnections.flatMap(conn => {
          const from = canvasSteps.find(s => s.id === conn.fromStepId);
          const to   = canvasSteps.find(s => s.id === conn.toStepId);
          if (!from || !to || colX[from.column] === undefined || colX[to.column] === undefined) return [];
          const connActions = processActions
            .filter((action, index) => {
              const placement = processActionPlacement(action, index);
              return placement?.kind === "connection"
                && placement.fromStepId === conn.fromStepId
                && placement.toStepId === conn.toStepId;
            })
            .sort((a, b) => placementOrder(processActionPlacement(a), 0) - placementOrder(processActionPlacement(b), 0));
          if (!connActions.length) return [];
          const arrow = buildConnectionArrow(conn, from, to, colX, laneStarts, connOffsets.get(conn.id) ?? 0);
          const fallbackPositions = dotPositions(arrow.dotCenter, connActions.length);
          return connActions.map((action, i) => {
            const placement = processActionPlacement(action, i);
            const pos = pointForConnectionPlacement(arrow, placement) ?? fallbackPositions[i] ?? arrow.dotCenter;
            return (
              <ProcessActionDot
                key={action.id}
                action={action}
                ariaLabel={`Procesactie ${action.label} op lijn ${from.label} naar ${to.label}`}
                cx={pos.x}
                cy={pos.y}
                onClick={e => { e.stopPropagation(); setSelectedConnectionId(null); onProcessActionClick?.(action); }}
              />
            );
          });
        })}

        {canvasSteps.map(step => {
          const cx = colX[step.column];
          const cy = stepCY(step, laneStarts);
          if (cx === undefined) return null;

          const isDrag   = !!(dragging?.stepId === step.id && dragging.moved);
          const isTarget = !!(dragTarget &&
            dragTarget.col  === step.column &&
            dragTarget.team === step.team &&
            dragTarget.row  === stepRow(step) &&
            dragging?.stepId !== step.id);

          if (step.type === "start" || step.type === "end") {
            return (
              <EventCircle key={step.id} step={step} cx={cx} cy={cy}
                isDragging={isDrag} isTarget={isTarget}
                onMouseDown={readOnly ? undefined : e => { e.stopPropagation(); handleStepMouseDown(e, step); }}
                onPortMouseDown={readOnly ? undefined : (e, side) => handlePortMouseDown(e, step, side)}
                onContextMenu={readOnly ? undefined : e => { e.preventDefault(); e.stopPropagation(); setContextMenu({ type: "step", stepId: step.id, x: e.clientX, y: e.clientY }); }} />
            );
          }

          if (step.type === "terminate") {
            return (
              <TerminateCircle key={step.id} step={step} cx={cx} cy={cy}
                isDragging={isDrag} isTarget={isTarget}
                onMouseDown={readOnly ? undefined : e => { e.stopPropagation(); handleStepMouseDown(e, step); }}
                onClick={() => { if (!dragging?.moved) selectStep(step); }}
                onPortMouseDown={readOnly ? undefined : (e, side) => handlePortMouseDown(e, step, side)}
                onContextMenu={readOnly ? undefined : e => { e.preventDefault(); e.stopPropagation(); setContextMenu({ type: "step", stepId: step.id, x: e.clientX, y: e.clientY }); }} />
            );
          }

          if (step.type === "send") {
            return (
              <SendCircle key={step.id} step={step} cx={cx} cy={cy}
                isDragging={isDrag} isTarget={isTarget}
                customLanes={customLanes}
                onMouseDown={readOnly ? undefined : e => { e.stopPropagation(); handleStepMouseDown(e, step); }}
                onClick={() => { if (!dragging?.moved) selectStep(step); }}
                onPortMouseDown={readOnly ? undefined : (e, side) => handlePortMouseDown(e, step, side)}
                onContextMenu={readOnly ? undefined : e => { e.preventDefault(); e.stopPropagation(); setContextMenu({ type: "step", stepId: step.id, x: e.clientX, y: e.clientY }); }} />
            );
          }

          if (step.type === "receive") {
            return (
              <ReceiveCircle key={step.id} step={step} cx={cx} cy={cy}
                isDragging={isDrag} isTarget={isTarget}
                customLanes={customLanes}
                onMouseDown={readOnly ? undefined : e => { e.stopPropagation(); handleStepMouseDown(e, step); }}
                onClick={() => { if (!dragging?.moved) selectStep(step); }}
                onPortMouseDown={readOnly ? undefined : (e, side) => handlePortMouseDown(e, step, side)}
                onContextMenu={readOnly ? undefined : e => { e.preventDefault(); e.stopPropagation(); setContextMenu({ type: "step", stepId: step.id, x: e.clientX, y: e.clientY }); }} />
            );
          }

          if (step.type === "timer") {
            return (
              <TimerCircle key={step.id} step={step} cx={cx} cy={cy}
                isDragging={isDrag} isTarget={isTarget}
                customLanes={customLanes}
                onMouseDown={readOnly ? undefined : e => { e.stopPropagation(); handleStepMouseDown(e, step); }}
                onClick={() => { if (!dragging?.moved) selectStep(step); }}
                onPortMouseDown={readOnly ? undefined : (e, side) => handlePortMouseDown(e, step, side)}
                onContextMenu={readOnly ? undefined : e => { e.preventDefault(); e.stopPropagation(); setContextMenu({ type: "step", stepId: step.id, x: e.clientX, y: e.clientY }); }} />
            );
          }

          if (step.type === "and") {
            return (
              <AndDiamond key={step.id} step={step} cx={cx} cy={cy}
                isDragging={isDrag} isTarget={isTarget}
                customLanes={customLanes}
                onClick={() => { if (!dragging?.moved) selectStep(step); }}
                onPortMouseDown={readOnly ? undefined : (e, side) => handlePortMouseDown(e, step, side)}
                onStepMouseDown={readOnly ? undefined : e => { e.stopPropagation(); handleStepMouseDown(e, step); }}
                onContextMenu={readOnly ? undefined : e => { e.preventDefault(); e.stopPropagation(); setContextMenu({ type: "step", stepId: step.id, x: e.clientX, y: e.clientY }); }} />
            );
          }

          if (step.type === "decision") {
            return (
              <DecisionDiamond key={step.id} step={step} cx={cx} cy={cy}
                isDragging={isDrag} isTarget={isTarget}
                customLanes={customLanes} viewerMode={viewerMode}
                onClick={() => { if (!dragging?.moved) selectStep(step); }}
                onPortMouseDown={readOnly ? undefined : (e, side) => handlePortMouseDown(e, step, side)}
                onStepMouseDown={readOnly ? undefined : e => { e.stopPropagation(); handleStepMouseDown(e, step); }}
                onContextMenu={readOnly ? undefined : e => { e.preventDefault(); e.stopPropagation(); setContextMenu({ type: "step", stepId: step.id, x: e.clientX, y: e.clientY }); }} />
            );
          }

          return (
            <StepBox key={step.id} step={step} cx={cx} cy={cy}
              isDragging={isDrag} isTarget={isTarget}
              sourceMissing={sourceMissingStepIdSet.has(step.id)}
              customLanes={customLanes} viewerMode={viewerMode}
              onClick={() => { if (!dragging?.moved) selectStep(step); }}
              onPortMouseDown={readOnly ? undefined : (e, side) => handlePortMouseDown(e, step, side)}
              onStepMouseDown={readOnly ? undefined : e => { e.stopPropagation(); handleStepMouseDown(e, step); }}
              onPlacementDragOver={handleStepPlacementDragOver}
              onPlacementDrop={e => handleStepPlacementDrop(e, step)}
              onContextMenu={readOnly ? undefined : e => { e.preventDefault(); e.stopPropagation(); setContextMenu({ type: "step", stepId: step.id, x: e.clientX, y: e.clientY }); }} />
          );
        })}

        {canvasSteps.flatMap(step => {
          const cx = colX[step.column];
          const cy = stepCY(step, laneStarts);
          if (cx === undefined) return [];
          const stepAutos = stepAutomationPlacements.get(step.id) ?? [];
          const stepFlows = stepFlowPlacements.get(step.id) ?? [];
          const stepActions = stepProcessActionPlacements.get(step.id) ?? [];
          const placements = [
            ...stepAutos.map(item => ({ kind: "automation" as const, id: item.id, label: item.name, item })),
            ...stepFlows.map(item => ({ kind: "flow" as const, id: item.id, label: item.naam, item })),
            ...stepActions.map(item => ({ kind: "action" as const, id: item.id, label: item.label, item })),
          ].sort((a, b) => {
            const aOrder = a.kind === "automation"
              ? placementOrder(automationPlacement(a.item as Automation), 0)
              : a.kind === "flow"
              ? placementOrder(normalizePlacementLink(flowLinks[a.id], 0), 0)
              : placementOrder(processActionPlacement(a.item as ProcessAction), 0);
            const bOrder = b.kind === "automation"
              ? placementOrder(automationPlacement(b.item as Automation), 0)
              : b.kind === "flow"
              ? placementOrder(normalizePlacementLink(flowLinks[b.id], 0), 0)
              : placementOrder(processActionPlacement(b.item as ProcessAction), 0);
            return aOrder - bOrder;
          });
          if (!placements.length) return [];
          const visible = placements.slice(0, STEP_DOT_VISIBLE_MAX);
          const hidden = placements.slice(STEP_DOT_VISIBLE_MAX);
          const hasOverflow = placements.length > visible.length;
          const positions = stepDotPositions(cx, cy + STEP_H / 2, visible.length + (hasOverflow ? 1 : 0));
          const rendered = visible.map((placement, index) => (
            <StepPlacementDot
              key={`${step.id}-${placement.kind}-${placement.id}`}
              id={placement.id}
              kind={placement.kind}
              actionType={placement.kind === "action" ? (placement.item as ProcessAction).type : undefined}
              label={placement.label}
              ariaLabel={`${placement.kind === "automation" ? "Automation" : placement.kind === "flow" ? "Procesreis" : "Procesactie"} ${placement.label} op stap ${step.label}`}
              alert={placement.kind === "automation"
                ? !isAutomationActive(placement.item as Automation)
                : placement.kind === "flow"
                ? flowHasInactiveAutomation(placement.item as import("@/lib/types").Flow, automations)
                : false}
              cx={positions[index].x}
              cy={positions[index].y}
              onClick={e => {
                e.stopPropagation();
                if (placement.kind === "automation") onAutomationClick?.(placement.item as Automation);
                else if (placement.kind === "flow") onFlowClick?.(placement.id);
                else onProcessActionClick?.(placement.item as ProcessAction);
              }}
            />
          ));
          if (hasOverflow) {
            const overflowPosition = positions[positions.length - 1];
            const overflowOpen = openStepPlacementOverflow === step.id;
            const overflowMenuHeight = Math.min(150, hidden.length * 32 + 16);
            const overflowMenuY = Math.max(4, overflowPosition.y - overflowMenuHeight - 18);
            rendered.push(
              <g
                key={`${step.id}-placement-overflow`}
                role="button"
                tabIndex={0}
                aria-label={`${hidden.length} extra plaatsing${hidden.length === 1 ? "" : "en"} op stap ${step.label}`}
                onClick={e => {
                  e.stopPropagation();
                  setOpenStepPlacementOverflow(current => current === step.id ? null : step.id);
                }}
                onKeyDown={e => {
                  if (e.key !== "Enter" && e.key !== " ") return;
                  e.preventDefault();
                  e.stopPropagation();
                  setOpenStepPlacementOverflow(current => current === step.id ? null : step.id);
                }}
                className="cursor-pointer"
              >
                <circle cx={overflowPosition.x} cy={overflowPosition.y} r={STEP_DOT_R + 2} fill="white" />
                <circle cx={overflowPosition.x} cy={overflowPosition.y} r={STEP_DOT_R} fill="#e2e8f0" stroke="#94a3b8" strokeWidth="1.5" />
                <text x={overflowPosition.x} y={overflowPosition.y + 0.5} textAnchor="middle" dominantBaseline="middle"
                  fontSize="8" fontWeight="800" fill="#334155" style={{ pointerEvents: "none", fontFamily: "IBM Plex Sans, system-ui, sans-serif" }}>
                  +{hidden.length}
                </text>
                {overflowOpen && (
                  <foreignObject
                    x={overflowPosition.x - 92}
                    y={overflowMenuY}
                    width={184}
                    height={overflowMenuHeight}
                  >
                    <div
                      role="menu"
                      aria-label={`Extra plaatsingen op stap ${step.label}`}
                      style={{
                        background: "white",
                        border: "1px solid #cbd5e1",
                        borderRadius: 8,
                        boxShadow: "0 12px 28px rgba(15,23,42,0.16)",
                        display: "flex",
                        flexDirection: "column",
                        gap: 2,
                        maxHeight: 150,
                        overflowY: "auto",
                        padding: 6,
                        width: "100%",
                      }}
                    >
                      {hidden.map(placement => (
                        <button
                          key={`${step.id}-overflow-${placement.kind}-${placement.id}`}
                          type="button"
                          aria-label={`${placement.kind === "automation" ? "Automation" : placement.kind === "flow" ? "Procesreis" : "Procesactie"} ${placement.label} openen`}
                          onClick={event => {
                            event.stopPropagation();
                            setOpenStepPlacementOverflow(null);
                            if (placement.kind === "automation") onAutomationClick?.(placement.item as Automation);
                            else if (placement.kind === "flow") onFlowClick?.(placement.id);
                            else onProcessActionClick?.(placement.item as ProcessAction);
                          }}
                          style={{
                            alignItems: "center",
                            background: "transparent",
                            border: 0,
                            borderRadius: 6,
                            color: "#334155",
                            cursor: "pointer",
                            display: "flex",
                            fontFamily: "IBM Plex Sans, system-ui, sans-serif",
                            fontSize: 11,
                            fontWeight: 600,
                            gap: 7,
                            minHeight: 28,
                            padding: "5px 7px",
                            textAlign: "left",
                            width: "100%",
                          }}
                        >
                          <span
                            aria-hidden="true"
                            style={{
                              alignItems: "center",
                              background: (
                                placement.kind === "automation"
                                  ? !isAutomationActive(placement.item as Automation)
                                  : placement.kind === "flow"
                                  ? flowHasInactiveAutomation(placement.item as import("@/lib/types").Flow, automations)
                                  : false
                              )
                                ? PLACEMENT_ALERT_FILL
                                : placement.kind === "automation" ? AUTOMATION_DOT_FILL : placement.kind === "flow" ? FLOW_DOT_FILL : PROCESS_ACTION_DOT_FILL,
                              borderRadius: 999,
                              color: (
                                placement.kind === "automation"
                                  ? !isAutomationActive(placement.item as Automation)
                                  : placement.kind === "flow"
                                  ? flowHasInactiveAutomation(placement.item as import("@/lib/types").Flow, automations)
                                  : false
                              )
                                ? PLACEMENT_ALERT_ICON
                                : placement.kind === "automation" ? AUTOMATION_DOT_ICON : placement.kind === "flow" ? FLOW_DOT_ICON : PROCESS_ACTION_DOT_ICON,
                              display: "inline-flex",
                              flex: "0 0 auto",
                              height: 16,
                              justifyContent: "center",
                              width: 16,
                            }}
                          >
                            {placement.kind === "action"
                              ? <ProcessActionIcon type={(placement.item as ProcessAction).type} size={9} color="currentColor" />
                              : (
                                <svg viewBox="0 0 24 24" width={9} height={9} fill="currentColor">
                                  <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                                </svg>
                              )}
                          </span>
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {placement.label}
                          </span>
                        </button>
                      ))}
                    </div>
                  </foreignObject>
                )}
              </g>,
            );
          }
          return rendered;
        })}

        {/* ── Drag ghost ── */}
        {dragging?.moved && (() => {
          const step = canvasSteps.find(s => s.id === dragging.stepId);
          if (!step) return null;
          const gx = dragging.curX, gy = dragging.curY;

          if (isEvent(step)) {
            const isStart = step.type === "start";
            const isEnd   = step.type === "end";
            const fill  = isStart ? "#dcfce7" : isEnd ? "#fee2e2" : "white";
            const str   = isStart ? "#16a34a"  : isEnd ? "#dc2626"  : getLaneConfig(step.team, customLanes).stroke;
            const sw    = isEnd ? 4 : isStart ? 2.5 : 2;
            const targetCY = dragTarget
              ? laneStarts[dragTarget.team] + dragTarget.row * ROW_H + ROW_H / 2
              : gy;
            return (
              <g opacity={0.6} style={{ pointerEvents: "none" }}>
                <circle cx={gx} cy={gy} r={EVT_R} fill={fill} stroke={str} strokeWidth={sw} />
                <circle cx={gx} cy={gy} r={EVT_R * 0.4} fill={str} />
                {dragTarget && getColX(dragTarget.col) !== undefined && (
                  <circle cx={getColX(dragTarget.col)!} cy={targetCY} r={EVT_R + 6}
                    fill="none" stroke="#3b82f6" strokeWidth="2" strokeDasharray="5 3" opacity="0.6" />
                )}
              </g>
            );
          }

          const isNewRow = !!(dragTarget && dragTarget.row > maxRowInLane(dragTarget.team, canvasSteps));
          const targetCY = dragTarget
            ? isNewRow
              ? laneStarts[dragTarget.team] + (laneHeights[dragTarget.team] ?? laneHeightFn(dragTarget.team, canvasSteps))
              : laneStarts[dragTarget.team] + dragTarget.row * ROW_H + ROW_H / 2
            : gy;

          if (isDecision(step)) {
            const str = viewerMode ? "#3B82F6" : getLaneConfig(step.team, customLanes).stroke;
            const pts = `${gx},${gy - DECISION_H} ${gx + DECISION_H},${gy} ${gx},${gy + DECISION_H} ${gx - DECISION_H},${gy}`;
            const h = DECISION_H;
            return (
              <g opacity={0.65} style={{ pointerEvents: "none" }}>
                <polygon points={pts} fill={viewerMode ? "#EFF6FF" : "white"} stroke={str} strokeWidth="2" />
                {step.type === "decision" ? (
                  <>
                    <line x1={gx - h * 0.45} y1={gy - h * 0.45} x2={gx + h * 0.45} y2={gy + h * 0.45}
                      stroke={str} strokeWidth="2" />
                    <line x1={gx + h * 0.45} y1={gy - h * 0.45} x2={gx - h * 0.45} y2={gy + h * 0.45}
                      stroke={str} strokeWidth="2" />
                  </>
                ) : (
                  <>
                    <line x1={gx} y1={gy - h * 0.55} x2={gx} y2={gy + h * 0.55}
                      stroke={str} strokeWidth="2" />
                    <line x1={gx - h * 0.55} y1={gy} x2={gx + h * 0.55} y2={gy}
                      stroke={str} strokeWidth="2" />
                  </>
                )}
                {dragTarget && getColX(dragTarget.col) !== undefined && (
                  <polygon
                    points={`${getColX(dragTarget.col)!},${targetCY - DECISION_H - 6} ${getColX(dragTarget.col)! + DECISION_H + 6},${targetCY} ${getColX(dragTarget.col)!},${targetCY + DECISION_H + 6} ${getColX(dragTarget.col)! - DECISION_H - 6},${targetCY}`}
                    fill="none" stroke="#3b82f6" strokeWidth="2" strokeDasharray="5 3" opacity={0.6} />
                )}
              </g>
            );
          }

          return (
            <g opacity={0.65} style={{ pointerEvents: "none" }}>
              {/* Ghost card following cursor */}
              <rect x={gx - STEP_W / 2} y={gy - STEP_H / 2} width={STEP_W} height={STEP_H}
                rx="8"
                fill={viewerMode ? (step.type === "optional" ? "#FFF7ED" : "#EFF6FF") : "white"}
                stroke={viewerMode ? (step.type === "optional" ? "#F97316" : "#3B82F6") : getLaneConfig(step.team, customLanes).stroke}
                strokeWidth="2"
                strokeDasharray={step.type === "optional" ? "6 3" : undefined} />
              {!viewerMode && <rect x={gx - STEP_W / 2} y={gy - STEP_H / 2} width={4} height={STEP_H}
                rx="2" fill={getLaneConfig(step.team, customLanes).stroke} />}
              <text x={viewerMode ? gx : gx + 4} y={gy} textAnchor="middle" dominantBaseline="middle"
                fontSize="9" fontWeight="500" fill={viewerMode ? (step.type === "optional" ? "#C2410C" : "#1D4ED8") : "#1e293b"}
                style={{ fontFamily: "IBM Plex Sans, system-ui, sans-serif" }}>
                {step.label.length > 18 ? step.label.slice(0, 17) + "…" : step.label}
              </text>

              {/* Drop indicator — same dashed rect for both existing and new row/col */}
              {dragTarget && getColX(dragTarget.col) !== undefined && (
                <rect x={getColX(dragTarget.col)! - STEP_W / 2 - 3} y={targetCY - STEP_H / 2 - 3}
                  width={STEP_W + 6} height={STEP_H + 6} rx="10" fill="none"
                  stroke="#3b82f6" strokeWidth="2" strokeDasharray="5 3" opacity={0.6} />
              )}
            </g>
          );
        })()}

        {/* ── New-step drag placeholder ── */}
        {newStepDrag && (() => {
          const { col, team, row } = newStepDrag;
          const cx = getColX(col);
          if (cx === undefined) return null;
          const isNewRow = row > maxRowInLane(team, canvasSteps);
          const cy = isNewRow
            ? laneStarts[team] + (laneHeights[team] ?? laneHeightFn(team, canvasSteps))
            : laneStarts[team] + row * ROW_H + ROW_H / 2;
          const cfg = getLaneConfig(team, customLanes);
          return (
            <g style={{ pointerEvents: "none" }}>
              <rect
                x={cx - STEP_W / 2 - 3} y={cy - STEP_H / 2 - 3}
                width={STEP_W + 6} height={STEP_H + 6} rx="10"
                fill={cfg.bg} fillOpacity={0.6}
                stroke={cfg.stroke} strokeWidth="2" strokeDasharray="5 3"
              />
              <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle"
                fontSize="9" fill={cfg.text} fontWeight="500" opacity={0.7}
                style={{ fontFamily: "IBM Plex Sans, system-ui, sans-serif" }}>
                Lege stap
              </text>
            </g>
          );
        })()}

        {/* ── Branch lines (automation → target step) ── */}
        {branchConnections.map(conn => {
          const pos = autoPositions.get(conn.fromAutomationId!);
          if (!pos) return null;
          const target = canvasSteps.find(s => s.id === conn.toStepId);
          if (!target || colX[target.column] === undefined) return null;
          const tx = colX[target.column];
          const ty = stepCY(target, laneStarts);
          const ex = tx - (isEvent(target) ? EVT_R : STEP_W / 2);
          const dotX = pos.x, dotY = pos.y;

          const goingUp   = ty < dotY - DOT_R;
          const goingDown = ty > dotY + DOT_R;

          // Build path and compute exact 50% midpoint along total path length
          let branchPath: string;
          let mid: Pt;
          let labelVertical = false; // true when midpoint sits on the vertical segment

          if (goingUp) {
            const seg1 = (dotY - DOT_R) - ty;
            const seg2 = Math.abs(ex - dotX);
            const half  = (seg1 + seg2) / 2;
            branchPath = `M ${dotX} ${dotY - DOT_R} L ${dotX} ${ty} L ${ex} ${ty}`;
            if (half <= seg1) {
              mid = { x: dotX, y: (dotY - DOT_R) - half };
              labelVertical = true;
            } else {
              mid = { x: dotX + (half - seg1) * (ex >= dotX ? 1 : -1), y: ty };
            }
          } else if (goingDown) {
            const seg1 = ty - (dotY + DOT_R);
            const seg2 = Math.abs(ex - dotX);
            const half  = (seg1 + seg2) / 2;
            branchPath = `M ${dotX} ${dotY + DOT_R} L ${dotX} ${ty} L ${ex} ${ty}`;
            if (half <= seg1) {
              mid = { x: dotX, y: (dotY + DOT_R) + half };
              labelVertical = true;
            } else {
              mid = { x: dotX + (half - seg1) * (ex >= dotX ? 1 : -1), y: ty };
            }
          } else {
            branchPath = `M ${dotX + DOT_R} ${dotY} L ${ex} ${dotY}`;
            mid = { x: (dotX + DOT_R + ex) / 2, y: dotY };
          }

          // Label always horizontal — positioned above the midpoint of the line
          const labelText = conn.label || "klik om te bewerken";
          const estW = Math.max(80, labelText.length * 5.5 + 16);
          // Offset label above the line so it never overlaps the path
          const labelOffsetY = labelVertical ? 0 : -12;
          const labelOffsetX = labelVertical ? 10 : 0;
          const isEditing = !readOnly && editingLabel?.connId === conn.id;

          return (
            <g key={conn.id}>
              {/* Invisible wide hit area */}
              <path d={branchPath} stroke="transparent" strokeWidth="18" fill="none"
                className="cursor-pointer"
                onClick={readOnly ? undefined : () => setEditingLabel({ connId: conn.id, x: mid.x, y: mid.y, value: conn.label ?? "" })}
                onContextMenu={readOnly ? undefined : e => { e.preventDefault(); e.stopPropagation(); setContextMenu({ type: "conn", connId: conn.id, x: e.clientX, y: e.clientY }); }} />
              {/* Visible path */}
              <path d={branchPath} stroke={ROUTE_OPTIONAL} strokeWidth="1.7" strokeDasharray="5 3" fill="none"
                aria-label="Correctie of optionele route"
                markerEnd="url(#ah-branch)" opacity={0.75} style={{ pointerEvents: "none" }} />
              {/* Label always horizontal, offset from midpoint so it doesn't overlap the line */}
              {isEditing ? (
                <foreignObject x={mid.x - estW / 2 + labelOffsetX} y={mid.y - 10 + labelOffsetY} width={estW} height={20}>
                  <input
                    autoFocus
                    value={editingLabel!.value}
                    onChange={e => setEditingLabel(prev => prev ? { ...prev, value: e.target.value } : prev)}
                    onBlur={() => { onUpdateConnectionLabel?.(conn.id, editingLabel!.value); setEditingLabel(null); }}
                    onKeyDown={e => {
                      if (e.key === "Enter") { onUpdateConnectionLabel?.(conn.id, editingLabel!.value); setEditingLabel(null); }
                      if (e.key === "Escape") setEditingLabel(null);
                    }}
                    style={{
                      width: "100%", height: "100%", fontSize: 8, fontWeight: 500,
                      textAlign: "center", border: "1.5px solid #d97706", borderRadius: 3,
                      padding: "0 4px", background: "white", color: "#92400e",
                      outline: "none", fontFamily: "IBM Plex Sans, system-ui, sans-serif",
                    }}
                  />
                </foreignObject>
              ) : (
                <g className="cursor-pointer"
                  onClick={readOnly ? undefined : () => setEditingLabel({ connId: conn.id, x: mid.x, y: mid.y, value: conn.label ?? "" })}>
                  <rect
                    x={mid.x - estW / 2 + labelOffsetX} y={mid.y - 7 + labelOffsetY}
                    width={estW} height={14} rx="3"
                    fill="white" fillOpacity={0.92}
                    style={{ pointerEvents: "none" }}
                  />
                  <text x={mid.x + labelOffsetX} y={mid.y + labelOffsetY} textAnchor="middle" dominantBaseline="middle"
                    fontSize="8" fontWeight="500" fill={conn.label ? "#92400e" : "#d97706"}
                    fillOpacity={conn.label ? 1 : 0.5}
                    style={{ fontFamily: "IBM Plex Sans, system-ui, sans-serif", pointerEvents: "none" }}>
                    {labelText}
                  </text>
                </g>
              )}
            </g>
          );
        })}

        {attachmentPlacements.map(({ attachment, anchor, origin }) => {
          const clickable = !!onAttachmentClick || (!readOnly && !!onUpdateAttachment);
          const draggable = !readOnly && !!onMoveAttachment;
          const editingAttachment = !readOnly && editingAttachmentId === attachment.id && !!onUpdateAttachment;
          const displayText = attachment.description?.trim() || attachment.label;
          return (
            <g key={attachment.id}>
              <line
                x1={anchor.x}
                y1={anchor.y}
                x2={origin.x}
                y2={origin.y + ATTACHMENT_H / 2}
                stroke="#94a3b8"
                strokeWidth={1.2}
                strokeDasharray="4 4"
                style={{ pointerEvents: "none" }}
              />
              <g
                aria-label={attachmentAriaLabel(attachment)}
                role={clickable ? "button" : undefined}
                tabIndex={clickable ? 0 : undefined}
                onClick={clickable ? e => {
                  e.stopPropagation();
                  setSelectedConnectionId(null);
                  if (!readOnly && onUpdateAttachment) setEditingAttachmentId(attachment.id);
                  onAttachmentClick?.(attachment);
                } : undefined}
                onMouseDown={draggable ? e => handleAttachmentMouseDown(e, attachment) : undefined}
                onContextMenu={readOnly || !onDeleteAttachment ? undefined : e => {
                  e.preventDefault();
                  e.stopPropagation();
                  setContextMenu({ type: "attachment", attachmentId: attachment.id, x: e.clientX, y: e.clientY });
                }}
                style={{
                  cursor: draggable ? "move" : clickable ? "pointer" : "context-menu",
                  pointerEvents: draggable || clickable || onDeleteAttachment || onUpdateAttachment ? "auto" : "none",
                }}
              >
                {renderAttachmentShape(attachment, origin.x, origin.y)}
                <text
                  x={origin.x + ATTACHMENT_W / 2}
                  y={origin.y + ATTACHMENT_H / 2 + 2}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={8}
                  fontWeight={600}
                  fill="#334155"
                  style={{ fontFamily: "IBM Plex Sans, system-ui, sans-serif", pointerEvents: "none" }}
                >
                  {displayText.length > 18 ? `${displayText.slice(0, 17)}...` : displayText}
                </text>
              </g>
              {editingAttachment && (
                <foreignObject
                  x={origin.x + ATTACHMENT_W + 8}
                  y={origin.y - 8}
                  width={188}
                  height={116}
                  style={{ overflow: "visible" }}
                >
                  <div
                    onMouseDown={event => {
                      event.stopPropagation();
                    }}
                    onClick={event => {
                      event.stopPropagation();
                    }}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 6,
                      padding: 8,
                      border: "1px solid #cbd5e1",
                      borderRadius: 6,
                      background: "rgba(255,255,255,0.98)",
                      boxShadow: "0 8px 20px rgba(15,23,42,0.16)",
                      fontFamily: "IBM Plex Sans, system-ui, sans-serif",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                      <span style={{ fontSize: 10, fontWeight: 800, color: "#0f172a" }}>Notitie</span>
                      <button
                        type="button"
                        aria-label="Notitie editor sluiten"
                        onClick={event => {
                          event.stopPropagation();
                          setEditingAttachmentId(null);
                        }}
                        style={{
                          alignItems: "center",
                          background: "#f8fafc",
                          border: "1px solid #cbd5e1",
                          borderRadius: 4,
                          color: "#334155",
                          cursor: "pointer",
                          display: "inline-flex",
                          fontSize: 12,
                          fontWeight: 800,
                          height: 20,
                          justifyContent: "center",
                          lineHeight: "18px",
                          padding: 0,
                          width: 20,
                        }}
                      >
                        x
                      </button>
                    </div>
                    <label style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 10, fontWeight: 700, color: "#334155" }}>
                      Titel
                      <input
                        aria-label="Notitie titel"
                        value={attachment.label}
                        onChange={event => onUpdateAttachment(attachment.id, { label: event.target.value })}
                        style={{
                          height: 24,
                          border: "1px solid #cbd5e1",
                          borderRadius: 4,
                          fontSize: 11,
                          padding: "0 6px",
                        }}
                      />
                    </label>
                    <label style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 10, fontWeight: 700, color: "#334155" }}>
                      Tekst
                      <textarea
                        aria-label="Notitie tekst"
                        value={attachment.description ?? ""}
                        onChange={event => onUpdateAttachment(attachment.id, { description: event.target.value })}
                        rows={3}
                        style={{
                          border: "1px solid #cbd5e1",
                          borderRadius: 4,
                          fontSize: 11,
                          lineHeight: 1.25,
                          padding: "5px 6px",
                          resize: "none",
                        }}
                      />
                    </label>
                  </div>
                </foreignObject>
              )}
            </g>
          );
        })}

        {/* ── Connection preview ── */}
        {artifacts.map((artifact) => {
          const displayArtifact = artifact;
          const containedSteps = (artifact.stepIds ?? [])
            .map(stepId => stepsById.get(stepId))
            .filter(Boolean) as ProcessStep[];
          const linkedAutomations = (artifact.automationIds ?? [])
            .map(automationId => automationById.get(automationId))
            .filter(Boolean) as Automation[];
          const linkedFlows = artifact.type === "automaticSyncBlock"
            ? Object.entries(flowLinks)
                .filter(([, link]) => normalizePlacementLink(link).kind === "pipeline_wide")
                .map(([flowId]) => flows.find(flow => flow.id === flowId))
                .filter(Boolean) as Flow[]
            : [];
          const manualLayout = manualExceptionTextLayout(displayArtifact, containedSteps);
          const height = artifactCanvasHeight(artifact, stepsById, automationById, linkedFlows);
          const draggable = !readOnly && !!onMoveArtifact;
          const editingManualField = editingManualArtifact?.artifactId === artifact.id
            ? editingManualArtifact.field
            : undefined;
          const canEditManualText = !readOnly && !!onUpdateArtifact;
          const isManualBlock = artifact.type === "manualExceptionBlock";
          const hasManualStepControls = !readOnly
            && isManualBlock
            && containedSteps.length > 0
            && (!!onMoveManualStepToCanvas || !!onReorderManualArtifactStep);

          return (
            <g key={artifact.id}>
              <g
                aria-label={isManualBlock ? `Manual exception block ${artifact.title}` : `Automatic sync block ${artifact.title}`}
                role="button"
                tabIndex={0}
                onClick={event => {
                  event.stopPropagation();
                  onArtifactClick?.(artifact);
                }}
                onKeyDown={event => {
                  if (event.key !== "Enter" && event.key !== " ") return;
                  event.preventDefault();
                  event.stopPropagation();
                  onArtifactClick?.(artifact);
                }}
                onDoubleClick={canEditManualText ? event => {
                  event.preventDefault();
                  event.stopPropagation();
                  setEditingManualArtifact({ artifactId: artifact.id, field: "title" });
                } : undefined}
                onMouseDown={draggable ? event => handleArtifactMouseDown(event, artifact) : undefined}
                onContextMenu={readOnly || !onDeleteArtifact ? undefined : event => {
                  event.preventDefault();
                  event.stopPropagation();
                  setContextMenu({ type: "artifact", artifactId: artifact.id, x: event.clientX, y: event.clientY });
                }}
                style={{
                  cursor: draggable ? "move" : !readOnly && onDeleteArtifact ? "context-menu" : undefined,
                  pointerEvents: draggable || canEditManualText || hasManualStepControls || (!readOnly && !!onDeleteArtifact) || !!onArtifactClick ? "auto" : "none",
                }}
              >
                {isManualBlock ? renderManualExceptionBlock(
                    displayArtifact,
                    containedSteps,
                    readOnly,
                    editingManualField,
                    canEditManualText ? field => setEditingManualArtifact({ artifactId: artifact.id, field }) : undefined,
                    () => setEditingManualArtifact(null),
                    onUpdateArtifact,
                    onStepClick,
                  ) : renderAutomaticSyncBlock(
                    displayArtifact,
                    linkedAutomations,
                    linkedFlows,
                    readOnly,
                    editingManualField,
                    canEditManualText ? field => setEditingManualArtifact({ artifactId: artifact.id, field }) : undefined,
                    () => setEditingManualArtifact(null),
                    onUpdateArtifact,
                  )}
                {isManualBlock && manualBlockDropTarget?.id === artifact.id && (
                  <rect
                    data-manual-block-drop-highlight={artifact.id}
                    x={artifact.position.x - 5}
                    y={displayArtifact.position.y - 5}
                    width={(artifact.size?.width ?? MANUAL_EXCEPTION_DEFAULT_W) + 10}
                    height={height + 10}
                    rx={12}
                    fill="#eff6ff"
                    fillOpacity={0.32}
                    stroke="#2563eb"
                    strokeWidth={2}
                    strokeDasharray="6 4"
                    style={{ pointerEvents: "none" }}
                  />
                )}
                {hasManualStepControls && containedSteps.map((step, index) => {
                  const stepX = artifact.position.x + (artifact.size?.width ?? MANUAL_EXCEPTION_DEFAULT_W) / 2;
                  const previousHeight = manualLayout.stepHeights
                    .slice(0, index)
                    .reduce((sum, itemHeight) => sum + itemHeight + MANUAL_EXCEPTION_STEP_GAP, 0);
                  const stepHeight = manualLayout.stepHeights[index] ?? STEP_H;
                  const stepTop = displayArtifact.position.y + manualLayout.stepsTop + previousHeight;
                  const stepY = stepTop + stepHeight / 2;
                  return (
                    <g key={`${artifact.id}-${step.id}-controls`}>
                      {onReorderManualArtifactStep && (
                        <g
                          role="button"
                          aria-label={`Manual stap ${step.label} sorteren`}
                          tabIndex={0}
                          data-manual-step-sort-control="true"
                          onMouseDown={event => handleManualStepMouseDown(event, artifact, step, "sort")}
                          style={{ cursor: "grab" }}
                        >
                          <rect
                            x={stepX - STEP_W / 2 - 20}
                            y={stepTop}
                            width={18}
                            height={stepHeight}
                            rx={5}
                            fill="transparent"
                          />
                          <text
                            x={stepX - STEP_W / 2 - 11}
                            y={stepY + 4}
                            textAnchor="middle"
                            fontSize={13}
                            fontWeight={800}
                            fill="#a16207"
                            style={{ fontFamily: "IBM Plex Sans, system-ui, sans-serif", pointerEvents: "none" }}
                          >
                            ::
                          </text>
                        </g>
                      )}
                      {onMoveManualStepToCanvas && (
                        <rect
                          role="button"
                          aria-label={`Manual stap ${step.label} terugplaatsen`}
                          tabIndex={0}
                          data-manual-step-drag-handle="true"
                          x={stepX - STEP_W / 2}
                          y={stepTop}
                          width={STEP_W}
                          height={stepHeight}
                          rx={8}
                          fill="transparent"
                          style={{ cursor: "grab" }}
                          onClick={!readOnly && onStepClick ? event => {
                            event.stopPropagation();
                            onStepClick(step);
                          } : undefined}
                          onMouseDown={event => handleManualStepMouseDown(event, artifact, step, "return")}
                        />
                      )}
                    </g>
                  );
                })}
              </g>
            </g>
          );
        })}

        {drawing && (() => {
          const horizontalFirst = drawing.fromSide === "left" || drawing.fromSide === "right";
          const previewPath = Math.abs(drawing.fromX - drawing.curX) < 4
            ? `M ${drawing.fromX} ${drawing.fromY} V ${drawing.curY}`
            : Math.abs(drawing.fromY - drawing.curY) < 4
              ? `M ${drawing.fromX} ${drawing.fromY} H ${drawing.curX}`
              : horizontalFirst
                ? (() => {
                    const midX = (drawing.fromX + drawing.curX) / 2;
                    return `M ${drawing.fromX} ${drawing.fromY} H ${midX} V ${drawing.curY} H ${drawing.curX}`;
                  })()
                : (() => {
                    const midY = (drawing.fromY + drawing.curY) / 2;
                    return `M ${drawing.fromX} ${drawing.fromY} V ${midY} H ${drawing.curX} V ${drawing.curY}`;
                  })();
          return (
            <path
              aria-label="Nieuwe verbinding preview"
              d={previewPath}
              stroke={routeStroke(selectedRouteType, false)}
              strokeWidth="1.5"
              strokeDasharray={selectedRouteType === "optional" ? "6 3" : undefined}
              fill="none"
              markerEnd={`url(#${routeMarker(selectedRouteType)})`}
              style={{ pointerEvents: "none" }}
            />
          );
        })()}

        {/* ── Branch drawing preview (orthogonal) ── */}
        {drawingBranch && (() => {
          const { startX, startY, curX, curY } = drawingBranch;
          const midX = (startX + curX) / 2;
          const previewPath = `M ${startX} ${startY} H ${midX} V ${curY} H ${curX}`;
          return (
            <path d={previewPath} stroke={ROUTE_OPTIONAL} strokeWidth="1.5" strokeDasharray="6 3" fill="none"
              markerEnd="url(#ah-branch)" style={{ pointerEvents: "none" }} />
          );
        })()}
        </svg>
      </div>
      {showLegend && <ProcessCanvasLegend />}

      {/* ── Context menu ── */}
      {!readOnly && contextMenu && createPortal(
        <div
          className="fixed z-50 bg-white border border-border rounded-lg shadow-lg py-1 min-w-[160px]"
          style={{
            left: contextMenu.x,
            top: contextMenu.y,
            transform: `scale(${clampContextMenuScale(1 / viewportScale)})`,
            transformOrigin: "top left",
          }}
          onMouseLeave={() => setContextMenu(null)}
        >
          {contextMenu.type === "conn" && (
            <>
              {onAddAttachment && ADD_ATTACHMENT_CONTROLS.map(control => (
                <button
                  key={control.type}
                  type="button"
                  aria-label={control.label}
                  className="w-full text-left px-3 py-1.5 text-sm hover:bg-secondary/50 transition-colors"
                  onMouseDown={event => {
                    event.preventDefault();
                    event.stopPropagation();
                  }}
                  onClick={() => {
                    onAddAttachment(control.type, { kind: "connection", id: contextMenu.connId });
                    setContextMenu(null);
                  }}
                >
                  {control.label}
                </button>
              ))}
              {onAddAttachment && onDeleteConnection && <div className="my-1 border-t border-border" />}
              {onDeleteConnection && (
                <button
                  className="w-full text-left px-3 py-1.5 text-sm text-destructive hover:bg-destructive/10 transition-colors"
                  onClick={() => { onDeleteConnection?.(contextMenu.connId); setContextMenu(null); }}
                >
                  Verbinding verwijderen
                </button>
              )}
            </>
          )}
          {contextMenu.type === "attachment" && (
            <button
              className="w-full text-left px-3 py-1.5 text-sm text-destructive hover:bg-destructive/10 transition-colors"
              onClick={() => { onDeleteAttachment?.(contextMenu.attachmentId); setContextMenu(null); }}
            >
              Artifact verwijderen
            </button>
          )}
          {contextMenu.type === "artifact" && (
            <button
              className="w-full text-left px-3 py-1.5 text-sm text-destructive hover:bg-destructive/10 transition-colors"
              onClick={() => { onDeleteArtifact?.(contextMenu.artifactId); setContextMenu(null); }}
            >
              Artifact verwijderen
            </button>
          )}
          {contextMenu.type === "step" && (() => {
            const step = canvasSteps.find(s => s.id === contextMenu.stepId);
            const isEvt = step?.type === "start" || step?.type === "end"
              || step?.type === "timer" || step?.type === "terminate" || step?.type === "send" || step?.type === "receive";
            return isEvt ? (
              <button
                className="w-full text-left px-3 py-1.5 text-sm text-destructive hover:bg-destructive/10 transition-colors"
                onClick={() => { onDeleteStep?.(contextMenu.stepId); setContextMenu(null); }}
              >
                Verwijder
              </button>
            ) : (
              <button
                className="w-full text-left px-3 py-1.5 text-sm hover:bg-secondary/50 transition-colors"
                onClick={() => { onParkStep?.(contextMenu.stepId); setContextMenu(null); }}
              >
                Parkeer stap
              </button>
            );
          })()}
        </div>
      , document.body)}
    </div>
  );
}
