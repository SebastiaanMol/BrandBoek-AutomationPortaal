import { supabase } from "@/integrations/supabase/client";

type SyncResult = { inserted: number; updated: number; deactivated: number; total: number };

export async function invokeEdgeFunction<T = SyncResult>(
  name: string,
  body?: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, body ? { body } : undefined);

  if (error) {
    const context = (error as Record<string, unknown>)?.context;

    if (context && typeof (context as Record<string, unknown>).error === "string") {
      throw new Error((context as Record<string, unknown>).error as string);
    }

    if (context && typeof (context as Record<string, unknown>).json === "function") {
      try {
        const errBody = await (context as { json: () => Promise<Record<string, unknown>> }).json();
        if (errBody?.error) throw new Error(errBody.error as string);
      } catch (e: unknown) {
        const eMsg = e instanceof Error ? e.message : undefined;
        if (eMsg && eMsg !== error.message) throw e;
      }
    }

    throw new Error(error.message);
  }

  return data as T;
}

export async function triggerHubSpotSync(): Promise<SyncResult> {
  return invokeEdgeFunction("hubspot-sync");
}

export async function triggerZapierSync(): Promise<SyncResult> {
  return invokeEdgeFunction("zapier-sync");
}

export async function triggerTypeformSync(): Promise<SyncResult> {
  return invokeEdgeFunction("typeform-sync");
}

export async function triggerGitlabSync(): Promise<SyncResult> {
  return invokeEdgeFunction("gitlab-sync");
}
