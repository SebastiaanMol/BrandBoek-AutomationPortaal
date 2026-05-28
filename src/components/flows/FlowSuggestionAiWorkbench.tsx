import { Clipboard, ShieldCheck, WandSparkles } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  parseFlowSuggestionAiResult,
  type FlowSuggestionAiResult,
} from "@/lib/flowSuggestionAi";

interface FlowSuggestionAiWorkbenchProps {
  prompt: string;
  aiResult: FlowSuggestionAiResult | null;
  onApply: (result: FlowSuggestionAiResult) => void;
}

const GUARDRAILS = [
  {
    title: "Mag invullen",
    description: "Naam, samenvatting, processtappen en reviewnotities.",
    className: "border-emerald-200 bg-emerald-50 text-emerald-950",
  },
  {
    title: "Blijft gelabeld",
    description: "Open vragen, mogelijke vervolgen en gaps.",
    className: "border-amber-200 bg-amber-50 text-amber-950",
  },
  {
    title: "Blijft read-only",
    description: "Webhook-bewijs, bewezen overgangen en goedkeuringsstatus.",
    className: "border-slate-200 bg-background text-slate-950",
  },
] as const;

export function FlowSuggestionAiWorkbench({
  prompt,
  aiResult,
  onApply,
}: FlowSuggestionAiWorkbenchProps): React.ReactNode {
  const [rawResult, setRawResult] = useState("");
  const [error, setError] = useState("");

  async function handleCopyPrompt(): Promise<void> {
    if (!navigator.clipboard?.writeText) {
      setError("Kopiëren wordt niet ondersteund in deze browser.");
      return;
    }

    try {
      await navigator.clipboard.writeText(prompt);
      setError("");
      toast.success("Prompt gekopieerd");
    } catch {
      setError("Prompt kopiëren is mislukt. Kopieer de tekst handmatig.");
    }
  }

  function handleApply(): void {
    const parsed = parseFlowSuggestionAiResult(rawResult);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }

    setError("");
    onApply(parsed.value);
    toast.success("AI-resultaat verwerkt");
  }

  return (
    <section className="min-w-0 rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 p-5 shadow-sm">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            AI-werkbank
          </p>
          <h2 className="mt-1 text-xl font-semibold leading-tight text-foreground">
            Verrijk dit voorstel handmatig met AI
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
            Kopieer de prompt, plak die in een AI, en plak de JSON-output hier terug.
            AI mag beschrijven en vragen stellen, maar bewijst nooit nieuwe overgangen.
          </p>
        </div>
        {aiResult && (
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
            <ShieldCheck className="h-3.5 w-3.5" />
            AI-verrijking actief
          </span>
        )}
      </div>

      <div className="mt-5 grid min-w-0 gap-4 lg:grid-cols-2">
        <div className="min-w-0 rounded-xl border border-border bg-card p-4">
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-foreground">1. Prompt met brondata</h3>
            <Button type="button" variant="outline" onClick={handleCopyPrompt}>
              <Clipboard className="h-4 w-4" />
              Prompt kopiëren
            </Button>
          </div>
          <pre className="mt-3 max-h-56 max-w-full overflow-auto whitespace-pre-wrap break-words rounded-lg bg-slate-950 p-3 text-xs leading-relaxed text-slate-50">
            {prompt}
          </pre>
        </div>

        <div className="min-w-0 rounded-xl border border-border bg-card p-4">
          <h3 className="text-sm font-semibold text-foreground">2. AI-resultaat terugplakken</h3>
          <Textarea
            aria-label="AI-resultaat"
            className="mt-3 min-h-56 resize-y font-mono text-xs"
            value={rawResult}
            onChange={(event) => setRawResult(event.target.value)}
            placeholder='{"title":"...","summary":"...","processSteps":["..."]}'
          />
          {error && (
            <p role="alert" className="mt-2 text-sm font-medium text-red-700">
              {error}
            </p>
          )}
          <Button type="button" className="mt-3" onClick={handleApply}>
            <WandSparkles className="h-4 w-4" />
            Resultaat verwerken
          </Button>
        </div>
      </div>

      <div className="mt-4 grid min-w-0 gap-3 lg:grid-cols-3">
        {GUARDRAILS.map((guardrail) => (
          <div key={guardrail.title} className={`min-w-0 rounded-xl border p-3 ${guardrail.className}`}>
            <p className="text-sm font-semibold">{guardrail.title}</p>
            <p className="mt-1 text-xs leading-relaxed opacity-75">{guardrail.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
