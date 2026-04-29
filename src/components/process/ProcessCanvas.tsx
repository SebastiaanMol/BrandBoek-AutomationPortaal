import { useRef, useMemo, useState, useCallback, useEffect } from "react";
import type { ProcessStep, Connection, Automation, TeamKey } from "@/data/processData";
import { TEAM_CONFIG, TEAM_ORDER } from "@/data/processData";

// ── Layout constants ──────────────────────────────────────────────────────────

const ROW_H        = 110;   // height of one row within a swimlane
const LANE_HDR_W   = 132;
const STEP_W       = 152;
const STEP_H       = 52;
const BASE_COL_W   = 248;
const EVT_COL_W    = 120;
const DOT_R        = 14;
const DOT_SPACING  = 36;
const EDGE_PAD     = 24;
const ARROW_MARGIN = 16;
const EVT_R        = 22;

// ── Helper types ──────────────────────────────────────────────────────────────

interface Pt { x: number; y: number }
interface ArrowData { path: string; preDotPath: string; postDotPath: string; postDotMid: Pt; postDotMidVertical: boolean; dotCenter: Pt; isVertical: boolean }

function isEvent(step: ProcessStep) {
  return step.type === "start" || step.type === "end";
}

function stepRow(step: ProcessStep) {
  return step.row ?? 0;
}

// ── Lane / row layout helpers ─────────────────────────────────────────────────

function maxRowInLane(team: TeamKey, steps: ProcessStep[]): number {
  const rows = steps.filter(s => s.team === team && !isEvent(s)).map(s => stepRow(s));
  return rows.length ? Math.max(...rows) : 0;
}

function laneHeightFn(team: TeamKey, steps: ProcessStep[]): number {
  return (maxRowInLane(team, steps) + 1) * ROW_H;
}

function buildLaneStarts(steps: ProcessStep[]): Record<TeamKey, number> {
  const map = {} as Record<TeamKey, number>;
  let y = 0;
  for (const team of TEAM_ORDER) {
    map[team] = y;
    y += laneHeightFn(team, steps);
  }
  return map;
}

function stepCY(step: ProcessStep, laneStarts: Record<TeamKey, number>): number {
  return laneStarts[step.team] + stepRow(step) * ROW_H + ROW_H / 2;
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

function edgeRight(s: ProcessStep, cx: number) { return cx + (isEvent(s) ? EVT_R : STEP_W / 2); }
function edgeLeft (s: ProcessStep, cx: number) { return cx - (isEvent(s) ? EVT_R : STEP_W / 2); }
function edgeDown (s: ProcessStep, cy: number) { return cy + (isEvent(s) ? EVT_R : STEP_H / 2); }
function edgeUp   (s: ProcessStep, cy: number) { return cy - (isEvent(s) ? EVT_R : STEP_H / 2); }

function buildArrow(
  from: ProcessStep,
  to: ProcessStep,
  colX: number[],
  laneStarts: Record<TeamKey, number>,
  midXOffset = 0,
): ArrowData {
  const fx = colX[from.column], fy = stepCY(from, laneStarts);
  const tx = colX[to.column],   ty = stepCY(to, laneStarts);

  const sameRow = from.team === to.team && stepRow(from) === stepRow(to);
  const sameCol = from.column === to.column;

  if (sameRow) {
    const ltr = from.column <= to.column;
    const sx = ltr ? edgeRight(from, fx) : edgeLeft(from, fx);
    const ex = ltr ? edgeLeft(to, tx)   : edgeRight(to, tx);
    const dc: Pt = { x: (sx + ex) / 2, y: fy };
    const pre  = `M ${sx} ${fy} L ${dc.x - DOT_R} ${fy}`;
    const post = `M ${dc.x + DOT_R} ${fy} L ${ex} ${fy}`;
    const postDotMid: Pt = { x: (dc.x + DOT_R + ex) / 2, y: fy };
    return { path: `M ${sx} ${fy} L ${ex} ${ty}`, preDotPath: pre, postDotPath: post, postDotMid, postDotMidVertical: false, dotCenter: dc, isVertical: false };
  }

  if (sameCol) {
    const down = fy < ty;
    const sy = down ? edgeDown(from, fy) : edgeUp(from, fy);
    const ey = down ? edgeUp(to, ty)     : edgeDown(to, ty);
    const dc: Pt = { x: fx, y: (sy + ey) / 2 };
    const pre  = down ? `M ${fx} ${sy} L ${fx} ${dc.y - DOT_R}` : `M ${fx} ${sy} L ${fx} ${dc.y + DOT_R}`;
    const post = down ? `M ${fx} ${dc.y + DOT_R} L ${fx} ${ey}` : `M ${fx} ${dc.y - DOT_R} L ${fx} ${ey}`;
    const postDotMid: Pt = { x: fx, y: down ? (dc.y + DOT_R + ey) / 2 : (dc.y - DOT_R + ey) / 2 };
    return { path: `M ${fx} ${sy} L ${tx} ${ey}`, preDotPath: pre, postDotPath: post, postDotMid, postDotMidVertical: true, dotCenter: dc, isVertical: true };
  }

  // Orthogonal routing: exit right → vertical → enter left (90° corners only)
  // The vertical segment is placed just past the from-step's right edge (in the inter-column gap)
  // rather than at the midpoint, so it never passes through intermediate step nodes.
  // midXOffset staggers parallel connections sharing the same column corridor so they don't overlap.
  const sx = edgeRight(from, fx), ex = edgeLeft(to, tx);
  const midX = sx + DOT_R * 2 + EDGE_PAD + midXOffset;
  // Smooth cubic bezier: exit horizontally, curve into vertical, curve out horizontally into target
  const cr = Math.min(24, Math.abs(ty - fy) / 2); // corner radius, capped at 24px
  const goDown = ty > fy;
  const path = `M ${sx} ${fy} L ${midX - cr} ${fy} C ${midX} ${fy} ${midX} ${fy} ${midX} ${fy + (goDown ? cr : -cr)} L ${midX} ${ty + (goDown ? -cr : cr)} C ${midX} ${ty} ${midX} ${ty} ${midX + cr} ${ty} L ${ex} ${ty}`;
  const dc: Pt = { x: (sx + midX - cr) / 2, y: fy };
  const pre  = `M ${sx} ${fy} L ${dc.x - DOT_R} ${fy}`;
  const post = `M ${dc.x + DOT_R} ${fy} L ${midX - cr} ${fy} C ${midX} ${fy} ${midX} ${fy} ${midX} ${fy + (goDown ? cr : -cr)} L ${midX} ${ty + (goDown ? -cr : cr)} C ${midX} ${ty} ${midX} ${ty} ${midX + cr} ${ty} L ${ex} ${ty}`;
  const postDotMid: Pt = { x: midX, y: (fy + ty) / 2 };
  return { path, preDotPath: pre, postDotPath: post, postDotMid, postDotMidVertical: true, dotCenter: dc, isVertical: false };
}

function dotPositions(center: Pt, n: number): Pt[] {
  return Array.from({ length: n }, (_, i) => ({
    x: center.x - ((n - 1) * DOT_SPACING) / 2 + i * DOT_SPACING,
    y: center.y,
  }));
}

// ── AutomationDot ─────────────────────────────────────────────────────────────

function AutomationDot({ auto, cx, cy, onClick, onPortMouseDown }: {
  auto: Automation; cx: number; cy: number;
  onClick: (e: React.MouseEvent) => void;
  onPortMouseDown: (e: React.MouseEvent) => void;
}) {
  const [hov, setHov] = useState(false);
  const label = auto.name;
  const estW = Math.max(64, label.length * 6 + 16);
  return (
    <g onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      className="cursor-pointer"
      style={{ filter: hov ? "drop-shadow(0 2px 4px rgba(0,0,0,.2))" : undefined }}>
      <circle cx={cx} cy={cy} r={DOT_R + 2} fill="white" onClick={onClick} />
      <circle cx={cx} cy={cy} r={DOT_R} fill="hsl(45 95% 55%)" stroke="hsl(35 80% 40%)" strokeWidth="1.5" onClick={onClick} />
      <foreignObject x={cx - 8} y={cy - 8} width={16} height={16} style={{ pointerEvents: "none" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 16, height: 16 }}>
          <svg viewBox="0 0 24 24" width={11} height={11} fill="hsl(35 80% 30%)" stroke="none">
            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
          </svg>
        </div>
      </foreignObject>
      {/* Tooltip — name of automation, always horizontal, appears on hover */}
      {hov && (
        <g style={{ pointerEvents: "none" }}>
          <rect x={cx - estW / 2} y={cy - DOT_R - 26} width={estW} height={18}
            rx="4" fill="#1e293b" fillOpacity={0.88} />
          <text x={cx} y={cy - DOT_R - 17} textAnchor="middle" dominantBaseline="middle"
            fontSize="10" fontWeight="500" fill="white"
            style={{ fontFamily: "IBM Plex Sans, system-ui, sans-serif" }}>
            {label}
          </text>
        </g>
      )}
      {/* Port handle — appears on hover for drawing branch connections */}
      {hov && (
        <circle cx={cx + DOT_R} cy={cy} r={5}
          fill="hsl(35 80% 40%)" stroke="white" strokeWidth="1.5"
          style={{ cursor: "crosshair" }}
          onMouseDown={e => { e.stopPropagation(); onPortMouseDown(e); }} />
      )}
    </g>
  );
}

// ── EventCircle ───────────────────────────────────────────────────────────────

function EventCircle({ step, cx, cy, isDragging, isTarget, onMouseDown, onPortMouseDown, onContextMenu }: {
  step: ProcessStep; cx: number; cy: number;
  isDragging?: boolean; isTarget?: boolean;
  onMouseDown: (e: React.MouseEvent) => void;
  onPortMouseDown: (e: React.MouseEvent) => void;
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
      <text x={cx} y={cy + EVT_R + 13} textAnchor="middle" dominantBaseline="middle"
        fontSize="10" fontWeight="600" fill={stroke}
        style={{ pointerEvents: "none", fontFamily: "IBM Plex Sans, system-ui, sans-serif" }}>
        {isStart ? "Start" : "Einde"}
      </text>
      <circle cx={cx + EVT_R} cy={cy} r={5}
        fill={stroke} stroke="white" strokeWidth="1.5"
        style={{ cursor: "crosshair" }}
        onMouseDown={e => { e.stopPropagation(); onPortMouseDown(e); }} />
    </g>
  );
}

// ── StepBox ───────────────────────────────────────────────────────────────────

function StepBox({ step, cx, cy, isDragging, isTarget, onClick, onPortMouseDown, onStepMouseDown, onContextMenu }: {
  step: ProcessStep; cx: number; cy: number;
  isDragging?: boolean; isTarget?: boolean;
  onClick: () => void;
  onPortMouseDown: (e: React.MouseEvent) => void;
  onStepMouseDown: (e: React.MouseEvent) => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}) {
  const [hov, setHov] = useState(false);
  const cfg = TEAM_CONFIG[step.team];
  const x = cx - STEP_W / 2, y = cy - STEP_H / 2;
  const label = step.label.length > 18 ? step.label.slice(0, 17) + "…" : step.label;

  return (
    <g style={{ opacity: isDragging ? 0.3 : 1 }}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      onContextMenu={onContextMenu}>
      {isTarget && (
        <rect x={x - 3} y={y - 3} width={STEP_W + 6} height={STEP_H + 6}
          rx="10" fill="none" stroke={cfg.stroke} strokeWidth="2" strokeDasharray="5 3" opacity="0.7" />
      )}
      <rect x={x} y={y} width={STEP_W} height={STEP_H} rx="8" fill="white"
        stroke={hov ? cfg.stroke : "#cbd5e1"} strokeWidth={hov ? 2 : 1.5}
        style={{ cursor: "pointer", filter: hov ? "drop-shadow(0 2px 6px rgba(0,0,0,.1))" : undefined }}
        onMouseDown={onStepMouseDown} onClick={onClick} />
      <rect x={x} y={y} width={4} height={STEP_H} rx="2" fill={cfg.stroke} style={{ pointerEvents: "none" }} />
      <text x={cx + 4} y={cy} textAnchor="middle" dominantBaseline="middle"
        fontSize="11.5" fontWeight="500" fill="#1e293b"
        style={{ pointerEvents: "none", fontFamily: "IBM Plex Sans, system-ui, sans-serif" }}>
        {label}
      </text>
      <circle cx={x + STEP_W} cy={cy} r={5} fill={cfg.stroke} stroke="white" strokeWidth="1.5"
        style={{ cursor: "crosshair" }}
        onMouseDown={e => { e.stopPropagation(); onPortMouseDown(e); }} />
    </g>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface ProcessCanvasProps {
  steps: ProcessStep[];
  connections: Connection[];
  automations: Automation[];
  onStepClick?: (s: ProcessStep) => void;
  onAutomationClick?: (a: Automation) => void;
  onAddConnection?: (fromId: string, toId: string) => void;
  onDeleteConnection?: (id: string) => void;
  onMoveStep?: (stepId: string, newTeam: TeamKey, newColumn: number, newRow: number) => void;
  onAttachAutomation?: (autoId: string, fromStepId: string, toStepId: string) => void;
  onAddStep?: (team: TeamKey, column: number, row: number) => void;
  onAddBranch?: (automationId: string, toStepId: string) => void;
  onUpdateConnectionLabel?: (connId: string, label: string) => void;
  onParkStep?: (stepId: string) => void;
  onPlaceStagedStep?: (step: ProcessStep, team: TeamKey, column: number, row: number) => void;
}

// ── Main component ────────────────────────────────────────────────────────────

export function ProcessCanvas({
  steps, connections, automations,
  onStepClick, onAutomationClick,
  onAddConnection, onDeleteConnection,
  onMoveStep, onAttachAutomation, onAddStep, onAddBranch, onUpdateConnectionLabel,
  onParkStep, onPlaceStagedStep,
}: ProcessCanvasProps) {
  const svgRef = useRef<SVGSVGElement>(null);

  const colX = useMemo(
    () => computeColX(steps, connections, automations),
    [steps, connections, automations],
  );

  // Dynamic lane heights and starts
  const laneStarts = useMemo(() => buildLaneStarts(steps), [steps]);
  const svgHeight  = useMemo(
    () => TEAM_ORDER.reduce((sum, t) => sum + laneHeightFn(t, steps), 0),
    [steps],
  );

  const lastCol = colX.length - 1;
  const lastColHasTask = steps.some(s => s.column === lastCol && !isEvent(s));
  // Extra trailing space so there's always room to drag/add after the last step
  const svgWidth = colX.length
    ? colX[lastCol] + (lastColHasTask ? STEP_W / 2 : EVT_R) + EDGE_PAD + BASE_COL_W * 2 + STEP_W
    : 800;

  // Interaction state
  const [hoveredConn, setHoveredConn] = useState<string | null>(null);
  const [drawing, setDrawing] = useState<{
    fromId: string; fromX: number; fromY: number; curX: number; curY: number;
  } | null>(null);
  const [dragging, setDragging] = useState<{
    stepId: string; startX: number; startY: number; curX: number; curY: number; moved: boolean;
  } | null>(null);
  // Always-current ref — assigned in render body (not useEffect) so it's synchronously up-to-date
  const draggingRef = useRef(dragging);
  draggingRef.current = dragging;
  const onParkStepRef = useRef(onParkStep);
  onParkStepRef.current = onParkStep;
  const [newStepDrag, setNewStepDrag] = useState<{ col: number; team: TeamKey; row: number } | null>(null);
  const [drawingBranch, setDrawingBranch] = useState<{
    automationId: string; startX: number; startY: number; curX: number; curY: number;
  } | null>(null);
  const [contextMenu, setContextMenu] = useState<
    | { type: "conn"; connId: string; x: number; y: number }
    | { type: "step"; stepId: string; x: number; y: number }
    | null
  >(null);
  const [editingLabel, setEditingLabel] = useState<{
    connId: string; x: number; y: number; value: string;
  } | null>(null);

  // Step-to-step connections only (not branch edges)
  const stepConnections = useMemo(
    () => connections.filter(c => !!c.fromStepId && !c.fromAutomationId),
    [connections],
  );

  // Branch edges only (automation → step)
  const branchConnections = useMemo(
    () => connections.filter(c => !!c.fromAutomationId),
    [connections],
  );

  // Stagger offsets for parallel orthogonal connections sharing the same column corridor.
  // Groups connections by (fromColumn, toColumn). Within each group, orthogonal connections
  // (different rows) get a midX offset so their vertical segments don't overlap.
  const connOffsets = useMemo(() => {
    const groups = new Map<string, string[]>();
    for (const conn of stepConnections) {
      const from = steps.find(s => s.id === conn.fromStepId);
      const to   = steps.find(s => s.id === conn.toStepId);
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
  }, [stepConnections, steps]);

  // Build a map of automationId → SVG dot center position
  const autoPositions = useMemo(() => {
    const map = new Map<string, Pt>();
    for (const conn of stepConnections) {
      const from = steps.find(s => s.id === conn.fromStepId);
      const to   = steps.find(s => s.id === conn.toStepId);
      if (!from || !to || colX[from.column] === undefined || colX[to.column] === undefined) continue;
      const connAutos = automations.filter(a => a.fromStepId === conn.fromStepId && a.toStepId === conn.toStepId);
      if (!connAutos.length) continue;
      const arrow = buildArrow(from, to, colX, laneStarts, connOffsets.get(conn.id) ?? 0);
      dotPositions(arrow.dotCenter, connAutos.length).forEach((pos, i) => {
        map.set(connAutos[i].id, pos);
      });
    }
    return map;
  }, [steps, stepConnections, automations, colX, laneStarts, connOffsets]);

  const clientToSvg = useCallback((clientX: number, clientY: number): Pt => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const r = svg.getBoundingClientRect();
    return {
      x: (clientX - r.left) * (svgWidth / r.width),
      y:  clientY - r.top,
    };
  }, [svgWidth]);

  const toSvg = useCallback((e: React.MouseEvent): Pt => {
    return clientToSvg(e.clientX, e.clientY);
  }, [clientToSvg]);

  // Returns the pixel X for an existing column, or the next new column position.
  // New column is placed just after the last step's right edge + standard padding.
  function getColX(col: number): number | undefined {
    if (col < colX.length) return colX[col];
    if (col === colX.length)
      return colX.length > 0
        ? colX[colX.length - 1] + STEP_W / 2 + EDGE_PAD * 2 + STEP_W / 2
        : LANE_HDR_W + STEP_W / 2 + EDGE_PAD;
    return undefined;
  }

  function nearestCol(x: number): number {
    let best = 0, bestDist = Infinity;
    colX.forEach((cx, i) => { const d = Math.abs(cx - x); if (d < bestDist) { bestDist = d; best = i; } });
    // Also allow snapping to a new column one step to the right
    const newCX = getColX(colX.length)!;
    if (Math.abs(newCX - x) < bestDist) return colX.length;
    return best;
  }

  // Snap y → {team, row}, allowing one new row beyond current max.
  // preferredTeam: when dragging a step, keep it in its own lane even if the
  // cursor strays into the extension zone below that lane.
  function nearestTeamRow(y: number): { team: TeamKey; row: number } {
    // Find the lane the cursor is currently in
    let best = TEAM_ORDER[0];
    for (const team of TEAM_ORDER) {
      if (y >= laneStarts[team]) best = team;
    }
    const laneStart = laneStarts[best];
    const lh        = laneHeightFn(best, steps);
    const maxR      = maxRowInLane(best, steps);

    // Bottom 35% of the lane = insert a new row
    if (y >= laneStart + lh - ROW_H * 0.35) {
      return { team: best, row: maxR + 1 };
    }

    // Otherwise snap to the nearest existing row
    const row = Math.max(0, Math.floor((y - laneStart) / ROW_H));
    return { team: best, row: Math.min(row, maxR) };
  }

  // Global mouseup: detect drag-to-right-of-SVG to park step in staging area.
  // Uses refs for dragging and onParkStep so this stable handler always sees current values.
  // 8px buffer prevents false positives when dropping exactly at the SVG's right edge.
  useEffect(() => {
    function onGlobalUp(e: MouseEvent) {
      const d = draggingRef.current;
      if (d?.moved) {
        const svgRect = svgRef.current?.getBoundingClientRect();
        if (svgRect && e.clientX > svgRect.right + 8) {
          onParkStepRef.current?.(d.stepId);
          setDragging(null);
          setDrawing(null);
          setDrawingBranch(null);
          return;
        }
      }
      setDragging(null);
      setDrawing(null);
      setDrawingBranch(null);
    }
    window.addEventListener("mouseup", onGlobalUp);
    return () => window.removeEventListener("mouseup", onGlobalUp);
  }, []); // stable: reads from refs

  // Mouse handlers
  function handlePortMouseDown(e: React.MouseEvent, step: ProcessStep) {
    e.stopPropagation();
    const pt  = toSvg(e);
    const scx = colX[step.column] ?? 0;
    const portX = scx + (isEvent(step) ? EVT_R : STEP_W / 2);
    setDrawing({ fromId: step.id, fromX: portX, fromY: stepCY(step, laneStarts), curX: pt.x, curY: pt.y });
  }

  function handleStepMouseDown(e: React.MouseEvent, step: ProcessStep) {
    if (e.button !== 0) return;
    const pt = toSvg(e);
    setDragging({ stepId: step.id, startX: pt.x, startY: pt.y, curX: pt.x, curY: pt.y, moved: false });
  }

  function handleMouseMove(e: React.MouseEvent) {
    const pt = toSvg(e);
    if (drawing) setDrawing(d => d ? { ...d, curX: pt.x, curY: pt.y } : null);
    if (dragging) {
      const moved = dragging.moved || Math.hypot(pt.x - dragging.startX, pt.y - dragging.startY) > 6;
      setDragging(d => d ? { ...d, curX: pt.x, curY: pt.y, moved } : null);
    }
    if (drawingBranch) setDrawingBranch(d => d ? { ...d, curX: pt.x, curY: pt.y } : null);
  }

  function handleMouseUp(e: React.MouseEvent) {
    const pt = toSvg(e);

    if (drawing) {
      const target = steps.find(s => {
        const scx = colX[s.column] ?? 0, scy = stepCY(s, laneStarts);
        if (isEvent(s)) return Math.hypot(pt.x - scx, pt.y - scy) <= EVT_R * 1.5 && s.id !== drawing.fromId;
        return Math.abs(pt.x - scx) <= STEP_W / 2 && Math.abs(pt.y - scy) <= STEP_H / 2 && s.id !== drawing.fromId;
      });
      if (target) onAddConnection?.(drawing.fromId, target.id);
      setDrawing(null);
    }

    if (drawingBranch) {
      const target = steps.find(s => {
        const scx = colX[s.column] ?? 0, scy = stepCY(s, laneStarts);
        if (isEvent(s)) return Math.hypot(pt.x - scx, pt.y - scy) <= EVT_R * 1.5;
        return Math.abs(pt.x - scx) <= STEP_W / 2 && Math.abs(pt.y - scy) <= STEP_H / 2;
      });
      if (target) onAddBranch?.(drawingBranch.automationId, target.id);
      setDrawingBranch(null);
    }

    if (dragging) {
      if (dragging.moved) {
        const { team, row } = nearestTeamRow(dragging.curY);
        onMoveStep?.(dragging.stepId, team, nearestCol(dragging.curX), row);
      }
      setDragging(null);
    }
  }

  const draggingStep = dragging ? steps.find(s => s.id === dragging.stepId) : null;
  const dragTarget = dragging?.moved
    ? { col: nearestCol(dragging.curX), ...nearestTeamRow(dragging.curY) }
    : null;

  // Show extension zone when cursor is targeting a new row
  const extensionTeam = dragTarget && dragTarget.row > maxRowInLane(dragTarget.team, steps)
    ? dragTarget.team : null;
  const effectiveSvgHeight = svgHeight + (extensionTeam ? ROW_H : 0);

  return (
    <div className="overflow-x-auto overflow-y-hidden w-full" style={{ height: effectiveSvgHeight }}>
      <svg ref={svgRef} width={svgWidth} height={effectiveSvgHeight}
        onMouseMove={handleMouseMove} onMouseUp={handleMouseUp}
        onMouseLeave={() => { setDrawing(null); }}
        onClick={() => setContextMenu(null)}
        onDragOver={e => {
          if (!e.dataTransfer.types.includes("newstep") && !e.dataTransfer.types.includes("stagedstep")) return;
          e.preventDefault();
          const pt = clientToSvg(e.clientX, e.clientY);
          const col = nearestCol(pt.x);
          const { team, row } = nearestTeamRow(pt.y);
          setNewStepDrag(prev =>
            prev?.col === col && prev.team === team && prev.row === row ? prev : { col, team, row }
          );
        }}
        onDragLeave={() => setNewStepDrag(null)}
        onDrop={e => {
          e.preventDefault();
          const pt  = clientToSvg(e.clientX, e.clientY);
          const col = nearestCol(pt.x);
          const { team, row } = nearestTeamRow(pt.y);
          setNewStepDrag(null);

          if (e.dataTransfer.getData("newStep") === "1") {
            onAddStep?.(team, col, row);
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
            <polygon points="0 0, 9 3.5, 0 7" fill="#d97706" />
          </marker>
        </defs>

        {/* ── Lane backgrounds (variable height, row dividers) ── */}
        {TEAM_ORDER.map(team => {
          const cfg    = TEAM_CONFIG[team];
          const startY = laneStarts[team];
          const lh     = laneHeightFn(team, steps);
          const maxR   = maxRowInLane(team, steps);

          return (
            <g key={team}>
              <rect x={0} y={startY} width={svgWidth} height={lh} fill={cfg.bg} />

              {/* Row dividers inside lane */}
              {Array.from({ length: maxR }, (_, r) => (
                <line key={r}
                  x1={LANE_HDR_W} y1={startY + (r + 1) * ROW_H}
                  x2={svgWidth}   y2={startY + (r + 1) * ROW_H}
                  stroke="#e2e8f0" strokeWidth="1" strokeDasharray="6 4" />
              ))}

              <line x1={0} y1={startY + lh} x2={svgWidth} y2={startY + lh}
                stroke="#e2e8f0" strokeWidth="1" />
              <rect x={0} y={startY} width={4} height={lh} fill={cfg.stroke} />
              <rect x={4} y={startY} width={LANE_HDR_W - 4} height={lh} fill={cfg.bg} />
              <line x1={LANE_HDR_W} y1={startY} x2={LANE_HDR_W} y2={startY + lh}
                stroke="#e2e8f0" strokeWidth="1" />
              <text x={LANE_HDR_W / 2 + 4} y={startY + lh / 2}
                textAnchor="middle" dominantBaseline="middle"
                fontSize="12" fontWeight="700" fill={cfg.text} letterSpacing="0.03em"
                style={{ fontFamily: "IBM Plex Sans, system-ui, sans-serif" }}>
                {cfg.label}
              </text>
            </g>
          );
        })}

        {/* ── Extension zone: ghost row below lane when dragging to a new row ── */}
        {extensionTeam && (() => {
          const cfg    = TEAM_CONFIG[extensionTeam];
          const startY = laneStarts[extensionTeam];
          const lh     = laneHeightFn(extensionTeam, steps);
          return (
            <g>
              <rect x={0} y={startY + lh} width={svgWidth} height={ROW_H}
                fill={cfg.bg} fillOpacity={0.6} />
              <rect x={0} y={startY + lh} width={4} height={ROW_H} fill={cfg.stroke} />
              <rect x={4} y={startY + lh} width={LANE_HDR_W - 4} height={ROW_H} fill={cfg.bg} fillOpacity={0.6} />
              <rect x={LANE_HDR_W} y={startY + lh} width={svgWidth - LANE_HDR_W} height={ROW_H}
                fill="none" stroke={cfg.stroke} strokeWidth={1.5} strokeDasharray="8 4" opacity={0.5} />
            </g>
          );
        })()}

        {/* ── Connections (step-to-step only) ── */}
        {stepConnections.map(conn => {
          const from = steps.find(s => s.id === conn.fromStepId);
          const to   = steps.find(s => s.id === conn.toStepId);
          if (!from || !to || colX[from.column] === undefined || colX[to.column] === undefined) return null;
          const arrow = buildArrow(from, to, colX, laneStarts, connOffsets.get(conn.id) ?? 0);
          const isHov = hoveredConn === conn.id;
          const connAutos = automations.filter(a => a.fromStepId === conn.fromStepId && a.toStepId === conn.toStepId);
          const hasAuto = connAutos.length > 0;
          const mid = arrow.postDotMid;
          const isEditingPost = editingLabel?.connId === conn.id;
          const postLabelText = conn.label || "";
          const postEstW = Math.max(80, (postLabelText.length) * 5.5 + 16);
          return (
            <g key={conn.id}>
              {/* Pre-dot segment always in gray; post-dot in amber dashed when automation sits on this connection */}
              {hasAuto ? (
                <>
                  <path d={arrow.preDotPath} stroke={isHov ? "#3b82f6" : "#94a3b8"} strokeWidth="1.5" fill="none"
                    strokeDasharray={isHov ? "6 3" : undefined} style={{ pointerEvents: "none" }} />
                  <path d={arrow.postDotPath} stroke="#d97706" strokeWidth="1.5" strokeDasharray="5 3" fill="none"
                    markerEnd={`url(#${isHov ? "ah-h" : "ah-branch"})`} opacity={0.85} style={{ pointerEvents: "none" }} />
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
                      <rect x={mid.x - postEstW / 2} y={mid.y - 8} width={postEstW} height={16}
                        fill="white" fillOpacity={0.92} rx={2} />
                      <text x={mid.x} y={mid.y} textAnchor="middle" dominantBaseline="middle"
                        fontSize={10} fontWeight={500} fill="#92400e">
                        {postLabelText}
                      </text>
                    </g>
                  ) : null}
                </>
              ) : (
                <path d={arrow.path} stroke={isHov ? "#3b82f6" : "#94a3b8"} strokeWidth="1.5" fill="none"
                  markerEnd={`url(#${isHov ? "ah-h" : "ah"})`}
                  strokeDasharray={isHov ? "6 3" : undefined} style={{ pointerEvents: "none" }} />
              )}
              <path d={arrow.path} stroke="transparent" strokeWidth="22" fill="none" className="cursor-pointer"
                onMouseEnter={() => setHoveredConn(conn.id)}
                onMouseLeave={() => setHoveredConn(null)}
                onClick={() => { if (hasAuto) setEditingLabel({ connId: conn.id, x: mid.x, y: mid.y, value: conn.label ?? "" }); }}
                onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setContextMenu({ type: "conn", connId: conn.id, x: e.clientX, y: e.clientY }); }}
                onDragOver={e => { e.preventDefault(); setHoveredConn(conn.id); }}
                onDragLeave={() => setHoveredConn(null)}
                onDrop={e => {
                  e.preventDefault();
                  const autoId = e.dataTransfer.getData("automationId");
                  if (autoId) onAttachAutomation?.(autoId, conn.fromStepId, conn.toStepId);
                  setHoveredConn(null);
                }} />
            </g>
          );
        })}

        {/* ── Automation dots ── */}
        {stepConnections.flatMap(conn => {
          const from = steps.find(s => s.id === conn.fromStepId);
          const to   = steps.find(s => s.id === conn.toStepId);
          if (!from || !to || colX[from.column] === undefined || colX[to.column] === undefined) return [];
          const connAutos = automations.filter(a => a.fromStepId === conn.fromStepId && a.toStepId === conn.toStepId);
          if (!connAutos.length) return [];
          const arrow = buildArrow(from, to, colX, laneStarts, connOffsets.get(conn.id) ?? 0);
          return dotPositions(arrow.dotCenter, connAutos.length).map((pos, i) => (
            <AutomationDot key={connAutos[i].id} auto={connAutos[i]} cx={pos.x} cy={pos.y}
              onClick={ev => { ev.stopPropagation(); onAutomationClick?.(connAutos[i]); }}
              onPortMouseDown={ev => {
                ev.stopPropagation();
                setDrawingBranch({
                  automationId: connAutos[i].id,
                  startX: pos.x + DOT_R, startY: pos.y,
                  curX: pos.x + DOT_R, curY: pos.y,
                });
              }} />
          ));
        })}

        {/* ── Steps & Events ── */}
        {steps.map(step => {
          const cx = colX[step.column];
          const cy = stepCY(step, laneStarts);
          if (cx === undefined) return null;

          const isDrag   = !!(dragging?.stepId === step.id && dragging.moved);
          const isTarget = !!(dragTarget &&
            dragTarget.col  === step.column &&
            dragTarget.team === step.team &&
            dragTarget.row  === stepRow(step) &&
            dragging?.stepId !== step.id);

          if (isEvent(step)) {
            return (
              <EventCircle key={step.id} step={step} cx={cx} cy={cy}
                isDragging={isDrag} isTarget={isTarget}
                onMouseDown={e => { e.stopPropagation(); handleStepMouseDown(e, step); }}
                onPortMouseDown={e => handlePortMouseDown(e, step)}
                onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setContextMenu({ type: "step", stepId: step.id, x: e.clientX, y: e.clientY }); }} />
            );
          }

          return (
            <StepBox key={step.id} step={step} cx={cx} cy={cy}
              isDragging={isDrag} isTarget={isTarget}
              onClick={() => { if (!dragging?.moved) onStepClick?.(step); }}
              onPortMouseDown={e => handlePortMouseDown(e, step)}
              onStepMouseDown={e => handleStepMouseDown(e, step)}
              onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setContextMenu({ type: "step", stepId: step.id, x: e.clientX, y: e.clientY }); }} />
          );
        })}

        {/* ── Drag ghost ── */}
        {dragging?.moved && (() => {
          const step = steps.find(s => s.id === dragging.stepId);
          if (!step) return null;
          const gx = dragging.curX, gy = dragging.curY;

          if (isEvent(step)) {
            const isStart = step.type === "start";
            const fill = isStart ? "#dcfce7" : "#fee2e2";
            const str  = isStart ? "#16a34a" : "#dc2626";
            const targetCY = dragTarget
              ? laneStarts[dragTarget.team] + dragTarget.row * ROW_H + ROW_H / 2
              : gy;
            return (
              <g opacity={0.6} style={{ pointerEvents: "none" }}>
                <circle cx={gx} cy={gy} r={EVT_R} fill={fill} stroke={str} strokeWidth={isStart ? 2.5 : 4} />
                <circle cx={gx} cy={gy} r={isStart ? EVT_R * 0.38 : EVT_R * 0.55} fill={str} />
                {dragTarget && getColX(dragTarget.col) !== undefined && (
                  <circle cx={getColX(dragTarget.col)!} cy={targetCY} r={EVT_R + 6}
                    fill="none" stroke="#3b82f6" strokeWidth="2" strokeDasharray="5 3" opacity="0.6" />
                )}
              </g>
            );
          }

          const isNewRow = !!(dragTarget && dragTarget.row > maxRowInLane(dragTarget.team, steps));
          const targetCY = dragTarget
            ? isNewRow
              ? laneStarts[dragTarget.team] + laneHeightFn(dragTarget.team, steps)
              : laneStarts[dragTarget.team] + dragTarget.row * ROW_H + ROW_H / 2
            : gy;

          return (
            <g opacity={0.65} style={{ pointerEvents: "none" }}>
              {/* Ghost card following cursor */}
              <rect x={gx - STEP_W / 2} y={gy - STEP_H / 2} width={STEP_W} height={STEP_H}
                rx="8" fill="white" stroke={TEAM_CONFIG[step.team].stroke} strokeWidth="2" />
              <rect x={gx - STEP_W / 2} y={gy - STEP_H / 2} width={4} height={STEP_H}
                rx="2" fill={TEAM_CONFIG[step.team].stroke} />
              <text x={gx + 4} y={gy} textAnchor="middle" dominantBaseline="middle"
                fontSize="11.5" fontWeight="500" fill="#1e293b"
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
          const isNewRow = row > maxRowInLane(team, steps);
          const cy = isNewRow
            ? laneStarts[team] + laneHeightFn(team, steps)
            : laneStarts[team] + row * ROW_H + ROW_H / 2;
          const cfg = TEAM_CONFIG[team];
          return (
            <g style={{ pointerEvents: "none" }}>
              <rect
                x={cx - STEP_W / 2 - 3} y={cy - STEP_H / 2 - 3}
                width={STEP_W + 6} height={STEP_H + 6} rx="10"
                fill={cfg.bg} fillOpacity={0.6}
                stroke={cfg.stroke} strokeWidth="2" strokeDasharray="5 3"
              />
              <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle"
                fontSize="11" fill={cfg.text} fontWeight="500" opacity={0.7}
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
          const target = steps.find(s => s.id === conn.toStepId);
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
          const isEditing = editingLabel?.connId === conn.id;

          return (
            <g key={conn.id}>
              {/* Invisible wide hit area */}
              <path d={branchPath} stroke="transparent" strokeWidth="18" fill="none"
                className="cursor-pointer"
                onClick={() => setEditingLabel({ connId: conn.id, x: mid.x, y: mid.y, value: conn.label ?? "" })}
                onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setContextMenu({ type: "conn", connId: conn.id, x: e.clientX, y: e.clientY }); }} />
              {/* Visible path */}
              <path d={branchPath} stroke="#d97706" strokeWidth="1.5" strokeDasharray="5 3" fill="none"
                markerEnd="url(#ah-branch)" opacity={0.75} style={{ pointerEvents: "none" }} />
              {/* Label always horizontal, offset from midpoint so it doesn't overlap the line */}
              {isEditing ? (
                <foreignObject x={mid.x - estW / 2 + labelOffsetX} y={mid.y - 13 + labelOffsetY} width={estW} height={26}>
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
                      width: "100%", height: "100%", fontSize: 10, fontWeight: 500,
                      textAlign: "center", border: "1.5px solid #d97706", borderRadius: 3,
                      padding: "0 4px", background: "white", color: "#92400e",
                      outline: "none", fontFamily: "IBM Plex Sans, system-ui, sans-serif",
                    }}
                  />
                </foreignObject>
              ) : (
                <g className="cursor-pointer"
                  onClick={() => setEditingLabel({ connId: conn.id, x: mid.x, y: mid.y, value: conn.label ?? "" })}>
                  <rect
                    x={mid.x - estW / 2 + labelOffsetX} y={mid.y - 9 + labelOffsetY}
                    width={estW} height={18} rx="3"
                    fill="white" fillOpacity={0.92}
                    style={{ pointerEvents: "none" }}
                  />
                  <text x={mid.x + labelOffsetX} y={mid.y + labelOffsetY} textAnchor="middle" dominantBaseline="middle"
                    fontSize="10" fontWeight="500" fill={conn.label ? "#92400e" : "#d97706"}
                    fillOpacity={conn.label ? 1 : 0.5}
                    style={{ fontFamily: "IBM Plex Sans, system-ui, sans-serif", pointerEvents: "none" }}>
                    {labelText}
                  </text>
                </g>
              )}
            </g>
          );
        })}

        {/* ── Connection preview ── */}
        {drawing && (
          <line x1={drawing.fromX} y1={drawing.fromY} x2={drawing.curX} y2={drawing.curY}
            stroke="#3b82f6" strokeWidth="1.5" strokeDasharray="6 3"
            markerEnd="url(#ah-d)" style={{ pointerEvents: "none" }} />
        )}

        {/* ── Branch drawing preview (orthogonal) ── */}
        {drawingBranch && (() => {
          const { startX, startY, curX, curY } = drawingBranch;
          const midX = (startX + curX) / 2;
          const previewPath = `M ${startX} ${startY} L ${midX} ${startY} L ${midX} ${curY} L ${curX} ${curY}`;
          return (
            <path d={previewPath} stroke="#d97706" strokeWidth="1.5" strokeDasharray="6 3" fill="none"
              markerEnd="url(#ah-branch)" style={{ pointerEvents: "none" }} />
          );
        })()}
      </svg>

      {/* ── Context menu ── */}
      {contextMenu && (
        <div
          className="fixed z-50 bg-white border border-border rounded-lg shadow-lg py-1 min-w-[160px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onMouseLeave={() => setContextMenu(null)}
        >
          {contextMenu.type === "conn" && (
            <button
              className="w-full text-left px-3 py-1.5 text-sm text-destructive hover:bg-destructive/10 transition-colors"
              onClick={() => { onDeleteConnection?.(contextMenu.connId); setContextMenu(null); }}
            >
              Verbinding verwijderen
            </button>
          )}
          {contextMenu.type === "step" && (
            <button
              className="w-full text-left px-3 py-1.5 text-sm hover:bg-secondary/50 transition-colors"
              onClick={() => { onParkStep?.(contextMenu.stepId); setContextMenu(null); }}
            >
              Parkeer stap
            </button>
          )}
        </div>
      )}
    </div>
  );
}
