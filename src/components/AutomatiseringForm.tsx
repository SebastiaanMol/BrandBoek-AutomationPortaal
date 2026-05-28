import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import type { Automatisering, Systeem, Categorie, Status, KlantFase, HubSpotWorkflowUserAuditInfo } from "@/lib/types";
import { CATEGORIEEN, SYSTEMEN, STATUSSEN, KLANT_FASEN } from "@/lib/types";
import { useAutomatiseringen, useSaveAutomatisering, useUpdateAutomatisering, useNextId, usePortalSettings } from "@/lib/hooks";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { ExternalLink, Lock, X, Loader2 } from "lucide-react";
import { getHubSpotWorkflowSourceUrl, isHubSpotAutomation } from "@/lib/hubspotSourceUrl";

interface AutomatiseringFormProps {
  prefill?: Partial<Automatisering>;
  editMode?: boolean;
  editId?: string;
}

export function AutomatiseringForm({ prefill, editMode, editId }: AutomatiseringFormProps): React.ReactNode {
  const navigate = useNavigate();
  const { data: allAutomatiseringen = [] } = useAutomatiseringen();
  const { data: nextId, isLoading: idLoading } = useNextId();
  const saveMutation = useSaveAutomatisering();
  const updateMutation = useUpdateAutomatisering();

  const { data: portalSettings } = usePortalSettings();
  const effectiveSystemen = useMemo(
    () => Array.from(new Set([...SYSTEMEN, ...(portalSettings?.extraSystemen ?? [])])) as string[],
    [portalSettings?.extraSystemen]
  );
  const effectiveCategorieen = useMemo(
    () => Array.from(new Set([...CATEGORIEEN, ...(portalSettings?.extraCategorieen ?? [])])) as string[],
    [portalSettings?.extraCategorieen]
  );
  const activeCategorieen = useMemo(
    () => {
      const activeBeschikbaar = new Set(portalSettings?.beschikbareCategorieen ?? CATEGORIEEN);
      const extraSet = new Set(portalSettings?.extraCategorieen ?? []);
      // Extra categories are always shown even when not yet added to beschikbareCategorieen
      return effectiveCategorieen.filter(
        (c) => activeBeschikbaar.has(c as Categorie) || extraSet.has(c)
      );
    },
    [portalSettings?.beschikbareCategorieen, portalSettings?.extraCategorieen, effectiveCategorieen]
  );

  const [form, setForm] = useState<Partial<Automatisering>>({
    naam: "",
    categorie: "HubSpot Workflow",
    doel: "",
    trigger: "",
    systemen: [],
    stappen: [""],
    afhankelijkheden: "",
    owner: "",
    status: "Actief",
    verbeterideeën: "",
    mermaidDiagram: "",
    koppelingen: [],
    fasen: [],
    ...prefill,
  });

  const sourceItem = prefill as Automatisering | undefined;
  const isHubSpotEdit = Boolean(editMode && sourceItem && isHubSpotAutomation(sourceItem));

  const set = (key: string, value: unknown) => setForm((f) => ({ ...f, [key]: value }));

  const toggleSysteem = (s: string): void => {
    const curr = form.systemen || [];
    set("systemen", curr.includes(s) ? curr.filter((x) => x !== s) : [...curr, s]);
  };

  const toggleFase = (f: KlantFase): void => {
    const curr = form.fasen || [];
    set("fasen", curr.includes(f) ? curr.filter((x) => x !== f) : [...curr, f]);
  };

  const updateStap = (idx: number, val: string) => {
    const stappen = [...(form.stappen || [])];
    stappen[idx] = val;
    set("stappen", stappen);
  };

  const addStap = () => set("stappen", [...(form.stappen || []), ""]);
  const removeStap = (idx: number) => set("stappen", (form.stappen || []).filter((_, i) => i !== idx));

  const addKoppeling = (doelId: string) => {
    const koppelingen = form.koppelingen || [];
    if (koppelingen.some((k) => k.doelId === doelId)) return;
    set("koppelingen", [...koppelingen, { doelId, label: "" }]);
  };

  const updateKoppelingLabel = (idx: number, label: string) => {
    const koppelingen = [...(form.koppelingen || [])];
    koppelingen[idx] = { ...koppelingen[idx], label };
    set("koppelingen", koppelingen);
  };

  const removeKoppeling = (idx: number) => {
    set("koppelingen", (form.koppelingen || []).filter((_, i) => i !== idx));
  };

  const submit = async () => {
    const effectiveNaam = isHubSpotEdit ? sourceItem?.naam : form.naam;
    if (!effectiveNaam?.trim()) {
      toast.error("Name is required");
      return;
    }

    const required = portalSettings?.verplichtVelden ?? [];
    for (const veld of required) {
      if (veld === "systemen" && (!form.systemen || form.systemen.length === 0)) {
        toast.error("Systemen is verplicht"); return;
      }
      if (veld === "fasen" && (!form.fasen || form.fasen.length === 0)) {
        toast.error("Fasen is verplicht"); return;
      }
      if (veld === "stappen" && (!form.stappen || form.stappen.filter((s) => s.trim()).length === 0)) {
        toast.error("Stappen is verplicht"); return;
      }
      if (
        (veld === "doel" || veld === "trigger" || veld === "owner" || veld === "afhankelijkheden") &&
        !form[veld]?.trim()
      ) {
        const label: Record<string, string> = {
          doel: "Doel", trigger: "Trigger", owner: "Owner", afhankelijkheden: "Afhankelijkheden",
        };
        toast.error(`${label[veld]} is verplicht`);
        return;
      }
    }

    const id = editMode ? editId! : nextId;
    if (!id) {
      toast.error("Cannot generate ID");
      return;
    }

    const item: Automatisering = {
      ...(editMode && sourceItem ? sourceItem : {}),
      id,
      naam: isHubSpotEdit ? sourceItem!.naam : form.naam!,
      categorie: isHubSpotEdit ? sourceItem!.categorie : form.categorie as Categorie,
      doel: isHubSpotEdit ? sourceItem!.doel : form.doel || "",
      trigger: isHubSpotEdit ? sourceItem!.trigger : form.trigger || "",
      systemen: isHubSpotEdit ? sourceItem!.systemen : (form.systemen || []) as Systeem[],
      stappen: isHubSpotEdit ? sourceItem!.stappen : (form.stappen || []).filter((s) => s.trim()),
      afhankelijkheden: form.afhankelijkheden || "",
      owner: form.owner || "",
      status: isHubSpotEdit ? sourceItem!.status : form.status as Status,
      verbeterideeën: form.verbeterideeën || "",
      mermaidDiagram: form.mermaidDiagram || "",
      koppelingen: (form.koppelingen || []).filter((k) => k.doelId),
      fasen: (form.fasen || []) as KlantFase[],
      createdAt: prefill?.createdAt || new Date().toISOString(),
      laatstGeverifieerd: prefill?.laatstGeverifieerd || null,
      geverifieerdDoor: prefill?.geverifieerdDoor || "",
    };

    try {
      if (editMode) {
        await updateMutation.mutateAsync(item);
        toast.success(`${item.id} updated`);
      } else {
        await saveMutation.mutateAsync(item);
        toast.success(`${item.id} saved`);
      }
      navigate(`/automations/${encodeURIComponent(item.id)}`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    }
  };

  const isPending = saveMutation.isPending || updateMutation.isPending;

  const availableForKoppeling = useMemo(
    () => allAutomatiseringen.filter(
      (a) => a.id !== editId && !(form.koppelingen || []).some((k) => k.doelId === a.id)
    ),
    [allAutomatiseringen, editId, form.koppelingen],
  );

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <p className="label-uppercase mb-1">ID</p>
        <p className="font-mono text-sm text-foreground">
          {editMode ? editId : idLoading ? <Loader2 className="h-4 w-4 animate-spin inline" /> : nextId}
        </p>
      </div>

      {isHubSpotEdit && sourceItem ? (
        <HubSpotReadOnlySourcePanel automation={sourceItem} />
      ) : (
        <>
          <Field label="Name">
            <Input aria-label="Name" value={form.naam} onChange={(e) => set("naam", e.target.value)} placeholder="Automation name" />
          </Field>

          <Field label="Category">
            <Select value={form.categorie} onValueChange={(v) => set("categorie", v)}>
              <SelectTrigger aria-label="Category"><SelectValue /></SelectTrigger>
              <SelectContent>
                {activeCategorieen.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Goal">
            <Textarea aria-label="Goal" value={form.doel} onChange={(e) => set("doel", e.target.value)} placeholder="What does this automation do?" />
          </Field>

          <Field label="Trigger">
            <Input aria-label="Trigger" value={form.trigger} onChange={(e) => set("trigger", e.target.value)} placeholder="What starts it?" />
          </Field>

          <Field label="Primary Systems">
            <p className="text-[10px] text-muted-foreground mb-2">Select all systems used by this automation</p>
            <div className="flex flex-wrap gap-3">
              {effectiveSystemen.map((s) => (
                <label key={s} className="flex items-center gap-2 text-sm">
                  <Checkbox checked={form.systemen?.includes(s as Systeem)} onCheckedChange={() => toggleSysteem(s)} />
                  {s}
                </label>
              ))}
            </div>
          </Field>
        </>
      )}

      <Field label="Customer Process Phase">
        <p className="text-[10px] text-muted-foreground mb-2">In which phase(s) of the customer journey is this automation active?</p>
        <div className="flex flex-wrap gap-3">
          {KLANT_FASEN.map((f) => (
            <label key={f} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={form.fasen?.includes(f)}
                onCheckedChange={() => toggleFase(f)}
              />
              {f}
            </label>
          ))}
        </div>
      </Field>

      {!isHubSpotEdit && (
        <Field label="Flow / Steps">
        <div className="space-y-2">
          {(form.stappen || []).map((stap, i) => (
            <div key={i} className="flex gap-2 items-center">
              <span className="text-xs text-muted-foreground font-mono w-6">{i + 1}.</span>
              <Input aria-label={`Stap ${i + 1}`} value={stap} onChange={(e) => updateStap(i, e.target.value)} placeholder={`Stap ${i + 1}`} />
              {(form.stappen || []).length > 1 && (
                <button onClick={() => removeStap(i)} className="text-destructive text-sm hover:underline">×</button>
              )}
            </div>
          ))}
          <button onClick={addStap} className="text-sm text-ring hover:underline">+ Add step</button>
        </div>
        </Field>
      )}

      <Field label="Links">
        <p className="text-[10px] text-muted-foreground mb-2">
          Leg alleen een koppeling als de output van deze automatisering direct de input/trigger is van een andere.
        </p>
        <div className="space-y-2">
          {(form.koppelingen || []).map((k, idx) => {
            const target = allAutomatiseringen.find((a) => a.id === k.doelId);
            return (
              <div key={idx} className="bg-secondary rounded-[var(--radius-inner)] p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-semibold text-foreground shrink-0">{k.doelId}</span>
                  <span className="text-xs text-muted-foreground truncate">{target?.naam || "Unknown"}</span>
                  <button onClick={() => removeKoppeling(idx)} className="ml-auto text-destructive shrink-0 hover:opacity-70">
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <Input
                  value={k.label}
                  onChange={(e) => updateKoppelingLabel(idx, e.target.value)}
                  placeholder="Beschrijf waarom de koppeling bestaat"
                  className="text-xs h-8"
                />
              </div>
            );
          })}
          {availableForKoppeling.length > 0 && (
            <Select onValueChange={(v) => addKoppeling(v)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="+ Directe koppeling toevoegen..." />
              </SelectTrigger>
              <SelectContent>
                {availableForKoppeling.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.id} — {a.naam}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </Field>

      <Field label="Dependencies">
        <Textarea aria-label="Dependencies" value={form.afhankelijkheden} onChange={(e) => set("afhankelijkheden", e.target.value)} />
      </Field>

      <Field label="Owner">
        <Input aria-label="Owner" value={form.owner} onChange={(e) => set("owner", e.target.value)} placeholder="Naam" />
      </Field>

      {!isHubSpotEdit && (
        <Field label="Status">
        <Select value={form.status} onValueChange={(v) => set("status", v)}>
          <SelectTrigger aria-label="Status"><SelectValue /></SelectTrigger>
          <SelectContent>
            {(portalSettings?.beschikbareStatussen ?? STATUSSEN).map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        </Field>
      )}

      <Field label="Improvement Ideas">
        <Textarea value={form.verbeterideeën} onChange={(e) => set("verbeterideeën", e.target.value)} />
      </Field>

      <Field label="Flow Diagram (Mermaid)">
        <Textarea
          aria-label="Flow Diagram (Mermaid)"
          className="font-mono text-xs"
          rows={6}
          value={form.mermaidDiagram}
          onChange={(e) => set("mermaidDiagram", e.target.value)}
          placeholder={`graph TD\n    A[Start] --> B[Stap 1]\n    B --> C[Einde]`}
        />
      </Field>

      <div className="flex gap-3">
        <button
          onClick={submit}
          disabled={isPending}
          className="bg-primary text-primary-foreground px-6 py-2.5 rounded-md text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {isPending ? "Saving..." : editMode ? "Save Changes" : "Save Automation"}
        </button>
        {editMode && (
          <button
            onClick={() => navigate(`/automations/${encodeURIComponent(editId)}`)}
            disabled={isPending}
            className="px-6 py-2.5 rounded-md text-sm font-medium border border-border hover:bg-secondary transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}

function HubSpotReadOnlySourcePanel({ automation }: { automation: Automatisering }): React.ReactNode {
  const [sourceEditAttempted, setSourceEditAttempted] = useState(false);
  const sourceUrl = getHubSpotWorkflowSourceUrl(automation);
  const workflowId = automation.hubspotWorkflow?.workflowId || automation.externalId || "Niet beschikbaar";
  const trigger = automation.hubspotWorkflow?.triggers?.[0]?.label || automation.trigger || "Niet beschikbaar";
  const hubspotActions = automation.hubspotWorkflow?.actions
    ?.map((action) => action.label || action.type)
    .filter(Boolean)
    .join(", ");
  const actions = automation.stappen?.filter(Boolean).join(", ") || hubspotActions || "Niet beschikbaar";

  const showSourceEditMessage = (): void => {
    setSourceEditAttempted(true);
    toast.error("Dit veld komt uit HubSpot. Pas dit aan bij de bron en sync daarna opnieuw.");
  };

  return (
    <section
      aria-label="HubSpot bronvelden"
      className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-4"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
              <Lock className="h-4 w-4" />
            </span>
            <h2 className="text-base font-semibold text-foreground">HubSpot bronvelden zijn read-only</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Pas bronvelden aan in HubSpot en sync daarna opnieuw.
          </p>
        </div>
        {sourceUrl ? (
          <a
            href={sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Open in HubSpot
            <ExternalLink className="h-4 w-4" />
          </a>
        ) : (
          <span className="inline-flex items-center rounded-md border border-border px-4 py-2 text-sm text-muted-foreground">
            Bronlink niet beschikbaar
          </span>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <ReadOnlySourceField label="Naam" value={automation.naam} onEditAttempt={showSourceEditMessage} />
        <ReadOnlySourceField label="Workflow ID" value={workflowId} onEditAttempt={showSourceEditMessage} />
        <ReadOnlySourceField label="Categorie / source" value={`${automation.categorie} - HubSpot`} onEditAttempt={showSourceEditMessage} />
        <ReadOnlySourceField label="Status" value={automation.status} onEditAttempt={showSourceEditMessage} />
        <ReadOnlySourceField label="HubSpot created by" value={formatHubSpotAuditUser(automation.hubspotWorkflow?.createdBy)} onEditAttempt={showSourceEditMessage} />
        <ReadOnlySourceField label="HubSpot updated by" value={formatHubSpotAuditUser(automation.hubspotWorkflow?.updatedBy)} onEditAttempt={showSourceEditMessage} />
        <ReadOnlySourceField label="Created at" value={formatHubSpotAuditDate(automation.hubspotWorkflow?.createdAt)} onEditAttempt={showSourceEditMessage} />
        <ReadOnlySourceField label="Updated at" value={formatHubSpotAuditDate(automation.hubspotWorkflow?.updatedAt)} onEditAttempt={showSourceEditMessage} />
        <ReadOnlySourceField label="Beschrijving" value={automation.doel || "Niet beschikbaar"} onEditAttempt={showSourceEditMessage} wide />
        <ReadOnlySourceField label="Trigger" value={trigger} onEditAttempt={showSourceEditMessage} wide />
        <ReadOnlySourceField label="Acties" value={actions} onEditAttempt={showSourceEditMessage} wide />
      </div>

      {sourceEditAttempted && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Dit veld komt uit HubSpot. Pas dit aan bij de bron en sync daarna opnieuw.
        </p>
      )}
    </section>
  );
}

function formatHubSpotAuditUser(user: HubSpotWorkflowUserAuditInfo | null | undefined): string {
  if (!user) return HUBSPOT_AUDIT_SYNC_FALLBACK;
  const value = user as { id?: string | null; email?: string | null; label?: string | null };
  const label = value.label?.trim();
  const email = value.email?.trim();
  const id = value.id?.trim();
  if (label && email && label !== email) return `${label} (${email})`;
  return label || email || (id ? `HubSpot user ${id}` : HUBSPOT_AUDIT_SYNC_FALLBACK);
}

function formatHubSpotAuditDate(value: string | null | undefined): string {
  if (!value) return HUBSPOT_AUDIT_SYNC_FALLBACK;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return HUBSPOT_AUDIT_SYNC_FALLBACK;
  return date.toLocaleDateString("nl-NL", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

const HUBSPOT_AUDIT_SYNC_FALLBACK = "Niet beschikbaar via HubSpot API";

function ReadOnlySourceField({
  label,
  value,
  wide,
  onEditAttempt,
}: {
  label: string;
  value: string;
  wide?: boolean;
  onEditAttempt: () => void;
}): React.ReactNode {
  return (
    <div className={`rounded-lg border border-border bg-background p-3 ${wide ? "sm:col-span-2" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="label-uppercase mb-1">{label}</p>
          <p className="text-sm text-foreground break-words">{value || "Niet beschikbaar"}</p>
        </div>
        <button
          type="button"
          onClick={onEditAttempt}
          className="shrink-0 rounded-md border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          Edit
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }): React.ReactNode {
  return (
    <div className="space-y-1.5">
      <Label className="label-uppercase">{label}</Label>
      {children}
    </div>
  );
}
