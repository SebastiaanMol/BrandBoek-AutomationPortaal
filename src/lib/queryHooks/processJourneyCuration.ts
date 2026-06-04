import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  saveCuratedProcessJourney,
  type SaveCuratedProcessJourneyInput,
} from "@/lib/storage/processJourneyCuration";

export function useSaveCuratedProcessJourney() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SaveCuratedProcessJourneyInput) => saveCuratedProcessJourney(input),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["flows"] });
      queryClient.invalidateQueries({ queryKey: ["flowSuggesties"] });
      queryClient.invalidateQueries({ queryKey: ["confirmedAutomationLinks"] });
      queryClient.invalidateQueries({ queryKey: ["openSuggestiesVoorFlow", result.flowId] });
    },
  });
}
