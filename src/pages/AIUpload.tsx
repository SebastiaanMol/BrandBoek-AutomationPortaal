import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import NieuweAutomatisering from "./NieuweAutomatisering";
import { Automatisering } from "@/lib/types";
import { Upload, FileText, Loader2 } from "lucide-react";

export default function AIUpload() {
  const [text, setText] = useState("");
  const [prefill, setPrefill] = useState<Partial<Automatisering> | null>(null);
  const [loading, setLoading] = useState(false);

  const extractFields = () => {
    if (!text.trim()) {
      toast.error("Plak eerst tekst of beschrijving");
      return;
    }
    setLoading(true);
    // Simulate AI extraction (placeholder — connect to OpenAI later)
    setTimeout(() => {
      const lines = text.split("\n").filter((l) => l.trim());
      setPrefill({
        naam: lines[0]?.slice(0, 80) || "Onbekende Automatisering",
        doel: text.slice(0, 200),
        trigger: "Handmatig geëxtraheerd uit tekst",
        stappen: lines.slice(1, 6),
        mermaidDiagram: `graph TD\n    A[Start] --> B[Stap 1]\n    B --> C[Stap 2]\n    C --> D[Einde]`,
      });
      setLoading(false);
      toast.success("AI heeft velden geëxtraheerd. Controleer en sla op.");
    }, 1500);
  };

  return (
    <div className="space-y-8">
      {!prefill ? (
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
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              {loading ? "Analyseren..." : "Extracteer met AI"}
            </button>
          </div>
          <div className="bg-secondary border border-border rounded-[var(--radius-inner)] p-4 mt-6">
            <p className="label-uppercase mb-2">Tip</p>
            <p className="text-sm text-muted-foreground">
              Momenteel wordt een lokale simulatie gebruikt. Verbind met OpenAI GPT-4o voor volledige AI-extractie.
            </p>
          </div>
        </div>
      ) : (
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
