import { ArrowRight, Clock, HelpCircle, Info } from "lucide-react";
import {
  getAutomationWhatHappensPresentation,
  type AutomationWhatHappensPresentation,
} from "@/lib/automationWhatHappensPresentation";
import type { Automatisering } from "@/lib/types";

// De boekhouders-lens kaart: het enige wat standaard zichtbaar is naast de header,
// voor elke bron (HubSpot/Zapier/GitLab/Typeform). Alles wat daarna in een
// "Technische details"-toggle staat (SourceQualityCard, Sentry-issues, het
// bron-specifieke technische template, de kettingreactie-kaart) is audit-materiaal
// voor wie het wil narekenen, maar is niet nodig om de regel te begrijpen.
//
// Was voorheen `HubSpotWhatHappensCard` in `HubSpotAutomationDetailTemplate.tsx` —
// verplaatst hierheen omdat de onderliggende `ai_enrichment`-velden altijd al
// bron-onafhankelijk waren (zie `AutomationAiEnrichment` in `types.ts`); alleen de
// kaart zelf bestond nog niet buiten HubSpot. Zie architectuur-audit.md, punt 1 en
// aanbeveling 3. `HubSpotAutomationDetailTemplate.tsx` blijft `HubSpotWhatHappensCard`
// exporteren als dunne wrapper rond dit component, voor bestaande imports.
export function AutomationWhatHappensCard({ automation }: { automation: Automatisering }): React.ReactNode {
  const presentation = getAutomationWhatHappensPresentation(automation);
  return <WatGebeurtErCard presentation={presentation} />;
}

function WatGebeurtErCard({
  presentation,
}: {
  presentation: { summary: string; whatHappens: AutomationWhatHappensPresentation };
}): React.ReactNode {
  const { whatHappens } = presentation;
  const hasEffectDetail = Boolean(whatHappens.background || whatHappens.visibleInHubspot);

  return (
    <section aria-label="Wat gebeurt er" className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-7">
      <h2 className="text-lg font-semibold text-foreground">Wat gebeurt er?</h2>
      <div className="mt-5 space-y-5">
        <WhatHappensRow icon={<Info className="h-4 w-4" />}>
          <p className="text-base leading-7 text-foreground">{presentation.summary}</p>
        </WhatHappensRow>

        {whatHappens.when && (
          <WhatHappensRow icon={<Clock className="h-4 w-4" />} label="Wanneer">
            <p className="text-sm leading-6 text-muted-foreground">{whatHappens.when}</p>
          </WhatHappensRow>
        )}

        {hasEffectDetail && (
          <WhatHappensRow icon={<ArrowRight className="h-4 w-4" />} label="Wat gebeurt er dan">
            <div className="space-y-2">
              {whatHappens.background && (
                <div className="rounded-xl bg-secondary/40 p-3">
                  <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Op de achtergrond</p>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">{whatHappens.background}</p>
                </div>
              )}
              {whatHappens.visibleInHubspot && (
                <div
                  className={
                    whatHappens.visibleInHubspot.status === "yes"
                      ? "rounded-xl border border-emerald-200 bg-emerald-50 p-3"
                      : "rounded-xl border border-dashed border-border p-3"
                  }
                >
                  <p className={`text-[11px] font-bold uppercase tracking-widest ${whatHappens.visibleInHubspot.status === "yes" ? "text-emerald-700" : "text-muted-foreground"}`}>
                    Zichtbaar in HubSpot
                  </p>
                  <p className={`mt-1 text-sm leading-6 ${whatHappens.visibleInHubspot.status === "yes" ? "text-emerald-900" : "text-muted-foreground"}`}>
                    {whatHappens.visibleInHubspot.status === "yes" ? "Ja" : "Niets"}
                    {whatHappens.visibleInHubspot.detail ? ` — ${whatHappens.visibleInHubspot.detail}` : ""}
                  </p>
                </div>
              )}
            </div>
          </WhatHappensRow>
        )}

        {whatHappens.why && (
          <WhatHappensRow icon={<HelpCircle className="h-4 w-4" />} label="Waarom deze regel bestaat">
            <div className="rounded-xl border-l-4 border-accent bg-accent/10 p-3">
              <p className="text-sm leading-6 text-foreground">{whatHappens.why}</p>
            </div>
          </WhatHappensRow>
        )}
      </div>
    </section>
  );
}

function WhatHappensRow({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label?: string;
  children: React.ReactNode;
}): React.ReactNode {
  return (
    <div className="flex items-start gap-4">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary text-foreground">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        {label && <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{label}</p>}
        <div className={label ? "mt-1.5" : undefined}>{children}</div>
      </div>
    </div>
  );
}
