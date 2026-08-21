import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/lib/AuthContext";
import {
  buildNotificationCenterModel,
  type NotificationCenterModel,
} from "@/lib/notificationCenter";
import { useAutomatiseringen } from "@/lib/queryHooks/automations";
import { usePipelines } from "@/lib/queryHooks/pipelines";
import { useAllProcessStates } from "@/lib/queryHooks/processState";
import { useAutomationSentryIssueOverview } from "@/lib/queryHooks/sentryIssues";
import {
  archiveNotification,
  fetchNotificationStates,
  markNotificationsSeen,
} from "@/lib/storage/notificationStates";

const emptyModel: NotificationCenterModel = {
  items: [],
  openItems: [],
  seenItems: [],
  archivedItems: [],
  unseenCount: 0,
};

export function useNotificationCenter() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const queryClient = useQueryClient();
  const automationsQuery = useAutomatiseringen();
  const pipelinesQuery = usePipelines();
  const processStatesQuery = useAllProcessStates();
  const sentryQuery = useAutomationSentryIssueOverview(automationsQuery.data ?? [], {
    enabled: Boolean((automationsQuery.data ?? []).length),
  });
  const statesQuery = useQuery({
    queryKey: ["notificationStates", userId],
    queryFn: () => fetchNotificationStates(userId ?? ""),
    enabled: Boolean(userId),
    staleTime: 60_000,
  });

  const model = useMemo(() => {
    if (!userId) return emptyModel;

    return buildNotificationCenterModel({
      automations: automationsQuery.data ?? [],
      pipelines: pipelinesQuery.data ?? [],
      processStates: processStatesQuery.data ?? {},
      sentry: sentryQuery.data,
      states: statesQuery.data ?? [],
    });
  }, [
    automationsQuery.data,
    pipelinesQuery.data,
    processStatesQuery.data,
    sentryQuery.data,
    statesQuery.data,
    userId,
  ]);

  const markSeenMutation = useMutation({
    mutationFn: (notificationKeys: string[]) => {
      if (!userId) return Promise.resolve();
      return markNotificationsSeen(userId, notificationKeys);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notificationStates", userId] });
    },
  });

  const archiveMutation = useMutation({
    mutationFn: (notificationKey: string) => {
      if (!userId) return Promise.resolve();
      return archiveNotification(userId, notificationKey);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notificationStates", userId] });
    },
  });

  return {
    model,
    isLoading:
      automationsQuery.isLoading ||
      pipelinesQuery.isLoading ||
      processStatesQuery.isLoading ||
      sentryQuery.isLoading ||
      statesQuery.isLoading,
    isError:
      automationsQuery.isError ||
      pipelinesQuery.isError ||
      processStatesQuery.isError ||
      sentryQuery.isError ||
      statesQuery.isError,
    markOpenNotificationsSeen: () => {
      const unseenKeys = model.openItems
        .filter((item) => !item.seenAt)
        .map((item) => item.notificationKey);
      if (unseenKeys.length > 0) {
        markSeenMutation.mutate(unseenKeys);
      }
    },
    archiveNotification: (notificationKey: string) => archiveMutation.mutate(notificationKey),
  };
}
