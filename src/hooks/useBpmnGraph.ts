import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchBpmnData, reviewAiFlow, buildBpmnGraph } from "@/lib/bpmnApi";
import type { BpmnGraph } from "@/types/bpmn";

const KEY = ["bpmn-graph"] as const;

export function useBpmnGraph(): {
  graph: BpmnGraph | null;
  isLoading: boolean;
  error: Error | null;
} {
  const { data, isLoading, error } = useQuery({
    queryKey: KEY,
    queryFn: fetchBpmnData,
    staleTime: 5 * 60 * 1000,
  });

  const graph: BpmnGraph | null = data
    ? buildBpmnGraph(data.automations, data.aiFlows)
    : null;

  return { graph, isLoading, error: error as Error | null };
}

export function useReviewAiFlow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: "confirm" | "reject" }) =>
      reviewAiFlow(id, action),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
