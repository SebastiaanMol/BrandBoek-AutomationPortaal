import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clipboard,
  FileText,
  GitBranch,
  Loader2,
  MessageSquarePlus,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  useAutomatiseringenIncludingLegacyGitlab,
  useAllConfirmedAutomationLinks,
  useCreateProcessJourneyReviewItem,
  useFlows,
  useFlowSuggesties,
  useProcessJourneyReviewItems,
  useSaveCuratedProcessJourney,
  useUpdateProcessJourneyReviewItemStatus,
} from "@/lib/hooks";
import {
  getProcessJourneyReviewPresentation,
  type ProcessJourneyReviewEdge,
  type ProcessJourneyReviewNode,
  type SelectedProcessJourneyReview,
} from "@/lib/processJourneyReviewPresentation";
import type {
  ProcessJourneyReviewItem,
  ProcessJourneyReviewItemType,
} from "@/lib/storage/processJourneyReviewItems";
import { cn } from "@/lib/utils";

const ITEM_TYPE_LABELS: Record<ProcessJourneyReviewItemType, string> = {
  missing_automation: "Automation mist",
  wrong_edge: "Verkeerde koppeling",
  missing_source_data: "Brondata ontbreekt",
  duplicate_or_legacy_node: "Duplicate/legacy node",
  endpoint_mismatch: "Endpoint mismatch",
  description_fix: "Beschrijving aanpassen",
  stop_point_unclear: "Stopreden onduidelijk",
  other: "Anders",
};

type ReviewContext =
  | { scope: "journey"; label: string }
  | { scope: "automation"; label: string; automationId: string }
  | {
      scope: "edge";
      label: string;
      fromAutomationId: string;
      toAutomationId: string;
      normalizedPath: string;
    };

export default function ProcessJourneyReview(): React.ReactNode {
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedJourneyId = searchParams.get("journey");
  const { data: automations = [], isLoading: automationsLoading } = useAutomatiseringenIncludingLegacyGitlab();
  const { data: suggestions = [], isLoading: suggestionsLoading } = useFlowSuggesties();
  const { data: flows = [], isLoading: flowsLoading } = useFlows();
  const { data: confirmedLinks = [], isLoading: confirmedLinksLoading } = useAllConfirmedAutomationLinks();
  const {
    data: reviewItems = [],
    isLoading: reviewItemsLoading,
    error: reviewItemsError,
  } = useProcessJourneyReviewItems();
  const createReviewItem = useCreateProcessJourneyReviewItem();
  const updateReviewItemStatus = useUpdateProcessJourneyReviewItemStatus();
  const saveCuratedJourney = useSaveCuratedProcessJourney();
  const [reviewContext, setReviewContext] = useState<ReviewContext>({ scope: "journey", label: "Hele procesreis" });
  const [itemType, setItemType] = useState<ProcessJourneyReviewItemType>("wrong_edge");
  const [note, setNote] = useState("");
  const [proposedAction, setProposedAction] = useState("");
  const [drafts, setDrafts] = useState<Record<string, { title: string; description: string }>>({});
  const [queueStatus, setQueueStatus] = useState<Record<string, "saved" | "skipped" | "error">>({});

  const presentation = useMemo(
    () =>
      getProcessJourneyReviewPresentation({
        automations,
        suggestions,
        flows,
        confirmedLinks,
        reviewItems,
        selectedJourneyId,
      }),
    [automations, suggestions, flows, confirmedLinks, reviewItems, selectedJourneyId],
  );

  const selected = presentation.selectedJourney;
  const draft = selected
    ? drafts[selected.id] ?? { title: selected.proposedTitle, description: selected.proposedDescription }
    : { title: "", description: "" };
  const isLoading = automationsLoading || suggestionsLoading || flowsLoading || confirmedLinksLoading;

  useEffect(() => {
    if (!selected) return;
    setDrafts((current) => {
      if (current[selected.id]) return current;
      return {
        ...current,
        [selected.id]: {
          title: selected.proposedTitle,
          description: selected.proposedDescription,
        },
      };
    });
  }, [selected]);

  function selectJourney(id: string): void {
    setSearchParams({ journey: id });
    setReviewContext({ scope: "journey", label: "Hele procesreis" });
    setItemType("wrong_edge");
  }

  async function copyText(value: string, label: string): Promise<void> {
    if (!navigator.clipboard?.writeText) {
      toast.error("Kopieren wordt niet ondersteund in deze browser");
      return;
    }

    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} gekopieerd`);
    } catch {
      toast.error(`${label} kopieren is mislukt`);
    }
  }

  async function submitReviewItem(): Promise<void> {
    if (!selected) return;
    const cleanNote = note.trim();
    const cleanAction = proposedAction.trim();
    if (!cleanNote) {
      toast.error("Vul eerst een notitie in");
      return;
    }

    try {
      await createReviewItem.mutateAsync({
        conceptJourneyId: selected.id,
        automationId: reviewContext.scope === "automation" ? reviewContext.automationId : null,
        fromAutomationId: reviewContext.scope === "edge" ? reviewContext.fromAutomationId : null,
        toAutomationId: reviewContext.scope === "edge" ? reviewContext.toAutomationId : null,
        normalizedPath: reviewContext.scope === "edge" ? reviewContext.normalizedPath : null,
        itemType,
        note: cleanNote,
        proposedAction: cleanAction,
      });
      setNote("");
      setProposedAction("");
      toast.success("Review-item opgeslagen");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Review-item opslaan mislukt");
    }
  }

  async function toggleReviewItem(item: ProcessJourneyReviewItem): Promise<void> {
    try {
      await updateReviewItemStatus.mutateAsync({
        id: item.id,
        status: item.status === "open" ? "resolved" : "open",
      });
      toast.success(item.status === "open" ? "Review-item opgelost" : "Review-item heropend");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Review-item bijwerken mislukt");
    }
  }

  function updateDraft(field: "title" | "description", value: string): void {
    if (!selected) return;
    setDrafts((current) => ({
      ...current,
      [selected.id]: {
        title: field === "title" ? value : (current[selected.id]?.title ?? selected.proposedTitle),
        description: field === "description" ? value : (current[selected.id]?.description ?? selected.proposedDescription),
      },
    }));
  }

  function selectRelativeJourney(delta: number): void {
    if (!selected) return;
    const index = presentation.queueRows.findIndex((row) => row.id === selected.id);
    const target = presentation.queueRows[index + delta];
    if (target) selectJourney(target.id);
  }

  function selectNextJourney(): void {
    if (!selected) return;
    const index = presentation.queueRows.findIndex((row) => row.id === selected.id);
    const target = presentation.queueRows[index + 1];
    if (target) {
      selectJourney(target.id);
      return;
    }
    toast.success("Alle review-items zijn doorlopen");
  }

  async function saveSelectedJourney(): Promise<void> {
    if (!selected) return;
    const title = draft.title.trim();
    const description = draft.description.trim();
    if (!title || !description) {
      toast.error("Vul een titel en beschrijving in");
      return;
    }

    try {
      await saveCuratedJourney.mutateAsync({
        kind: selected.kind,
        flowId: selected.flowId,
        title,
        description,
        automationIds: selected.automationIds,
        systemen: selected.systemen,
        transitions: selected.saveTransitions,
      });
      setQueueStatus((current) => ({ ...current, [selected.id]: "saved" }));
      toast.success(selected.kind === "concept" ? "Procesreis opgeslagen" : "Procesreis bijgewerkt");
      selectNextJourney();
    } catch (error) {
      setQueueStatus((current) => ({ ...current, [selected.id]: "error" }));
      toast.error(error instanceof Error ? error.message : "Procesreis opslaan mislukt");
    }
  }

  function skipSelectedJourney(): void {
    if (!selected) return;
    setQueueStatus((current) => ({ ...current, [selected.id]: "skipped" }));
    toast.success("Review-item overgeslagen");
    selectNextJourney();
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto flex w-full max-w-[1800px] flex-col gap-5 px-5 py-6 lg:px-8">
        <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">
                <ShieldCheck className="h-3.5 w-3.5" />
                Developer-sessie
              </span>
              <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950">
                Procesreis Review Cockpit
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600">
                Bespreek procesreizen een voor een, controleer het harde webhook-bewijs en sla pas op wanneer de
                titel en beschrijving kloppen.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline">
                <Link to="/flows">Terug naar procesreizen</Link>
              </Button>
              {selected && (
                <Button asChild>
                  <Link to={selected.approvalHref}>
                    <CheckCircle2 className="h-4 w-4" />
                    Open goedkeurpagina
                  </Link>
                </Button>
              )}
            </div>
          </div>
        </header>

        {isLoading ? (
          <div className="flex min-h-80 items-center justify-center rounded-2xl border border-slate-200 bg-white">
            <Loader2 className="h-5 w-5 animate-spin text-slate-500" />
          </div>
        ) : presentation.queueRows.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="grid min-w-0 gap-5 xl:grid-cols-[320px_minmax(0,1fr)_390px]">
            <aside className="min-w-0 space-y-3">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Wachtrij</p>
                <h2 className="mt-1 text-lg font-semibold text-slate-950">
                  {presentation.queueRows.length} review-item{presentation.queueRows.length === 1 ? "" : "s"}
                </h2>
              </div>
              <div className="grid gap-2">
                {presentation.queueRows.map((row) => (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => selectJourney(row.id)}
                    className={cn(
                      "min-w-0 rounded-2xl border bg-white p-4 text-left shadow-sm transition-colors hover:border-slate-300",
                      selected?.id === row.id ? "border-slate-950 ring-2 ring-slate-950/5" : "border-slate-200",
                    )}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                        100% webhook
                      </span>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                        {queueStatus[row.id] === "saved"
                          ? "Opgeslagen"
                          : queueStatus[row.id] === "skipped"
                            ? "Overgeslagen"
                            : queueStatus[row.id] === "error"
                              ? "Fout"
                              : row.statusLabel}
                      </span>
                      {row.openItemCount > 0 && (
                        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                          {row.openItemCount} open
                        </span>
                      )}
                    </div>
                    <p className="mt-3 line-clamp-2 text-sm font-semibold text-slate-950">{row.title}</p>
                    <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-slate-600">{row.description}</p>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      <TinyPill>{row.automationCount} automations</TinyPill>
                      <TinyPill>{row.transitionCount} edges</TinyPill>
                      {row.sourceLabels.map((source) => <TinyPill key={source}>{source}</TinyPill>)}
                    </div>
                  </button>
                ))}
              </div>
            </aside>

            {selected && (
              <>
                <main className="min-w-0 space-y-5">
                  <JourneyOverview
                    journey={selected}
                    onReviewAutomation={(node) => {
                      setReviewContext({ scope: "automation", label: node.name, automationId: node.id });
                      setItemType("missing_source_data");
                    }}
                    onReviewEdge={(edge) => {
                      setReviewContext({
                        scope: "edge",
                        label: `${edge.fromName} -> ${edge.toName}`,
                        fromAutomationId: edge.fromId,
                        toAutomationId: edge.toId,
                        normalizedPath: edge.normalizedPath,
                      });
                      setItemType("wrong_edge");
                    }}
                  />
                  <CopyWorkbench
                    journey={selected}
                    onCopyPrompt={() => copyText(selected.prompt, "Prompt")}
                    onCopyMarkdown={() => copyText(selected.markdown, "Markdown")}
                  />
                </main>

                <aside className="min-w-0 space-y-5">
                  <CurationPanel
                    journey={selected}
                    draftTitle={draft.title}
                    draftDescription={draft.description}
                    isSaving={saveCuratedJourney.isPending}
                    canGoBack={presentation.queueRows.findIndex((row) => row.id === selected.id) > 0}
                    onTitleChange={(value) => updateDraft("title", value)}
                    onDescriptionChange={(value) => updateDraft("description", value)}
                    onSave={saveSelectedJourney}
                    onSkip={skipSelectedJourney}
                    onBack={() => selectRelativeJourney(-1)}
                  />
                  <ReviewItemForm
                    context={reviewContext}
                    itemType={itemType}
                    note={note}
                    proposedAction={proposedAction}
                    isSaving={createReviewItem.isPending}
                    storageUnavailable={Boolean(reviewItemsError)}
                    onTypeChange={setItemType}
                    onNoteChange={setNote}
                    onActionChange={setProposedAction}
                    onSubmit={submitReviewItem}
                  />
                  <ReviewItemList
                    items={selected.reviewItems}
                    isLoading={reviewItemsLoading}
                    storageError={reviewItemsError}
                    isUpdating={updateReviewItemStatus.isPending}
                    onToggle={toggleReviewItem}
                  />
                </aside>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function CurationPanel({
  journey,
  draftTitle,
  draftDescription,
  isSaving,
  canGoBack,
  onTitleChange,
  onDescriptionChange,
  onSave,
  onSkip,
  onBack,
}: {
  journey: SelectedProcessJourneyReview;
  draftTitle: string;
  draftDescription: string;
  isSaving: boolean;
  canGoBack: boolean;
  onTitleChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onSave: () => void;
  onSkip: () => void;
  onBack: () => void;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Curatie</p>
          <h2 className="mt-1 text-lg font-semibold text-slate-950">Eén voor één opslaan</h2>
          <p className="mt-1 text-sm leading-relaxed text-slate-600">
            {journey.kind === "concept"
              ? "Deze procesreis wordt nieuw aangemaakt na jouw akkoord."
              : "Deze goedgekeurde procesreis wordt alleen tekstueel bijgewerkt."}
          </p>
        </div>
        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
          {journey.kind === "concept" ? "Nieuw" : "Bestaand"}
        </span>
      </div>

      {journey.kind === "flow" && (
        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Huidige tekst</p>
          <p className="mt-2 text-sm font-semibold text-slate-950">{journey.currentTitle}</p>
          <p className="mt-1 text-xs leading-relaxed text-slate-600">
            {journey.currentDescription || "Geen huidige beschrijving."}
          </p>
        </div>
      )}

      <div className="mt-4 grid gap-4">
        <div className="grid gap-2">
          <Label htmlFor="curation-title">Voorgestelde titel</Label>
          <Input
            id="curation-title"
            aria-label="Voorgestelde titel"
            value={draftTitle}
            onChange={(event) => onTitleChange(event.target.value)}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="curation-description">Voorgestelde beschrijving</Label>
          <Textarea
            id="curation-description"
            aria-label="Voorgestelde beschrijving"
            value={draftDescription}
            onChange={(event) => onDescriptionChange(event.target.value)}
            className="min-h-36"
          />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="button" onClick={onSave} disabled={isSaving}>
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
          {journey.saveLabel}
        </Button>
        <Button type="button" variant="outline" onClick={onSkip} disabled={isSaving}>
          Overslaan
        </Button>
        <Button type="button" variant="outline" onClick={onBack} disabled={!canGoBack || isSaving}>
          Terug naar vorige
        </Button>
      </div>
    </section>
  );
}

function JourneyOverview({
  journey,
  onReviewAutomation,
  onReviewEdge,
}: {
  journey: SelectedProcessJourneyReview;
  onReviewAutomation: (node: ProcessJourneyReviewNode) => void;
  onReviewEdge: (edge: ProcessJourneyReviewEdge) => void;
}) {
  return (
    <>
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap gap-2">
              <TinyPill>{journey.structureLabel}</TinyPill>
              <TinyPill>{journey.automationCount} automations</TinyPill>
              <TinyPill>{journey.transitionCount} webhook-overgangen</TinyPill>
            </div>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">{journey.title}</h2>
            <p className="mt-2 max-w-4xl text-sm leading-relaxed text-slate-600">{journey.description}</p>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-5">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-950">
            <GitBranch className="h-4 w-4" />
            Procesreis-keten
          </h2>
          <p className="mt-1 text-sm text-slate-600">Elke automation is een eigen node; elke pijl is hard webhook-bewijs.</p>
        </div>
        <div className="max-w-full overflow-x-auto p-5">
          <div className="flex min-w-max items-center gap-3">
            {journey.nodes.map((node, index) => (
              <div key={node.id} className="flex items-center gap-3">
                <article className="w-64 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-600">{node.sourceLabel}</span>
                    <span className="text-[10px] font-semibold uppercase text-slate-500">Stap {index + 1}</span>
                  </div>
                  <p className="mt-3 line-clamp-2 text-sm font-semibold text-slate-950">{node.name}</p>
                  <p className="mt-1 text-xs text-slate-500">{node.status}</p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-3 w-full"
                    onClick={() => onReviewAutomation(node)}
                  >
                    <MessageSquarePlus className="h-3.5 w-3.5" />
                    Review automation
                  </Button>
                </article>
                {index < journey.nodes.length - 1 && <ArrowRight className="h-5 w-5 text-slate-400" />}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-950">Webhook-bewijs</h2>
        <div className="mt-4 grid gap-3">
          {journey.edges.map((edge) => (
            <article key={edge.id} className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800">
                    {edge.evidenceLabel}
                  </span>
                  <p className="mt-3 text-sm font-semibold text-slate-950">
                    {edge.fromName} <span className="text-slate-400">{"->"}</span> {edge.toName}
                  </p>
                  <p className="mt-2 text-xs text-slate-600">
                    <code className="rounded bg-white px-2 py-1">{edge.method} {edge.normalizedPath}</code>
                  </p>
                  <p className="mt-2 text-xs text-slate-500">Bronveld: {edge.sourceField}</p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => onReviewEdge(edge)}>
                  <MessageSquarePlus className="h-3.5 w-3.5" />
                  Review edge
                </Button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <InfoListCard
          title="Waar stopt het bewijs?"
          icon={AlertTriangle}
          items={journey.stopReasons.map((reason) => ({
            title: reason.nodeName,
            description: reason.description,
          }))}
        />
        <InfoListCard
          title="Bronkwaliteit"
          icon={ShieldCheck}
          empty="Geen bronkwaliteitmeldingen voor deze kandidaat."
          items={journey.sourceQualityWarnings.map((warning) => ({
            title: warning.automationName,
            description: `${warning.message} (${warning.type})`,
          }))}
        />
      </section>
    </>
  );
}

function CopyWorkbench({
  journey,
  onCopyPrompt,
  onCopyMarkdown,
}: {
  journey: SelectedProcessJourneyReview;
  onCopyPrompt: () => void;
  onCopyMarkdown: () => void;
}) {
  return (
    <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Export voor gesprek</p>
          <h2 className="mt-1 text-lg font-semibold text-slate-950">Prompt + Markdown</h2>
          <p className="mt-1 text-sm text-slate-600">
            Kopieer bewijs en bespreekpunten naar AI, notulen of een losse review.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={onCopyPrompt}>
            <Clipboard className="h-4 w-4" />
            Prompt kopiëren
          </Button>
          <Button type="button" variant="outline" onClick={onCopyMarkdown}>
            <FileText className="h-4 w-4" />
            Markdown kopiëren
          </Button>
        </div>
      </div>
      <pre className="mt-4 max-h-44 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-slate-950 p-4 text-xs leading-relaxed text-slate-50">
        {journey.markdown}
      </pre>
    </section>
  );
}

function ReviewItemForm({
  context,
  itemType,
  note,
  proposedAction,
  isSaving,
  storageUnavailable,
  onTypeChange,
  onNoteChange,
  onActionChange,
  onSubmit,
}: {
  context: ReviewContext;
  itemType: ProcessJourneyReviewItemType;
  note: string;
  proposedAction: string;
  isSaving: boolean;
  storageUnavailable: boolean;
  onTypeChange: (value: ProcessJourneyReviewItemType) => void;
  onNoteChange: (value: string) => void;
  onActionChange: (value: string) => void;
  onSubmit: () => void;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-950">Nieuw review-item</h2>
      <p className="mt-1 text-sm text-slate-600">
        Scope: <span className="font-medium text-slate-950">{context.label}</span>
      </p>
      {storageUnavailable && (
        <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Correctielijst-opslag is nog niet beschikbaar. Pas eerst de database-migratie toe.
        </p>
      )}
      <div className="mt-4 grid gap-4">
        <div className="grid gap-2">
          <Label htmlFor="review-item-type">Type fout</Label>
          <Select value={itemType} onValueChange={(value) => onTypeChange(value as ProcessJourneyReviewItemType)}>
            <SelectTrigger id="review-item-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(ITEM_TYPE_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="review-note">Notitie</Label>
          <Textarea
            id="review-note"
            aria-label="Notitie"
            value={note}
            onChange={(event) => onNoteChange(event.target.value)}
            placeholder="Wat klopt er niet of moet worden uitgezocht?"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="review-action">Voorgestelde actie</Label>
          <Input
            id="review-action"
            aria-label="Voorgestelde actie"
            value={proposedAction}
            onChange={(event) => onActionChange(event.target.value)}
            placeholder="Bijv. check endpoint in HubSpot workflow"
          />
        </div>
        <Button type="button" onClick={onSubmit} disabled={isSaving || storageUnavailable}>
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquarePlus className="h-4 w-4" />}
          Review-item opslaan
        </Button>
      </div>
    </section>
  );
}

function ReviewItemList({
  items,
  isLoading,
  storageError,
  isUpdating,
  onToggle,
}: {
  items: ProcessJourneyReviewItem[];
  isLoading: boolean;
  storageError: unknown;
  isUpdating: boolean;
  onToggle: (item: ProcessJourneyReviewItem) => void;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-slate-950">Correctielijst</h2>
        <TinyPill>{items.filter((item) => item.status === "open").length} open</TinyPill>
      </div>
      {storageError ? (
        <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Correctielijst-opslag is nog niet beschikbaar. Pas eerst de database-migratie toe.
        </p>
      ) : isLoading ? (
        <p className="mt-4 text-sm text-slate-600">Correctielijst laden...</p>
      ) : items.length === 0 ? (
        <p className="mt-4 text-sm text-slate-600">Nog geen review-items voor deze kandidaat.</p>
      ) : (
        <div className="mt-4 grid gap-3">
          {items.map((item) => (
            <article
              key={item.id}
              className={cn(
                "rounded-xl border p-4",
                item.status === "open" ? "border-amber-200 bg-amber-50/60" : "border-emerald-200 bg-emerald-50/60",
              )}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                    {ITEM_TYPE_LABELS[item.itemType]}
                  </span>
                  <p className="mt-2 text-sm font-semibold leading-relaxed text-slate-950">{item.note}</p>
                  {item.proposedAction && (
                    <p className="mt-1 text-xs leading-relaxed text-slate-600">Actie: {item.proposedAction}</p>
                  )}
                  {item.normalizedPath && (
                    <code className="mt-2 inline-block rounded bg-white px-2 py-1 text-[11px] text-slate-600">
                      {item.normalizedPath}
                    </code>
                  )}
                </div>
                <Button type="button" variant="outline" size="sm" disabled={isUpdating} onClick={() => onToggle(item)}>
                  {item.status === "open" ? "Oplossen" : "Heropenen"}
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function InfoListCard({
  title,
  icon: Icon,
  items,
  empty = "Geen items.",
}: {
  title: string;
  icon: typeof AlertTriangle;
  items: Array<{ title: string; description: string }>;
  empty?: string;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-950">
        <Icon className="h-4 w-4" />
        {title}
      </h2>
      {items.length === 0 ? (
        <p className="mt-3 text-sm text-slate-600">{empty}</p>
      ) : (
        <div className="mt-4 grid gap-3">
          {items.map((item) => (
            <div key={`${title}-${item.title}-${item.description}`} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-sm font-semibold text-slate-950">{item.title}</p>
              <p className="mt-1 text-sm leading-relaxed text-slate-600">{item.description}</p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function EmptyState() {
  return (
    <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center shadow-sm">
      <h2 className="text-lg font-semibold text-slate-950">Geen conceptprocesreizen om te reviewen</h2>
      <p className="mt-2 text-sm text-slate-600">
        Detecteer eerst webhook-bewezen conceptprocesreizen op de procesreizenpagina.
      </p>
      <Button asChild className="mt-4">
        <Link to="/flows">Naar procesreizen</Link>
      </Button>
    </section>
  );
}

function TinyPill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600">
      {children}
    </span>
  );
}
