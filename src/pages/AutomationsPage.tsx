import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ListChecks, PlusCircle } from "lucide-react";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAutomatiseringen } from "@/lib/hooks";
import AlleAutomatiseringen from "./AlleAutomatiseringen";

type SourceFilter = "alle" | "hubspot" | "gitlab" | "zapier" | "typeform";

export default function AutomationsPage() {
  const navigate = useNavigate();
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("alle");
  const { data: automations = [] } = useAutomatiseringen();
  const activeCount = automations.filter((automation) => automation.status === "Actief").length;
  const disabledCount = automations.filter((automation) => automation.status === "Uitgeschakeld").length;
  const sourceCount = new Set(automations.map((automation) => automation.source || "handmatig")).size;
  const hubspotCount = automations.filter((automation) => automation.source === "hubspot").length;
  const gitlabCount = automations.filter((automation) => (
    automation.source === "gitlab" || Boolean(automation.gitlabFilePath)
  )).length;
  const zapierCount = automations.filter((automation) => automation.source === "zapier").length;
  const typeformCount = automations.filter((automation) => automation.source === "typeform").length;
  const sourceTabs = [
    { value: "alle", label: "Alle", count: automations.length },
    { value: "hubspot", label: "HubSpot", count: hubspotCount },
    { value: "gitlab", label: "GitLab", count: gitlabCount },
    { value: "zapier", label: "Zapier", count: zapierCount },
    { value: "typeform", label: "Typeform", count: typeformCount },
  ] satisfies Array<{ value: SourceFilter; label: string; count: number }>;

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-[1400px] px-6 py-8 lg:px-10 lg:py-10 animate-fade-in">
        <Tabs
          value={sourceFilter}
          onValueChange={(value) => setSourceFilter(value as SourceFilter)}
          className="space-y-5"
        >
          <header className="relative mb-8 overflow-hidden rounded-2xl border border-border bg-primary-soft">
            <div className="relative z-10 px-6 py-7 sm:px-8 sm:py-8">
              <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl border border-primary/15 bg-primary/10 text-primary">
                    <ListChecks className="h-5 w-5" />
                  </div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                    Automatiseringsportaal
                  </p>
                  <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground">
                    Automation beheer
                  </h1>
                  <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
                    Beheer HubSpot workflows, GitLab backend automations, Zapier zaps en Typeform formulieren vanuit dezelfde rustige procesreis-stijl.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => navigate("/nieuw")}
                  className="inline-flex min-h-11 w-full items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-border bg-card px-3.5 py-2 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:w-auto"
                >
                  <PlusCircle className="h-4 w-4" />
                  Nieuwe automation
                </button>
              </div>

              <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
                <StatBadge label="Automations" value={automations.length} />
                <StatBadge label="Actief" value={activeCount} />
                <StatBadge label="Bronnen" value={sourceCount} />
                <StatBadge label="Uitgeschakeld" value={disabledCount} />
              </div>
            </div>
          </header>

          <div className="flex flex-col gap-3 rounded-xl border border-border bg-muted/20 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              Kies een bron om de lijst te beperken. De status en source blijven bewust gescheiden.
            </p>
            <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 rounded-lg bg-muted/40 p-1 sm:w-auto">
              {sourceTabs.map((tab) => (
                <TabsTrigger
                  key={tab.value}
                  value={tab.value}
                  onClick={() => setSourceFilter(tab.value)}
                  className="min-h-9 gap-2 rounded-md px-3 py-2 text-sm font-medium data-[state=active]:bg-card"
                >
                  {tab.label}
                  <span className="rounded-full bg-background px-1.5 py-0.5 text-[11px] leading-none text-muted-foreground">
                    {tab.count}
                  </span>
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          <AlleAutomatiseringen sourceFilter={sourceFilter} />
        </Tabs>
      </div>
    </div>
  );
}

function StatBadge({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border bg-card/80 px-4 py-2.5 backdrop-blur-sm">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold text-foreground">
        {new Intl.NumberFormat("nl-NL").format(value)}
      </p>
    </div>
  );
}
