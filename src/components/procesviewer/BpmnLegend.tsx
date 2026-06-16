import { useState } from "react";
import { Info, X } from "lucide-react";

export interface LaneInfo {
  name: string;
  color: string;
}

export interface SymbolDef {
  label: string;
  render: () => React.ReactNode;
}

interface BpmnLegendProps {
  lanes: LaneInfo[];
  symbols?: SymbolDef[];
}

const DEFAULT_SYMBOLS: SymbolDef[] = [
  {
    label: "Start event",
    render: () => (
      <svg width="22" height="22" viewBox="0 0 22 22">
        <circle cx="11" cy="11" r="9" stroke="#16A34A" strokeWidth="2" fill="#F0FDF4" />
        <circle cx="11" cy="11" r="4" fill="#16A34A" />
      </svg>
    ),
  },
  {
    label: "Eind event",
    render: () => (
      <svg width="22" height="22" viewBox="0 0 22 22">
        <circle cx="11" cy="11" r="9" stroke="#DC2626" strokeWidth="2.5" fill="#FEF2F2" />
      </svg>
    ),
  },
  {
    label: "Taak",
    render: () => (
      <svg width="42" height="18" viewBox="0 0 42 18">
        <rect x="0.75" y="0.75" width="40.5" height="16.5" rx="4" stroke="#3B82F6" strokeWidth="1.5" fill="#EFF6FF" />
        <text x="21" y="12" textAnchor="middle" fontSize="8" fill="#1D4ED8" fontWeight="500">Taak</text>
      </svg>
    ),
  },
  {
    label: "Optionele taak",
    render: () => (
      <svg width="42" height="18" viewBox="0 0 42 18">
        <rect x="0.75" y="0.75" width="40.5" height="16.5" rx="4" stroke="#F97316" strokeWidth="1.5" strokeDasharray="5 2.5" fill="#FFF7ED" />
        <text x="21" y="12" textAnchor="middle" fontSize="7" fill="#C2410C" fontWeight="500">Optioneel</text>
      </svg>
    ),
  },
  {
    label: "Gateway",
    render: () => (
      <svg width="22" height="22" viewBox="0 0 22 22">
        <rect
          x="11" y="2"
          width="13" height="13"
          rx="0"
          transform="rotate(45 11 11)"
          stroke="#3B82F6" strokeWidth="1.5" fill="#EFF6FF"
        />
        <line x1="7.5" y1="7.5" x2="14.5" y2="14.5" stroke="#3B82F6" strokeWidth="1.5" />
        <line x1="14.5" y1="7.5" x2="7.5" y2="14.5" stroke="#3B82F6" strokeWidth="1.5" />
      </svg>
    ),
  },
  {
    label: "Notitie",
    render: () => (
      <svg width="28" height="20" viewBox="0 0 28 20">
        <path
          d="M8 3H4v14h4"
          stroke="#64748B"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        <line x1="10" y1="6" x2="23" y2="6" stroke="#64748B" strokeWidth="1.3" strokeLinecap="round" />
        <line x1="10" y1="10" x2="21" y2="10" stroke="#64748B" strokeWidth="1.3" strokeLinecap="round" />
        <line x1="10" y1="14" x2="18" y2="14" stroke="#64748B" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    label: "Data/document",
    render: () => (
      <svg width="24" height="24" viewBox="0 0 24 24">
        <path
          d="M6 3.75h8l4 4V20.25H6z"
          stroke="#0EA5E9"
          strokeWidth="1.5"
          strokeLinejoin="round"
          fill="#F0F9FF"
        />
        <path d="M14 3.75v4h4" stroke="#0EA5E9" strokeWidth="1.5" strokeLinejoin="round" fill="none" />
        <line x1="8.5" y1="12" x2="15.5" y2="12" stroke="#0EA5E9" strokeWidth="1.2" strokeLinecap="round" />
        <line x1="8.5" y1="15" x2="14" y2="15" stroke="#0EA5E9" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    label: "Databron",
    render: () => (
      <svg width="24" height="24" viewBox="0 0 24 24">
        <ellipse cx="12" cy="6" rx="6" ry="2.5" stroke="#8B5CF6" strokeWidth="1.5" fill="#F5F3FF" />
        <path d="M6 6v9c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5V6" stroke="#8B5CF6" strokeWidth="1.5" fill="#F5F3FF" />
        <path d="M6 10.5c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5" stroke="#8B5CF6" strokeWidth="1.3" fill="none" />
      </svg>
    ),
  },
];

export function BpmnLegend({ lanes, symbols = DEFAULT_SYMBOLS }: BpmnLegendProps): React.ReactNode {
  const [open, setOpen] = useState(true);

  return (
    <div
      className="absolute z-30"
      style={{ bottom: 16, left: 16, pointerEvents: "none" }}
    >
      {open ? (
        <div
          className="bg-white rounded-[12px] p-4 w-[340px]"
          style={{
            border: "0.5px solid #E2E8F0",
            boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
            pointerEvents: "auto",
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />
              <span className="text-xs font-semibold text-slate-700">Legenda</span>
            </div>
            <button
              aria-label="Legenda sluiten"
              onClick={() => setOpen(false)}
              className="text-slate-400 hover:text-slate-600 transition-colors"
              style={{ pointerEvents: "auto" }}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Two-column body */}
          <div className="grid grid-cols-2 gap-4">
            {/* Left column */}
            <div className="flex flex-col gap-3">
              {/* Routes */}
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Routes</p>
                <div className="flex flex-col gap-1.5">
                  <RouteRow color="#3B82F6" label="Hoofdproces" dashed={false} />
                  <RouteRow color="#F97316" label="Actie / correctie" dashed />
                  <RouteRow color="#DC2626" label="Uitzondering" dashed={false} />
                </div>
              </div>

              {/* Lanes */}
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Lanes</p>
                <div className="flex flex-col gap-1.5">
                  {lanes.map((lane) => (
                    <div key={lane.name} className="flex items-center gap-2">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: lane.color }}
                      />
                      <span className="text-[11px] text-slate-600">{lane.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Right column — Symbolen */}
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Symbolen</p>
              <div className="flex flex-col gap-2">
                {symbols.map((sym) => (
                  <div key={sym.label} className="flex items-center gap-2">
                    <div className="shrink-0 flex items-center justify-center" style={{ width: 44 }}>
                      {sym.render()}
                    </div>
                    <span className="text-[11px] text-slate-600">{sym.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-1.5 bg-white text-slate-600 text-xs font-medium px-3 py-1.5 rounded-[8px] hover:bg-slate-50 transition-colors"
          style={{
            border: "0.5px solid #E2E8F0",
            boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
            pointerEvents: "auto",
          }}
        >
          <Info className="h-3.5 w-3.5 text-blue-500" />
          Legenda
        </button>
      )}
    </div>
  );
}

function RouteRow({ color, label, dashed }: { color: string; label: string; dashed: boolean }): React.ReactNode {
  return (
    <div className="flex items-center gap-2">
      <svg width="24" height="10" viewBox="0 0 24 10">
        <line
          x1="0" y1="5" x2="20" y2="5"
          stroke={color}
          strokeWidth="1.5"
          strokeDasharray={dashed ? "4 2" : undefined}
        />
        <polygon points="18,2 24,5 18,8" fill={color} />
      </svg>
      <span className="text-[11px] text-slate-600">{label}</span>
    </div>
  );
}
