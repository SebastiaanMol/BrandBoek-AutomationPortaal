import { useState, useMemo, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Info, LayoutGrid, ListOrdered } from "lucide-react";
import {
  useFlows,
  useAutomatiseringen,
  useUpdateFlow,
  useDeleteFlow,
} from "@/lib/hooks";
import type { Automatisering, Systeem } from "@/lib/types";
import { FlowHeader } from "@/components/flows/FlowHeader";
import { FlowCanvas } from "@/components/flows/FlowCanvas";
import { AutomationList } from "@/components/flows/AutomationList";
import { AutomationDetail } from "@/components/flows/AutomationDetail";

type View = "flow" | "steps";

export default function FlowDetail(): React.ReactNode {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: flows = [], isLoading: flowsLoading } = useFlows();
  const { data: automations = [] } = useAutomatiseringen();
  const updateFlow = useUpdateFlow();
  const deleteFlow = useDeleteFlow();

  const flow = useMemo(() => flows.find((f) => f.id === id), [flows, id]);
  const autoMap = useMemo(
    () => new Map(automations.map((a) => [a.id, a])),
    [automations],
  );

  const [naam, setNaam] = useState("");
  const [beschrijving, setBeschrijving] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [view, setView] = useState<View>("flow");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const initializedRef = useRef<string | null>(null);
  const flowId = flow?.id;
  const flowNaam = flow?.naam;
  const flowBeschrijving = flow?.beschrijving;
  const firstAutoId = flow?.automationIds[0] ?? null;

  useEffect(() => {
    if (flowId && initializedRef.current !== flowId) {
      initializedRef.current = flowId;
      setNaam(flowNaam ?? "");
      setBeschrijving(flowBeschrijving ?? "");
      setSelectedId(firstAutoId);
    }
  }, [flowId, flowNaam, flowBeschrijving, firstAutoId]);

  const isDirty = flow !== undefined && (naam !== flow.naam || beschrijving !== flow.beschrijving);

  if (flowsLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Laden...</p>
      </div>
    );
  }

  if (!flow) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Flow niet gevonden.</p>
      </div>
    );
  }

  async function handleSave(): Promise<void> {
    try {
      await updateFlow.mutateAsync({ id: flow!.id, naam, beschrijving });
      toast.success("Opgeslagen");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Opslaan mislukt");
    }
  }

  async function handleDelete(): Promise<void> {
    try {
      await deleteFlow.mutateAsync(flow!.id);
      toast.success("Flow verwijderd");
      navigate("/flows");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Verwijderen mislukt");
    }
  }

  async function handleRemoveAutomation(autoId: string): Promise<void> {
    const newIds = flow!.automationIds.filter((i) => i !== autoId);
    const remainingAutos = newIds
      .map((i) => autoMap.get(i))
      .filter((a): a is Automatisering => a !== undefined);
    const newSystemen = [...new Set(remainingAutos.flatMap((a) => a.systemen))] as Systeem[];
    try {
      await updateFlow.mutateAsync({ id: flow!.id, automationIds: newIds, systemen: newSystemen });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Verwijderen mislukt");
    }
  }

  const missingIds = flow.automationIds.filter((autoId) => !autoMap.get(autoId));

  const sharedListProps = {
    flow,
    autoMap,
    selectedId,
    onSelect: setSelectedId,
  } as const;

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-[1400px] px-6 py-8 lg:px-10 lg:py-10 space-y-6 animate-fade-in">
        <FlowHeader
          flow={flow}
          automationCount={flow.automationIds.length}
          naam={naam}
          beschrijving={beschrijving}
          setNaam={setNaam}
          setBeschrijving={setBeschrijving}
          isDirty={isDirty}
          onSave={handleSave}
          isSaving={updateFlow.isPending}
        />

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-6">
          {/* Left: visual flow */}
          <section className="space-y-4">
            <div className="flex items-end justify-between gap-4 flex-wrap">
              <div>
                <h2 className="text-lg font-semibold tracking-tight text-foreground">
                  Visuele flow
                </h2>
                <p className="text-sm text-muted-foreground">
                  {view === "flow"
                    ? "Elke node is één losse automation. Klik om de interne stappen te zien."
                    : "Alle automations in volgorde. Klik om te selecteren."}
                </p>
              </div>
              <div className="inline-flex items-center p-0.5 rounded-lg bg-secondary border border-border">
                <ToggleBtn
                  active={view === "flow"}
                  onClick={() => setView("flow")}
                  icon={<LayoutGrid className="w-3.5 h-3.5" />}
                  label="Flow"
                />
                <ToggleBtn
                  active={view === "steps"}
                  onClick={() => setView("steps")}
                  icon={<ListOrdered className="w-3.5 h-3.5" />}
                  label="Stappen"
                />
              </div>
            </div>

            <div className="flex items-start gap-2.5 px-3.5 py-2.5 rounded-lg bg-primary-soft border border-primary/20 text-xs text-foreground/80 leading-relaxed">
              <Info className="w-3.5 h-3.5 text-primary flex-shrink-0 mt-0.5" />
              <p>
                {view === "flow"
                  ? "Deze flow leest je van boven naar beneden: het proces start bovenaan en loopt via de verbonden automations naar het eindresultaat. Elke gekleurde node is een losse automation in een specifiek systeem. Klik op een node voor de interne stappen en zie aan de ↻ badge of een automation ook in andere processen wordt hergebruikt."
                  : "Alle automations in volgorde. Klik op een stap om rechts de details te zien."}
              </p>
            </div>

            <div className="card-elevated overflow-hidden h-[680px]">
              {view === "flow" ? (
                <FlowCanvas
                  flow={flow}
                  autoMap={autoMap}
                  allFlows={flows}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                />
              ) : (
                <div className="h-full overflow-y-auto p-5">
                  <AutomationList {...sharedListProps} />
                </div>
              )}
            </div>
          </section>

          {/* Right: details */}
          <aside className="space-y-4 lg:sticky lg:top-6 self-start">
            <div>
              <h2 className="text-lg font-semibold tracking-tight text-foreground">
                Geselecteerde automation
              </h2>
              <p className="text-sm text-muted-foreground">
                Wat deze automation doet, in mensentaal.
              </p>
            </div>
            <AutomationDetail
              automationId={selectedId}
              currentFlowId={flow.id}
              autoMap={autoMap}
              allFlows={flows}
            />

            <div className="card-elevated p-4">
              <p className="px-1 pb-2 text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">
                Alle automations in deze flow
              </p>
              <AutomationList {...sharedListProps} />
              {missingIds.length > 0 && (
                <div className="mt-3 pt-3 border-t border-border space-y-1">
                  {missingIds.map((autoId) => (
                    <div key={autoId} className="flex items-center justify-between gap-2">
                      <p className="text-xs text-muted-foreground truncate">{autoId} — niet meer beschikbaar</p>
                      <button
                        type="button"
                        className="text-xs text-destructive hover:underline shrink-0"
                        onClick={() => handleRemoveAutomation(autoId)}
                      >
                        Verwijder
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="card-elevated p-4">
              {showDeleteConfirm ? (
                <div className="flex items-center gap-3">
                  <p className="text-sm text-muted-foreground">Flow verwijderen?</p>
                  <button
                    type="button"
                    className="text-sm text-destructive font-medium hover:underline disabled:opacity-50"
                    onClick={handleDelete}
                    disabled={deleteFlow.isPending}
                  >
                    Ja, verwijder
                  </button>
                  <button
                    type="button"
                    className="text-sm text-muted-foreground hover:text-foreground"
                    onClick={() => setShowDeleteConfirm(false)}
                  >
                    Annuleer
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="text-sm text-destructive hover:text-destructive/80 transition-colors"
                  onClick={() => setShowDeleteConfirm(true)}
                >
                  Flow verwijderen
                </button>
              )}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

const ToggleBtn = ({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) => (
  <button
    type="button"
    onClick={onClick}
    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
      active ? "bg-card text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
    }`}
  >
    {icon}
    {label}
  </button>
);
