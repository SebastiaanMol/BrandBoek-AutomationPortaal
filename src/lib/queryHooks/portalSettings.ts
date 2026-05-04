import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchPortalSettings, savePortalSettings } from "../supabaseStorage";
import type { PortalSettings } from "../types";

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
