import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { UseMutationResult } from "@tanstack/react-query";
import { fetchAutomatiseringen, insertAutomatisering, updateAutomatisering, deleteAutomatisering, generateNextId, verifieerAutomatisering, fetchIntegration, saveIntegration, deleteIntegration, triggerHubSpotSync, triggerZapierSync, triggerTypeformSync, triggerGitlabSync, fetchPortalSettings, savePortalSettings, fetchAutomationLinks, confirmAutomationLink, fetchPipelines, triggerHubSpotPipelinesSync, triggerDescribePipeline, fetchFlows, insertFlow, updateFlow, deleteFlow, fetchAllConfirmedAutomationLinks } from "./supabaseStorage";
import type { Automatisering, Flow, PortalSettings } from "./types";

export function useAutomatiseringen() {
  return useQuery({
    queryKey: ["automatiseringen"],
    queryFn: fetchAutomatiseringen,
  });
}

export function useSaveAutomatisering() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (item: Automatisering) => insertAutomatisering(item),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automatiseringen"] });
    },
  });
}

export function useUpdateAutomatisering() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (item: Automatisering) => updateAutomatisering(item),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automatiseringen"] });
    },
  });
}

export function useDeleteAutomatisering() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteAutomatisering(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automatiseringen"] });
    },
  });
}

export function useVerifieerAutomatisering() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, door, status }: { id: string; door: string; status?: string }) =>
      verifieerAutomatisering(id, door, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automatiseringen"] });
    },
  });
}

export function useNextId() {
  return useQuery({
    queryKey: ["nextAutoId"],
    queryFn: generateNextId,
  });
}

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

type SyncResult = { inserted: number; updated: number; deactivated: number; total: number };

function useIntegrationSync(
  mutationFn: () => Promise<SyncResult>,
  integrationKey: string,
): UseMutationResult<SyncResult, Error, void> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automatiseringen"] });
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

export function useTypeformSync(): UseMutationResult<SyncResult, Error, void> {
  return useIntegrationSync(triggerTypeformSync, "typeform");
}

export function useGitlabSync(): UseMutationResult<SyncResult, Error, void> {
  return useIntegrationSync(triggerGitlabSync, "gitlab");
}

export function usePortalSettings() {
  return useQuery({
    queryKey: ["portal_settings"],
    queryFn: fetchPortalSettings,
    refetchOnWindowFocus: false,
  });
}

export function useSavePortalSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (settings: PortalSettings) => savePortalSettings(settings),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["portal_settings"] }),
  });
}

export function useAutomationLinks(id: string) {
  return useQuery({
    queryKey: ["automation_links", id],
    queryFn: () => fetchAutomationLinks(id),
    enabled: !!id,
  });
}

export function useConfirmLink() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (linkId: string) => confirmAutomationLink(linkId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["automation_links"] }),
  });
}

export function usePipelines() {
  return useQuery({
    queryKey: ["pipelines"],
    queryFn:  fetchPipelines,
    refetchOnWindowFocus: false,
  });
}

export function useHubSpotPipelinesSync() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: triggerHubSpotPipelinesSync,
    onSuccess:  () => queryClient.invalidateQueries({ queryKey: ["pipelines"] }),
  });
}

export function useDescribePipeline() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (pipelineId: string) => triggerDescribePipeline(pipelineId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["pipelines"] }),
  });
}

// ─── Flows ────────────────────────────────────────────────────────────────────

export function useFlows() {
  return useQuery({
    queryKey: ["flows"],
    queryFn: fetchFlows,
  });
}

export function useCreateFlow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (flow: Omit<Flow, "id" | "createdAt" | "updatedAt">) => insertFlow(flow),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["flows"] });
    },
  });
}

export function useUpdateFlow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...updates
    }: { id: string } & Partial<Pick<Flow, "naam" | "beschrijving" | "systemen" | "automationIds">>) =>
      updateFlow(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["flows"] });
    },
  });
}

export function useDeleteFlow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteFlow(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["flows"] });
    },
  });
}

export function useAllConfirmedAutomationLinks() {
  return useQuery({
    queryKey: ["confirmedAutomationLinks"],
    queryFn: fetchAllConfirmedAutomationLinks,
  });
}
