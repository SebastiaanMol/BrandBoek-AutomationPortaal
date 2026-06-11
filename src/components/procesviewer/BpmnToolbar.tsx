import { Minus, Plus, Maximize2, Maximize, Minimize } from "lucide-react";
import type { ConnectionRouteType } from "@/data/processData";

interface BpmnToolbarProps {
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
  onFullscreen: () => void;
  isFullscreen: boolean;
  isDrawingConnection?: boolean;
  selectedRouteType?: ConnectionRouteType;
  onToggleDrawConnection?: () => void;
  onRouteTypeChange?: (routeType: ConnectionRouteType) => void;
}

export function BpmnToolbar({
  zoom,
  onZoomIn,
  onZoomOut,
  onReset,
  onFullscreen,
  isFullscreen,
  isDrawingConnection = false,
  selectedRouteType = "main",
  onToggleDrawConnection,
  onRouteTypeChange,
}: BpmnToolbarProps): React.ReactNode {
  return (
    <div className="absolute top-3 right-3 z-30 flex items-center gap-1.5">
      {onToggleDrawConnection && (
        <>
          <ToolbarButton
            onClick={onToggleDrawConnection}
            title={isDrawingConnection ? "Stop lijn tekenen" : "Lijn tekenen"}
            active={isDrawingConnection}
          >
            <span className="text-[10px] font-bold leading-none">Lijn</span>
          </ToolbarButton>
          {isDrawingConnection && onRouteTypeChange && (
            <div className="flex items-center rounded-[8px] border border-[#E2E8F0] bg-white p-0.5">
              <RouteTypeButton
                label="Hoofdroute"
                shortLabel="Hoofd"
                routeType="main"
                selectedRouteType={selectedRouteType}
                onSelect={onRouteTypeChange}
              />
              <RouteTypeButton
                label="Correctie / optioneel"
                shortLabel="Opt."
                routeType="optional"
                selectedRouteType={selectedRouteType}
                onSelect={onRouteTypeChange}
              />
              <RouteTypeButton
                label="Uitzondering / einde"
                shortLabel="Einde"
                routeType="end"
                selectedRouteType={selectedRouteType}
                onSelect={onRouteTypeChange}
              />
            </div>
          )}
          <div className="mx-1 h-5 w-px bg-slate-200" />
        </>
      )}
      <span className="text-xs text-slate-500 tabular-nums select-none pr-1">
        {Math.round(zoom * 100)}%
      </span>
      <ToolbarButton onClick={onZoomOut} title="Zoom uit">
        <Minus className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton onClick={onZoomIn} title="Zoom in">
        <Plus className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton onClick={onReset} title="Herstel weergave">
        <Maximize2 className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton onClick={onFullscreen} title={isFullscreen ? "Volledig scherm sluiten" : "Volledig scherm"} active={isFullscreen}>
        {isFullscreen ? <Minimize className="h-3.5 w-3.5" /> : <Maximize className="h-3.5 w-3.5" />}
      </ToolbarButton>
    </div>
  );
}

function ToolbarButton({
  onClick,
  title,
  active,
  children,
}: {
  onClick: () => void;
  title: string;
  active?: boolean;
  children: React.ReactNode;
}): React.ReactNode {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      className={`flex items-center justify-center rounded-[8px] transition-colors ${
        active
          ? "bg-[#EFF6FF] border border-[#2563EB] text-[#2563EB]"
          : "bg-white border border-[#E2E8F0] text-[#94A3B8] hover:bg-[#F1F5F9] hover:text-[#0F172A]"
      }`}
      style={{ width: 30, height: 30, borderWidth: "0.5px" }}
    >
      {children}
    </button>
  );
}

function RouteTypeButton({
  label,
  shortLabel,
  routeType,
  selectedRouteType,
  onSelect,
}: {
  label: string;
  shortLabel: string;
  routeType: ConnectionRouteType;
  selectedRouteType: ConnectionRouteType;
  onSelect: (routeType: ConnectionRouteType) => void;
}): React.ReactNode {
  const active = routeType === selectedRouteType;
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={() => onSelect(routeType)}
      className={`h-6 rounded-md px-2 text-[10px] font-semibold transition-colors ${
        active ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"
      }`}
    >
      {shortLabel}
    </button>
  );
}
