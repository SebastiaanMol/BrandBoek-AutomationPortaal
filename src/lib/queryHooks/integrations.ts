import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { UseMutationResult } from "@tanstack/react-query";
import {
  applySourceSyncReview,
  deleteIntegration,
  fetchIntegration,
  saveIntegration,
  type SyncPreviewResult,
  triggerGitlabSync,
  triggerHubSpotSync,
  triggerTypeformSync,
  triggerZapierJsonImport,
  triggerZapierSync,
} from "../supabaseStorage";

export function useIntegration(type: string) {
  return useQuery({
    queryKey: ["integration", type],
    queryFn: () => fetchIntegration(type),
  });
}

export function useSaveIntegration() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ type, token }: { type: string; token: string }) => saveIntegration(type, token),
    onSuccess: (_data, { type }) => {
      queryClient.invalidateQueries({ queryKey: ["integration", type] });
    },
  });
}

export function useDeleteIntegration() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (type: string) => deleteIntegration(type),
    onSuccess: (_data, type) => {
      queryClient.invalidateQueries({ queryKey: ["integration", type] });
    },
  });
}

function useIntegrationSync(
  mutationFn: () => Promise<SyncPreviewResult>,
  integrationKey: string,
): UseMutationResult<SyncPreviewResult, Error, void> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automatiseringen"] });
      queryClient.invalidateQueries({ queryKey: ["pending"] });
      queryClient.invalidateQueries({ queryKey: ["rejected-hubspot-automations"] });
      queryClient.invalidateQueries({ queryKey: ["integration", integrationKey] });
    },
  });
}

export function useHubSpotSync(): UseMutationResult<SyncPreviewResult, Error, void> {
  return useIntegrationSync(triggerHubSpotSync, "hubspot");
}

export function useZapierSync(): UseMutationResult<SyncPreviewResult, Error, void> {
  return useIntegrationSync(triggerZapierSync, "zapier");
}

export function useZapierJsonImport(): UseMutationResult<SyncPreviewResult, Error, unknown> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: triggerZapierJsonImport,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automatiseringen"] });
      queryClient.invalidateQueries({ queryKey: ["pending"] });
      queryClient.invalidateQueries({ queryKey: ["integration", "zapier"] });
    },
  });
}

export function useTypeformSync(): UseMutationResult<SyncPreviewResult, Error, void> {
  return useIntegrationSync(triggerTypeformSync, "typeform");
}

export function useGitlabSync(): UseMutationResult<SyncPreviewResult, Error, void> {
  return useIntegrationSync(triggerGitlabSync, "gitlab");
}

export function useApplySourceSyncReview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ source, syncRunId, selectedChangeItemIds }: {
      source: "hubspot" | "zapier" | "typeform" | "gitlab";
      syncRunId: string;
      selectedChangeItemIds: string[];
    }) => applySourceSyncReview(source, syncRunId, selectedChangeItemIds),
    onSuccess: (_data, { source }) => {
      queryClient.invalidateQueries({ queryKey: ["automatiseringen"] });
      queryClient.invalidateQueries({ queryKey: ["pending"] });
      queryClient.invalidateQueries({ queryKey: ["rejected-hubspot-automations"] });
      queryClient.invalidateQueries({ queryKey: ["integration", source] });
    },
  });
}
