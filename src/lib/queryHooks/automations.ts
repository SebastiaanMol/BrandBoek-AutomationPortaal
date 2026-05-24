import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  deleteAutomatisering,
  fetchAutomatiseringen,
  fetchAutomatiseringenIncludingLegacyGitlab,
  generateNextId,
  insertAutomatisering,
  setCleanupDeleteCandidate,
  updateAutomatisering,
  verifieerAutomatisering,
} from "../supabaseStorage";
import type { Automatisering } from "../types";

export function useAutomatiseringen() {
  return useQuery({
    queryKey: ["automatiseringen"],
    queryFn: fetchAutomatiseringen,
  });
}

export function useAutomatiseringenIncludingLegacyGitlab() {
  return useQuery({
    queryKey: ["automatiseringen", "including-legacy-gitlab"],
    queryFn: fetchAutomatiseringenIncludingLegacyGitlab,
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

export function useSetCleanupDeleteCandidate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, marked }: { id: string; marked: boolean }) => setCleanupDeleteCandidate(id, marked),
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
