import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  confirmAutomationLink,
  fetchAllConfirmedAutomationLinks,
  fetchAutomationLinks,
} from "../supabaseStorage";

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
