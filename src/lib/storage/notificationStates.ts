import { supabase } from "@/integrations/supabase/client";
import type { NotificationState } from "@/lib/notificationCenter";

interface NotificationStateRow {
  notification_key?: unknown;
  seen_at?: unknown;
  archived_at?: unknown;
}

export async function fetchNotificationStates(userId: string): Promise<NotificationState[]> {
  const { data, error } = await (supabase as any)
    .from("notification_states")
    .select("notification_key, seen_at, archived_at")
    .eq("user_id", userId);

  if (error) throw error;

  return ((data ?? []) as NotificationStateRow[])
    .filter((row) => typeof row.notification_key === "string")
    .map((row) => ({
      notificationKey: row.notification_key as string,
      seenAt: typeof row.seen_at === "string" ? row.seen_at : null,
      archivedAt: typeof row.archived_at === "string" ? row.archived_at : null,
    }));
}

export async function markNotificationsSeen(userId: string, notificationKeys: string[], now = new Date().toISOString()): Promise<void> {
  const uniqueKeys = Array.from(new Set(notificationKeys.filter(Boolean)));
  if (uniqueKeys.length === 0) return;

  const { error } = await (supabase as any)
    .from("notification_states")
    .upsert(
      uniqueKeys.map((notificationKey) => ({
        user_id: userId,
        notification_key: notificationKey,
        seen_at: now,
        updated_at: now,
      })),
      { onConflict: "user_id,notification_key" },
    );

  if (error) throw error;
}

export async function archiveNotification(userId: string, notificationKey: string, now = new Date().toISOString()): Promise<void> {
  const { error } = await (supabase as any)
    .from("notification_states")
    .upsert(
      {
        user_id: userId,
        notification_key: notificationKey,
        seen_at: now,
        archived_at: now,
        updated_at: now,
      },
      { onConflict: "user_id,notification_key" },
    );

  if (error) throw error;
}
