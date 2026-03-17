import { useState } from "react";
import { useAutomatiseringen } from "@/lib/hooks";
import { MermaidDiagram } from "@/components/MermaidDiagram";
import { StatusBadge, SystemBadge } from "@/components/Badges";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";

export default function BPMNViewer() {
  const { data: allData, isLoading } = useAutomatiseringen();
  const [selectedId, setSelectedId] = useState<string>("alle");

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const data = allData || [];
  const items = selectedId === "alle" ? data.filter((a) => a.mermaidDiagram) : data.filter((a) => a.id === selectedId && a.mermaidDiagram);

  return (
    <div className="space-y-6">
      <Select value={selectedId} onValueChange={setSelectedId}>
        <SelectTrigger className="w-80">
          <SelectValue placeholder="Selecteer automatisering" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="alle">Alle diagrammen</SelectItem>
          {data.filter((a) => a.mermaidDiagram).map((a) => (
            <SelectItem key={a.id} value={a.id}>{a.id} — {a.naam}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {items.length === 0 && (
        <p className="text-muted-foreground text-sm">Geen diagrammen beschikbaar.</p>
      )}

      {items.map((a) => (
        <div key={a.id} className="bg-card border border-border rounded-[var(--radius-outer)] shadow-sm p-6 space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="font-mono text-xs text-muted-foreground">{a.id}</span>
            <h3 className="font-semibold text-foreground">{a.naam}</h3>
            <StatusBadge status={a.status} />
          </div>
          <MermaidDiagram chart={a.mermaidDiagram} />
          <div className="grid md:grid-cols-3 gap-4 pt-2 border-t border-border">
            <div>
              <p className="label-uppercase mb-0.5">Trigger</p>
              <p className="text-sm">{a.trigger}</p>
            </div>
            <div>
              <p className="label-uppercase mb-0.5">Owner</p>
              <p className="text-sm">{a.owner}</p>
            </div>
            <div>
              <p className="label-uppercase mb-0.5">Systemen</p>
              <div className="flex gap-1.5 flex-wrap">
                {a.systemen.map((s) => <SystemBadge key={s} systeem={s} />)}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
