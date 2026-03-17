import { useState, useRef } from "react";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import NieuweAutomatisering from "./NieuweAutomatisering";
import { Automatisering, Categorie, Systeem, Status } from "@/lib/types";
import { insertAutomatisering, generateNextId } from "@/lib/supabaseStorage";
import { Upload, FileText, Loader2, FileSpreadsheet, ChevronDown, Check, Sparkles } from "lucide-react";
import { StatusBadge, CategorieBadge, SystemBadge } from "@/components/Badges";
import { supabase } from "@/integrations/supabase/client";

type Tab = "tekst" | "csv";

interface ParsedAutomation {
  raw: Record<string, string>;
  mapped: Partial<Automatisering>;
  beschrijving: string;
}

function detectCategory(row: Record<string, string>): Categorie {
  const all = Object.values(row).join(" ").toLowerCase();
  if (all.includes("zapier") && all.includes("hubspot")) return "HubSpot + Zapier";
  if (all.includes("zapier")) return "Zapier Zap";
  if (all.includes("script") || all.includes("python") || all.includes("backend")) return "Backend Script";
  if (all.includes("hubspot") || all.includes("workflow")) return "HubSpot Workflow";
  return "Anders";
}

function detectSystemen(row: Record<string, string>): Systeem[] {
  const all = Object.values(row).join(" ").toLowerCase();
  const keys = Object.keys(row).join(" ").toLowerCase();
  const systemen: Systeem[] = [];
  if (all.includes("hubspot")) systemen.push("HubSpot");
  if (all.includes("zapier") || keys.includes("trigger app") || keys.includes("action app")) systemen.push("Zapier");
  if (all.includes("typeform")) systemen.push("Typeform");
  if (all.includes("sharepoint")) systemen.push("SharePoint");
  if (all.includes("wefact")) systemen.push("WeFact");
  if (all.includes("docufy")) systemen.push("Docufy");
  if (all.includes("backend") || all.includes("script") || all.includes("python")) systemen.push("Backend");
  if (all.includes("email") || all.includes("e-mail") || all.includes("mail") || all.includes("gmail")) systemen.push("E-mail");
  if (all.includes("api") || all.includes("webhook")) systemen.push("API");
  // Detect specific apps from Zapier trigger/action app columns
  const triggerApp = findField(row, ["trigger app", "trigger_app"]).toLowerCase();
  const actionApp = findField(row, ["action app", "action_app"]).toLowerCase();
  for (const app of [triggerApp, actionApp]) {
    if (app.includes("hubspot") && !systemen.includes("HubSpot")) systemen.push("HubSpot");
    if (app.includes("typeform") && !systemen.includes("Typeform")) systemen.push("Typeform");
    if (app.includes("sharepoint") && !systemen.includes("SharePoint")) systemen.push("SharePoint");
  }
  return systemen.length > 0 ? systemen : ["HubSpot"];
}

function detectStatus(row: Record<string, string>): Status {
  const all = Object.values(row).join(" ").toLowerCase();
  if (all.includes("uitgeschakeld") || all.includes("disabled") || all.includes("off")) return "Uitgeschakeld";
  if (all.includes("verouderd") || all.includes("deprecated")) return "Verouderd";
  if (all.includes("review") || all.includes("draft")) return "In review";
  return "Actief";
}

function findField(row: Record<string, string>, keywords: string[]): string {
  for (const key of Object.keys(row)) {
    const k = key.toLowerCase().trim();
    if (keywords.some((kw) => k.includes(kw))) return row[key]?.trim() || "";
  }
  return "";
}

function generateBeschrijving(mapped: Partial<Automatisering>): string {
  const parts: string[] = [];
  if (mapped.naam) parts.push(`**${mapped.naam}**`);
  if (mapped.categorie) parts.push(`is een ${mapped.categorie}`);
  if (mapped.trigger) parts.push(`die wordt getriggerd door: ${mapped.trigger}.`);
  if (mapped.doel) parts.push(`Het doel is: ${mapped.doel}.`);
  if (mapped.systemen && mapped.systemen.length > 0) {
    parts.push(`Betrokken systemen: ${mapped.systemen.join(", ")}.`);
  }
  if (mapped.stappen && mapped.stappen.length > 0) {
    parts.push(`De flow bestaat uit ${mapped.stappen.length} stap(pen): ${mapped.stappen.join(" → ")}.`);
  }
  if (mapped.status) parts.push(`Status: ${mapped.status}.`);
  return parts.join(" ");
}

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];

  // Handle quoted CSV fields
  const splitCSVLine = (line: string): string[] => {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if ((ch === "," || ch === ";") && !inQuotes) {
        result.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
    result.push(current.trim());
    return result;
  };

  const headers = splitCSVLine(lines[0]);
  return lines.slice(1).map((line) => {
    const values = splitCSVLine(line);
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => {
      obj[h] = values[i] || "";
    });
    return obj;
  });
}

function mapRow(row: Record<string, string>): ParsedAutomation {
  const naam = findField(row, ["naam", "name", "titel", "title", "workflow", "automation", "zap name", "zap"]) || Object.values(row)[0] || "Onbekend";
  const doel = findField(row, ["doel", "goal", "beschrijving", "description", "purpose", "omschrijving", "notes"]);
  const trigger = findField(row, ["trigger", "start", "event", "wanneer", "when", "trigger app", "enrollment trigger"]);
  const owner = findField(row, ["owner", "eigenaar", "verantwoordelijk", "assigned", "created by", "folder"]);
  const stappen_raw = findField(row, ["stappen", "steps", "flow", "acties", "actions", "action app"]);
  // For Zapier: combine trigger app + action app as steps if no explicit steps
  const triggerApp = findField(row, ["trigger app", "trigger_app"]);
  const actionApp = findField(row, ["action app", "action_app"]);
  let stappen = stappen_raw ? stappen_raw.split(/[;\|→]/).map((s) => s.trim()).filter(Boolean) : [];
  if (stappen.length === 0 && (triggerApp || actionApp)) {
    if (triggerApp) stappen.push(`Trigger: ${triggerApp}`);
    if (actionApp) stappen.push(`Action: ${actionApp}`);
  }
  
  const afhankelijkheden = findField(row, ["afhankelijk", "dependencies", "knelpunt", "blocker"]);
  const verbeterideeën = findField(row, ["verbetering", "improvement", "idee", "todo", "opmerking", "notes"]);

  const mapped: Partial<Automatisering> = {
    naam,
    categorie: detectCategory(row),
    doel: doel || `Automatisering: ${naam}`,
    trigger: trigger || "Niet gespecificeerd",
    systemen: detectSystemen(row),
    stappen: stappen.length > 0 ? stappen : [`${naam} uitvoeren`],
    afhankelijkheden: afhankelijkheden || "",
    owner: owner || "",
    status: detectStatus(row),
    verbeterideeën: verbeterideeën || "",
    mermaidDiagram: generateMermaid(naam, stappen),
  };

  return { raw: row, mapped, beschrijving: generateBeschrijving(mapped) };
}

function generateMermaid(naam: string, stappen: string[]): string {
  if (stappen.length === 0) return `graph TD\n    A[Start: ${naam}] --> B[Einde]`;
  const nodes = stappen.map((s, i) => {
    const letter = String.fromCharCode(66 + i); // B, C, D...
    return `    ${i === 0 ? "A" : String.fromCharCode(65 + i)}[${s}] --> ${letter === String.fromCharCode(66 + stappen.length) ? `${letter}[Einde]` : `${letter}`}`;
  });
  // Simplified version
  let mermaid = "graph TD\n";
  mermaid += `    A[Start: ${naam}]`;
  stappen.forEach((s, i) => {
    const cur = String.fromCharCode(66 + i);
    mermaid += ` --> ${cur}[${s.slice(0, 40)}]`;
  });
  mermaid += ` --> Z[Einde]`;
  return mermaid;
}

export default function AIUpload() {
  const [tab, setTab] = useState<Tab>("csv");
  const [text, setText] = useState("");
  const [prefill, setPrefill] = useState<Partial<Automatisering> | null>(null);
  const [loading, setLoading] = useState(false);
  const [csvResults, setCsvResults] = useState<ParsedAutomation[]>([]);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [savedIds, setSavedIds] = useState<Set<number>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- TEXT TAB ---
  const extractFields = async () => {
    if (!text.trim()) {
      toast.error("Plak eerst tekst of beschrijving");
      return;
    }
    setLoading(true);
    try {
      const { data: result, error } = await supabase.functions.invoke("extract-automation", {
        body: { type: "text", data: text },
      });
      if (error) throw error;
      const auto = result?.automations?.[0];
      if (!auto) throw new Error("Geen resultaat van AI");
      setPrefill({
        naam: auto.naam,
        categorie: auto.categorie,
        doel: auto.doel,
        trigger: auto.trigger,
        systemen: auto.systemen,
        stappen: auto.stappen,
        afhankelijkheden: auto.afhankelijkheden || "",
        owner: auto.owner || "",
        status: auto.status,
        verbeterideeën: auto.verbeterideeën || "",
        mermaidDiagram: generateMermaid(auto.naam, auto.stappen || []),
      });
      toast.success("AI heeft velden geëxtraheerd. Controleer en sla op.");
    } catch (e: any) {
      console.error("AI extraction error:", e);
      toast.error(e?.message || "AI-extractie mislukt. Probeer opnieuw.");
    } finally {
      setLoading(false);
    }
  };

  // --- CSV TAB ---
  const handleCSVUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith(".csv")) {
      toast.error("Upload een .csv bestand");
      return;
    }
    setLoading(true);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const content = ev.target?.result as string;
      processCSV(content);
    };
    reader.readAsText(file);
  };

  const processCSV = async (content: string) => {
    const rows = parseCSV(content);
    if (rows.length === 0) {
      toast.error("Geen data gevonden in CSV. Controleer het formaat.");
      setLoading(false);
      return;
    }

    // First do local mapping as fallback
    const localResults = rows.map(mapRow);
    
    try {
      toast.info("AI analyseert je CSV data...");
      const { data: result, error } = await supabase.functions.invoke("extract-automation", {
        body: { type: "csv_rows", data: rows },
      });
      
      if (error) throw error;
      
      const aiAutomations = result?.automations;
      if (aiAutomations && aiAutomations.length > 0) {
        // Merge AI results with raw CSV data
        const aiResults: ParsedAutomation[] = aiAutomations.map((auto: any, idx: number) => ({
          raw: rows[idx] || rows[0],
          mapped: {
            naam: auto.naam,
            categorie: auto.categorie as Categorie,
            doel: auto.doel,
            trigger: auto.trigger,
            systemen: auto.systemen as Systeem[],
            stappen: auto.stappen,
            afhankelijkheden: auto.afhankelijkheden || "",
            owner: auto.owner || "",
            status: auto.status as Status,
            verbeterideeën: auto.verbeterideeën || "",
            mermaidDiagram: generateMermaid(auto.naam, auto.stappen || []),
          },
          beschrijving: auto.beschrijving || generateBeschrijving({
            naam: auto.naam,
            categorie: auto.categorie,
            trigger: auto.trigger,
            doel: auto.doel,
            systemen: auto.systemen,
            stappen: auto.stappen,
            status: auto.status,
          }),
        }));
        setCsvResults(aiResults);
        setSavedIds(new Set());
        setLoading(false);
        toast.success(`AI heeft ${aiResults.length} automatisering(en) geanalyseerd`);
        return;
      }
    } catch (e: any) {
      console.error("AI CSV extraction error:", e);
      toast.warning("AI-analyse niet beschikbaar, lokale extractie gebruikt.");
    }

    // Fallback to local
    setCsvResults(localResults);
    setSavedIds(new Set());
    setLoading(false);
    toast.success(`${localResults.length} automatisering(en) gevonden in CSV (lokaal)`);
  };

  const saveOne = async (idx: number) => {
    const item = csvResults[idx];
    if (!item) return;
    try {
      const id = await generateNextId();
      const full: Automatisering = {
        id,
        naam: item.mapped.naam || "Onbekend",
        categorie: item.mapped.categorie || "Anders",
        doel: item.mapped.doel || "",
        trigger: item.mapped.trigger || "",
        systemen: item.mapped.systemen || [],
        stappen: item.mapped.stappen || [],
        afhankelijkheden: item.mapped.afhankelijkheden || "",
        owner: item.mapped.owner || "",
        status: item.mapped.status || "Actief",
        verbeterideeën: item.mapped.verbeterideeën || "",
        mermaidDiagram: item.mapped.mermaidDiagram || "",
        koppelingen: [],
        fasen: [],
        createdAt: new Date().toISOString(),
      };
      await insertAutomatisering(full);
      setSavedIds((prev) => new Set(prev).add(idx));
      toast.success(`"${full.naam}" opgeslagen als ${full.id}`);
    } catch (err: any) {
      toast.error(err.message || "Opslaan mislukt");
    }
  };

  const saveAll = () => {
    let count = 0;
    csvResults.forEach((_, idx) => {
      if (!savedIds.has(idx)) {
        saveOne(idx);
        count++;
      }
    });
    if (count === 0) toast.info("Alle items zijn al opgeslagen");
    else toast.success(`${count} automatisering(en) opgeslagen`);
  };

  return (
    <div className="space-y-6">
      {/* Tab switcher */}
      <div className="flex gap-1 bg-secondary p-1 rounded-lg w-fit">
        <button
          onClick={() => setTab("csv")}
          className={`px-4 py-2 text-sm rounded-md transition-colors ${
            tab === "csv" ? "bg-card text-foreground shadow-sm font-medium" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <FileSpreadsheet className="h-4 w-4 inline mr-2" />
          CSV Upload (HubSpot / Zapier)
        </button>
        <button
          onClick={() => setTab("tekst")}
          className={`px-4 py-2 text-sm rounded-md transition-colors ${
            tab === "tekst" ? "bg-card text-foreground shadow-sm font-medium" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <FileText className="h-4 w-4 inline mr-2" />
          Tekst / AI Extractie
        </button>
      </div>

      {/* CSV TAB */}
      {tab === "csv" && !csvResults.length && (
        <div className="max-w-2xl space-y-4">
          <p className="text-sm text-muted-foreground">
            Upload een CSV-export van je HubSpot workflows of automatiseringen. Het portaal herkent automatisch de kolommen en vult alle velden in.
          </p>
          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-border rounded-[var(--radius-outer)] p-12 text-center cursor-pointer hover:border-primary/50 hover:bg-secondary/50 transition-colors"
          >
            <FileSpreadsheet className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-sm font-medium text-foreground">Klik om een CSV-bestand te uploaden</p>
            <p className="text-xs text-muted-foreground mt-1">Ondersteunt HubSpot workflow exports en andere CSV-formaten</p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleCSVUpload}
              className="hidden"
            />
          </div>
          {loading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Bezig met verwerken...
            </div>
          )}
          <div className="bg-secondary border border-border rounded-[var(--radius-inner)] p-4 mt-4">
            <p className="label-uppercase mb-2">Verwachte kolommen</p>
            <p className="text-sm text-muted-foreground">
              Het systeem herkent kolommen zoals: <span className="font-mono text-xs">Naam, Name, Workflow, Beschrijving, Description, Trigger, Owner, Status, Stappen, Steps, Actions</span> enz. Kolommen die niet herkend worden, worden overgeslagen.
            </p>
          </div>
        </div>
      )}

      {/* CSV RESULTS */}
      {tab === "csv" && csvResults.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {csvResults.length} automatisering(en) geëxtraheerd uit CSV
            </p>
            <div className="flex gap-2">
              <button
                onClick={saveAll}
                className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
              >
                Alles opslaan ({csvResults.length - savedIds.size})
              </button>
              <button
                onClick={() => {
                  setCsvResults([]);
                  setSavedIds(new Set());
                }}
                className="text-sm text-muted-foreground hover:underline px-3 py-2"
              >
                Opnieuw uploaden
              </button>
            </div>
          </div>

          {csvResults.map((result, idx) => {
            const isExpanded = expandedIdx === idx;
            const isSaved = savedIds.has(idx);
            return (
              <div
                key={idx}
                className={`bg-card border rounded-[var(--radius-outer)] overflow-hidden transition-colors ${
                  isSaved ? "border-primary/30 bg-primary/5" : "border-border"
                }`}
              >
                <button
                  onClick={() => setExpandedIdx(isExpanded ? null : idx)}
                  className="w-full px-5 py-4 flex items-center gap-3 justify-between text-left hover:bg-secondary/50 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {isSaved && <Check className="h-4 w-4 text-primary shrink-0" />}
                    <span className="font-medium truncate">{result.mapped.naam}</span>
                    <CategorieBadge categorie={result.mapped.categorie!} />
                    <StatusBadge status={result.mapped.status!} />
                    <div className="hidden md:flex gap-1">
                      {result.mapped.systemen?.map((s) => (
                        <SystemBadge key={s} systeem={s} />
                      ))}
                    </div>
                  </div>
                  <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform shrink-0 ${isExpanded ? "rotate-180" : ""}`} />
                </button>

                {isExpanded && (
                  <div className="px-5 pb-5 pt-2 border-t border-border space-y-4">
                    {/* AI Beschrijving */}
                    <div className="bg-secondary/70 border border-border rounded-[var(--radius-inner)] p-4">
                      <p className="label-uppercase mb-1">Wat doet deze automatisering?</p>
                      <p className="text-sm text-foreground leading-relaxed">{result.beschrijving}</p>
                    </div>

                    <div className="grid md:grid-cols-2 gap-4">
                      <div>
                        <p className="label-uppercase mb-0.5">Doel</p>
                        <p className="text-sm text-foreground">{result.mapped.doel || "—"}</p>
                      </div>
                      <div>
                        <p className="label-uppercase mb-0.5">Trigger</p>
                        <p className="text-sm text-foreground">{result.mapped.trigger || "—"}</p>
                      </div>
                      <div>
                        <p className="label-uppercase mb-0.5">Owner</p>
                        <p className="text-sm text-foreground">{result.mapped.owner || "—"}</p>
                      </div>
                      <div>
                        <p className="label-uppercase mb-0.5">Afhankelijkheden</p>
                        <p className="text-sm text-foreground">{result.mapped.afhankelijkheden || "—"}</p>
                      </div>
                    </div>

                    {result.mapped.stappen && result.mapped.stappen.length > 0 && (
                      <div>
                        <p className="label-uppercase mb-1">Stappen</p>
                        <ol className="list-decimal list-inside text-sm text-foreground space-y-0.5">
                          {result.mapped.stappen.map((s, i) => (
                            <li key={i}>{s}</li>
                          ))}
                        </ol>
                      </div>
                    )}

                    {/* Raw CSV data */}
                    <div>
                      <p className="label-uppercase mb-1">Ruwe CSV-data</p>
                      <div className="bg-muted rounded-[var(--radius-inner)] p-3 overflow-x-auto">
                        <table className="text-xs font-mono w-full">
                          <tbody>
                            {Object.entries(result.raw).map(([key, val]) => (
                              <tr key={key} className="border-b border-border last:border-0">
                                <td className="py-1 pr-4 text-muted-foreground whitespace-nowrap font-semibold">{key}</td>
                                <td className="py-1 text-foreground">{val || "—"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {!isSaved && (
                      <button
                        onClick={() => saveOne(idx)}
                        className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
                      >
                        Opslaan in portaal
                      </button>
                    )}
                    {isSaved && (
                      <p className="text-sm text-primary font-medium flex items-center gap-1">
                        <Check className="h-4 w-4" /> Opgeslagen
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* TEXT TAB */}
      {tab === "tekst" && !prefill && (
        <div className="max-w-2xl space-y-4">
          <p className="text-sm text-muted-foreground">
            Plak een beschrijving, script of documenttekst hieronder. AI extraheert automatisch de velden.
          </p>
          <Textarea
            rows={12}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Plak hier je automatiseringsbeschrijving, Python script, of documenttekst..."
            className="font-mono text-xs"
          />
          <div className="flex gap-3">
            <button
              onClick={extractFields}
              disabled={loading}
              className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-md text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {loading ? "Analyseren..." : "Extracteer met AI"}
            </button>
          </div>
        </div>
      )}

      {tab === "tekst" && prefill && (
        <div>
          <div className="flex items-center gap-3 mb-6">
            <FileText className="h-5 w-5 text-ring" />
            <h2 className="font-semibold text-foreground">AI-resultaat — Controleer en sla op</h2>
            <button
              onClick={() => setPrefill(null)}
              className="text-sm text-muted-foreground hover:underline ml-auto"
            >
              Opnieuw beginnen
            </button>
          </div>
          <NieuweAutomatisering prefill={prefill} />
        </div>
      )}
    </div>
  );
}
