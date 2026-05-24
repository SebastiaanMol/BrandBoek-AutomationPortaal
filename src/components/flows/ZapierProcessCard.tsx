import { ChevronDown, Code2, GitBranch, Mail, Play, Search, ShieldCheck, Webhook } from "lucide-react";
import type { Automatisering, ZapierProcessInfo, ZapierProcessStepInfo } from "@/lib/types";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface ZapierProcessCardProps {
  automation: Automatisering;
}

export function ZapierProcessCard({ automation }: ZapierProcessCardProps): React.ReactNode {
  const process = automation.importProposal?.zap?.process;
  if (automation.source !== "zapier" || !process) return null;

  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Zapier processtappen
          </p>
          <h2 className="mt-1 text-lg font-semibold text-foreground">
            Zapier broninformatie
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
            {sanitizeZapierText(`${process.trigger} ${process.outcome}`)}
          </p>
        </div>
        <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
          <ShieldCheck className="h-3.5 w-3.5" />
          Read-only import
        </span>
      </div>

      <ZapierHighlights process={process} />

      <ol className="mt-5 space-y-3">
        {process.steps.map((step) => (
          <li key={`${step.index}-${step.summary}`} className="rounded-xl border border-border bg-muted/20 p-3">
            <div className="flex gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-background text-xs font-bold text-muted-foreground">
                {step.index}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <StepIcon step={step} />
                  <p className="text-sm font-semibold leading-snug text-foreground">
                    {sanitizeZapierText(step.summary)}
                  </p>
                </div>
                <p className="mt-1 text-xs font-medium text-muted-foreground">
                  {step.appName}
                </p>
                {step.details.length > 0 && (
                  <ul className="mt-2 space-y-1 text-xs leading-relaxed text-muted-foreground">
                    {step.details.map((detail) => (
                      <li key={detail} className="flex gap-2">
                        <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-muted-foreground/50" />
                        <span>{sanitizeZapierText(detail)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </li>
        ))}
      </ol>

      {process.webhookHandoffs.length > 0 && (
        <Collapsible>
          <CollapsibleTrigger className="mt-4 flex w-full items-center justify-between rounded-md border border-border bg-background px-3 py-2 text-left text-xs font-semibold text-muted-foreground transition-colors hover:bg-secondary/50">
            <span className="inline-flex items-center gap-1.5">
              <Code2 className="h-3.5 w-3.5" />
              Logica en technisch bewijs
            </span>
            <ChevronDown className="h-3.5 w-3.5" />
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2 rounded-md border border-border bg-muted/20 px-3 py-3">
            <div className="grid gap-2 sm:grid-cols-2">
              {process.webhookHandoffs.map((handoff) => (
                <div key={`${handoff.method}-${handoff.path}`} className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Webhook-overdracht
                  </p>
                  <p className="break-all font-mono text-xs leading-relaxed text-foreground">
                    {[handoff.method, handoff.path].filter(Boolean).join(" ")}
                  </p>
                  {handoff.host && (
                    <p className="mt-1 break-all font-mono text-[11px] leading-relaxed text-muted-foreground">
                      {handoff.host}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}
    </section>
  );
}

function ZapierHighlights({ process }: { process: ZapierProcessInfo }): React.ReactNode {
  const highlights = [
    ...process.dataLookups.map((value) => ({ label: "Gebruikt data", value })),
    ...process.conditions.map((value) => ({ label: "Voorwaarde", value })),
    ...process.emails.map((email) => ({ label: "E-mail", value: `Outlook-mail: ${email.subject}` })),
    ...process.webhookHandoffs.map(() => ({ label: "Overdracht", value: "Geeft gegevens door aan een gekoppelde backendverwerking" })),
  ];

  if (highlights.length === 0) return null;

  return (
    <div className="mt-4 grid gap-2 md:grid-cols-2">
      {highlights.slice(0, 6).map((item) => (
        <div key={`${item.label}-${item.value}`} className="rounded-lg border border-border bg-background px-3 py-2.5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            {item.label}
          </p>
          <p className="mt-1 text-sm leading-relaxed text-foreground">
            {item.value}
          </p>
        </div>
      ))}
    </div>
  );
}

function sanitizeZapierText(value: string): string {
  return value
    .replace(/\b(GET|POST|PUT|PATCH|DELETE)\b/gi, "")
    .replace(/https?:\/\/\S+/gi, "de technische route")
    .replace(/\s+via\s+\/[^\s.]+/gi, "")
    .replace(/\/[a-z0-9/_-]+/gi, "de technische route")
    .replace(/aan de backend\s+aan de backendverwerking/gi, "aan de backendverwerking")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function StepIcon({ step }: { step: ZapierProcessStepInfo }): React.ReactNode {
  const className = "h-4 w-4 shrink-0 text-muted-foreground";
  if (step.kind === "trigger") return <Play className={className} />;
  if (step.kind === "lookup") return <Search className={className} />;
  if (step.kind === "condition" || step.kind === "branch") return <GitBranch className={className} />;
  if (step.kind === "email") return <Mail className={className} />;
  if (step.kind === "webhook") return <Webhook className={className} />;
  return <Play className={className} />;
}
