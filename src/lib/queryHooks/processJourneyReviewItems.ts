import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createProcessJourneyReviewItem,
  fetchProcessJourneyReviewItems,
  updateProcessJourneyReviewItemStatus,
  type CreateProcessJourneyReviewItemInput,
  type FetchProcessJourneyReviewItemsInput,
  type ProcessJourneyReviewItemStatus,
} from "@/lib/storage/processJourneyReviewItems";

export function useProcessJourneyReviewItems(input: FetchProcessJourneyReviewItemsInput = {}) {
  return useQuery({
    queryKey: ["processJourneyReviewItems", input.conceptJourneyId ?? "all", input.flowId ?? "all"],
    queryFn: () => fetchProcessJourneyReviewItems(input),
  });
}

export function useCreateProcessJourneyReviewItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateProcessJourneyReviewItemInput) => createProcessJourneyReviewItem(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["processJourneyReviewItems"] });
    },
  });
}

export function useUpdateProcessJourneyReviewItemStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: ProcessJourneyReviewItemStatus }) =>
      updateProcessJourneyReviewItemStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["processJourneyReviewItems"] });
    },
  });
}
