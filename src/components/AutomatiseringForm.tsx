import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Automatisering, CATEGORIEEN, SYSTEMEN, STATUSSEN, KLANT_FASEN, Systeem, Categorie, Status, KlantFase, Koppeling } from "@/lib/types";
import { useAutomatiseringen, useSaveAutomatisering, useUpdateAutomatisering, useNextId } from "@/lib/hooks";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { X, Loader2 } from "lucide-react";

interface AutomatiseringFormProps {
  prefill?: Partial<Automatisering>;
  editMode?: boolean;
  editId?: string;
}

export default function AutomatiseringForm({ prefill, editMode, editId }: AutomatiseringFormProps) {
  const navigate = useNavigate();
  const { data: allAutomatiseringen = [] } = useAutomatiseringen();
  const { data: nextId, isLoading: idLoading } = useNextId();
  const saveMutation = useSaveAutomatisering();
  const updateMutation = useUpdateAutomatisering();

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
    gitlabFilePath: "",
    ...prefill,
  });

  const set = (key: string, value: unknown) => setForm((f) => ({ ...f, [key]: value }));

  const toggleSysteem = (s: Systeem) => {
    const curr = form.systemen || [];
    set("systemen", curr.includes(s) ? curr.filter((x) => x !== s) : [...curr, s]);
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
    if (!form.naam?.trim()) {
      toast.error("Name is required");
      return;
    }

    const id = editMode ? editId! : nextId;
    if (!id) {
      toast.error("Cannot generate ID");
      return;
    }

    const item: Automatisering = {
      id,
      naam: form.naam!,
      categorie: form.categorie as Categorie,
      doel: form.doel || "",
      trigger: form.trigger || "",
      systemen: (form.systemen || []) as Systeem[],
      stappen: (form.stappen || []).filter((s) => s.trim()),
      afhankelijkheden: form.afhankelijkheden || "",
      owner: form.owner || "",
      status: form.status as Status,
      verbeterideeën: form.verbeterideeën || "",
      mermaidDiagram: form.mermaidDiagram || "",
      koppelingen: (form.koppelingen || []).filter((k) => k.doelId),
      fasen: (form.fasen || []) as KlantFase[],
      createdAt: prefill?.createdAt || new Date().toISOString(),
      laatstGeverifieerd: prefill?.laatstGeverifieerd || null,
      geverifieerdDoor: prefill?.geverifieerdDoor || "",
      gitlabFilePath: form.gitlabFilePath?.trim() || undefined,
    };

    try {
      if (editMode) {
        await updateMutation.mutateAsync(item);
        toast.success(`${item.id} updated`);
      } else {
        await saveMutation.mutateAsync(item);
        toast.success(`${item.id} saved`);
      }
      navigate(`/alle?open=${item.id}`);
    } catch (err: any) {
      toast.error(err.message || "Save failed");
    }
  };

  const isPending = saveMutation.isPending || updateMutation.isPending;

  const availableForKoppeling = allAutomatiseringen.filter(
    (a) => a.id !== editId && !(form.koppelingen || []).some((k) => k.doelId === a.id)
  );

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <p className="label-uppercase mb-1">ID</p>
        <p className="font-mono text-sm text-foreground">
          {editMode ? editId : idLoading ? <Loader2 className="h-4 w-4 animate-spin inline" /> : nextId}
        </p>
      </div>

      <Field label="Name">
        <Input value={form.naam} onChange={(e) => set("naam", e.target.value)} placeholder="Automation name" />
      </Field>

      <Field label="Category">
        <Select value={form.categorie} onValueChange={(v) => set("categorie", v)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {CATEGORIEEN.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
      </Field>

      <Field label="Goal">
        <Textarea value={form.doel} onChange={(e) => set("doel", e.target.value)} placeholder="What does this automation do?" />
      </Field>

      <Field label="Trigger">
        <Input value={form.trigger} onChange={(e) => set("trigger", e.target.value)} placeholder="What starts it?" />
      </Field>

      <Field label="Primary Systems">
        <p className="text-[10px] text-muted-foreground mb-2">Select all systems used by this automation</p>
        <div className="flex flex-wrap gap-3">
          {SYSTEMEN.map((s) => (
            <label key={s} className="flex items-center gap-2 text-sm">
              <Checkbox checked={form.systemen?.includes(s)} onCheckedChange={() => toggleSysteem(s)} />
              {s}
            </label>
          ))}
        </div>
      </Field>

      <Field label="Customer Process Phase">
        <p className="text-[10px] text-muted-foreground mb-2">In which phase(s) of the customer journey is this automation active?</p>
        <div className="flex flex-wrap gap-3">
          {KLANT_FASEN.map((f) => (
            <label key={f} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={form.fasen?.includes(f)}
                onCheckedChange={() => {
                  const curr = form.fasen || [];
                  set("fasen", curr.includes(f) ? curr.filter((x) => x !== f) : [...curr, f]);
                }}
              />
              {f}
            </label>
          ))}
        </div>
      </Field>

      <Field label="Flow / Steps">
        <div className="space-y-2">
          {(form.stappen || []).map((stap, i) => (
            <div key={i} className="flex gap-2 items-center">
              <span className="text-xs text-muted-foreground font-mono w-6">{i + 1}.</span>
              <Input value={stap} onChange={(e) => updateStap(i, e.target.value)} placeholder={`Stap ${i + 1}`} />
              {(form.stappen || []).length > 1 && (
                <button onClick={() => removeStap(i)} className="text-destructive text-sm hover:underline">×</button>
              )}
            </div>
          ))}
          <button onClick={addStap} className="text-sm text-ring hover:underline">+ Add step</button>
        </div>
      </Field>

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
        <Textarea value={form.afhankelijkheden} onChange={(e) => set("afhankelijkheden", e.target.value)} />
      </Field>

      <Field label="Owner">
        <Input value={form.owner} onChange={(e) => set("owner", e.target.value)} placeholder="Naam" />
      </Field>

      <Field label="Status">
        <Select value={form.status} onValueChange={(v) => set("status", v)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {STATUSSEN.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </Field>

      <Field label="Improvement Ideas">
        <Textarea value={form.verbeterideeën} onChange={(e) => set("verbeterideeën", e.target.value)} />
      </Field>

      <Field label="Flow Diagram (Mermaid)">
        <Textarea
          className="font-mono text-xs"
          rows={6}
          value={form.mermaidDiagram}
          onChange={(e) => set("mermaidDiagram", e.target.value)}
          placeholder={`graph TD\n    A[Start] --> B[Stap 1]\n    B --> C[Einde]`}
        />
      </Field>

      <Field label="GitLab bestandspad">
        <Input
          value={form.gitlabFilePath || ""}
          onChange={(e) => set("gitlabFilePath", e.target.value)}
          placeholder="scripts/automation-naam.js"
          className="font-mono text-xs"
        />
        <p className="text-[10px] text-muted-foreground mt-1">Pad naar het bronbestand in GitLab. Wordt gebruikt voor AI-beschrijvingen.</p>
      </Field>

      <button
        onClick={submit}
        disabled={isPending}
        className="bg-primary text-primary-foreground px-6 py-2.5 rounded-md text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
      >
        {isPending ? "Saving..." : editMode ? "Save Changes" : "Save Automation"}
      </button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="label-uppercase">{label}</Label>
      {children}
    </div>
  );
}
