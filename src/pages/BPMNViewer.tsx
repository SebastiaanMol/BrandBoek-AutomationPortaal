import { useState, useMemo } from "react";
import { useAutomatiseringen } from "@/lib/hooks";
import { MermaidDiagram } from "@/components/MermaidDiagram";
import { StatusBadge, SystemBadge } from "@/components/Badges";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, LayoutGrid, FileText } from "lucide-react";
import { Automatisering } from "@/lib/types";

type ViewMode = "overzicht" | "individueel";

/** Build a combined Mermaid diagram with swimming lanes per categorie */
function buildSwimmingLanesDiagram(data: Automatisering[]): string {
  const withDiagram = data.filter((a) => a.stappen.length > 0 || a.mermaidDiagram);
  if (withDiagram.length === 0) return "";

  // Group by categorie
  const groups: Record<string, Automatisering[]> = {};
  for (const a of withDiagram) {
    const cat = a.categorie || "Anders";
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(a);
  }

  const lines: string[] = [];
  // Use block-beta or a simple flowchart with subgraphs as lanes
  lines.push("graph LR");

  for (const [categorie, items] of Object.entries(groups)) {
    const safeCategory = categorie.replace(/[^a-zA-Z0-9]/g, "_");
    lines.push(`  subgraph ${safeCategory}["${categorie}"]`);
    lines.push(`    direction TB`);

    for (const a of items) {
      const safeId = a.id.replace(/-/g, "_");
      const shortName = a.naam.length > 40 ? a.naam.slice(0, 37) + "..." : a.naam;
      // Escape special chars for Mermaid
      const escapedName = shortName.replace(/\(/g, "#40;").replace(/\)/g, "#41;").replace(/"/g, "#quot;");
      const statusIcon = a.status === "Actief" ? "✅" : a.status === "Verouderd" ? "⚠️" : a.status === "In review" ? "🔍" : "❌";

      lines.push(`    ${safeId}["${a.id}: ${escapedName}"]`);
    }

    lines.push(`  end`);
  }

  // Add koppelingen as edges between automations
  for (const a of withDiagram) {
    const safeFrom = a.id.replace(/-/g, "_");
    for (const k of a.koppelingen) {
      const safeTo = k.doelId.replace(/-/g, "_");
      // Only draw if target exists in our set
      if (withDiagram.some((t) => t.id === k.doelId)) {
        const label = k.label ? k.label.replace(/"/g, "'").slice(0, 30) : "";
        if (label) {
          lines.push(`  ${safeFrom} -->|"${label}"| ${safeTo}`);
        } else {
          lines.push(`  ${safeFrom} --> ${safeTo}`);
        }
      }
    }
  }

  // Style subgraphs with category colors would be nice but Mermaid classDef on subgraphs is limited
  return lines.join("\n");
}

/** Build a detailed swimming lanes diagram grouped by Klantfase */
function buildFaseDiagram(data: Automatisering[]): string {
  const FASEN = ["Marketing", "Sales", "Onboarding", "Boekhouding", "Offboarding"];
  const withFasen = data.filter((a) => a.fasen && a.fasen.length > 0);
  if (withFasen.length === 0) return "";

  const lines: string[] = [];
  lines.push("graph LR");

  for (const fase of FASEN) {
    const items = withFasen.filter((a) => a.fasen.includes(fase as any));
    if (items.length === 0) continue;

    lines.push(`  subgraph ${fase}["${fase}"]`);
    lines.push(`    direction TB`);

    for (const a of items) {
      const safeId = `${fase}_${a.id.replace(/-/g, "_")}`;
      const shortName = a.naam.length > 35 ? a.naam.slice(0, 32) + "..." : a.naam;
      const escapedName = shortName.replace(/\(/g, "#40;").replace(/\)/g, "#41;").replace(/"/g, "#quot;");
      lines.push(`    ${safeId}["${a.id}: ${escapedName}"]`);
    }

    lines.push(`  end`);
  }

  // Add koppelingen
  for (const a of withFasen) {
    for (const k of a.koppelingen) {
      const target = withFasen.find((t) => t.id === k.doelId);
      if (!target) continue;
      // Find phase combos for edges
      for (const fromFase of a.fasen) {
        for (const toFase of target.fasen) {
          const safeFrom = `${fromFase}_${a.id.replace(/-/g, "_")}`;
          const safeTo = `${toFase}_${k.doelId.replace(/-/g, "_")}`;
          lines.push(`  ${safeFrom} --> ${safeTo}`);
        }
      }
    }
  }

  return lines.join("\n");
}

export default function BPMNViewer() {
  const { data: allData, isLoading } = useAutomatiseringen();
  const [viewMode, setViewMode] = useState<ViewMode>("overzicht");
  const [selectedId, setSelectedId] = useState<string>("alle");
  const [laneType, setLaneType] = useState<"categorie" | "fase">("categorie");

  const data = allData || [];

  const overviewDiagram = useMemo(() => {
    if (laneType === "fase") return buildFaseDiagram(data);
    return buildSwimmingLanesDiagram(data);
  }, [data, laneType]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const individualItems =
    selectedId === "alle"
      ? data.filter((a) => a.mermaidDiagram)
      : data.filter((a) => a.id === selectedId && a.mermaidDiagram);

  return (
    <div className="space-y-6">
      {/* View mode tabs */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex gap-1 bg-secondary p-1 rounded-lg">
          <button
            onClick={() => setViewMode("overzicht")}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              viewMode === "overzicht"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <LayoutGrid className="h-4 w-4" />
            Totaaloverzicht
          </button>
          <button
            onClick={() => setViewMode("individueel")}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              viewMode === "individueel"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <FileText className="h-4 w-4" />
            Per automatisering
          </button>
        </div>

        {viewMode === "overzicht" && (
          <Select value={laneType} onValueChange={(v) => setLaneType(v as any)}>
            <SelectTrigger className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="categorie">Groeperen op categorie</SelectItem>
              <SelectItem value="fase">Groeperen op klantfase</SelectItem>
            </SelectContent>
          </Select>
        )}

        {viewMode === "individueel" && (
          <Select value={selectedId} onValueChange={setSelectedId}>
            <SelectTrigger className="w-80">
              <SelectValue placeholder="Selecteer automatisering" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="alle">Alle diagrammen</SelectItem>
              {data
                .filter((a) => a.mermaidDiagram)
                .map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.id} — {a.naam}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Overview mode */}
      {viewMode === "overzicht" && (
        <div className="bg-card border border-border rounded-[var(--radius-outer)] shadow-sm p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-foreground">
              {laneType === "categorie" ? "Alle automatiseringen per categorie" : "Alle automatiseringen per klantfase"}
            </h2>
            <span className="text-xs text-muted-foreground">
              {data.length} automatisering{data.length !== 1 ? "en" : ""}
            </span>
          </div>

          {overviewDiagram ? (
            <div className="overflow-x-auto">
              <MermaidDiagram chart={overviewDiagram} />
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">
              {laneType === "fase"
                ? "Geen automatiseringen met klantfasen gevonden. Wijs eerst fasen toe aan je automatiseringen."
                : "Geen automatiseringen beschikbaar."}
            </p>
          )}

          {/* Legend */}
          <div className="border-t border-border pt-4">
            <p className="label-uppercase mb-2">Legenda</p>
            <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
              <span>→ Pijlen = directe koppelingen tussen automatiseringen</span>
              <span>Groepen = {laneType === "categorie" ? "categorieën (HubSpot Workflow, Zapier Zap, etc.)" : "klantfasen (Marketing, Sales, etc.)"}</span>
            </div>
          </div>
        </div>
      )}

      {/* Individual mode */}
      {viewMode === "individueel" && (
        <>
          {individualItems.length === 0 && (
            <p className="text-muted-foreground text-sm">Geen diagrammen beschikbaar.</p>
          )}

          {individualItems.map((a) => (
            <div
              key={a.id}
              className="bg-card border border-border rounded-[var(--radius-outer)] shadow-sm p-6 space-y-4"
            >
              <div className="flex items-center gap-3 flex-wrap">
                <span className="font-mono text-xs text-muted-foreground">{a.id}</span>
                <h3 className="font-semibold text-foreground">{a.naam}</h3>
                <StatusBadge status={a.status} />
              </div>
              <div className="overflow-x-auto">
                <MermaidDiagram chart={a.mermaidDiagram} />
              </div>
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
                    {a.systemen.map((s) => (
                      <SystemBadge key={s} systeem={s} />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
