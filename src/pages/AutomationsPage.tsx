import { useState } from "react";

import { Tabs } from "@/components/ui/tabs";
import { useAutomatiseringen } from "@/lib/hooks";
import AlleAutomatiseringen from "./AlleAutomatiseringen";
import { readNavigationMemoryData } from "@/lib/navigationMemory";

type SourceFilter = "alle" | "hubspot" | "gitlab" | "zapier" | "typeform";

interface AutomationCatalogMemory {
  sourceFilter?: SourceFilter;
}

export default function AutomationsPage() {
  const rememberedCatalog = readNavigationMemoryData<AutomationCatalogMemory>("automations");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>(
    isSourceFilter(rememberedCatalog?.sourceFilter) ? rememberedCatalog.sourceFilter : "alle",
  );
  const { data: automations = [] } = useAutomatiseringen();
  const activeCount = automations.filter((automation) => automation.status === "Actief").length;
  const disabledCount = automations.filter((automation) => automation.status === "Uitgeschakeld").length;
  const sourceCount = new Set(automations.map((automation) => automation.source || "handmatig")).size;
  const warningCount = automations.filter((automation) =>
    automation.sourceFindings?.some((finding) =>
      !finding.resolvedAt && (finding.type === "source_missing" || finding.type === "source_data_incomplete")
    ),
  ).length;
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
          <header className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-3">
              <h1 className="text-3xl font-semibold tracking-tight text-foreground">
                Automation beheer
              </h1>
              <p className="text-sm text-muted-foreground">
                {new Intl.NumberFormat("nl-NL").format(automations.length)} automations
              </p>
            </div>

            <div className="flex flex-wrap gap-2 lg:justify-end">
              <StatPill value={activeCount} label="actief" />
              <StatPill value={disabledCount} label="uitgeschakeld" />
              <StatPill value={sourceCount} label="bronnen" />
              <StatPill value={warningCount} label={warningCount === 1 ? "waarschuwing" : "waarschuwingen"} />
            </div>
          </header>

          <AlleAutomatiseringen
            sourceFilter={sourceFilter}
            sourceTabs={sourceTabs}
            onSourceFilterChange={setSourceFilter}
          />
        </Tabs>
      </div>
    </div>
  );
}

function isSourceFilter(value: unknown): value is SourceFilter {
  return value === "alle" || value === "hubspot" || value === "gitlab" || value === "zapier" || value === "typeform";
}

function StatPill({ label, value }: { label: string; value: number }) {
  return (
    <span
      aria-label={`${new Intl.NumberFormat("nl-NL").format(value)} ${label}`}
      className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-border bg-card px-3 text-sm text-muted-foreground shadow-sm"
    >
      <strong className="font-semibold text-foreground">
        {new Intl.NumberFormat("nl-NL").format(value)}
      </strong>
      {label}
    </span>
  );
}
