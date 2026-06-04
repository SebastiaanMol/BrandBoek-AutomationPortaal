import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { getPortalSettings, PortalSettings } from "../types";

export async function fetchPortalSettings(): Promise<PortalSettings> {
  const { data, error } = await supabase
    .from("portal_settings")
    .select("settings")
    .eq("id", "main")
    .maybeSingle();
  if (error) throw error;
  return getPortalSettings((data?.settings ?? {}) as Partial<PortalSettings>);
}

export async function savePortalSettings(settings: PortalSettings): Promise<void> {
  const { error } = await supabase
    .from("portal_settings")
    .upsert(
      { id: "main", settings: settings as unknown as Json, updated_at: new Date().toISOString() },
      { onConflict: "id" }
    );
  if (error) throw error;
}
