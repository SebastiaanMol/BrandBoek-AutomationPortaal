import { useState, useCallback, useEffect, useRef } from "react";
import { jsPDF } from "jspdf";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { RotateCcw, Save, Plus, ImageDown, FileDown, ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ProcessCanvas } from "@/components/process/ProcessCanvas";
import { UnassignedPanel } from "@/components/process/UnassignedPanel";
import { AutomationDetailPanel } from "@/components/process/AutomationDetailPanel";
import { StepDialog } from "@/components/process/StepDialog";
import type { ProcessStep, Automation, TeamKey, ProcessState } from "@/data/processData";
import { initialState, TEAM_ORDER, TEAM_CONFIG } from "@/data/processData";
import { useAutomatiseringen } from "@/lib/hooks";
import type { Automatisering, KlantFase } from "@/lib/types";
import { supabase } from "@/integrations/supabase/client";
import { fetchProcessState, saveProcessState } from "@/lib/supabaseStorage";

const FASE_TO_TEAM: Record<KlantFase, TeamKey> = {
  Marketing:   "marketing",
  Sales:       "sales",
  Onboarding:  "onboarding",
  Boekhouding: "boekhouding",
  Offboarding: "management",
};

function toCanvasAutomation(a: Automatisering, existing?: Automation): Automation {
  return {
    id:         a.id,
    name:       a.naam,
    team:       FASE_TO_TEAM[a.fasen?.[0]] ?? "management",
    tool:       a.systemen?.[0] ?? "Anders",
    goal:       a.doel ?? "",
    fromStepId: existing?.fromStepId,
    toStepId:   existing?.toStepId,
  };
}

export default function Processen() {
  const [state, setState]     = useState<ProcessState>(initialState);
  const [saved, setSaved]     = useState<ProcessState>(initialState);
  const [isDirty, setIsDirty] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmSave, setConfirmSave] = useState(false);
  const [loading, setLoading] = useState(true);
  const savedLinksRef = useRef<Record<string, { fromStepId: string; toStepId: string }>>({});

  // ── Load canvas from Supabase on mount ─────────────────────────────────────
  useEffect(() => {
    fetchProcessState()
      .then(saved => {
        if (saved) {
          savedLinksRef.current = saved.autoLinks;
          setState(prev => ({
            ...prev,
            steps:       saved.steps       as ProcessState["steps"],
            connections: saved.connections as ProcessState["connections"],
            // autoLinks applied in dbAutomations effect once automations are loaded
          }));
          setSaved(s => ({
            ...s,
            steps:       saved.steps       as ProcessState["steps"],
            connections: saved.connections as ProcessState["connections"],
          }));
        }
      })
      .catch(err => console.error("Laden proceskaart mislukt:", err))
      .finally(() => setLoading(false));
  }, []);

  // ── Load real automations from Supabase and merge with saved links ──────────
  const { data: dbAutomations } = useAutomatiseringen();
  useEffect(() => {
    if (!dbAutomations) return;
    if (loading) return; // wait for fetchProcessState to populate savedLinksRef
    setState(prev => ({
      ...prev,
      automations: dbAutomations.map(a => {
        const existing  = prev.automations.find(x => x.id === a.id);
        const savedLink = savedLinksRef.current[a.id];
        return toCanvasAutomation(a, existing ?? (savedLink ? { ...savedLink } as Automation : undefined));
      }),
    }));
  }, [dbAutomations, loading]);

  // UI state
  const [selectedAuto, setSelectedAuto] = useState<Automation | null>(null);
  const [editingStep, setEditingStep]   = useState<ProcessStep | null>(null);
  const [stepDialogOpen, setStepDialogOpen] = useState(false);
  const [stepDefaults, setStepDefaults] = useState<{ team?: TeamKey; column?: number; row?: number }>({});

  // ── Dirty tracking helper ──────────────────────────────────────────────────
  function update(fn: (s: ProcessState) => ProcessState) {
    setState(prev => { const next = fn(prev); setIsDirty(true); return next; });
  }

  // ── Save / Reset ───────────────────────────────────────────────────────────
  async function handleSave() {
    // Build autoLinks map: only automations that are fully attached
    const autoLinks: Record<string, { fromStepId: string; toStepId: string }> = {};
    state.automations.forEach(a => {
      if (a.fromStepId && a.toStepId) {
        autoLinks[a.id] = { fromStepId: a.fromStepId, toStepId: a.toStepId };
      }
    });

    try {
      await saveProcessState({ steps: state.steps, connections: state.connections, autoLinks });
      setSaved(state);
      setIsDirty(false);
      toast.success("Proceskaart opgeslagen");
    } catch (err) {
      console.error(err);
      toast.error("Opslaan mislukt — controleer de database");
    }
  }

  function handleReset() {
    // Restore steps & connections from saved, but keep current automations
    // and restore only their link data (fromStepId/toStepId) from saved
    setState(prev => ({
      ...saved,
      automations: prev.automations.map(a => {
        const savedLink = saved.automations.find(s => s.id === a.id);
        return savedLink
          ? { ...a, fromStepId: savedLink.fromStepId, toStepId: savedLink.toStepId }
          : { ...a, fromStepId: undefined, toStepId: undefined };
      }),
    }));
    setIsDirty(false);
    toast.info("Teruggezet naar opgeslagen versie");
  }

  function getSvgElement(): SVGSVGElement | null {
    return document.querySelector(".process-canvas-wrap svg");
  }

  function svgToCanvas(svg: SVGSVGElement): Promise<HTMLCanvasElement> {
    return new Promise((resolve, reject) => {
      const w = Number(svg.getAttribute("width") ?? svg.viewBox.baseVal.width);
      const h = Number(svg.getAttribute("height") ?? svg.viewBox.baseVal.height);

      // Clone and sanitize: resolve CSS variables + strip external font refs
      const clone = svg.cloneNode(true) as SVGSVGElement;
      clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");

      // Inline computed styles on every element so CSS vars resolve
      const liveEls = Array.from(svg.querySelectorAll("*"));
      const cloneEls = Array.from(clone.querySelectorAll("*"));
      liveEls.forEach((el, i) => {
        const computed = window.getComputedStyle(el);
        const attrs = ["fill", "stroke", "color", "background-color"];
        attrs.forEach(attr => {
          const val = computed.getPropertyValue(attr);
          if (val && val !== "none" && val !== "") {
            (cloneEls[i] as SVGElement).style.setProperty(attr, val);
          }
        });
      });

      // Add style block: use system fonts so external font load can't fail
      const style = document.createElementNS("http://www.w3.org/2000/svg", "style");
      style.textContent = `* { font-family: system-ui, Arial, sans-serif !important; }`;
      clone.insertBefore(style, clone.firstChild);

      const xml = new XMLSerializer().serializeToString(clone);
      // Use base64 data URL to avoid cross-origin blob restrictions
      const b64 = btoa(unescape(encodeURIComponent(xml)));
      const dataUrl = `data:image/svg+xml;base64,${b64}`;

      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = w * 2;
        canvas.height = h * 2;
        const ctx = canvas.getContext("2d")!;
        ctx.scale(2, 2);
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas);
      };
      img.onerror = (e) => {
        console.error("SVG render error:", e);
        reject(new Error("SVG kon niet worden gerenderd"));
      };
      img.src = dataUrl;
    });
  }

  async function exportPng() {
    const svg = getSvgElement();
    if (!svg) return toast.error("Canvas niet gevonden");
    try {
      const canvas = await svgToCanvas(svg);
      const a = document.createElement("a");
      a.download = "proceskaart.png";
      a.href = canvas.toDataURL("image/png");
      a.click();
      toast.success("PNG gedownload");
    } catch {
      toast.error("Export mislukt");
    }
  }

  async function exportPdf() {
    const svg = getSvgElement();
    if (!svg) return toast.error("Canvas niet gevonden");
    try {
      const canvas = await svgToCanvas(svg);
      const imgData = canvas.toDataURL("image/png");
      const w = canvas.width / 2;
      const h = canvas.height / 2;
      const pdf = new jsPDF({ orientation: "landscape", unit: "px", format: [w, h] });
      pdf.addImage(imgData, "PNG", 0, 0, w, h);
      pdf.save("proceskaart.pdf");
      toast.success("PDF gedownload");
    } catch (err) {
      console.error(err);
      toast.error("Export mislukt");
    }
  }

  // ── Step handlers ──────────────────────────────────────────────────────────
  const handleStepClick = useCallback((step: ProcessStep) => {
    if (step.type === "start" || step.type === "end") return;
    setEditingStep(step);
    setStepDialogOpen(true);
  }, []);

  function handleSaveStep(step: ProcessStep) {
    update(s => ({
      ...s,
      steps: s.steps.find(x => x.id === step.id)
        ? s.steps.map(x => x.id === step.id ? step : x)
        : [...s.steps, step],
    }));
    toast.success(editingStep ? "Stap bijgewerkt" : "Stap toegevoegd");
    setEditingStep(null);
  }

  function handleDeleteStep(id: string) {
    update(s => ({
      steps: s.steps.filter(x => x.id !== id),
      connections: s.connections.filter(c => c.fromStepId !== id && c.toStepId !== id),
      automations: s.automations.map(a =>
        a.fromStepId === id || a.toStepId === id
          ? { ...a, fromStepId: undefined, toStepId: undefined }
          : a,
      ),
    }));
    toast.success("Stap verwijderd");
  }

  function handleAddStep(team: TeamKey, column: number, row: number) {
    setStepDefaults({ team, column, row });
    setEditingStep(null);
    setStepDialogOpen(true);
  }

  function handleMoveStep(stepId: string, newTeam: TeamKey, newColumn: number, newRow: number = 0) {
    update(s => {
      const moving = s.steps.find(x => x.id === stepId);
      if (!moving) return s;

      // Event markers use INSERT behaviour: slide everything to make room, close the gap left behind.
      if (moving.type === "start" || moving.type === "end") {
        const oldCol = moving.column;
        if (oldCol === newColumn) return { ...s, steps: s.steps.map(x => x.id === stepId ? { ...x, team: newTeam } : x) };
        return {
          ...s,
          steps: s.steps.map(x => {
            if (x.id === stepId) return { ...x, team: newTeam, column: newColumn };
            if (newColumn > oldCol) {
              // Moving right: steps strictly between old and new shift left by 1
              if (x.column > oldCol && x.column <= newColumn) return { ...x, column: x.column - 1 };
            } else {
              // Moving left: steps between new and old shift right by 1
              if (x.column >= newColumn && x.column < oldCol) return { ...x, column: x.column + 1 };
            }
            return x;
          }),
        };
      }

      // Regular steps: swap with whatever occupies the target cell (same team + column + row)
      const target = s.steps.find(x => x.team === newTeam && x.column === newColumn && (x.row ?? 0) === newRow && x.id !== stepId);
      return {
        ...s,
        steps: s.steps.map(x => {
          if (x.id === stepId) return { ...x, team: newTeam, column: newColumn, row: newRow };
          if (target && x.id === target.id) return { ...x, team: moving.team, column: moving.column, row: moving.row ?? 0 };
          return x;
        }),
      };
    });
  }

  // ── Connection handlers ────────────────────────────────────────────────────
  function handleAddConnection(fromId: string, toId: string) {
    update(s => {
      const exists = s.connections.some(c => c.fromStepId === fromId && c.toStepId === toId);
      if (exists) return s;
      return {
        ...s,
        connections: [...s.connections, { id: `c-${Date.now()}`, fromStepId: fromId, toStepId: toId }],
      };
    });
  }

  function handleDeleteConnection(id: string) {
    update(s => {
      const conn = s.connections.find(c => c.id === id);
      // If it's a step-to-step connection, detach any automations that sit on it
      const updatedAutos = conn?.fromStepId
        ? s.automations.map(a =>
            a.fromStepId === conn.fromStepId && a.toStepId === conn.toStepId
              ? { ...a, fromStepId: undefined, toStepId: undefined }
              : a,
          )
        : s.automations;
      return { ...s, connections: s.connections.filter(c => c.id !== id), automations: updatedAutos };
    });
    toast.success("Verbinding verwijderd");
  }

  // ── Automation handlers ────────────────────────────────────────────────────
  const handleAutoClick = useCallback((a: Automation) => {
    setSelectedAuto(a);
  }, []);

  function handleAttach(autoId: string, fromStepId: string, toStepId: string) {
    update(s => ({
      ...s,
      automations: s.automations.map(a =>
        a.id === autoId ? { ...a, fromStepId, toStepId } : a,
      ),
    }));
    toast.success("Automation gekoppeld");
  }

  function handleDetach(autoId: string) {
    update(s => ({
      ...s,
      automations: s.automations.map(a =>
        a.id === autoId ? { ...a, fromStepId: undefined, toStepId: undefined } : a,
      ),
    }));
    toast.success("Automation losgekoppeld");
  }

  function handleAddBranch(automationId: string, toStepId: string) {
    // Branch = a regular Connection with fromAutomationId instead of fromStepId
    const newConn = {
      id: `b-${Date.now()}`,
      fromAutomationId: automationId,
      toStepId,
      label: "",
    };
    update(s => ({ ...s, connections: [...s.connections, newConn] }));
    // Open detail panel for the automation
    const auto = state.automations.find(a => a.id === automationId);
    if (auto) setSelectedAuto(auto);
  }

  function handleUpdateConnectionLabel(connId: string, label: string) {
    update(s => ({
      ...s,
      connections: s.connections.map(c => c.id === connId ? { ...c, label } : c),
    }));
  }

  // ── Derived data ───────────────────────────────────────────────────────────
  const maxColumn = state.steps.reduce((m, s) => Math.max(m, s.column), 0);
  const breadcrumb  = TEAM_ORDER.map(t => TEAM_CONFIG[t].label).join(" → ");

  return (
    <div className="flex flex-col h-[calc(100vh-48px)] min-h-0">
      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div className="shrink-0 px-6 py-3 border-b border-border bg-card flex items-center gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-base font-bold">Processes</h1>
            {isDirty && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-amber-50 text-amber-700 border border-amber-200">
                Niet opgeslagen
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">
            A-tot-Z klantreis · {breadcrumb}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground hover:text-foreground">
                <FileDown className="h-3.5 w-3.5" />
                Export
                <ChevronDown className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={exportPng} className="gap-2">
                <ImageDown className="h-4 w-4" />
                PNG downloaden
              </DropdownMenuItem>
              <DropdownMenuItem onClick={exportPdf} className="gap-2">
                <FileDown className="h-4 w-4" />
                PDF downloaden
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button variant="ghost" size="sm" onClick={() => setConfirmReset(true)} disabled={!isDirty}
            className="gap-1.5 text-muted-foreground hover:text-foreground">
            <RotateCcw className="h-3.5 w-3.5" />
            Reset
          </Button>

          <Button size="sm" onClick={() => setConfirmSave(true)} disabled={!isDirty} className="gap-1.5">
            <Save className="h-3.5 w-3.5" />
            Opslaan
          </Button>

          <Button
            draggable
            variant="outline" size="sm"
            onDragStart={(e: React.DragEvent) => e.dataTransfer.setData("newStep", "1")}
            onClick={() => { setStepDefaults({}); setEditingStep(null); setStepDialogOpen(true); }}
            className="gap-1.5 ml-1 cursor-grab active:cursor-grabbing"
            title="Klik om een stap toe te voegen, of sleep naar de canvas"
          >
            <Plus className="h-3.5 w-3.5" />
            Stap toevoegen
          </Button>
        </div>
      </div>

      {/* ── Content area ─────────────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* Canvas */}
        <div className="flex-1 min-w-0 overflow-hidden flex flex-col">
          <div className="flex-1 overflow-auto p-4">
            {loading ? (
              <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
                Proceskaart laden…
              </div>
            ) : null}
            <div className={`process-canvas-wrap border border-border rounded-[var(--radius-outer)] overflow-hidden bg-card shadow-sm ${loading ? "hidden" : ""}`}>
              <ProcessCanvas
                steps={state.steps}
                connections={state.connections}
                automations={state.automations}
                onStepClick={handleStepClick}
                onAutomationClick={handleAutoClick}
                onAddConnection={handleAddConnection}
                onDeleteConnection={handleDeleteConnection}
                onMoveStep={handleMoveStep}
                onAttachAutomation={handleAttach}
                onAddStep={handleAddStep}
                onAddBranch={handleAddBranch}
                onUpdateConnectionLabel={handleUpdateConnectionLabel}
              />
            </div>

            {/* Legend */}
            <div className="mt-3 flex items-center gap-4 flex-wrap">
              <p className="text-xs text-muted-foreground">
                <span className="font-medium">Tip:</span> Sleep automations naar pijlen ·
                Sleep stappen om te verplaatsen ·
                Sleep vanuit het poortje (rechts op een stap) om een verbinding te tekenen ·
                Dubbelklik op een pijl om te verwijderen
              </p>
            </div>
          </div>
        </div>

        {/* Right panels */}
        {selectedAuto ? (
          <AutomationDetailPanel
            automation={selectedAuto}
            fullData={dbAutomations?.find(a => a.id === selectedAuto?.id)}
            steps={state.steps}
            branchConnections={[
              // Main outgoing path: the step-to-step connection this automation sits on
              ...state.connections.filter(c =>
                selectedAuto?.fromStepId && c.fromStepId === selectedAuto.fromStepId && c.toStepId === selectedAuto.toStepId
              ),
              // Extra branch connections drawn from the automation dot
              ...state.connections.filter(c => c.fromAutomationId === selectedAuto?.id),
            ]}
            onClose={() => setSelectedAuto(null)}
            onDetach={handleDetach}
          />
        ) : (
          <UnassignedPanel
            automations={state.automations}
            steps={state.steps}
            onAutomationClick={handleAutoClick}
          />
        )}
      </div>

      {/* ── Dialogs ──────────────────────────────────────────────────────── */}
      <StepDialog
        open={stepDialogOpen}
        step={editingStep}
        maxColumn={maxColumn}
        defaultValues={stepDefaults}
        onSave={handleSaveStep}
        onDelete={editingStep ? handleDeleteStep : undefined}
        onClose={() => { setStepDialogOpen(false); setEditingStep(null); }}
      />

      {/* ── Bevestiging Reset ──────────────────────────────────────────── */}
      <AlertDialog open={confirmReset} onOpenChange={setConfirmReset}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Wijzigingen terugzetten?</AlertDialogTitle>
            <AlertDialogDescription>
              Alle niet-opgeslagen wijzigingen worden ongedaan gemaakt. Je keert terug naar de laatste opgeslagen versie.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction onClick={() => { handleReset(); setConfirmReset(false); }}>
              Ja, terugzetten
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Bevestiging Opslaan ────────────────────────────────────────── */}
      <AlertDialog open={confirmSave} onOpenChange={setConfirmSave}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Proceskaart opslaan?</AlertDialogTitle>
            <AlertDialogDescription>
              De huidige versie wordt opgeslagen in de database. Dit overschrijft de vorige opgeslagen versie.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction onClick={() => { handleSave(); setConfirmSave(false); }}>
              Ja, opslaan
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
