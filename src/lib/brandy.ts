// src/lib/brandy.ts
import { supabase } from "@/integrations/supabase/client";
import type { Automatisering } from "@/lib/types";
import { berekenComplexiteit } from "@/lib/types";
import type { Signaal } from "@/lib/signalen";

// ── Brandy chat types ────────────────────────────────────────────────────────

export interface BrandyContext {
  automationId?: string;
  automationNaam?: string;
}

export interface BrandyResponse {
  antwoord: string;
  bronnen: string[];
  entiteiten: string[];
  zekerheid: "hoog" | "gemiddeld" | "laag";
  diagnose_modus?: boolean;
  stap_nummer?: number;
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

// ── Brandy mind types ────────────────────────────────────────────────────────

export interface BrandyMind {
  id: string;
  signalen: Signaal[];
  samenvatting: string;
  prioriteiten: string[];      // signal IDs ranked by urgency
  automation_count: number;
  aangemaakt_op: string;
}

// ── Chat functions ────────────────────────────────────────────────────────────

export async function askBrandy(
  vraag: string,
  automations: Automatisering[],
  context?: BrandyContext
): Promise<BrandyResponse> {
  const { data, error } = await supabase.functions.invoke("brandy-ask", {
    body: { vraag, context, automations },
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

// ── Mind functions ─────────────────────────────────────────────────────────────

export async function fetchBrandyMind(): Promise<BrandyMind | null> {
  const { data } = await supabase
    .from("brandy_mind")
    .select("*")
    .order("aangemaakt_op", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (data as BrandyMind | null);
}

export async function runBrandyAnalyse(
  signalen: Signaal[],
  automations: Automatisering[]
): Promise<BrandyMind> {
  const slimAutomations = automations.map(a => ({
    id: a.id,
    naam: a.naam,
    status: a.status,
    fasen: a.fasen ?? [],
    systemen: a.systemen ?? [],
    owner: a.owner ?? "",
    stappenCount: a.stappen?.length ?? 0,
    complexiteit: berekenComplexiteit(a),
  }));

  const { data, error } = await supabase.functions.invoke("brandy-analyse", {
    body: { signalen, automations: slimAutomations },
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

  return data as BrandyMind;
}
