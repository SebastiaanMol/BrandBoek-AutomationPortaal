import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  confirmAutomationLink,
  fetchAllConfirmedAutomationLinks,
  fetchAutomationLinks,
} from "../supabaseStorage";
import {
  bevestigFlowSuggestie,
  fetchFlowSuggesties,
  verwerpFlowSuggestie,
} from "../storage/automationLinks";
import { invokeEdgeFunction } from "../storage/edgeFunctions";

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

export function useAllConfirmedAutomationLinks() {
  return useQuery({
    queryKey: ["confirmedAutomationLinks"],
    queryFn: fetchAllConfirmedAutomationLinks,
  });
}

export function useFlowSuggesties() {
  return useQuery({
    queryKey: ["flowSuggesties"],
    queryFn: fetchFlowSuggesties,
  });
}

export function useDetecteerSuggesties() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => invokeEdgeFunction("detect-flow-links"),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["flowSuggesties"] }),
  });
}

export function useBevestigFlowSuggestie() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ fromId, toId }: { fromId: string; toId: string }) =>
      bevestigFlowSuggestie(fromId, toId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["flowSuggesties"] });
      queryClient.invalidateQueries({ queryKey: ["confirmedAutomationLinks"] });
    },
  });
}

export function useVerwerpFlowSuggestie() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ fromId, toId }: { fromId: string; toId: string }) =>
      verwerpFlowSuggestie(fromId, toId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["flowSuggesties"] }),
  });
}
