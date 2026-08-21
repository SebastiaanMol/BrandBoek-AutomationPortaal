import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchAllProcessStates,
  fetchProcessState,
  updateProcessManualStatus,
  type ProcessManualStatus,
} from "../supabaseStorage";

export function useProcessState(pipelineId: string | null) {
  return useQuery({
    queryKey: ["processState", pipelineId],
    queryFn: () => pipelineId ? fetchProcessState(pipelineId) : null,
    enabled: !!pipelineId,
    staleTime: Infinity,
  });
}

export function useAllProcessStates() {
  return useQuery({
    queryKey: ["processState", "all"],
    queryFn: fetchAllProcessStates,
    staleTime: 60_000,
  });
}

export function useUpdateProcessManualStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ pipelineId, status }: { pipelineId: string; status: ProcessManualStatus }) =>
      updateProcessManualStatus(pipelineId, status),
    onSuccess: (_data, { pipelineId }) => {
      queryClient.invalidateQueries({ queryKey: ["processState", pipelineId] });
      queryClient.invalidateQueries({ queryKey: ["processState", "all"] });
    },
  });
}
