import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Automatisering, CATEGORIEEN, SYSTEMEN, STATUSSEN, Systeem, Categorie, Status } from "@/lib/types";
import { generateId, saveAutomatisering } from "@/lib/storage";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";

interface NieuweAutomatiseringProps {
  prefill?: Partial<Automatisering>;
}

export default function NieuweAutomatisering({ prefill }: NieuweAutomatiseringProps) {
  const navigate = useNavigate();
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

  const submit = () => {
    if (!form.naam?.trim()) {
      toast.error("Naam is verplicht");
      return;
    }
    const item: Automatisering = {
      id: generateId(),
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
      createdAt: new Date().toISOString(),
    };
    saveAutomatisering(item);
    toast.success(`${item.id} opgeslagen`);
    navigate("/alle");
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <p className="label-uppercase mb-1">ID</p>
        <p className="font-mono text-sm text-foreground">{generateId()}</p>
      </div>

      <Field label="Naam">
        <Input value={form.naam} onChange={(e) => set("naam", e.target.value)} placeholder="Naam van de automatisering" />
      </Field>

      <Field label="Categorie">
        <Select value={form.categorie} onValueChange={(v) => set("categorie", v)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {CATEGORIEEN.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
      </Field>

      <Field label="Doel">
        <Textarea value={form.doel} onChange={(e) => set("doel", e.target.value)} placeholder="Wat doet deze automatisering?" />
      </Field>

      <Field label="Trigger">
        <Input value={form.trigger} onChange={(e) => set("trigger", e.target.value)} placeholder="Waardoor start het?" />
      </Field>

      <Field label="Betrokken Systemen">
        <div className="flex flex-wrap gap-3">
          {SYSTEMEN.map((s) => (
            <label key={s} className="flex items-center gap-2 text-sm">
              <Checkbox checked={form.systemen?.includes(s)} onCheckedChange={() => toggleSysteem(s)} />
              {s}
            </label>
          ))}
        </div>
      </Field>

      <Field label="Flow / Stappen">
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
          <button onClick={addStap} className="text-sm text-ring hover:underline">+ Stap toevoegen</button>
        </div>
      </Field>

      <Field label="Afhankelijkheden & Knelpunten">
        <Textarea value={form.afhankelijkheden} onChange={(e) => set("afhankelijkheden", e.target.value)} />
      </Field>

      <Field label="Owner / Verantwoordelijke">
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

      <Field label="Verbeterideeën">
        <Textarea value={form.verbeterideeën} onChange={(e) => set("verbeterideeën", e.target.value)} />
      </Field>

      <Field label="BPMN Diagram (Mermaid)">
        <Textarea
          className="font-mono text-xs"
          rows={6}
          value={form.mermaidDiagram}
          onChange={(e) => set("mermaidDiagram", e.target.value)}
          placeholder={`graph TD\n    A[Start] --> B[Stap 1]\n    B --> C[Einde]`}
        />
      </Field>

      <button
        onClick={submit}
        className="bg-primary text-primary-foreground px-6 py-2.5 rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
      >
        Opslaan
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
