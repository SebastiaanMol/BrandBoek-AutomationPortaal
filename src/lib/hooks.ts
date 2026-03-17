import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchAutomatiseringen, insertAutomatisering, updateAutomatisering, generateNextId } from "./supabaseStorage";
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

export function useNextId() {
  return useQuery({
    queryKey: ["nextAutoId"],
    queryFn: generateNextId,
  });
}
