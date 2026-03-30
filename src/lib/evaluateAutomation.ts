import { supabase } from "./supabaseClient";

export interface EvaluationResult {
  automation_id: string;
  automation_name: string;
  toStepId: string | null;
  branchId: string | null;
  branchLabel: string | null;
  reason: "condition_match" | "default_fallback" | "no_match";
  evaluated_at: string;
}

/**
 * Roept de evaluate-automation Edge Function aan.
 *
 * @param automationId  - ID van de automation in Supabase
 * @param payload       - De data om tegen te evalueren, bijv. { deal: { status: "won", tier: "enterprise" } }
 */
export async function evaluateAutomation(
  automationId: string,
  payload: Record<string, unknown>,
): Promise<EvaluationResult> {
  const { data, error } = await supabase.functions.invoke("evaluate-automation", {
    body: { automation_id: automationId, payload },
  });

  if (error) throw new Error(error.message);
  if (data.error) throw new Error(data.error);

  return data as EvaluationResult;
}
