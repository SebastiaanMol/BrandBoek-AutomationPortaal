import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchAutomatiseringen, insertAutomatisering, updateAutomatisering, deleteAutomatisering, generateNextId, verifieerAutomatisering, fetchIntegration, saveIntegration, deleteIntegration, triggerHubSpotSync, triggerZapierSync, triggerTypeformSync } from "./supabaseStorage";
import { Automatisering } from "./types";

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

export function useHubSpotSync() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: triggerHubSpotSync,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automatiseringen"] });
      queryClient.invalidateQueries({ queryKey: ["integration", "hubspot"] });
    },
  });
}

export function useZapierSync() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: triggerZapierSync,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automatiseringen"] });
      queryClient.invalidateQueries({ queryKey: ["integration", "zapier"] });
    },
  });
}

export function useTypeformSync() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: triggerTypeformSync,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automatiseringen"] });
      queryClient.invalidateQueries({ queryKey: ["integration", "typeform"] });
    },
  });
}
