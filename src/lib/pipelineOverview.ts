import type { Pipeline, PipelineStage } from "@/lib/types";

export type PipelineFilter = "all" | "hubspot" | "custom" | "inactive";

export function getPipelineSourceLabel(pipeline: Pick<Pipeline, "source">): string {
  return pipeline.source === "custom" ? "Intern proces" : "HubSpot";
}

export function getPipelineDateLabel(pipeline: Pick<Pipeline, "source">): string {
  return pipeline.source === "custom" ? "Laatst bijgewerkt" : "Gesynchroniseerd";
}

export function getPipelineDateValue(pipeline: Pick<Pipeline, "source" | "syncedAt" | "updatedAt">): string {
  return pipeline.source === "custom" ? pipeline.updatedAt : pipeline.syncedAt;
}

export function sortPipelineStages(pipeline: Pick<Pipeline, "stages">): PipelineStage[] {
  return [...pipeline.stages].sort((first, second) => first.display_order - second.display_order);
}

export function getPreviewStages(pipeline: Pick<Pipeline, "stages">, limit = 8): PipelineStage[] {
  return sortPipelineStages(pipeline).slice(0, limit);
}

export function filterPipelinesForOverview(
  pipelines: Pipeline[],
  filter: PipelineFilter,
  search: string,
): Pipeline[] {
  const query = search.trim().toLowerCase();

  return pipelines.filter((pipeline) => {
    const matchesFilter =
      filter === "all" ||
      (filter === "inactive" ? !pipeline.isActive : pipeline.source === filter);
    const matchesSearch = query === "" || pipeline.naam.toLowerCase().includes(query);

    return matchesFilter && matchesSearch;
  });
}
