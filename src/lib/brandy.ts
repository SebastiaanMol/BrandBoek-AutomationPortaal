import { supabase } from "@/integrations/supabase/client";

export interface BrandyContext {
  automationId?: string;
  automationNaam?: string;
}

export interface BrandyResponse {
  antwoord: string;
  bronnen: string[];
  entiteiten: string[];
  zekerheid: "hoog" | "gemiddeld" | "laag";
}

export type BrandyFeedbackLabel = "correct" | "incorrect" | "onvolledig";

export interface BrandyMessage {
  id: string;
  type: "user" | "brandy";
  content: string;
  response?: BrandyResponse;
  context?: BrandyContext;
  timestamp: Date;
}

export async function askBrandy(
  vraag: string,
  context?: BrandyContext
): Promise<BrandyResponse> {
  const { data, error } = await supabase.functions.invoke("brandy-ask", {
    body: { vraag, context },
  });

  if (error) {
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === "function") {
      try {
        const body = await ctx.json();
        if (body?.error) throw new Error(body.error);
      } catch (e: unknown) {
        if (e instanceof Error && e.message !== error.message) throw e;
      }
    }
    throw new Error(error.message);
  }

  return data as BrandyResponse;
}

export async function sendBrandyFeedback(
  vraag: string,
  antwoord: string,
  label: BrandyFeedbackLabel
): Promise<void> {
  await supabase.functions.invoke("brandy-feedback", {
    body: { vraag, antwoord, label },
  });
}
