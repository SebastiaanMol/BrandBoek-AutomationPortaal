import { useState } from "react";

import { Archive } from "lucide-react";
import {
  PageHeaderMetric,
  PageHeaderMetrics,
  PageHeaderShell,
} from "@/components/layout/PageHeader";
import { Tabs } from "@/components/ui/tabs";
import { useAutomationSentryIssueOverview, useAutomatiseringen } from "@/lib/hooks";
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
  const sentryOverviewQuery = useAutomationSentryIssueOverview(automations);
  const sentrySummaries = sentryOverviewQuery.data?.matches.summariesByAutomationId ?? {};
  const sentryIssueCount = Object.values(sentrySummaries).reduce(
    (total, summary) => total + summary.linkedIssueCount,
    0,
  );
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
          <PageHeaderShell
            icon={Archive}
            eyebrow="Automations"
            title="Automation beheer"
            description={`${new Intl.NumberFormat("nl-NL").format(automations.length)} automations`}
            metrics={(
              <PageHeaderMetrics>
                <PageHeaderMetric value={activeCount} label="actief" />
                <PageHeaderMetric value={disabledCount} label="uitgeschakeld" />
                <PageHeaderMetric value={sourceCount} label="bronnen" />
                <PageHeaderMetric value={warningCount} label={warningCount === 1 ? "waarschuwing" : "waarschuwingen"} />
                <PageHeaderMetric value={sentryIssueCount} label="Sentry issues" />
              </PageHeaderMetrics>
            )}
          />

          <AlleAutomatiseringen
            sourceFilter={sourceFilter}
            sourceTabs={sourceTabs}
            onSourceFilterChange={setSourceFilter}
            sentrySummaries={sentrySummaries}
          />
        </Tabs>
      </div>
    </div>
  );
}

function isSourceFilter(value: unknown): value is SourceFilter {
  return value === "alle" || value === "hubspot" || value === "gitlab" || value === "zapier" || value === "typeform";
}
