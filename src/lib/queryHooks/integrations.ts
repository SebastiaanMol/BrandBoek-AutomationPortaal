import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { UseMutationResult } from "@tanstack/react-query";
import {
  deleteIntegration,
  fetchIntegration,
  saveIntegration,
  triggerGitlabSync,
  triggerHubSpotSync,
  triggerTypeformSync,
  triggerZapierJsonImport,
  triggerZapierSync,
} from "../supabaseStorage";

type SyncResult = {
  inserted: number;
  updated: number;
  deactivated: number;
  deletedRejected?: number;
  total: number;
  proposed?: number;
  findings?: number;
  missing?: number;
  changed?: number;
  syncRunId?: string;
};

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
  mutationFn: () => Promise<SyncResult>,
  integrationKey: string,
): UseMutationResult<SyncResult, Error, void> {
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

export function useHubSpotSync(): UseMutationResult<SyncResult, Error, void> {
  return useIntegrationSync(triggerHubSpotSync, "hubspot");
}

export function useZapierSync(): UseMutationResult<SyncResult, Error, void> {
  return useIntegrationSync(triggerZapierSync, "zapier");
}

export function useZapierJsonImport(): UseMutationResult<SyncResult, Error, unknown> {
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

export function useTypeformSync(): UseMutationResult<SyncResult, Error, void> {
  return useIntegrationSync(triggerTypeformSync, "typeform");
}

export function useGitlabSync(): UseMutationResult<SyncResult, Error, void> {
  return useIntegrationSync(triggerGitlabSync, "gitlab");
}
