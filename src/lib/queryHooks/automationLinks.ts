import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  confirmAutomationLink,
  fetchAllConfirmedAutomationLinks,
  fetchAutomationLinks,
} from "../supabaseStorage";
import {
  accepteerFlowKandidaat,
  bevestigFlowSuggestie,
  fetchFlowSuggesties,
  fetchOpenSuggestiesVoorFlow,
  ongedaanBevestigFlowSuggestie,
  ongedaanVerwerpFlowSuggestie,
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
    onSuccess: (_, { fromId, toId }) => {
      queryClient.setQueryData<Awaited<ReturnType<typeof fetchFlowSuggesties>>>(["flowSuggesties"], (old) =>
        old?.map((suggestie) =>
          suggestie.fromId === fromId && suggestie.toId === toId
            ? { ...suggestie, confirmed: true, rejected: false }
            : suggestie,
        ),
      );
      queryClient.invalidateQueries({ queryKey: ["flowSuggesties"] });
      queryClient.invalidateQueries({ queryKey: ["confirmedAutomationLinks"] });
      queryClient.invalidateQueries({ queryKey: ["openSuggestiesVoorFlow"] });
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

export function useOngedaanBevestigFlowSuggestie() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ fromId, toId }: { fromId: string; toId: string }) =>
      ongedaanBevestigFlowSuggestie(fromId, toId),
    onSuccess: (_, { fromId, toId }) => {
      queryClient.setQueryData<Awaited<ReturnType<typeof fetchFlowSuggesties>>>(["flowSuggesties"], (old) =>
        old?.map((suggestie) =>
          suggestie.fromId === fromId && suggestie.toId === toId
            ? { ...suggestie, confirmed: false }
            : suggestie,
        ),
      );
      queryClient.invalidateQueries({ queryKey: ["flowSuggesties"] });
      queryClient.invalidateQueries({ queryKey: ["confirmedAutomationLinks"] });
    },
  });
}

export function useOngedaanVerwerpFlowSuggestie() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ fromId, toId }: { fromId: string; toId: string }) =>
      ongedaanVerwerpFlowSuggestie(fromId, toId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["flowSuggesties"] }),
  });
}

export function useAccepteerFlowKandidaat() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ nodeIds, flowId }: { nodeIds: string[]; flowId: string }) =>
      accepteerFlowKandidaat(nodeIds, flowId),
    onSuccess: (_, { flowId }) => {
      queryClient.invalidateQueries({ queryKey: ["flowSuggesties"] });
      queryClient.invalidateQueries({ queryKey: ["openSuggestiesVoorFlow", flowId] });
    },
  });
}

export function useOpenSuggestiesVoorFlow(flowId: string | undefined) {
  return useQuery({
    queryKey: ["openSuggestiesVoorFlow", flowId],
    queryFn: () => fetchOpenSuggestiesVoorFlow(flowId!),
    enabled: !!flowId,
  });
}
