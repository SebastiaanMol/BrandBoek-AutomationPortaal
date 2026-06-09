import { useRef, useState, useCallback, useEffect, useMemo } from "react";
import type { ProcessState, ProcessStep, Connection } from "@/data/processData";
import { getLaneConfig, isPipelineStep, TEAM_ORDER } from "@/data/processData";
import { BpmnToolbar } from "./BpmnToolbar";
import { BpmnLegend } from "./BpmnLegend";
import { BpmnStatusBar } from "./BpmnStatusBar";

// ── Layout constants (spec values) ──────────────────────────────────────────
const LANE_LABEL_W = 80;
const ROW_H        = 100;
const STEP_W       = 140;
const STEP_H       = 52;
const GATEWAY_SIZE = 22;   // half-size for the diamond (44px total)
const EVT_R        = 16;
const COL_W        = 220;
const EDGE_PAD     = STEP_W / 2 + 16;
const MIN_ZOOM     = 0.25;
const MAX_ZOOM     = 2.0;
const ZOOM_STEP    = 0.1;
const GRID_SIZE    = 28;

// ── Connector colours ────────────────────────────────────────────────────────
const COLOR_MAIN     = "#3B82F6";
const COLOR_OPTIONAL = "#F97316";
const COLOR_END      = "#DC2626";

// ── Lane override colours per spec ──────────────────────────────────────────
const LANE_COLOR_OVERRIDES: Record<string, string> = {
  marketing:    "#6366F1",
  sales:        "#2563EB",
  onboarding:   "#059669",
  klantrelaties:"#DB2777",
};

interface ProcessviewerCanvasProps {
  processState: ProcessState;
  onStepClick?: (stepId: string) => void;
  onAutoClick?: (autoId: string) => void;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return m ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) } : null;
}

function isEvent(step: ProcessStep): boolean {
  return step.type === "start" || step.type === "end" || step.type === "terminate" ||
    step.type === "send" || step.type === "receive";
}

function isDecision(step: ProcessStep): boolean {
  return step.type === "decision" || step.type === "and";
}

function stepRow(step: ProcessStep): number {
  return step.row ?? 0;
}

function maxRowInLane(lane: string, steps: ProcessStep[]): number {
  const rows = steps.filter((s) => s.team === lane && !isEvent(s)).map(stepRow);
  return rows.length ? Math.max(...rows) : 0;
}

function laneHeight(lane: string, steps: ProcessStep[]): number {
  return (maxRowInLane(lane, steps) + 1) * ROW_H;
}

function buildLaneStarts(steps: ProcessStep[], lanes: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  let y = 0;
  for (const lane of lanes) {
    map[lane] = y;
    y += laneHeight(lane, steps);
  }
  return map;
}

function buildColMap(steps: ProcessStep[]): Map<number, number> {
  const sorted = [...new Set(steps.map((s) => s.column))].sort((a, b) => a - b);
  return new Map(sorted.map((col, i) => [col, i]));
}

function colX(normPos: number): number {
  return LANE_LABEL_W + EDGE_PAD + normPos * COL_W;
}

function stepCx(step: ProcessStep, colMap: Map<number, number>): number {
  return colX(colMap.get(step.column) ?? step.column);
}
function stepCy(step: ProcessStep, laneStarts: Record<string, number>): number {
  const start = laneStarts[step.team] ?? 0;
  return start + stepRow(step) * ROW_H + ROW_H / 2;
}

// ── Arrow path builder ───────────────────────────────────────────────────────
function buildArrowPath(
  fx: number, fy: number,
  tx: number, ty: number,
): string {
  if (Math.abs(fy - ty) < 4) {
    // horizontal
    return `M ${fx} ${fy} L ${tx} ${ty}`;
  }
  if (Math.abs(fx - tx) < 4) {
    // vertical
    return `M ${fx} ${fy} L ${tx} ${ty}`;
  }
  // orthogonal: go right from source midpoint, then down/up to target
  const midX = (fx + tx) / 2;
  const r = 10;
  const dy = ty > fy ? r : -r;
  const dx = tx > fx ? r : -r;
  return `M ${fx} ${fy} H ${midX - dx} Q ${midX} ${fy} ${midX} ${fy + dy} V ${ty - dy} Q ${midX} ${ty} ${midX + dx} ${ty} H ${tx}`;
}

// ── Node edge helpers ────────────────────────────────────────────────────────
function nodeRightX(step: ProcessStep, colMap: Map<number, number>): number {
  const cx = stepCx(step, colMap);
  if (isEvent(step)) return cx + EVT_R;
  if (isDecision(step)) return cx + GATEWAY_SIZE;
  return cx + STEP_W / 2;
}
function nodeLeftX(step: ProcessStep, colMap: Map<number, number>): number {
  const cx = stepCx(step, colMap);
  if (isEvent(step)) return cx - EVT_R;
  if (isDecision(step)) return cx - GATEWAY_SIZE;
  return cx - STEP_W / 2;
}
function nodeBottomY(step: ProcessStep, cy: number): number {
  if (isEvent(step)) return cy + EVT_R;
  if (isDecision(step)) return cy + GATEWAY_SIZE;
  return cy + STEP_H / 2;
}
function nodeTopY(step: ProcessStep, cy: number): number {
  if (isEvent(step)) return cy - EVT_R;
  if (isDecision(step)) return cy - GATEWAY_SIZE;
  return cy - STEP_H / 2;
}

// ── Automation dot position ──────────────────────────────────────────────────
function autoDotPos(
  from: ProcessStep,
  to: ProcessStep,
  laneStarts: Record<string, number>,
  colMap: Map<number, number>,
): { x: number; y: number } {
  const fx = nodeRightX(from, colMap);
  const fy = stepCy(from, laneStarts);
  const tx = nodeLeftX(to, colMap);
  const ty = stepCy(to, laneStarts);
  if (Math.abs(fy - ty) < 4) return { x: (fx + tx) / 2, y: fy };       // horizontal
  if (Math.abs(fx - tx) < 4) return { x: fx, y: (fy + ty) / 2 };       // vertical
  const midX = (fx + tx) / 2;
  return { x: (fx + midX) / 2, y: fy };                                  // orthogonal
}

// ── Connection colour ────────────────────────────────────────────────────────
function connColor(from: ProcessStep | undefined, to: ProcessStep | undefined): string {
  if (to?.type === "end" || to?.type === "terminate") return COLOR_END;
  if (from?.type === "decision") return COLOR_OPTIONAL;
  return COLOR_MAIN;
}

// ── Drag helpers ─────────────────────────────────────────────────────────────
function nearestLane(
  svgY: number,
  laneStarts: Record<string, number>,
  lanes: string[],
  steps: ProcessStep[],
): string {
  let best = lanes[0];
  for (const lane of lanes) {
    if (svgY >= laneStarts[lane]) best = lane;
  }
  return best;
}

function nearestRow(svgY: number, lane: string, laneStarts: Record<string, number>, steps: ProcessStep[]): number {
  const start = laneStarts[lane] ?? 0;
  const maxR = maxRowInLane(lane, steps);
  const row = Math.max(0, Math.round((svgY - start - ROW_H / 2) / ROW_H));
  return Math.min(row, maxR);
}

function nearestCol(svgX: number, maxCol: number): number {
  const col = Math.max(0, Math.round((svgX - LANE_LABEL_W - EDGE_PAD) / COL_W));
  return Math.min(col, maxCol);
}

function snapCol(svgX: number): number {
  return Math.max(0, Math.round((svgX - LANE_LABEL_W - EDGE_PAD) / COL_W));
}

function snapRow(svgY: number, lane: string, laneStarts: Record<string, number>): number {
  const start = laneStarts[lane] ?? 0;
  return Math.max(0, Math.round((svgY - start - ROW_H / 2) / ROW_H));
}

function isOccupied(lane: string, row: number, col: number, steps: ProcessStep[], colMap: Map<number, number>): boolean {
  return steps.some((s) => s.team === lane && (s.row ?? 0) === row && (colMap.get(s.column) ?? s.column) === col);
}

// Detect if svgY is within SNAP_PX of a row-separator line inside a lane
const SNAP_PX = 14;
function rowSepUnder(svgY: number, lane: string, laneStarts: Record<string, number>, steps: ProcessStep[]): number | null {
  const start = laneStarts[lane] ?? 0;
  const maxR   = maxRowInLane(lane, steps);
  for (let r = 0; r <= maxR; r++) {
    const lineY = start + (r + 1) * ROW_H;
    if (Math.abs(svgY - lineY) < SNAP_PX) return r; // returns the row ABOVE the separator
  }
  return null;
}

function laneHasStepsInRow(lane: string, row: number, steps: ProcessStep[]): boolean {
  return steps.some((s) => s.team === lane && (s.row ?? 0) === row);
}

// ── Component ────────────────────────────────────────────────────────────────
export function ProcessviewerCanvas({ processState, onStepClick, onAutoClick }: ProcessviewerCanvasProps): React.ReactNode {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef       = useRef<SVGSVGElement>(null);

  const [zoom, setZoom]         = useState(1.0);
  const [panX, setPanX]         = useState(24);
  const [panY, setPanY]         = useState(24);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isAnimating, setIsAnimating]   = useState(false);

  const panRef = useRef<{ startX: number; startY: number; px: number; py: number } | null>(null);

  const { steps, connections, automations, customLanes, activeLanes } = processState;

  const visibleLanes = useMemo<string[]>(() => {
    const all = [...TEAM_ORDER, ...(customLanes?.map((l) => l.key) ?? [])];
    if (!activeLanes?.length) return all.filter((l) => steps.some((s) => s.team === l));
    return activeLanes.filter((l) => all.includes(l));
  }, [steps, activeLanes, customLanes]);

  const laneStarts = useMemo(
    () => buildLaneStarts(steps, visibleLanes),
    [steps, visibleLanes],
  );

  const svgHeight = useMemo(
    () => visibleLanes.reduce((h, l) => h + laneHeight(l, steps), 0),
    [steps, visibleLanes],
  );

  const colMap = useMemo(() => buildColMap(steps), [steps]);
  const maxNormCol = Math.max(0, colMap.size - 1);
  const svgWidth = colX(maxNormCol) + EDGE_PAD + 20;

  // Auto-fit when content loads or changes
  const fittedRef = useRef<string>("");
  useEffect(() => {
    const key = `${svgWidth}x${svgHeight}`;
    if (key === fittedRef.current || !containerRef.current || svgWidth < 10 || svgHeight < 10) return;
    fittedRef.current = key;
    const cw = containerRef.current.clientWidth;
    const ch = containerRef.current.clientHeight;
    const PAD = 40;
    // Fit by height so nodes stay readable; minimum 65% zoom
    const fitByH = (ch - PAD * 2) / svgHeight;
    const fitByW = (cw - PAD * 2) / svgWidth;
    const rawZ = Math.min(fitByH, fitByW, 1.0);
    const z = Math.max(0.65, Math.round(rawZ * 20) / 20); // step by 0.05
    const scaledW = svgWidth * z;
    // Centre if content fits, otherwise left-align with padding
    const px = scaledW <= cw - PAD * 2 ? Math.max(PAD, (cw - scaledW) / 2) : PAD;
    const py = PAD;
    setIsAnimating(true);
    setZoom(z);
    setPanX(px);
    setPanY(py);
    setTimeout(() => setIsAnimating(false), 350);
  }, [svgWidth, svgHeight]);

  // Legend lane list
  const legendLanes = useMemo(
    () => visibleLanes.map((key) => {
      const cfg = getLaneConfig(key, customLanes ?? []);
      const color = LANE_COLOR_OVERRIDES[key] ?? cfg.stroke;
      return { name: cfg.label, color };
    }),
    [visibleLanes, customLanes],
  );

  // ── Zoom toward cursor ────────────────────────────────────────────────────
  const applyZoom = useCallback((delta: number, clientX?: number, clientY?: number) => {
    setZoom((prev) => {
      const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, parseFloat((prev + delta).toFixed(2))));
      if (next === prev) return prev;
      if (clientX !== undefined && clientY !== undefined && containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const cx = clientX - rect.left;
        const cy = clientY - rect.top;
        setPanX((px) => cx - (cx - px) * (next / prev));
        setPanY((py) => cy - (cy - py) * (next / prev));
      }
      return next;
    });
  }, []);

  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    applyZoom(e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP, e.clientX, e.clientY);
  }, [applyZoom]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, [handleWheel]);

  // ── Fullscreen ────────────────────────────────────────────────────────────
  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  }, []);

  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  // ── Pan handlers ──────────────────────────────────────────────────────────
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    panRef.current = { startX: e.clientX, startY: e.clientY, px: panX, py: panY };
  }, [panX, panY]);

  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!panRef.current) return;
      setPanX(panRef.current.px + (e.clientX - panRef.current.startX));
      setPanY(panRef.current.py + (e.clientY - panRef.current.startY));
    }
    function onUp() {
      panRef.current = null;
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  // ── SVG coordinate from client ────────────────────────────────────────────
  const clientToSvg = useCallback((clientX: number, clientY: number) => {
    const rect = containerRef.current?.getBoundingClientRect() ?? { left: 0, top: 0 };
    return {
      x: (clientX - rect.left - panX) / zoom,
      y: (clientY - rect.top  - panY) / zoom,
    };
  }, [panX, panY, zoom]);


  const resetView = useCallback(() => {
    if (!containerRef.current) return;
    const cw = containerRef.current.clientWidth;
    const ch = containerRef.current.clientHeight;
    const PAD = 40;
    const rawZ = Math.min((cw - PAD * 2) / svgWidth, (ch - PAD * 2) / svgHeight, 1.0);
    const z = Math.max(0.65, Math.round(rawZ * 20) / 20);
    setIsAnimating(true);
    setZoom(z);
    setPanX(Math.max(PAD, (cw - svgWidth * z) / 2));
    setPanY(PAD);
    setTimeout(() => setIsAnimating(false), 350);
  }, [svgWidth, svgHeight]);

  // ── Cursor style ──────────────────────────────────────────────────────────
  const cursor = panRef.current ? "grabbing" : "grab";

  return (
    <div
      ref={containerRef}
      className="relative flex-1 min-h-0 overflow-hidden select-none"
      style={{
        background: "#F8FAFC",
        backgroundImage: `
          repeating-linear-gradient(0deg, rgba(0,0,0,0.04) 0px, transparent 1px, transparent ${GRID_SIZE}px),
          repeating-linear-gradient(90deg, rgba(0,0,0,0.04) 0px, transparent 1px, transparent ${GRID_SIZE}px)
        `,
        backgroundSize: `${GRID_SIZE}px ${GRID_SIZE}px`,
        cursor,
      }}
      onMouseDown={onMouseDown}
    >
      {/* Canvas */}
      <div
        style={{
          transform: `translate(${panX}px, ${panY}px) scale(${zoom})`,
          transformOrigin: "0 0",
          position: "absolute",
          top: 0,
          left: 0,
          transition: isAnimating ? "transform 320ms cubic-bezier(0.4,0,0.2,1)" : undefined,
        }}
      >
        <svg
          ref={svgRef}
          width={svgWidth}
          height={svgHeight}
          style={{ overflow: "visible", display: "block" }}
        >
          <defs>
            <ArrowMarkers />
          </defs>

          {/* Swimlanes */}
          {visibleLanes.map((lane) => (
            <Lane
              key={lane}
              lane={lane}
              laneStarts={laneStarts}
              steps={steps}
              customLanes={customLanes ?? []}
              svgWidth={svgWidth}
            />
          ))}

          {/* Connections */}
          {connections.map((conn) => {
            if (!conn.fromStepId) return null;
            const from = steps.find((s) => s.id === conn.fromStepId);
            const to   = steps.find((s) => s.id === conn.toStepId);
            if (!from || !to) return null;
            return (
              <ConnectorLine
                key={conn.id}
                from={from}
                to={to}
                laneStarts={laneStarts}
                label={conn.label}
                colMap={colMap}
              />
            );
          })}

          {/* Automations */}
          {automations.map((auto) => {
            if (!auto.fromStepId || !auto.toStepId) return null;
            const from = steps.find((s) => s.id === auto.fromStepId);
            const to   = steps.find((s) => s.id === auto.toStepId);
            if (!from || !to) return null;
            const { x, y } = autoDotPos(from, to, laneStarts, colMap);
            return (
              <AutomationDot
                key={auto.id}
                cx={x} cy={y}
                name={auto.name}
                onClick={() => onAutoClick?.(auto.id)}
              />
            );
          })}

          {/* Steps — click only, no drag */}
          {steps.map((step) => {
            const cx = stepCx(step, colMap);
            const cy = stepCy(step, laneStarts);
            return (
              <BpmnNode
                key={step.id}
                step={step}
                cx={cx}
                cy={cy}
                onMouseDown={onStepClick ? (e) => { e.stopPropagation(); } : undefined}
                onClick={onStepClick ? () => onStepClick(step.id) : undefined}
              />
            );
          })}
        </svg>
      </div>

      {/* Overlay controls */}
      <BpmnToolbar
        zoom={zoom}
        onZoomIn={() => applyZoom(ZOOM_STEP)}
        onZoomOut={() => applyZoom(-ZOOM_STEP)}
        onReset={resetView}
        onFullscreen={toggleFullscreen}
        isFullscreen={isFullscreen}
      />

      <BpmnLegend lanes={legendLanes} />

      <BpmnStatusBar steps={steps} activeLanes={visibleLanes} />
    </div>
  );
}

// ── SVG sub-components ───────────────────────────────────────────────────────

function ArrowMarkers(): React.ReactNode {
  return (
    <>
      <marker id="pvah-main" markerWidth="9" markerHeight="7" refX="8" refY="3.5" orient="auto">
        <polygon points="0 0, 9 3.5, 0 7" fill={COLOR_MAIN} />
      </marker>
      <marker id="pvah-opt" markerWidth="9" markerHeight="7" refX="8" refY="3.5" orient="auto">
        <polygon points="0 0, 9 3.5, 0 7" fill={COLOR_OPTIONAL} />
      </marker>
      <marker id="pvah-end" markerWidth="9" markerHeight="7" refX="8" refY="3.5" orient="auto">
        <polygon points="0 0, 9 3.5, 0 7" fill={COLOR_END} />
      </marker>
    </>
  );
}

function Lane({
  lane, laneStarts, steps, customLanes, svgWidth,
}: {
  lane: string;
  laneStarts: Record<string, number>;
  steps: ProcessStep[];
  customLanes: import("@/data/processData").CustomLane[];
  svgWidth: number;
}): React.ReactNode {
  const cfg = getLaneConfig(lane, customLanes);
  const hexColor = LANE_COLOR_OVERRIDES[lane];
  const rgb = hexColor ? hexToRgb(hexColor) : null;

  const contentBg  = rgb ? `rgba(${rgb.r},${rgb.g},${rgb.b},0.04)` : cfg.bg;
  const labelColor = hexColor ?? cfg.stroke;

  const y  = laneStarts[lane] ?? 0;
  const lh = laneHeight(lane, steps);
  const maxR = maxRowInLane(lane, steps);

  return (
    <g>
      {/* Content background */}
      <rect x={0} y={y} width={svgWidth} height={lh} fill={contentBg} />
      {/* Label column */}
      <rect x={0} y={y} width={LANE_LABEL_W} height={lh} fill={labelColor} fillOpacity={0.1} />
      {/* Bottom separator */}
      <line x1={0} y1={y + lh} x2={svgWidth} y2={y + lh} stroke="#E2E8F0" strokeWidth={0.5} />
      {/* Row dividers */}
      {Array.from({ length: maxR }, (_, i) => (
        <line
          key={i}
          x1={LANE_LABEL_W}
          y1={y + (i + 1) * ROW_H}
          x2={svgWidth}
          y2={y + (i + 1) * ROW_H}
          stroke="#E2E8F0"
          strokeWidth={0.5}
          strokeDasharray="4 4"
        />
      ))}
      {/* Horizontal label via foreignObject */}
      <foreignObject x={0} y={y} width={LANE_LABEL_W} height={lh}>
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "6px 4px",
            textAlign: "center",
            fontSize: "9px",
            fontWeight: "700",
            letterSpacing: "0.6px",
            textTransform: "uppercase",
            color: labelColor,
            lineHeight: 1.3,
            wordBreak: "break-word",
            overflowWrap: "break-word",
            fontFamily: "IBM Plex Sans, system-ui, sans-serif",
            userSelect: "none",
          }}
        >
          {cfg.label}
        </div>
      </foreignObject>
    </g>
  );
}

function ConnectorLine({
  from, to, laneStarts, label, colMap,
}: {
  from: ProcessStep;
  to: ProcessStep;
  laneStarts: Record<string, number>;
  label?: string;
  colMap: Map<number, number>;
}): React.ReactNode {
  const color = connColor(from, to);
  const markerId = color === COLOR_END ? "pvah-end" : color === COLOR_OPTIONAL ? "pvah-opt" : "pvah-main";
  const dashed = from.type === "decision";

  const fy = stepCy(from, laneStarts);
  const ty = stepCy(to,   laneStarts);

  const fromCx = stepCx(from, colMap);
  const toCx   = stepCx(to,   colMap);
  const isGwTarget = to.type === "decision" || to.type === "and";

  let fx: number, tx: number, d: string, midX: number, midY: number;
  // Same column → straight vertical using node-type-aware exit/entry points
  if (from.column === to.column) {
    fx = fromCx; tx = toCx;
    const down   = fy < ty;
    const startY = down ? nodeBottomY(from, fy) : nodeTopY(from, fy);
    const endY   = down ? nodeTopY(to, ty)      : nodeBottomY(to, ty);
    d    = `M ${fx} ${startY} L ${tx} ${endY}`;
    midX = fx;
    midY = (startY + endY) / 2;
  } else {
    // Standard routing: exit right/left of source, enter left/right of target
    fx = nodeRightX(from, colMap);
    tx = nodeLeftX(to, colMap);
    d = buildArrowPath(fx, fy, tx, ty);
    midX = (fx + tx) / 2;
    midY = (fy + ty) / 2;
  }

  return (
    <g>
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeDasharray={dashed ? "6 3" : undefined}
        markerEnd={`url(#${markerId})`}
      />
      {label && (
        <text
          x={midX}
          y={midY - 6}
          textAnchor="middle"
          fontSize="9"
          fill={color}
          fontWeight="500"
        >
          {label}
        </text>
      )}
    </g>
  );
}

function AutomationDot({ cx, cy, name, onClick }: { cx: number; cy: number; name: string; onClick?: () => void }): React.ReactNode {
  const [hov, setHov] = useState(false);
  const r = 9;
  const label = name.length > 22 ? name.slice(0, 21) + "…" : name;
  const tipW  = Math.min(label.length * 6 + 16, 180);

  return (
    <g
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      onClick={(e) => { e.stopPropagation(); onClick?.(); }}
      style={{ cursor: onClick ? "pointer" : "default" }}
    >
      <circle cx={cx} cy={cy} r={r + 3} fill="white" />
      <circle cx={cx} cy={cy} r={r} fill="hsl(45 95% 55%)" stroke="hsl(35 80% 40%)" strokeWidth="1.5" />
      {/* ⚡ via text — simpler than SVG path in a sub-component */}
      <text x={cx} y={cy + 1} textAnchor="middle" dominantBaseline="middle" fontSize="9" fill="hsl(35 80% 28%)" style={{ pointerEvents: "none", userSelect: "none" }}>
        ⚡
      </text>
      {hov && (
        <g style={{ pointerEvents: "none" }}>
          <rect
            x={cx - tipW / 2} y={cy - r - 24}
            width={tipW} height={18}
            rx="4" fill="#1e293b" fillOpacity={0.88}
          />
          <text x={cx} y={cy - r - 15} textAnchor="middle" fontSize="9" fill="white" fontWeight="500">
            {label}
          </text>
        </g>
      )}
    </g>
  );
}

function BpmnNode({
  step, cx, cy, ghost, onMouseDown, onClick,
}: {
  step: ProcessStep;
  cx: number;
  cy: number;
  ghost?: boolean;
  onMouseDown?: (e: React.MouseEvent) => void;
  onClick?: () => void;
}): React.ReactNode {
  const opacity = ghost ? 0.55 : 1;
  const clickable = !!(onMouseDown || onClick);

  if (step.type === "start") {
    return (
      <g opacity={opacity} onMouseDown={onMouseDown} onClick={onClick} style={{ cursor: clickable ? "pointer" : undefined }}>
        <circle cx={cx} cy={cy} r={EVT_R} stroke="#16A34A" strokeWidth={2.5} fill="#F0FDF4" />
        <circle cx={cx} cy={cy} r={5} fill="#16A34A" />
        <foreignObject x={cx - 40} y={cy + EVT_R + 4} width={80} height={24} style={{ pointerEvents: "none" }}>
          <div style={{ textAlign: "center", fontSize: "9px", fontWeight: "500", color: "#15803D", lineHeight: 1.2, overflow: "hidden", wordBreak: "break-word", fontFamily: "IBM Plex Sans, system-ui, sans-serif" }}>
            {step.label}
          </div>
        </foreignObject>
      </g>
    );
  }

  if (step.type === "end" || step.type === "terminate") {
    return (
      <g opacity={opacity} onMouseDown={onMouseDown} onClick={onClick} style={{ cursor: clickable ? "pointer" : undefined }}>
        <circle cx={cx} cy={cy} r={EVT_R} stroke="#DC2626" strokeWidth={3} fill="#FEF2F2" />
        {step.type === "terminate" && <circle cx={cx} cy={cy} r={EVT_R * 0.5} fill="#DC2626" />}
        <foreignObject x={cx - 40} y={cy + EVT_R + 4} width={80} height={24} style={{ pointerEvents: "none" }}>
          <div style={{ textAlign: "center", fontSize: "9px", fontWeight: "500", color: "#DC2626", lineHeight: 1.2, overflow: "hidden", wordBreak: "break-word", fontFamily: "IBM Plex Sans, system-ui, sans-serif" }}>
            {step.label}
          </div>
        </foreignObject>
      </g>
    );
  }

  if (step.type === "decision" || step.type === "and") {
    const h = GATEWAY_SIZE;
    return (
      <g opacity={opacity} onMouseDown={onMouseDown} onClick={onClick} style={{ cursor: clickable ? "pointer" : undefined }}>
        <polygon
          points={`${cx},${cy - h} ${cx + h},${cy} ${cx},${cy + h} ${cx - h},${cy}`}
          stroke="#3B82F6"
          strokeWidth={1.5}
          fill="#EFF6FF"
        />
        <line x1={cx - h * 0.5} y1={cy - h * 0.5} x2={cx + h * 0.5} y2={cy + h * 0.5} stroke="#3B82F6" strokeWidth={1.5} />
        <line x1={cx + h * 0.5} y1={cy - h * 0.5} x2={cx - h * 0.5} y2={cy + h * 0.5} stroke="#3B82F6" strokeWidth={1.5} />
        <foreignObject x={cx - 40} y={cy + h + 4} width={80} height={24} style={{ pointerEvents: "none" }}>
          <div style={{ textAlign: "center", fontSize: "9px", fontWeight: "500", color: "#1D4ED8", lineHeight: 1.2, overflow: "hidden", wordBreak: "break-word", fontFamily: "IBM Plex Sans, system-ui, sans-serif" }}>
            {step.label}
          </div>
        </foreignObject>
      </g>
    );
  }

  // Task (default) or optional
  const isOptional = step.type === ("optional" as ProcessStep["type"]);
  const stroke     = isOptional ? "#F97316" : "#3B82F6";
  const fill       = isOptional ? "#FFF7ED" : "#EFF6FF";
  const textColor  = isOptional ? "#C2410C" : "#1D4ED8";
  const dashArray  = isOptional ? "6 3" : undefined;
  const [hovered, setHovered]   = useState(false);

  return (
    <g
      opacity={opacity}
      onMouseDown={onMouseDown}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ cursor: clickable ? "pointer" : undefined }}
    >
      <rect
        x={cx - STEP_W / 2}
        y={cy - STEP_H / 2}
        width={STEP_W}
        height={STEP_H}
        rx="7"
        stroke={stroke}
        strokeWidth={hovered ? 2 : 1.5}
        strokeDasharray={dashArray}
        fill={fill}
        style={{ filter: hovered ? `drop-shadow(0 3px 8px ${stroke}44)` : undefined }}
      />
      {/* Node label via foreignObject — wraps to 2 lines, always fits */}
      <foreignObject
        x={cx - STEP_W / 2 + 5}
        y={cy - STEP_H / 2}
        width={STEP_W - 10}
        height={STEP_H}
        style={{ pointerEvents: "none" }}
      >
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            fontSize: "10px",
            fontWeight: "500",
            color: textColor,
            lineHeight: 1.25,
            overflow: "hidden",
            wordBreak: "break-word",
            overflowWrap: "break-word",
            fontFamily: "IBM Plex Sans, system-ui, sans-serif",
            padding: "2px",
          }}
        >
          {step.label}
        </div>
      </foreignObject>
      {isPipelineStep(step) && (
        <g style={{ pointerEvents: "none" }}>
          <rect
            x={cx + STEP_W / 2 - 3 - 32}
            y={cy - STEP_H / 2 + 3}
            width={32}
            height={10}
            rx="2.5"
            fill="#FFF1EE"
            stroke="#FF7A59"
            strokeWidth="0.5"
          />
          <text
            x={cx + STEP_W / 2 - 3 - 16}
            y={cy - STEP_H / 2 + 3 + 5}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize="6"
            fontWeight="600"
            fill="#C45200"
            style={{ pointerEvents: "none", fontFamily: "IBM Plex Sans, system-ui, sans-serif" }}
          >
            Pipeline
          </text>
        </g>
      )}
    </g>
  );
}

