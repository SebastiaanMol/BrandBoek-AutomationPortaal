import { supabase } from "@/integrations/supabase/client";
import { Integration } from "../types";

export async function fetchIntegration(type: string): Promise<Integration | null> {
  const { data, error } = await supabase
    .from("integrations")
    .select("*")
    .eq("type", type)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    id: data.id,
    userId: data.user_id,
    type: data.type,
    token: data.token,
    lastSyncedAt: data.last_synced_at,
    status: data.status as Integration["status"],
    errorMessage: data.error_message,
    createdAt: data.created_at,
  };
}

export async function saveIntegration(type: string, token: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Niet ingelogd");
  const { error } = await supabase.from("integrations").upsert(
    { user_id: user.id, type, token, status: "connected", error_message: null },
    { onConflict: "user_id,type" }
  );
  if (error) throw error;
}

export async function deleteIntegration(type: string): Promise<void> {
  const { error } = await supabase.from("integrations").delete().eq("type", type);
  if (error) throw error;
}
