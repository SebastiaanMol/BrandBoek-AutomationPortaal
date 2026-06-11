import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createCustomPipeline,
  deleteCustomPipeline,
  fetchPipelines,
  renameCustomPipeline,
  setPipelineActive,
  triggerDescribePipeline,
  triggerHubSpotPipelinesSync,
  updateCustomPipeline,
} from "../supabaseStorage";
import type { CustomPipelineInput } from "../storage/pipelines";

export function usePipelines() {
  return useQuery({
    queryKey: ["pipelines"],
    queryFn: fetchPipelines,
    refetchOnWindowFocus: false,
  });
}

export function useHubSpotPipelinesSync() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: triggerHubSpotPipelinesSync,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["pipelines"] }),
  });
}

export function useDescribePipeline() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (pipelineId: string) => triggerDescribePipeline(pipelineId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["pipelines"] }),
  });
}

export function useSetPipelineActive() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ pipelineId, isActive }: { pipelineId: string; isActive: boolean }) =>
      setPipelineActive(pipelineId, isActive),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["pipelines"] }),
  });
}

export function useCreateCustomPipeline() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CustomPipelineInput) => createCustomPipeline(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["pipelines"] }),
  });
}

export function useUpdateCustomPipeline() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { pipelineId: string } & CustomPipelineInput) => updateCustomPipeline(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["pipelines"] }),
  });
}

export function useRenameCustomPipeline() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ pipelineId, naam }: { pipelineId: string; naam: string }) =>
      renameCustomPipeline(pipelineId, naam),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["pipelines"] }),
  });
}

export function useDeleteCustomPipeline() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (pipelineId: string) => deleteCustomPipeline(pipelineId),
    onSuccess: (_, pipelineId) => {
      queryClient.invalidateQueries({ queryKey: ["pipelines"] });
      queryClient.removeQueries({ queryKey: ["processState", pipelineId] });
    },
  });
}
