import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  deleteFlow,
  fetchFlows,
  insertFlow,
  updateFlow,
} from "../supabaseStorage";
import type { Flow } from "../types";

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
