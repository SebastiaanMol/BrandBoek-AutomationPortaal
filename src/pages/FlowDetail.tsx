import { useState, useMemo, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { toast } from "sonner";
import { useFlows, useAutomatiseringen, useUpdateFlow, useDeleteFlow } from "@/lib/hooks";

export default function FlowDetail(): React.ReactNode {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: flows = [] } = useFlows();
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
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Sync local state when flow loads from server (only when id changes, not on every re-render)
  useEffect(() => {
    if (flow) {
      setNaam(flow.naam);
      setBeschrijving(flow.beschrijving);
    }
  }, [flow?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const isDirty = flow && (naam !== flow.naam || beschrijving !== flow.beschrijving);

  if (!flow) {
    return <p className="text-muted-foreground text-sm">Flow niet gevonden.</p>;
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
    try {
      await updateFlow.mutateAsync({ id: flow!.id, automationIds: newIds });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Verwijderen mislukt");
    }
  }

  const flowSet = new Set(flow.automationIds);

  return (
    <div className="max-w-2xl">
      {/* Header */}
      <div className="mb-8">
        <input
          className="text-xl font-semibold w-full bg-transparent border-b border-transparent hover:border-border focus:border-border focus:outline-none pb-1 mb-3"
          value={naam}
          onChange={(e) => setNaam(e.target.value)}
        />
        <textarea
          className="w-full bg-transparent border-b border-transparent hover:border-border focus:border-border focus:outline-none resize-none text-sm text-muted-foreground"
          rows={2}
          value={beschrijving}
          onChange={(e) => setBeschrijving(e.target.value)}
          placeholder="Beschrijving..."
        />
        <div className="flex items-center gap-2 flex-wrap mt-3">
          {flow.systemen.map((s) => (
            <span
              key={s}
              className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground"
            >
              {s}
            </span>
          ))}
        </div>
        {isDirty && (
          <button
            className="mt-3 text-sm px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
            onClick={handleSave}
          >
            Opslaan
          </button>
        )}
      </div>

      {/* Step list */}
      <div className="mb-8">
        {flow.automationIds.map((autoId, i) => {
          const auto = autoMap.get(autoId);
          const isLast = i === flow.automationIds.length - 1;

          if (!auto) {
            return (
              <div key={autoId} className="flex gap-4">
                <div className="flex flex-col items-center">
                  <div className="w-6 h-6 rounded-full bg-destructive/20 text-destructive text-[10px] font-bold flex items-center justify-center shrink-0">
                    {i + 1}
                  </div>
                  {!isLast && <div className="w-px flex-1 min-h-[2rem] bg-border" />}
                </div>
                <div className="pb-6">
                  <p className="text-sm text-muted-foreground">{autoId} — niet meer beschikbaar</p>
                  <button
                    className="text-xs text-destructive underline mt-1"
                    onClick={() => handleRemoveAutomation(autoId)}
                  >
                    Verwijder uit flow
                  </button>
                </div>
              </div>
            );
          }

          // Detect branches: outgoing koppelingen that point to other automations in this flow
          const branches = (auto.koppelingen ?? []).filter((k) => flowSet.has(k.doelId));
          const hasBranches = branches.length > 1;

          return (
            <div key={autoId} className="flex gap-4">
              <div className="flex flex-col items-center">
                <div
                  className={`w-6 h-6 rounded-full text-[10px] font-bold flex items-center justify-center shrink-0 ${
                    isLast
                      ? "bg-emerald-500 text-white"
                      : "bg-primary text-primary-foreground"
                  }`}
                >
                  {isLast ? "✓" : i + 1}
                </div>
                {!isLast && <div className="w-px flex-1 min-h-[2rem] bg-border" />}
              </div>
              <div className="pb-6 flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold truncate">{auto.naam}</p>
                  <Link
                    to={`/alle?open=${auto.id}`}
                    className="text-xs text-primary hover:underline shrink-0"
                  >
                    ↗ open
                  </Link>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{auto.trigger}</p>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground mt-1 inline-block">
                  {auto.categorie}
                </span>

                {hasBranches && (
                  <div className="mt-2 ml-2 space-y-1 border-l border-border pl-3">
                    {branches.map((b) => {
                      const target = autoMap.get(b.doelId);
                      return (
                        <p key={b.doelId} className="text-xs text-muted-foreground">
                          ↳ {b.label}: {target?.naam ?? b.doelId}
                        </p>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="border-t border-border pt-4">
        {showDeleteConfirm ? (
          <div className="flex items-center gap-3">
            <p className="text-sm text-muted-foreground">Flow verwijderen?</p>
            <button
              className="text-sm text-destructive font-medium hover:underline"
              onClick={handleDelete}
            >
              Ja, verwijder
            </button>
            <button
              className="text-sm text-muted-foreground hover:text-foreground"
              onClick={() => setShowDeleteConfirm(false)}
            >
              Annuleer
            </button>
          </div>
        ) : (
          <button
            className="text-sm text-destructive hover:text-destructive/80 transition-colors"
            onClick={() => setShowDeleteConfirm(true)}
          >
            Flow verwijderen
          </button>
        )}
      </div>
    </div>
  );
}
