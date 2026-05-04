import { useQuery } from "@tanstack/react-query";
import { fetchProcessState } from "../supabaseStorage";

export function useProcessState(pipelineId: string | null) {
  return useQuery({
    queryKey: ["processState", pipelineId],
    queryFn: () => pipelineId ? fetchProcessState(pipelineId) : null,
    enabled: !!pipelineId,
    staleTime: Infinity,
  });
}
